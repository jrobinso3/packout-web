import { useMemo, useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'

// ─── TexturedBox ──────────────────────────────────────────────────────────────
// Renders a box where the front (+Z) and back (-Z) faces carry the product PNG.
// The four thin edge faces (left, right, top, bottom) use a neutral white so
// the label reads cleanly from the aisle without showing the image mirrored.

function TexturedBox({ dimensions, textureUrl }) {
  const texture = useLoader(THREE.TextureLoader, textureUrl)
  // Ensure correct color space for PNGs
  texture.colorSpace = THREE.SRGBColorSpace
  
  const [w, h, d] = dimensions

  // Re-use materials across re-renders; do NOT dispose shared textures here!
  const materials = useMemo(() => {
    // Create an invisible material for all faces except the front
    const invisible = new THREE.MeshBasicMaterial({ visible: false })
    
    const face = new THREE.MeshStandardMaterial({ 
      map: texture, 
      roughness: 0.6,
      transparent: true, // PNG alpha
      side: THREE.DoubleSide
    })

    // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
    // Only the +Z face (index 4) is visible.
    return [invisible, invisible, invisible, invisible, face, invisible]
  }, [texture])

  useEffect(() => {
    return () => {
      // We only dispose materials that are specific to this instance's mesh.
      // We do NOT dispose the texture here because other boxes might use it.
      materials.forEach((m) => m.dispose())
    }
  }, [materials])

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </mesh>
  )
}

// ─── ProductGroup ─────────────────────────────────────────────────────────────

function ProductGroup({ dropzoneMesh, items = [] }) {
  const transforms = useMemo(() => {
    if (!items.length) return []
    
    dropzoneMesh.geometry.computeBoundingBox()
    const bbox = dropzoneMesh.geometry.boundingBox

    const dropzoneWidth  = bbox.max.x - bbox.min.x
    const dropzoneHeight = bbox.max.y - bbox.min.y
    const dropzoneDepth  = bbox.max.z - bbox.min.z

    const results = []
    const dummy        = new THREE.Object3D()
    const globalMatrix = new THREE.Matrix4()

    // Start at the left edge of the dropzone
    let cursorX = bbox.min.x

    items.forEach((item) => {
      const { product, facings, stackVertical, spacing } = item
      const [pWidth, pHeight, pDepth] = product.dimensions

      // Use the cursorX to position the start of this product's block
      const startX = cursorX + pWidth / 2
      
      // Calculate how many fit in Y and Z
      const countY = stackVertical ? Math.max(1, Math.floor(dropzoneHeight / pHeight)) : 1
      const countZ = Math.max(1, Math.floor(dropzoneDepth  / pDepth))

      // Vertical centering if not stacking
      const startY = stackVertical ? (bbox.min.y + pHeight / 2) : (bbox.min.y + dropzoneHeight / 2)
      const startZ = bbox.min.z + (dropzoneDepth - countZ * pDepth) / 2 + pDepth / 2

      for (let y = 0; y < countY; y++) {
        for (let z = 0; z < countZ; z++) {
          for (let x = 0; x < facings; x++) {
            const posX = startX + x * pWidth
            
            // Check if we've exceeded the dropzone width
            if (posX - pWidth / 2 > bbox.max.x) continue

            dummy.position.set(posX, startY + y * pHeight, startZ + z * pDepth)
            dummy.updateMatrix()
            globalMatrix.copy(dropzoneMesh.matrixWorld).multiply(dummy.matrix)

            const pos  = new THREE.Vector3()
            const quat = new THREE.Quaternion()
            const scale = new THREE.Vector3()
            globalMatrix.decompose(pos, quat, scale)
            
            results.push({ pos, quat, scale, product, id: `${item.id}-${x}-${y}-${z}` })
          }
        }
      }

      // Advance cursor: width of this group + its trailing spacing
      cursorX += (facings * pWidth) + (spacing * 0.0254) // convert inches to meters
    })

    return results
  }, [dropzoneMesh, items])

  return (
    <group>
      {transforms.map((t) => {
        const { product, pos, quat, scale, id } = t
        const [pWidth, pHeight, pDepth] = product.dimensions
        const radXZ = Math.min(pWidth, pDepth) / 2 - 0.001

        if (product.isCustom) {
          return (
            <group key={id} position={pos} quaternion={quat} scale={scale}>
              <TexturedBox dimensions={product.dimensions} textureUrl={product.textureUrl} />
            </group>
          )
        }

        return (
          <mesh key={id} position={pos} quaternion={quat} scale={scale} castShadow receiveShadow>
            {product.geometry === 'sphere'   && <sphereGeometry   args={[radXZ, 32, 16]} />}
            {product.geometry === 'cylinder' && <cylinderGeometry args={[radXZ, radXZ, pHeight - 0.002, 32]} />}
            {product.geometry === 'cone'     && <coneGeometry     args={[radXZ, pHeight - 0.002, 32]} />}
            {(!product.geometry || product.geometry === 'box') && <boxGeometry args={[pWidth - 0.002, pHeight - 0.002, pDepth - 0.002]} />}
            <meshStandardMaterial color={product.color} roughness={0.1} metalness={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

// ─── PlacementsRenderer ───────────────────────────────────────────────────────

export default function PlacementsRenderer({ placements }) {
  return (
    <group>
      {Object.entries(placements).map(([uuid, placement]) => (
        <ProductGroup
          key={uuid}
          dropzoneMesh={placement.mesh}
          items={placement.items}
        />
      ))}
    </group>
  )
}
