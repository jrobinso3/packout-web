// ─── PlacementsRenderer.jsx ───────────────────────────────────────────────────
// Renders all products that have been dropped onto display shelves.
//
// Architecture: three specialised batch renderers handle the three product types:
//   ModelProductBatch   — full GLB scenes cloned per-instance
//   CustomProductBatch  — InstancedMesh with a PNG texture on the front face
//   StandardProductBatch — InstancedMesh with a procedural shape + solid colour
//
// ProductGroup sits above these batchers. It owns the matrix calculation logic:
// it reads the dropzone mesh's bounding box and world scale, then computes a
// world-space transform matrix for every product unit (facing × stack × depth).
//
// PlacementsRenderer is the public entry point. It iterates the placements map
// and re-binds each shelf name to a live mesh in the loaded scene.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useEffect, useRef, Suspense } from 'react'
import { useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { resolveAssetUrl } from '../utils/textureUtils'
import { ErrorBoundary } from '../utils/ErrorBoundary'

// Shared invisible material used for the five non-front faces of custom products.
// Declared outside components so it is created once and never recreated.
const sharedInvisibleMat = new THREE.MeshBasicMaterial({ visible: false })

// ─── ModelProductBatch ────────────────────────────────────────────────────────
// Renders a set of full 3D GLB models at the given world-space matrices.
// Each instance is a full scene clone so GLB animations / sub-meshes are intact.
// NOTE: Cloning full scenes is memory-intensive; used only for '3D' category products.
function ModelProductBatch({ product, matrices, shelfId }) {
  const { scene } = useGLTF(resolveAssetUrl(product.glbUrl))

  // Normalize the GLB source to unit size (1.0).
  const { normalizationScale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    return {
      normalizationScale: new THREE.Vector3(
        1 / (size.x || 1),
        1 / (size.y || 1),
        1 / (size.z || 1)
      ),
      offset: center.multiplyScalar(-1)
    }
  }, [scene])

  // Optimization: use stable clones for the number of instances needed.
  const clones = useMemo(() => {
    return matrices.map(() => scene.clone())
  }, [scene, matrices.length])

  // Decompose matrices into R3F-consumable props (position, quaternion, scale).
  // This is more robust than manual matrix copying for standard React updates.
  const instanceData = useMemo(() => {
    return matrices.map(m => {
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scl = new THREE.Vector3()
      m.decompose(pos, quat, scl)
      return { pos, quat, scl }
    })
  }, [matrices])

  return (
    <group>
      {instanceData.map((data, i) => (
        <group
          key={i}
          position={data.pos}
          quaternion={data.quat}
          scale={data.scl}
        >
          {clones[i] && (
            <primitive
              object={clones[i]}
              scale={normalizationScale}
              position={offset.clone().multiply(normalizationScale)}
              castShadow
              receiveShadow
              userData={{ isProduct: true, shelfId, productId: product.id }}
            />
          )}
        </group>
      ))}
    </group>
  )
}

