import { useGLTF } from '@react-three/drei'
import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import * as THREE from 'three'

// Capitalize and pretty-print mesh names: "shelf1" → "Shelf 1", "floorstand" → "Floorstand"
function prettifyName(name) {
  return name
    .replace(/\.\d+$/g, '')          // Remove Blender .001 suffixes
    .replace(/_/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2') // "shelf1" → "shelf 1"
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// Utility to clean suffixes like .001
function normalizeName(name) {
  if (!name) return 'unnamed'
  return name.replace(/\.\d+$/g, '').trim()
}

// Hierarchy search for meaningful part name
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
  const [hoveredGroupId, setHoveredGroupId] = useState(null)

  // Every time we load this model instance, we clone the scene graph.
  // This prevents destructive mutations from leaking into the useGLTF cache.
  const instance = useMemo(() => scene.clone(), [scene])

  // Sync emissive highlight based on hover state
  useEffect(() => {
    instance.traverse(node => {
      if (node.isMesh && node.material) {
        const n = node.name.toLowerCase()
        const isInteractive = !n.includes('_col') && !n.includes('col') && !n.includes('_ind') && !n.includes('dropzone')
        if (!isInteractive) return

        const meshName = getInteractionGroupName(node)
        const isHovered = meshName === hoveredGroupId
        const isSelected = meshName === activePartId
        
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach(mat => {
          if (mat.emissive) {
            // High-contrast Blue pulse for hover, deep blue glow for selection
            if (isHovered) mat.emissive.set(0x3399ff)
            else if (isSelected) mat.emissive.set(0x1a4d80)
            else mat.emissive.set(0x000000)
          }
        })
      }
    })
  }, [hoveredGroupId, activePartId, instance])

  // Setup the scene graph (materials, registry, shadows)
  useLayoutEffect(() => {
    // groupsMap: meshName → Map<uuid, entry>
    const groupsMap = new Map()

    const addToGroup = (meshName, entry) => {
      if (!groupsMap.has(meshName)) groupsMap.set(meshName, new Map())
      const g = groupsMap.get(meshName)
      if (!g.has(entry.uuid)) g.set(entry.uuid, entry)
    }

    instance.traverse((child) => {
      if (child.isMesh) {
        const n = child.name.toLowerCase()
        const isCollider = n.includes('_col') || n === 'col'
        const isVisual   = n.includes('_ind') || n.includes('dropzone')

        if (isCollider) {
          child.visible = true
          child.material = new THREE.MeshBasicMaterial({ visible: false })
          child.userData.isDropzone = true
          child.userData.visualGroup = child.parent
        } else if (isVisual) {
          if (child.material) {
            const oldMat = child.material
            if (!oldMat.emissive) {
              child.material = new THREE.MeshStandardMaterial({
                color: oldMat.color.clone(),
                emissive: new THREE.Color(0x000000),
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false, 
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
          child.castShadow = true
          child.receiveShadow = true

          if (child.material) {
            const processMat = (mat) => {
              const newMat = mat.clone()
              newMat.side = THREE.DoubleSide
              return newMat
            }
            const meshName = getInteractionGroupName(child)

            if (Array.isArray(child.material)) {
              child.material = child.material.map(processMat)
              child.material.forEach(mat => {
                const cleanName = (mat.name || child.name || 'Unnamed').replace(/\.\d+$/g, '')
                addToGroup(meshName, {
                  uuid: mat.uuid,
                  name: prettifyName(cleanName),
                  material: mat,
                })
              })
            } else {
              child.material = processMat(child.material)
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
      }
    })

    if (onMaterialsReady) {
      const groups = Array.from(groupsMap.entries()).map(([meshName, matsMap]) => ({
        groupName: meshName,
        label: prettifyName(meshName),
        materials: Array.from(matsMap.values()),
      }))
      onMaterialsReady(groups)
    }

    if (onLoaded) {
      onLoaded(instance)
    }
  }, [instance, onMaterialsReady, onLoaded])

  const handlePointerOver = (e) => {
    e.stopPropagation()
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
      rotation-y={(rotation * Math.PI) / 180} 
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  )
}
