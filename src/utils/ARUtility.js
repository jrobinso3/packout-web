import * as THREE from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter'

/**
 * Utility to standardize materials for USDZ.
 * USDZExporter strictly supports MeshStandardMaterial.
 */
function toStandardMaterial(mat) {
  if (!mat) return new THREE.MeshStandardMaterial({ color: 0xffffff })
  
  // If already Standard, just clone it to be safe
  if (mat.isMeshStandardMaterial) return mat.clone()
  
  // Otherwise, create a new Standard material and copy shared properties
  const newMat = new THREE.MeshStandardMaterial({
    color: mat.color?.clone() || 0xffffff,
    map: mat.map || null,
    roughness: mat.roughness ?? 0.8,
    metalness: mat.metalness ?? 0,
    opacity: mat.opacity ?? 1,
    transparent: mat.transparent ?? false,
    alphaTest: mat.alphaTest ?? 0,
    side: THREE.FrontSide
  })
  
  return newMat
}

/**
 * Distills a scene for AR export by flattening instances and standardizing materials.
 * This is the critical step to fix "Invalid Model" errors on iPad.
 */
function distillSceneForAR(source) {
  const root = new THREE.Group()
  
  // Ensure we have current world matrices before we start capturing
  source.updateMatrixWorld(true)

  source.traverse((node) => {
    // 1. Handle Instanced Meshes (Flatten them)
    if (node.isInstancedMesh) {
      console.log(`AR Distiller: Flattening ${node.count} instances of ${node.name}`)
      
      const geometry = node.geometry.clone()
      const material = Array.isArray(node.material) 
        ? node.material.map(toStandardMaterial) 
        : toStandardMaterial(node.material)

      for (let i = 0; i < node.count; i++) {
        const instanceMatrix = new THREE.Matrix4()
        node.getMatrixAt(i, instanceMatrix)
        
        // Compute the instance's absolute world transform
        const worldMatrix = new THREE.Matrix4()
        worldMatrix.copy(node.matrixWorld).multiply(instanceMatrix)
        
        const mesh = new THREE.Mesh(geometry, material)
        mesh.applyMatrix4(worldMatrix)
        root.add(mesh)
      }
    } 
    // 2. Handle Regular Meshes
    else if (node.isMesh && !node.isInstancedMesh) {
      const n = node.name.toLowerCase()
      // Skip invisible / technical nodes
      const isTechnical = n.includes('col') || n.includes('ind') || n.includes('dropzone')
      if (isTechnical || !node.visible) return

      const mesh = new THREE.Mesh(
        node.geometry.clone(),
        Array.isArray(node.material) ? node.material.map(toStandardMaterial) : toStandardMaterial(node.material)
      )
      
      // Sync world matrix
      mesh.applyMatrix4(node.matrixWorld)
      root.add(mesh)
    }
  })

  return root
}

/**
 * Utility to generate a USDZ blob from a Three.js scene/group.
 */
export async function generateUSDZ(scene) {
  if (!scene) {
    console.error('AR Generate Error: No scene provided.')
    return null
  }

  try {
    console.log('🚀 Starting USDZ Scene Distillation...')
    const startTime = performance.now()
    
    // Step 1: Distill the scene (Flatten instances + Standardize materials)
    const distilledScene = distillSceneForAR(scene)
    const distillTime = performance.now() - startTime
    console.log(`✅ Distillation Complete in ${distillTime.toFixed(2)}ms`)
    
    // Log hierarchy summary for verification
    let meshCount = 0
    distilledScene.traverse(n => { if (n.isMesh) meshCount++ })
    console.log(`📊 Export Payload: ${meshCount} standalone meshes in distilled hierarchy.`)
    
    const exporter = new USDZExporter()
    
    // Step 2: Parse the distilled scene
    const parseStart = performance.now()
    const usdzData = await exporter.parseAsync(distilledScene, {
      quickLookCompatible: true
    })
    const parseTime = performance.now() - parseStart
    console.log(`✅ USDZ Parse Complete in ${parseTime.toFixed(2)}ms. Payload Size: ${(usdzData.byteLength / 1024).toFixed(2)} KB`)
    
    const blob = new Blob([usdzData], { type: 'model/vnd.usdz+zip' })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('❌ USDZ Generation Failed:', error)
    return null
  }
}

/**
 * Utility to trigger the native iOS AR viewer.
 */
export function launchARQuickLook(url) {
  if (!url) {
    console.error('AR Launch Error: No model URL provided.')
    return
  }

  const link = document.createElement('a')
  link.setAttribute('rel', 'ar')
  link.setAttribute('href', url)
  
  const filename = `packout_${new Date().toISOString().slice(0, 10)}.usdz`
  link.setAttribute('download', filename)
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Standard iOS/iPadOS detection
 */
export function isIOS() {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform)
  || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}
