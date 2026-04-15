import { Canvas } from '@react-three/fiber'

function ProductMesh({ product }) {
  const [w, h, d] = product.dimensions
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
        src={product.textureUrl}
        alt={product.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    </div>
  )
}

export default function ProductThumbnail({ product }) {
  // Short-circuit for custom standee products — just show the PNG
  if (product.isCustom) return <CustomThumbnail product={product} />

  const [w, h, d] = product.dimensions
  const radius = Math.sqrt(w * w + h * h + d * d) / 2
  const fov = 20
  const halfFovRad = (fov / 2) * (Math.PI / 180)
  const dist = radius / (0.9 * Math.tan(halfFovRad))

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
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
