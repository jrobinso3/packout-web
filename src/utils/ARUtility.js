import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter'

/**
 * Utility to generate a USDZ blob from a Three.js scene/group.
 * This is the "Build" phase of the two-stage AR launch.
 */
export async function generateUSDZ(scene) {
  if (!scene) {
    console.error('AR Generate Error: No scene provided.')
    return null
  }

  try {
    const exporter = new USDZExporter()
    
    // Material Safety Pass: USDZExporter strictly supports MeshStandardMaterial.
    // We traverse to ensure the export group is "Clean" for Pixar/iOS.
    scene.traverse((node) => {
      if (node.isMesh && node.material) {
        // If it's a multi-material or non-standard, we log a warning.
        // USDZExporter usually tries its best but Standard is the safest baseline.
        if (!node.material.isMeshStandardMaterial && !node.material.isMeshPhysicalMaterial) {
          console.warn(`AR Export: Mesh "${node.name}" uses non-standard material. Result may vary in AR viewer.`)
        }
      }
    })

    // Parse the scene into USDZ data (Uint8Array)
    // options.quickLookCompatible ensures maximum stability on iPadOS
    const usdzData = await exporter.parse(scene, {
      quickLookCompatible: true
    })
    
    const blob = new Blob([usdzData], { type: 'model/vnd.usdz+zip' })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('❌ USDZ Generation Failed:', error)
    return null
  }
}

/**
 * Utility to trigger the native iOS AR viewer.
 * This MUST be called directly from a user interaction tick (synchronously) 
 * to bypass Safari's popup blocker.
 */
export function launchARQuickLook(url) {
  if (!url) {
    console.error('AR Launch Error: No model URL provided.')
    return
  }

  const link = document.createElement('a')
  link.setAttribute('rel', 'ar')
  link.setAttribute('href', url)
  
  // naming correctly for iOS
  const filename = `packout_${new Date().toISOString().slice(0, 10)}.usdz`
  link.setAttribute('download', filename)
  
  // Append, click, and immediately remove to keep DOM clean
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
