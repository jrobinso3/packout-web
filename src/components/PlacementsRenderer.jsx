import { useMemo, useEffect, useRef, Suspense } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'

// ─── Shared Logic ─────────────────────────────────────────────────────────────

const sharedInvisibleMat = new THREE.MeshBasicMaterial({ visible: false })

/**
 * Renders a batch of custom textured products.
 * Hooks are kept isolate to this component to avoid conditional hook violations.
 */
function CustomProductBatch({ product, matrices }) {
  const meshRef = useRef()
  const [wi, hi, di] = product.dimensions
  const w = wi * 0.0254
  const h = hi * 0.0254
  const d = di * 0.0254
  
  const texture = useLoader(THREE.TextureLoader, product.textureUrl)
  texture.colorSpace = THREE.SRGBColorSpace

  const materials = useMemo(() => [
    sharedInvisibleMat, sharedInvisibleMat, sharedInvisibleMat, sharedInvisibleMat,
    new THREE.MeshStandardMaterial({ 
      map: texture, 
      transparent: true, 
      alphaTest: 0.5, // Stop transparent pixels from blocking depth
      roughness: 0.6, 
      side: THREE.DoubleSide 
    }),
    sharedInvisibleMat
  ], [texture])

  useEffect(() => {
    if (!meshRef.current) return
    matrices.forEach((matrix, i) => {
      meshRef.current.setMatrixAt(i, matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [matrices])

  return (
    <instancedMesh ref={meshRef} args={[null, null, matrices.length]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </instancedMesh>
  )
}

/**
 * Renders a batch of standard demo shapes.
 */
function StandardProductBatch({ product, matrices }) {
  const meshRef = useRef()
  const [wi, hi, di] = product.dimensions
  const w = wi * 0.0254
  const h = hi * 0.0254
  const d = di * 0.0254

  useEffect(() => {
    if (!meshRef.current) return
    matrices.forEach((matrix, i) => {
      meshRef.current.setMatrixAt(i, matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [matrices])

  const radXZ = Math.min(w, d) / 2
  let geometry
  if (product.geometry === 'sphere')   geometry = <sphereGeometry   args={[radXZ, 32, 16]} />
  if (product.geometry === 'cylinder') geometry = <cylinderGeometry args={[radXZ, radXZ, h - 0.002, 32]} />
  if (product.geometry === 'cone')     geometry = <coneGeometry     args={[radXZ, h - 0.002, 32]} />
  if (!geometry)                       geometry = <boxGeometry      args={[w - 0.002, h - 0.002, d - 0.002]} />

  return (
    <instancedMesh ref={meshRef} args={[null, null, matrices.length]} castShadow receiveShadow>
      {geometry}
      <meshStandardMaterial color={product.color} roughness={0.8} metalness={0} />
    </instancedMesh>
  )
}

function ProductGroup({ dropzoneMesh, items = [], rotation = 0 }) {
  const groups = useMemo(() => {
    if (!items.length) return new Map()
    
    // R3F applies rotation-y to the Three.js scene during the commit phase, but
    // useMemo runs during the render phase — so the scene rotation is one cycle
    // stale when this recalculates. Fix: walk up to the GLTF scene root and
    // apply the rotation manually before recomputing world matrices.
    let sceneRoot = dropzoneMesh
    while (sceneRoot.parent && sceneRoot.parent.type !== 'Scene') {
      sceneRoot = sceneRoot.parent
    }
    sceneRoot.rotation.y = (rotation * Math.PI) / 180
    dropzoneMesh.updateMatrixWorld(true)

    const worldScale = new THREE.Vector3()
    dropzoneMesh.getWorldScale(worldScale)
    if (worldScale.x === 0) worldScale.x = 1
    if (worldScale.y === 0) worldScale.y = 1
    if (worldScale.z === 0) worldScale.z = 1

    dropzoneMesh.geometry.computeBoundingBox()
    const bbox = dropzoneMesh.geometry.boundingBox
    const localWidth  = bbox.max.x - bbox.min.x
    const localHeight = bbox.max.y - bbox.min.y
    const localDepth  = bbox.max.z - bbox.min.z

    const map = new Map()
    const dummy = new THREE.Object3D()
    const globalMatrix = new THREE.Matrix4()

    const globalAutoFit = items.some(item => item.autoFit)
    let totalFacings = 0
    let totalProductWidthLocal = 0
    
    items.forEach(item => {
      const f = item.facings || 1
      const lw = ((item.product.dimensions?.[0] || 4) * 0.0254) / worldScale.x
      totalFacings += f
      totalProductWidthLocal += f * lw
    })

    const globalAutoSpacingX = (globalAutoFit && totalFacings > 1)
      ? (localWidth - totalProductWidthLocal) / (totalFacings - 1)
      : 0

    let accumulatedWidthLocal = 0
    let globalFacingCounter = 0

    items.forEach((item) => {
      const { product, facings = 1, stackVertical = false, spacing = 0, autoFit = false } = item
      const [piW, piH, piD] = product.dimensions
      const pWidth  = piW * 0.0254
      const pHeight = piH * 0.0254
      const pDepth  = piD * 0.0254
      
      const lpWidth  = pWidth / worldScale.x
      const lpHeight = pHeight / worldScale.y
      const lpDepth  = pDepth / worldScale.z
      const lsMeters = (spacing * 0.0254) / worldScale.x

      const countY = stackVertical ? Math.max(1, Math.floor(localHeight / lpHeight)) : 1
      const countZ = Math.max(1, Math.floor(localDepth  / lpDepth))
      const spacingZ = (autoFit && countZ > 1) ? (localDepth - (countZ * lpDepth)) / (countZ - 1) : 0

      const startZ = bbox.max.z - lpDepth / 2
      const startY = bbox.min.y + lpHeight / 2

      if (!map.has(product.id)) map.set(product.id, { product, matrices: [] })
      const groupData = map.get(product.id)

      const spacingX = globalAutoFit ? globalAutoSpacingX : lsMeters

      for (let y = 0; y < countY; y++) {
        // Draw BACK to FRONT for correct transparency sorting
        for (let z = countZ - 1; z >= 0; z--) {
          for (let x = 0; x < facings; x++) {
            const posX = bbox.min.x + accumulatedWidthLocal + (x * lpWidth) + (globalFacingCounter + x) * spacingX + lpWidth / 2
            if (posX - lpWidth / 2 > bbox.max.x + 0.005) continue
            
            dummy.position.set(posX, startY + y * lpHeight, startZ - z * (lpDepth + spacingZ))
            dummy.updateMatrix()
            globalMatrix.copy(dropzoneMesh.matrixWorld).multiply(dummy.matrix)
            groupData.matrices.push(globalMatrix.clone())
          }
        }
      }
      accumulatedWidthLocal += facings * lpWidth + (globalAutoFit ? 0 : facings * lsMeters)
      if (globalAutoFit) globalFacingCounter += facings
    })

    return map
  }, [dropzoneMesh, items, rotation])

  return (
    <group>
      {Array.from(groups.values()).map(({ product, matrices }) => (
        <Suspense key={product.id} fallback={null}>
          {(product.isCustom || product.textureUrl) ? (
            <CustomProductBatch product={product} matrices={matrices} />
          ) : (
            <StandardProductBatch product={product} matrices={matrices} />
          )}
        </Suspense>
      ))}
    </group>
  )
}

export default function PlacementsRenderer({ placements, rotation = 0, scene }) {
  return (
    <group>
      {Object.entries(placements).map(([shelfName, placement]) => {
        // Re-bind: Find the live mesh instance in the scene by its stable name
        const mesh = scene?.getObjectByName(shelfName)
        if (!mesh) return null

        return (
          <ProductGroup
            key={shelfName}
            dropzoneMesh={mesh}
            items={placement.items}
            rotation={rotation}
          />
        )
      })}
    </group>
  )
}
