// ─── MaterialEditor.jsx ───────────────────────────────────────────────────────
// Collapsible material editing UI for the sidebar panel.
// Component hierarchy:
//
//   MaterialEditor
//     └─ MaterialGroup (one per logical mesh group, e.g. "Front Panel")
//          └─ MaterialCard (one per material UUID within the group)
//               ├─ TextureStrip   (thumbnail row of all PBR map slots)
//               │    └─ TextureThumbnail (single map preview canvas)
//               └─ EditableNumber (click-to-type numeric field for roughness / mix)
//
// MaterialCard also exports as a named export so MaterialFloatingMenu can render
// individual cards without the group wrapper.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ChevronDown, ChevronUp, Upload, Box } from 'lucide-react'
import { applyArtworkMix } from '../utils/textureUtils'

// ─── helpers ─────────────────────────────────────────────────────────────────

// Convert a Three.js Color to a CSS hex string (e.g. "#ff8800")
const threeToHex = (color) => '#' + color.getHexString()

// PBR map slot definitions — used to build the TextureStrip thumbnail row.
// key = property name on THREE.Material
const MAP_SLOTS = [
  { key: 'map',             label: 'Albedo'       },
  { key: 'normalMap',       label: 'Normal'       },
  { key: 'roughnessMap',    label: 'Roughness'    },
  { key: 'aoMap',           label: 'AO'           },
  { key: 'displacementMap', label: 'Displacement' },
  { key: 'alphaMap',        label: 'Alpha'        },
]

// Render a texture's image to a small canvas and return a data URL.
// Returns null if the texture hasn't loaded yet.
function textureToDataURL(texture, size = 128) {
  if (!texture?.image) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    canvas.getContext('2d').drawImage(texture.image, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  } catch { return null }
}

// ─── EditableNumber ───────────────────────────────────────────────────────────
// A span that shows a formatted number; clicking it converts it to a text input.
// Used for roughness and artwork mix so the user can type exact values.
function EditableNumber({ value, onChange, min = 0, max = 1, decimals = 2 }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value.toFixed(decimals))

  // Keep display text in sync when the value changes externally (e.g. slider drag)
  useEffect(() => {
    if (!editing) setText(value.toFixed(decimals))
  }, [value, editing, decimals])

  const commit = () => {
    const parsed = parseFloat(text)
    const v = isNaN(parsed) ? value : Math.max(min, Math.min(max, parsed))
    onChange(v)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="text"
        value={text}
        autoFocus
        className="mat-editable-input"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setText(value.toFixed(decimals)); setEditing(false) }
        }}
      />
    )
  }

  return (
    <span
      className="mat-value mat-value-editable"
      title="Click to type a value"
      onClick={() => { setText(value.toFixed(decimals)); setEditing(true) }}
    >
      {value.toFixed(decimals)}
    </span>
  )
}

// ─── TextureThumbnail ─────────────────────────────────────────────────────────
// Renders a single PBR map slot as a thumbnail image.
// Shows a white overlay when whiteOverlay > 0 to visualise the artwork mix.
function TextureThumbnail({ texture, label, whiteOverlay = 0 }) {
  const [src, setSrc] = useState(null)
  const [hovered, setHovered] = useState(false)

  // Async thumbnail generation — waits for the image to load if needed
  useEffect(() => {
    if (!texture) { setSrc(null); return }
    const url = textureToDataURL(texture)
    if (url) { setSrc(url); return }

    // Image hasn't finished loading yet — attach a one-shot load listener
    const img = texture.image
    if (img instanceof HTMLImageElement && !img.complete) {
      const onLoad = () => setSrc(textureToDataURL(texture))
      img.addEventListener('load', onLoad, { once: true })
      return () => img.removeEventListener('load', onLoad)
    }
  }, [texture])

  if (!src) return null

  return (
    <div
      className="mat-tex-thumb"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img src={src} alt={label} className="mat-tex-img" />
      {/* White overlay previews the artwork mix value on the albedo thumbnail */}
      {whiteOverlay > 0.001 && (
        <div className="mat-tex-mix-overlay" style={{ opacity: whiteOverlay }} />
      )}
      <span className={`mat-tex-label ${hovered ? 'mat-tex-label-visible' : ''}`}>{label}</span>
    </div>
  )
}

// ─── TextureStrip ─────────────────────────────────────────────────────────────
// Horizontal row of TextureThumbnails for every PBR map slot that has a texture.
// Passes the original (pre-blend) albedo texture so the overlay is applied correctly.
function TextureStrip({ material, mapMix, originalAlbedoTex }) {
  const slots = MAP_SLOTS.filter(({ key }) => !!material[key])
  if (slots.length === 0) return null
  return (
    <div className="mat-tex-strip">
      {slots.map(({ key, label }) => (
        <TextureThumbnail
          key={key}
          // For the albedo slot, show the pre-blend texture so the overlay renders correctly
          texture={key === 'map' && originalAlbedoTex ? originalAlbedoTex : material[key]}
          label={label}
          // Show a white overlay on the albedo thumbnail proportional to the mix
          whiteOverlay={key === 'map' ? 1 - mapMix : 0}
        />
      ))}
    </div>
  )
}

