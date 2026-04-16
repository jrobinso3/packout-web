import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
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

export default function DisplayModel({ url, onMaterialsReady, onLoaded, rotation = 0 }) {
  const { scene } = useGLTF(url)

  // We mutate the pristine scene directly instead of cloning it.
  // Cloning scenes in ThreeJS often strips complex PBR textures or nodes!
  useMemo(() => {
    // groupsMap: meshName → Map<uuid, entry>
    // This lets the UI organise material cards by which object they belong to.
    const groupsMap = new Map()

    const addToGroup = (meshName, entry) => {
      if (!groupsMap.has(meshName)) groupsMap.set(meshName, new Map())
      const g = groupsMap.get(meshName)
      if (!g.has(entry.uuid)) g.set(entry.uuid, entry)
    }

    scene.traverse((child) => {
      if (child.isMesh) {
        const n = child.name.toLowerCase()
        // Only modify the dropzones. Leave the rest of the display completely untouched!
        const isCollider = n.includes('_col') || n === 'col'
        const isVisual   = n.includes('_ind') || n.includes('dropzone')

        if (isCollider) {
          // ── Invisible collision proxy ──────────────────────────────────
          // visible=false hides it from the renderer but Three.js raycaster
          // still tests it, so it acts as a perfect invisible hit volume.
          child.visible = false
          child.userData.isDropzone = true
          // Store the parent group so DropController can find the visual
          // siblings when it needs to toggle the hover highlight.
          child.userData.visualGroup = child.parent
        } else if (isVisual) {
          // ── Visual guide companion ─────────────────────────────────────
          // Maintain original green albedo, but enable emissive support
          if (child.material) {
            const oldMat = child.material
            
            if (!oldMat.emissive) {
              child.material = new THREE.MeshStandardMaterial({
                color: oldMat.color.clone(),
                emissive: new THREE.Color(0x000000),
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                metalness: 0,
                roughness: 1
              })
            } else {
              child.material = oldMat.clone()
              child.material.emissive.set(0x000000)
              child.material.transparent = true
              child.material.opacity = 0.2
              child.material.side = THREE.DoubleSide
            }
          }
          child.userData.isDropzoneVisual = true
        } else {
          // Assure the original materials cast and receive shadows properly
          child.castShadow = true
          child.receiveShadow = true

          if (child.material) {
            // Clone the material to avoid shared cache mutations across HMR reloads
            const processMat = (mat) => {
              const newMat = mat.clone()
              newMat.side = THREE.DoubleSide
              return newMat
            }

            // Group key = Blender object name, which is the parent Group node.
            // Multi-material objects export as:
            //   Group "floorstand" → Mesh "floorstand", Mesh "floorstand_1", ...
            // Using parent.name collapses all primitives under one heading.
            const meshName = child.parent?.name || child.name || 'unnamed'

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

    // Convert to array of { groupName, label, materials[] }
    if (onMaterialsReady) {
      const groups = Array.from(groupsMap.entries()).map(([meshName, matsMap]) => ({
        groupName: meshName,
        label: prettifyName(meshName),
        materials: Array.from(matsMap.values()),
      }))
      onMaterialsReady(groups)
    }

    if (onLoaded) {
      onLoaded(scene)
    }
  }, [scene, onMaterialsReady, onLoaded])

  return <primitive object={scene} position={[0, -1, 0]} rotation-y={(rotation * Math.PI) / 180} />
}
