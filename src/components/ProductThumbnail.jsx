import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { renderGlbThumbnail, resolveAssetUrl } from '../utils/textureUtils'

function ProductMesh({ product }) {
  const { scene } = useGLTF(resolveAssetUrl(product.glbUrl))
  const [wi, hi, di] = product.dimensions
  const w = wi * 0.0254
  const h = hi * 0.0254
  const d = di * 0.0254

  const { normalizationScale, offset } = useMemo(() => {
    if (!scene) return { normalizationScale: new THREE.Vector3(1, 1, 1), offset: new THREE.Vector3(0, 0, 0) }
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    return {
      normalizationScale: new THREE.Vector3(w / (size.x || 1), h / (size.y || 1), d / (size.z || 1)),
      offset: center.multiplyScalar(-1)
    }
  }, [scene, w, h, d])

  if (product.category === '3D') {
    return (
      <group rotation={[0, -0.6, 0]}>
        <primitive 
          object={scene} 
          scale={normalizationScale} 
          position={offset.clone().multiply(normalizationScale)} 
        />
      </group>
    )
  }

  const radXZ = Math.min(w, d) / 2
  const geometry = (() => {
    switch (product.geometry) {
      case 'sphere':   return <sphereGeometry   args={[radXZ, 32, 16]} />
      case 'cylinder': return <cylinderGeometry args={[radXZ, radXZ, h, 32]} />
      case 'cone':     return <coneGeometry     args={[radXZ, h, 32]} />
      default:         return <boxGeometry      args={[w, h, d]} />
    }
  })()

  return (
    <mesh rotation={[0, -0.6, 0]}>
      {geometry}
      <meshStandardMaterial color={product.color} roughness={0.3} metalness={0.4} />
    </mesh>
  )
}

// Custom products use their PNG as a flat image thumbnail — no 3D canvas needed.
function CustomThumbnail({ product }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src={resolveAssetUrl(product.textureUrl)}
        alt={product.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    </div>
  )
}

export default function ProductThumbnail({ product, onUpdate }) {
  // Generate a thumbnail for GLB products that are missing one, then persist it.
  const [generatedThumb, setGeneratedThumb] = useState(null)

  useEffect(() => {
    if (!product.glbUrl || product.thumbnailUrl) return
    let cancelled = false
    renderGlbThumbnail(product.glbUrl).then(thumb => {
      if (!thumb || cancelled) return
      setGeneratedThumb(thumb)
      onUpdate?.(product.id, { thumbnailUrl: thumb })
    })
    return () => { cancelled = true }
  }, [product.id, product.glbUrl, product.thumbnailUrl])

  const thumbUrl = product.thumbnailUrl || generatedThumb

  // Use pre-rendered / just-generated thumbnail if available
  if (thumbUrl) return <CustomThumbnail product={{ ...product, textureUrl: thumbUrl }} />

  // Standee products use their PNG texture
  if (product.isCustom || product.textureUrl) return <CustomThumbnail product={product} />

  // Procedural geometry fallback for standard non-GLB products
  const [wi, hi, di] = product.dimensions
  const w = wi * 0.0254
  const h = hi * 0.0254
  const d = di * 0.0254
  const radius = Math.sqrt(w * w + h * h + d * d) / 2
  const fov = 20
  const dist = radius / (0.9 * Math.tan((fov / 2) * (Math.PI / 180)))

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        frameloop="demand"
        camera={{ position: [dist * 0.625, dist * 0.5, dist], fov }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} />
        <ProductMesh product={product} />
      </Canvas>
    </div>
  )
}