// ─── MaterialCard ─────────────────────────────────────────────────────────────
// The primary editing UI for a single Three.js material. Exported as a named
// export so MaterialFloatingMenu can use it directly.
//
// Internal state mirrors the live material properties so the UI stays in sync
// without needing to read from Three.js on every render.
export function MaterialCard({ entry }) {
  const { name, material } = entry

  const [color, setColor]         = useState(() => threeToHex(material.color ?? new THREE.Color(1, 1, 1)))
  const [roughness, setRoughness] = useState(() => material.roughness ?? 1)

  // Determine if this is a branding face (front/back/side) to set the default mix
  const isBrandingFaceCheck = useCallback(() => {
    const matName = (name || '').toLowerCase()
    const isSide2 = matName.includes('side2') || matName.includes('side 2')
    return (matName.includes('front') || matName.includes('back') || matName.includes('side')) && !isSide2 && !matName.includes('inside')
  }, [name])

  // Artwork mix: read from material memory (userData) if already set, else use naming heuristic
  const [mapMix, setMapMix]   = useState(() => material.userData.artworkMix ?? (isBrandingFaceCheck() ? 0 : 1))
  const [expanded, setExpanded] = useState(false)

  // Keep a reference to the original (pre-blend) albedo texture for the mix preview
  const [originalAlbedoTex, setOriginalAlbedoTex] = useState(() => material.map ?? null)
  const [thumbSrc, setThumbSrc] = useState(() => textureToDataURL(material.map))

  const originalMapRef = useRef(material.map ?? null) // Persists across re-renders without causing re-renders
  const debounceRef    = useRef(null)                 // Handle for the artwork mix debounce timer

  // Update the header thumbnail when the albedo texture changes (e.g. after bitmap replace)
  useEffect(() => {
    if (originalAlbedoTex) setThumbSrc(textureToDataURL(originalAlbedoTex))
  }, [originalAlbedoTex])

  // Clean up any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Re-apply the artwork blend using the stored original texture.
  // Must restore the original map first because applyArtworkMix replaces material.map.
  const applyBlend = useCallback((v) => {
    if (originalMapRef.current) {
      material.map = originalMapRef.current
    }
    applyArtworkMix(material, v)
  }, [material])

  // ── Change handlers — update Three.js material and call onUpdateConfig ─────

  const handleColor = useCallback((e) => {
    const hex = e.target.value
    setColor(hex)
    if (material.color) material.color.set(hex)
    material.needsUpdate = true
    if (entry.onUpdateConfig) entry.onUpdateConfig({ color: hex })
  }, [material, entry])

  const handleRoughness = useCallback((v) => {
    setRoughness(v)
    material.roughness = v
    material.needsUpdate = true
    if (entry.onUpdateConfig) entry.onUpdateConfig({ roughness: v })
  }, [material, entry])

  // Artwork mix is debounced at 40ms because the canvas blend is relatively
  // expensive and the slider can fire many events per second during a drag.
  const handleMapMix = useCallback((v) => {
    setMapMix(v)
    material.userData.artworkMix = v // Persist in material so session save picks it up
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      applyBlend(v)
      if (entry.onUpdateConfig) {
        entry.onUpdateConfig({ artworkMix: v })
      }
    }, 40)
  }, [applyBlend, material, entry])

  // Replace the albedo bitmap with a user-uploaded PNG.
  // The original texture settings (colorSpace, wrapS, flipY, etc.) are copied
  // to the new texture so it renders consistently with the rest of the material.
  const handleBitmapReplace = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const origMap = originalMapRef.current
      const newTex  = new THREE.Texture(img)
      newTex.colorSpace      = origMap?.colorSpace ?? THREE.SRGBColorSpace
      newTex.wrapS           = origMap?.wrapS      ?? THREE.RepeatWrapping
      newTex.wrapT           = origMap?.wrapT      ?? THREE.RepeatWrapping
      newTex.flipY           = origMap?.flipY      ?? false
      newTex.needsUpdate     = true

      // Promote the new texture to "original" so future mix operations use it
      originalMapRef.current = newTex
      setOriginalAlbedoTex(newTex)
      applyBlend(mapMix) // Re-apply current mix to the new texture
      URL.revokeObjectURL(url)
    }
    img.src = url
    e.target.value = '' // Reset file input so the same file can be re-selected
  }, [mapMix, applyBlend])

  const isPBR       = material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial'
  const hasAlbedoMap = !!material.map

  return (
    <div className="material-card">
      {/* Collapsible header: thumbnail/swatch + name + material type badge */}
      <button className="material-card-header" onClick={() => setExpanded(p => !p)}>
        {thumbSrc ? (
          <div className="mat-header-thumb-wrap">
            <img src={thumbSrc} className="mat-header-thumb" alt="" />
            {/* White overlay on header thumbnail mirrors the artwork mix value */}
            {mapMix < 0.999 && (
              <div className="mat-header-thumb-overlay" style={{ opacity: 1 - mapMix }} />
            )}
          </div>
        ) : (
          <span className="material-swatch" style={{ background: color }} />
        )}
        <span className="material-name" title={name}>{name}</span>
        <span className="material-type-badge">{material.type?.replace('Mesh', '').replace('Material', '')}</span>
        {expanded ? <ChevronUp size={14} className="material-chevron" /> : <ChevronDown size={14} className="material-chevron" />}
      </button>

      {expanded && (
        <div className="material-controls">
          {/* Row of PBR map thumbnails with the albedo overlay preview */}
          <TextureStrip material={material} mapMix={mapMix} originalAlbedoTex={originalAlbedoTex} />

          {/* Artwork Mix slider — only visible when there is an albedo texture */}
          {hasAlbedoMap && (
            <div className="mat-row">
              <label className="mat-label">Artwork Mix</label>
              <div className="mat-slider-wrap">
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={mapMix}
                  onChange={(e) => handleMapMix(parseFloat(e.target.value))}
                  className="mat-slider mat-slider-mapmix"
                  style={{ '--pct': `${mapMix * 100}%` }}
                />
                <EditableNumber value={mapMix} onChange={handleMapMix} min={0} max={1} />
              </div>
            </div>
          )}

          {/* Replace artwork button — swaps the albedo bitmap */}
          {hasAlbedoMap && (
            <label className="mat-upload-label">
              <Upload size={11} />
              <span>Replace Artwork</span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg"
                className="sr-only"
                onChange={handleBitmapReplace}
              />
            </label>
          )}

          {/* Colour picker — hidden for materials with no .color property */}
          {material.color && (
            <div className="mat-row">
              <label className="mat-label">Color</label>
              <div className="mat-color-wrap">
                <input type="color" className="mat-color-input" value={color} onChange={handleColor} />
                <span className="mat-hex">{color.toUpperCase()}</span>
              </div>
            </div>
          )}

          {/* Roughness slider — only for PBR material types */}
          {isPBR && (
            <div className="mat-row">
              <label className="mat-label">Roughness</label>
              <div className="mat-slider-wrap">
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={roughness}
                  onChange={(e) => handleRoughness(parseFloat(e.target.value))}
                  className="mat-slider"
                  style={{ '--pct': `${roughness * 100}%` }}
                />
                <EditableNumber value={roughness} onChange={handleRoughness} min={0} max={1} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MaterialGroup ────────────────────────────────────────────────────────────
// Collapsible group header that wraps all material cards for one mesh group.
// Filters out internal structural materials (e.g. "fluting") that aren't user-editable.
function MaterialGroup({ groupName, label, materials, onUpdateConfig }) {
  const [open, setOpen] = useState(false)
  // Exclude materials whose names contain 'fluting' (internal corrugate texture)
  const visible = (materials ?? []).filter(e => !e.name.toLowerCase().includes('fluting'))
  if (visible.length === 0) return null

  return (
    <div className="mat-group">
      <button className="mat-group-header" onClick={() => setOpen(p => !p)}>
        <Box size={11} className="mat-group-icon" />
        <span className="mat-group-name">{label}</span>
        <span className="mat-group-count">{visible.length}</span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div className="mat-group-cards">
          {visible.map(entry => (
            <MaterialCard
              key={entry.uuid}
              entry={{
                ...entry,
                // Bind the onUpdateConfig callback to this group and material UUID
                // so MaterialCard doesn't need to know its own context
                onUpdateConfig: (cfg) => {
                  if (onUpdateConfig) onUpdateConfig(groupName, entry.uuid, cfg)
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MaterialEditor ───────────────────────────────────────────────────────────
// Top-level export. Renders one MaterialGroup per display mesh group,
// filtering out groups that contain only fluting materials.
export default function MaterialEditor({ groups, onUpdateConfig }) {
  if (!groups?.length) return null

  const visibleGroups = groups.filter(g =>
    (g.materials ?? []).some(e => !e.name.toLowerCase().includes('fluting'))
  )
  if (visibleGroups.length === 0) return null

  return (
    <div className="mat-editor">
      <div className="space-y-2">
        {visibleGroups.map(({ groupName, label, materials }) => (
          <MaterialGroup
            key={groupName}
            groupName={groupName}
            label={label ?? groupName}
            materials={materials ?? []}
            onUpdateConfig={onUpdateConfig}
          />
        ))}
      </div>
    </div>
  )
}
