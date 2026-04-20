// ─── DisplayModel.jsx ─────────────────────────────────────────────────────────
// Loads a GLB fixture model and classifies every mesh into one of three roles:
//
//   _col  →  Dropzone collider  (invisible, used for raycasting shelf selection)
//   _ind  →  Visual indicator   (semi-transparent shelf-highlight overlay)
//   other →  Visual surface     (shadow-casting, clickable for material editing)
//
// After classification, the visual surfaces are registered into a "material
// groups" map and reported upward via onMaterialsReady. This map drives the
// MaterialEditor / MaterialFloatingMenu UI.
//
// Emissive highlight colours are applied reactively based on hover/selection
// state so users get clear feedback when mousing over parts.
// ──────────────────────────────────────────────────────────────────────────────

import { useGLTF } from '@react-three/drei'
import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { applyArtworkMix } from '../utils/textureUtils'

// ─── prettifyName ─────────────────────────────────────────────────────────────
// Converts raw GLB mesh names into human-readable labels for the UI.
// Examples: "shelf1" → "Shelf 1", "floorstand_front" → "Floorstand Front"
function prettifyName(name) {
  return name
    .replace(/\.\d+$/g, '')           // Remove Blender .001 suffixes
    .replace(/_/g, ' ')               // Underscores → spaces
    .replace(/([a-z])(\d)/g, '$1 $2') // "shelf1" → "shelf 1"
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// ─── normalizeName ────────────────────────────────────────────────────────────
// Strips Blender .001/.002 numeric suffixes from mesh names so that duplicated
// mesh names created by Blender still resolve to the same key.
function normalizeName(name) {
  if (!name) return 'unnamed'
  return name.replace(/\.\d+$/g, '').trim()
}

// ─── getInteractionGroupName ──────────────────────────────────────────────────
// Resolves which "group" a mesh belongs to for interaction purposes.
// If the mesh's parent has a meaningful name (not Scene/RootNode/Collection),
// the parent name is returned — this groups all sibling meshes under the same
// selection target (e.g., every face of "Front_Panel" acts as one clickable part).
function getInteractionGroupName(node) {
  if (!node) return 'unnamed'
  const parentName = node.parent?.name || ''
  const lpn = parentName.toLowerCase()
  const isParentGeneric = !parentName || lpn === 'scene' || lpn === 'rootnode' || lpn.includes('collection')

  const nameToUse = isParentGeneric ? node.name : parentName
  return normalizeName(nameToUse)
}

export default function DisplayModel({ url, onMaterialsReady, onLoaded, rotation = 0, onSelectPart, activePartId }) {
  const { scene } = useGLTF(url)

  // Track which part group the pointer is currently over for emissive feedback
  const [hoveredGroupId, setHoveredGroupId] = useState(null)

  // Clone the scene so mutations (material overrides, visibility changes) don't
  // contaminate the useGLTF cache shared by other consumers of the same URL.
  const instance = useMemo(() => scene.clone(), [scene])

  // ─── EMISSIVE HIGHLIGHT SYNC ─────────────────────────────────────────────────
  // Run any time hover or selection state changes. Walks every mesh in the
  // instance and sets its emissive colour:
  //   Hovered  → bright blue (#3399ff)
  //   Selected → dark blue glow (#1a4d80)
  //   Default  → no emissive (#000000)
  useEffect(() => {
    instance.traverse(node => {
      if (node.isMesh && node.material) {
        const n = node.name.toLowerCase()
        // Only apply feedback to interactive (non-collider, non-indicator) meshes
        const isInteractive = !n.includes('_col') && !n.includes('col') && !n.includes('_ind') && !n.includes('dropzone')
        if (!isInteractive) return

        const meshName = getInteractionGroupName(node)
        const isHovered = meshName === hoveredGroupId
        const isSelected = meshName === activePartId

        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach(mat => {
          if (mat.emissive) {
            if (isHovered) mat.emissive.set(0x3399ff)
            else if (isSelected) mat.emissive.set(0x1a4d80)
            else mat.emissive.set(0x000000)
          }
        })
      }
    })
  }, [hoveredGroupId, activePartId, instance])

  // ─── SCENE SETUP ─────────────────────────────────────────────────────────────
  // useLayoutEffect runs synchronously after the DOM is updated but before the
  // browser paints — ideal here because we need materials set before the first
  // render frame so there is no flash of un-classified geometry.
  useLayoutEffect(() => {
    // groupsMap: meshGroupName → Map<materialUuid, entry>
    // Using a Map<uuid, entry> (not an array) prevents duplicate entries when
    // multiple meshes in the same group share the same material instance.
    const groupsMap = new Map()

    const addToGroup = (meshName, entry) => {
      if (!groupsMap.has(meshName)) groupsMap.set(meshName, new Map())
      const g = groupsMap.get(meshName)
      if (!g.has(entry.uuid)) g.set(entry.uuid, entry)
    }

    instance.traverse((child) => {
      if (child.isMesh) {
        const n = child.name.toLowerCase()
        const isCollider = n.includes('_col') || n === 'col'   // Invisible drop target
        const isVisual   = n.includes('_ind') || n.includes('dropzone') // Semi-transparent overlay

        if (isCollider) {
          // Collider meshes are fully invisible; only the raycaster "sees" them.
          child.visible = true
          child.material = new THREE.MeshBasicMaterial({ visible: false })
          child.userData.isDropzone = true
          child.userData.visualGroup = child.parent // Reference for highlight sync
        } else if (isVisual) {
          // Visual indicator meshes: semi-transparent overlay for shelf feedback.
          // We need MeshStandardMaterial so emissive can be applied for hover glow.
          if (child.material) {
            const oldMat = child.material
            if (!oldMat.emissive) {
              // Upgrade basic materials to standard so emissive works
              child.material = new THREE.MeshStandardMaterial({
                color: oldMat.color.clone(),
                emissive: new THREE.Color(0x000000),
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false, // Prevents z-fighting with shelf surface
                metalness: 0,
                roughness: 1
              })
            } else {
              child.material = oldMat.clone()
              child.material.emissive.set(0x000000)
              child.material.transparent = true
              child.material.opacity = 0.2
              child.material.side = THREE.DoubleSide
              child.material.depthWrite = false
            }
          }
          child.userData.isDropzoneVisual = true
        } else {
          // ── Visual surface mesh: cast/receive shadows, register in group map ──
          child.castShadow = true
          child.receiveShadow = true

          const meshName = getInteractionGroupName(child)

          // brandAndProcess: clone the material and apply the correct artwork mix
          const brandAndProcess = (mat) => {
            const newMat = mat.clone()
            newMat.side = THREE.DoubleSide

            const matName = (newMat.name || child.name || '').toLowerCase()

            // Branding filter: front/back/side faces get artwork mix = 0 (solid white)
            // so customer artwork can be composited on top. "side2", "inside" are NOT
            // branding faces — they're structural panels that show the raw material texture.
            const isSide2 = matName.includes('side2') || matName.includes('side 2')
            const isBrandingFace = (
              matName.includes('front') ||
              matName.includes('side')
            ) && !isSide2 && !matName.includes('inside')

            if (isBrandingFace) {
              // Start fully white; the user can dial up the artwork via the mix slider
              newMat.userData.artworkMix = 0
              applyArtworkMix(newMat, 0)
            } else {
              // Start with full texture visible for structural faces
              newMat.userData.artworkMix = 1
              if (newMat.map) {
                // Enable tiling/repeat wrapping for the corrugate/cardboard texture
                newMat.map.wrapS = THREE.RepeatWrapping
                newMat.map.wrapT = THREE.RepeatWrapping
                newMat.map.repeat.set(3, 3) // 3x Tile for better scale
              }
            }
            return newMat
          }

          if (Array.isArray(child.material)) {
            // Multi-material mesh: process each slot independently
            child.material = child.material.map(brandAndProcess)
            child.material.forEach(mat => {
              const cleanName = (mat.name || child.name || 'Unnamed').replace(/\.\d+$/g, '')
              addToGroup(meshName, {
                uuid: mat.uuid,
                name: prettifyName(cleanName),
                material: mat,
              })
            })
          } else {
            child.material = brandAndProcess(child.material)
            const mat = child.material
            const cleanName = (mat.name || child.name || 'Unnamed').replace(/\.\d+$/g, '')
            addToGroup(meshName, {
              uuid: mat.uuid,
              name: prettifyName(cleanName),
              material: mat,
            })
          }
        }
      }
    })

    // Convert groupsMap to a plain array for React-friendly state consumption
    if (onMaterialsReady) {
      const groups = Array.from(groupsMap.entries()).map(([meshName, matsMap]) => ({
        groupName: meshName,
        label: prettifyName(meshName),
        materials: Array.from(matsMap.values()),
      }))
      onMaterialsReady(groups)
    }

    // Bubble the cloned scene up to App/ConfiguratorCanvas so re-binding can occur
    if (onLoaded) {
      onLoaded(instance)
    }
  }, [instance, onMaterialsReady, onLoaded])

  // ─── POINTER EVENT HANDLERS ──────────────────────────────────────────────────
  // These handlers live on the <primitive> element so R3F's pointer event system
  // routes them correctly through the scene hierarchy.

  const handlePointerOver = (e) => {
    e.stopPropagation() // Prevent bubbling to parent meshes
    const mesh = e.object
    const n = mesh.name.toLowerCase()
    const isInteractive = !n.includes('_col') && !n.includes('col') && !n.includes('_ind') && !n.includes('dropzone')
    if (isInteractive) {
      setHoveredGroupId(getInteractionGroupName(mesh))
    }
  }

  const handlePointerOut = () => setHoveredGroupId(null)

  const handleClick = (e) => {
    e.stopPropagation()
    const mesh = e.object
    const n = mesh.name.toLowerCase()
    const isInteractive = !n.includes('_col') && !n.includes('col') && !n.includes('_ind') && !n.includes('dropzone')
    if (isInteractive && onSelectPart) {
      onSelectPart(getInteractionGroupName(mesh))
    }
  }

  return (
    <primitive
      object={instance}
      position={[0, -1, 0]}
      rotation-y={(rotation * Math.PI) / 180} // Degrees from App → radians for Three.js
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  )
}
