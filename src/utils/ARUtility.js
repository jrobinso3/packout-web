import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter'

/**
 * Utility to handle ARKit (AR Quick Look) export for iOS/iPad devices.
 * Uses Three.js USDZExporter to convert the scene to Apple's Pixar-backed format.
 */
export async function exportToAR(scene) {
  if (!scene) {
    console.error('AR Export Error: No scene provided.')
    return
  }

  console.log('🚀 Finalizing AR Model for iPad...')

  try {
    const exporter = new USDZExporter()
    
    // Parse the scene into USDZ data (Uint8Array)
    const usdzData = await exporter.parse(scene)
    
    // Create a Blob for the USDZ file
    const blob = new Blob([usdzData], { type: 'model/vnd.usdz+zip' })
    const url = URL.createObjectURL(blob)
    
    // Create the native AR Quick Look trigger link
    const link = document.createElement('a')
    link.style.display = 'none'
    link.href = url
    
    // CRITICAL: rel="ar" is required for iOS to trigger the native AR viewer
    link.rel = 'ar'
    
    // Specifically naming the file for the iOS system
    const filename = `packout_${new Date().toISOString().slice(0, 10)}.usdz`
    link.download = filename
    
    document.body.appendChild(link)
    link.click()
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 2000)
    
    console.log('✅ AR Session Ready: Check your iPad AR viewer.')
  } catch (error) {
    console.error('❌ AR Export Failed:', error)
  }
}

/**
 * Simple check for iOS/iPadOS platform
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
  // iPad on iOS 13 detection
  || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}
