import { useMemo } from 'react'
import * as THREE from 'three'

function ProductGroup({ dropzoneMesh, product }) {
  const transforms = useMemo(() => {
    dropzoneMesh.geometry.computeBoundingBox()
    const bbox = dropzoneMesh.geometry.boundingBox

    const dropzoneWidth = bbox.max.x - bbox.min.x
    const dropzoneHeight = bbox.max.y - bbox.min.y
    const dropzoneDepth = bbox.max.z - bbox.min.z

    const [pWidth, pHeight, pDepth] = product.dimensions

    const countX = Math.max(1, Math.floor(dropzoneWidth / pWidth))
    const countY = Math.max(1, Math.floor(dropzoneHeight / pHeight))
    const countZ = Math.max(1, Math.floor(dropzoneDepth / pDepth))

    const startX = bbox.min.x + (dropzoneWidth - countX * pWidth) / 2 + pWidth / 2
    const startY = bbox.min.y + pHeight / 2
    const startZ = bbox.min.z + (dropzoneDepth - countZ * pDepth) / 2 + pDepth / 2

    const results = []
    const dummy = new THREE.Object3D()
    const globalMatrix = new THREE.Matrix4()

    for (let y = 0; y < countY; y++) {
      for (let z = 0; z < countZ; z++) {
        for (let x = 0; x < countX; x++) {
          dummy.position.set(startX + x * pWidth, startY + y * pHeight, startZ + z * pDepth)
          dummy.updateMatrix()
          globalMatrix.copy(dropzoneMesh.matrixWorld).multiply(dummy.matrix)

          const pos = new THREE.Vector3()
          const quat = new THREE.Quaternion()
          const scale = new THREE.Vector3()
          globalMatrix.decompose(pos, quat, scale)
          results.push({ pos, quat, scale })
        }
      }
    }

    return results
  }, [dropzoneMesh, product])

  const [pWidth, pHeight, pDepth] = product.dimensions
  const radXZ = Math.min(pWidth, pDepth) / 2 - 0.001

  return (
    <group>
      {transforms.map((t, i) => (
        <mesh key={i} position={t.pos} quaternion={t.quat} scale={t.scale} castShadow receiveShadow>
          {product.geometry === 'sphere'   && <sphereGeometry   args={[radXZ, 32, 16]} />}
          {product.geometry === 'cylinder' && <cylinderGeometry args={[radXZ, radXZ, pHeight - 0.002, 32]} />}
          {product.geometry === 'cone'     && <coneGeometry     args={[radXZ, pHeight - 0.002, 32]} />}
          {(!product.geometry || product.geometry === 'box') && <boxGeometry args={[pWidth - 0.002, pHeight - 0.002, pDepth - 0.002]} />}
          <meshStandardMaterial color={product.color} roughness={0.1} metalness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

export default function PlacementsRenderer({ placements }) {
  return (
    <group>
      {Object.entries(placements).map(([uuid, placement]) => (
        <ProductGroup
          key={uuid}
          dropzoneMesh={placement.mesh}
          product={placement.product}
        />
      ))}
    </group>
  )
}
