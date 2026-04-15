import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

export default function DisplayModel({ url }) {
  const { scene } = useGLTF(url)

  // We mutate the pristine scene directly instead of cloning it.
  // Cloning scenes in ThreeJS often strips complex PBR textures or nodes!
  useMemo(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        const n = child.name.toLowerCase()
        // Only modify the dropzones. Leave the rest of the display completely untouched!
        if (n.includes('dropzone')) {
          if (n.includes('col')) {
            // ── Invisible collision proxy ──────────────────────────────────
            // visible=false hides it from the renderer but Three.js raycaster
            // still tests it, so it acts as a perfect invisible hit volume.
            child.visible = false
            child.userData.isDropzone = true
            // Store the parent group so DropController can find the visual
            // siblings when it needs to toggle the hover highlight.
            child.userData.visualGroup = child.parent
          } else {
            // ── Visual wire tubes ──────────────────────────────────────────
            // Each gets its own material instance so hover can be toggled
            // independently per slot.
            child.material = new THREE.MeshBasicMaterial({
              color: 0x00f0ff,
              wireframe: true,
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide
            })
            child.userData.isDropzoneVisual = true
          }
        } else {
          // Assure the original materials cast and receive shadows properly
          child.castShadow = true
          child.receiveShadow = true
          
          if (child.material) {
            // Clone the material to avoid shared cache mutations across HMR reloads
            // This prevents the 'WebGL: INVALID_OPERATION: useProgram: program not valid' error
            if (Array.isArray(child.material)) {
               child.material = child.material.map(mat => {
                 const newMat = mat.clone()
                 newMat.side = THREE.DoubleSide
                 return newMat
               })
            } else {
               child.material = child.material.clone()
               child.material.side = THREE.DoubleSide
            }
          }
        }
      }
    })
  }, [scene])

  return <primitive object={scene} position={[0, -1, 0]} />
}
