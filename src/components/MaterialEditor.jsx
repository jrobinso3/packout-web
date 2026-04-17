import { useState, useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Palette, ChevronDown, ChevronUp, Upload, Box } from 'lucide-react'
import { applyArtworkMix } from '../utils/textureUtils'

// ─── helpers ─────────────────────────────────────────────────────────────────

const threeToHex = (color) => '#' + color.getHexString()

const MAP_SLOTS = [
  { key: 'map',             label: 'Albedo'      },
  { key: 'normalMap',       label: 'Normal'      },
  { key: 'roughnessMap',    label: 'Roughness'   },
  { key: 'aoMap',           label: 'AO'          },
  { key: 'displacementMap', label: 'Displacement'},
  { key: 'alphaMap',        label: 'Alpha'       },
]

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

function EditableNumber({ value, onChange, min = 0, max = 1, decimals = 2 }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value.toFixed(decimals))

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

function TextureThumbnail({ texture, label, whiteOverlay = 0 }) {
  const [src, setSrc] = useState(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!texture) { setSrc(null); return }
    const url = textureToDataURL(texture)
    if (url) { setSrc(url); return }
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
      {whiteOverlay > 0.001 && (
        <div className="mat-tex-mix-overlay" style={{ opacity: whiteOverlay }} />
      )}
      <span className={`mat-tex-label ${hovered ? 'mat-tex-label-visible' : ''}`}>{label}</span>
    </div>
  )
}

// ─── TextureStrip ─────────────────────────────────────────────────────────────

function TextureStrip({ material, mapMix, originalAlbedoTex }) {
  const slots = MAP_SLOTS.filter(({ key }) => !!material[key])
  if (slots.length === 0) return null
  return (
    <div className="mat-tex-strip">
      {slots.map(({ key, label }) => (
        <TextureThumbnail
          key={key}
          texture={key === 'map' && originalAlbedoTex ? originalAlbedoTex : material[key]}
          label={label}
          whiteOverlay={key === 'map' ? 1 - mapMix : 0}
        />
      ))}
    </div>
  )
}

// ─── MaterialCard ─────────────────────────────────────────────────────────────

export function MaterialCard({ entry }) {
  const { name, material } = entry

  const [color, setColor]     = useState(() => threeToHex(material.color ?? new THREE.Color(1, 1, 1)))
  const [roughness, setRoughness] = useState(() => material.roughness ?? 1)
  
  // Intelligent default: branding faces start white (0), structural faces start original (1)
  const isBrandingFaceCheck = useCallback(() => {
    const matName = (name || '').toLowerCase()
    const isSide2 = matName.includes('side2') || matName.includes('side 2')
    return (matName.includes('front') || matName.includes('back') || matName.includes('side')) && !isSide2 && !matName.includes('inside')
  }, [name])

  // Initialize from material memory (userData) or default to the naming heuristic
  const [mapMix, setMapMix]   = useState(() => material.userData.artworkMix ?? (isBrandingFaceCheck() ? 0 : 1))
  const [expanded, setExpanded] = useState(false)

  const [originalAlbedoTex, setOriginalAlbedoTex] = useState(() => material.map ?? null)
  const [thumbSrc, setThumbSrc] = useState(() => textureToDataURL(material.map))

  const originalMapRef = useRef(material.map ?? null)
  const debounceRef    = useRef(null)

  useEffect(() => {
    if (originalAlbedoTex) setThumbSrc(textureToDataURL(originalAlbedoTex))
  }, [originalAlbedoTex])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const applyBlend = useCallback((v) => {
    if (originalMapRef.current) {
      material.map = originalMapRef.current
    }
    applyArtworkMix(material, v)
  }, [material])

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

  const handleMapMix = useCallback((v) => {
    setMapMix(v)
    material.userData.artworkMix = v // Persist to material memory
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      applyBlend(v)
      // Signal update for persistence
      if (entry.onUpdateConfig) {
        entry.onUpdateConfig({ artworkMix: v })
      }
    }, 40)
  }, [applyBlend, material, entry])

  // (Initial blend is handled by DisplayModel.jsx on load)

  // Replace the albedo bitmap
  const handleBitmapReplace = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    const img  = new Image()
    img.onload = () => {
      const origMap = originalMapRef.current
      const newTex  = new THREE.Texture(img)
      newTex.colorSpace = origMap?.colorSpace ?? THREE.SRGBColorSpace
      newTex.wrapS      = origMap?.wrapS      ?? THREE.RepeatWrapping
      newTex.wrapT      = origMap?.wrapT      ?? THREE.RepeatWrapping
      newTex.flipY      = origMap?.flipY      ?? false
      newTex.needsUpdate = true

      originalMapRef.current = newTex
      setOriginalAlbedoTex(newTex)
      applyBlend(mapMix)
      URL.revokeObjectURL(url)
    }
    img.src = url
    e.target.value = ''
  }, [mapMix, applyBlend])

  const isPBR       = material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial'
  const hasAlbedoMap = !!material.map

  return (
    <div className="material-card">
      <button className="material-card-header" onClick={() => setExpanded(p => !p)}>
        {thumbSrc ? (
          <div className="mat-header-thumb-wrap">
            <img src={thumbSrc} className="mat-header-thumb" alt="" />
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
          <TextureStrip material={material} mapMix={mapMix} originalAlbedoTex={originalAlbedoTex} />

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

          {material.color && (
            <div className="mat-row">
              <label className="mat-label">Color</label>
              <div className="mat-color-wrap">
                <input type="color" className="mat-color-input" value={color} onChange={handleColor} />
                <span className="mat-hex">{color.toUpperCase()}</span>
              </div>
            </div>
          )}

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

function MaterialGroup({ groupName, label, materials, onUpdateConfig }) {
  const [open, setOpen] = useState(false)
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