// ─── CustomProductBatch ───────────────────────────────────────────────────────
// Renders PNG-textured custom products as a single InstancedMesh (one draw call).
// The box has 6 faces; only face index 4 (front/+Z) gets the texture — the rest
// use the shared invisible material so the product looks like a flat standee.
function CustomProductBatch({ product, matrices, shelfId }) {
  const meshRef = useRef()

  // Load the PNG texture once; mark as sRGB so colours display correctly
  const texture = useLoader(THREE.TextureLoader, resolveAssetUrl(product.textureUrl))
  texture.colorSpace = THREE.SRGBColorSpace

  // Build the per-face material array once per unique texture
  const materials = useMemo(() => [
    sharedInvisibleMat, // -X (left)
    sharedInvisibleMat, // +X (right)
    sharedInvisibleMat, // +Y (top)
    sharedInvisibleMat, // -Y (bottom)
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,   // Discard pixels below 50% alpha; prevents depth-sorting artefacts
      roughness: 0.6,
      side: THREE.DoubleSide
    }),
    sharedInvisibleMat  // -Z (back)
  ], [texture])

  // Push updated matrices into the InstancedMesh whenever placements change
  useEffect(() => {
    if (!meshRef.current) return
    matrices.forEach((matrix, i) => {
      meshRef.current.setMatrixAt(i, matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [matrices])

  return (
    <instancedMesh
      key={matrices.length}
      ref={meshRef}
      args={[null, null, matrices.length]}
      count={matrices.length}
      castShadow
      receiveShadow
      userData={{ isProduct: true, shelfId, productId: product.id }}
    >
      {/* Matrix scale handles the physical dimensions; geometry is unit sized (1.0) */}
      <boxGeometry />
      {/* R3F accepts array materials via the material-N attach pattern */}
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </instancedMesh>
  )
}

// ─── StandardProductBatch ─────────────────────────────────────────────────────
// Renders built-in demo shapes (box, sphere, cylinder, cone) as an InstancedMesh.
// Used for products from the default catalog that have no uploaded texture.
function StandardProductBatch({ product, matrices, shelfId }) {
  const meshRef = useRef()

  const geometry = useMemo(() => {
    switch (product.geometry) {
      case 'sphere':   return <sphereGeometry   args={[0.5, 32, 16]} />
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
      case 'cone':     return <coneGeometry     args={[0.5, 1, 32]} />
      default:         return <boxGeometry />
    }
  }, [product.geometry])

  useEffect(() => {
    if (!meshRef.current) return
    matrices.forEach((matrix, i) => {
      meshRef.current.setMatrixAt(i, matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [matrices])

  return (
    <instancedMesh
      key={matrices.length}
      ref={meshRef}
      args={[null, null, matrices.length]}
      count={matrices.length}
      castShadow
      receiveShadow
      userData={{ isProduct: true, shelfId, productId: product.id }}
    >
      {geometry}
      <meshStandardMaterial color={product.color} roughness={0.8} metalness={0} />
    </instancedMesh>
  )
}

// ─── ProductGroup ─────────────────────────────────────────────────────────────
// Core matrix calculation layer. Given a dropzone mesh and a list of placement
// items, computes a world-space Matrix4 for every individual product unit.
//
// Layout algorithm:
//   • Iterates items left-to-right across the shelf width
//   • Each item occupies (facings × productWidth) of horizontal space
//   • If autoFit is on, remaining shelf space is distributed as even gaps
//   • Products are stacked vertically if stackVertical is true
//   • Depth (Z) is filled front-to-back; drawn BACK-TO-FRONT for correct alpha sorting
function ProductGroup({ dropzoneMesh, items = [], rotation = 0, shelfId, displayRoot }) {
  const groups = useMemo(() => {
    if (!items.length) return new Map()

    // R3F applies the rotation-y prop to the scene during the commit phase, but
    // useMemo runs during render — so the rotation is one cycle stale when matrices
    // are recalculated. Fix: manually sync the display root's rotation before
    // updating world matrices so localToWorld gives the correct result.
    if (displayRoot) {
      displayRoot.rotation.y = (rotation * Math.PI) / 180
      // CRITICAL: Update from root down to ensure all parent scales/positions are current
      displayRoot.updateMatrixWorld(true) 
    }

    // Get the shelf's world scale (accounts for any non-uniform scaling in Blender)
    const worldScale = new THREE.Vector3()
    dropzoneMesh.getWorldScale(worldScale)
    // Guard against degenerate zero-scale meshes
    if (worldScale.x === 0) worldScale.x = 1
    if (worldScale.y === 0) worldScale.y = 1
    if (worldScale.z === 0) worldScale.z = 1

    dropzoneMesh.geometry.computeBoundingBox()
    const bbox = dropzoneMesh.geometry.boundingBox

    // Local (un-scaled) bounding box dimensions
    const localWidth  = bbox.max.x - bbox.min.x
    const localHeight = bbox.max.y - bbox.min.y
    const localDepth  = bbox.max.z - bbox.min.z

    // result map: productId → { product, matrices[] }
    const map = new Map()
    const dummy = new THREE.Object3D() // Reused to build local transforms
    const globalMatrix = new THREE.Matrix4()

    // ── Auto-fit spacing calculation ──────────────────────────────────────────
    // If any item has autoFit=true, treat it as a shelf-wide setting.
    // We distribute all leftover space evenly as gaps between every facing.
    const globalAutoFit = items.some(item => item.autoFit)
    let totalFacings = 0
    let totalProductWidthLocal = 0

    items.forEach(item => {
      const f = item.facings || 1
      const lw = ((item.product.dimensions?.[0] || 4) * 0.0254) / worldScale.x // product width in local space
      totalFacings += f
      totalProductWidthLocal += f * lw
    })

    // Auto spacing: distribute remaining shelf width equally between all facings.
    // Clamp to 0 to prevent negative gaps (overlaps) if products exceed shelf width.
    const globalAutoSpacingX = (globalAutoFit && totalFacings > 1)
      ? Math.max(0, (localWidth - totalProductWidthLocal) / (totalFacings - 1))
      : 0

    // Running X offset (in local space) as we place products left-to-right
    let accumulatedWidthLocal = 0
    let globalFacingCounter = 0  // Total facings placed so far (for gap calculation)

    items.forEach((item) => {
      const { product, facings = 1, stackVertical = false, spacing = 0, autoFit = false } = item
      const [piW, piH, piD] = product.dimensions

      // Convert product dimensions from inches → metres, then to local shelf space
      const pWidth  = piW * 0.0254
      const pHeight = piH * 0.0254
      const pDepth  = piD * 0.0254

      const lpWidth  = pWidth  / worldScale.x  // local width
      const lpHeight = pHeight / worldScale.y  // local height
      const lpDepth  = pDepth  / worldScale.z  // local depth
      const lsMeters = (spacing * 0.0254) / worldScale.x // manual spacing in local space

      // Stacking: how many rows fit vertically on this shelf?
      const countY = stackVertical ? Math.max(1, Math.floor(localHeight / lpHeight)) : 1

      // Depth fill: how many units fit front-to-back?
      const countZ = Math.max(1, Math.floor(localDepth / lpDepth))

      // If auto-fit is on, distribute depth fill spacing too
      const spacingZ = (autoFit && countZ > 1) ? (localDepth - (countZ * lpDepth)) / (countZ - 1) : 0

      // Start Z at the back of the bounding box, start Y at the bottom
      const startZ = bbox.max.z - lpDepth / 2
      const startY = bbox.min.y + lpHeight / 2

      if (!map.has(product.id)) map.set(product.id, { product, matrices: [] })
      const groupData = map.get(product.id)

      const spacingX = globalAutoFit ? globalAutoSpacingX : lsMeters

      // ── Iteration: Y (vertical stacks) × Z (depth rows, back-to-front) × X (facings) ──
      for (let y = 0; y < countY; y++) {
        // Render back-to-front (countZ-1 → 0) so transparent products sort correctly
        for (let z = countZ - 1; z >= 0; z--) {
          for (let x = 0; x < facings; x++) {
            // X position: start at left edge + accumulated offset + per-facing index + inter-facing spacing
            const posX = bbox.min.x + accumulatedWidthLocal + (x * lpWidth) + (globalFacingCounter + x) * spacingX + lpWidth / 2

            // Clip: don't place units that would overflow the shelf
            if (posX - lpWidth / 2 > bbox.max.x + 0.005) continue

            dummy.position.set(posX, startY + y * lpHeight, startZ - z * (lpDepth + spacingZ))
            dummy.scale.set(lpWidth, lpHeight, lpDepth)
            dummy.updateMatrix()

            // Convert local shelf position → world space by multiplying with dropzone's world matrix
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

  const map = groups

  return (
    <group>
      {Array.from(map.values()).map(({ product, matrices }) => {
        const standardFallback = <StandardProductBatch product={product} matrices={matrices} shelfId={shelfId} />
        
        return (
          <Suspense key={product.id} fallback={null}>
            {product.category === '3D' && product.glbUrl ? (
              <ErrorBoundary fallback={standardFallback}>
                <ModelProductBatch product={product} matrices={matrices} shelfId={shelfId} />
              </ErrorBoundary>
            ) : (product.isCustom || product.textureUrl) ? (
              <ErrorBoundary fallback={standardFallback}>
                <CustomProductBatch product={product} matrices={matrices} shelfId={shelfId} />
              </ErrorBoundary>
            ) : (
              standardFallback
            )}
          </Suspense>
        )
      })}
    </group>
  )
}

// ─── PlacementsRenderer ───────────────────────────────────────────────────────
// Public entry point. Iterates the placements map (keyed by GLB mesh name) and
// for each shelf: re-binds the mesh reference from the live scene, then renders
// a ProductGroup. If the scene isn't loaded yet or the mesh name doesn't match,
// that shelf is skipped silently.
export default function PlacementsRenderer({ placements, rotation = 0, scene }) {
  return (
    <group>
      {Object.entries(placements).map(([shelfName, placement]) => {
        // Re-bind: look up the live mesh by the stable GLB name used as the map key.
        // This works after IDB hydration because the name is preserved across sessions.
        const mesh = scene?.getObjectByName(shelfName)
        if (!mesh) return null

        return (
          <ProductGroup
            key={shelfName}
            dropzoneMesh={mesh}
            items={placement.items}
            rotation={rotation}
            shelfId={shelfName}
            displayRoot={scene}
          />
        )
      })}
    </group>
  )
}
