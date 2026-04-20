// ─── ARUtility.js ─────────────────────────────────────────────────────────────
// Utilities for exporting the configured display to Apple AR Quick Look (iOS/iPadOS).
//
// The workflow is two-phase to keep the UI responsive:
//   Phase 1 (generateUSDZ) — heavy async work; call on button press, show spinner
//   Phase 2 (launchARQuickLook) — synchronous; must be called in a user gesture
//     handler (iOS requires a click to open native AR viewer)
//
// Known USDZ constraints that distillSceneForAR handles:
//   • iOS AR Quick Look does NOT support InstancedMesh — must be flattened
//   • Only MeshStandardMaterial is supported; others are converted
//   • Invisible/technical meshes (_col, _ind, dropzone) must be excluded
//   • World matrices must be baked in (display rotation applied before export)
// ──────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter'

// ─── toStandardMaterial ───────────────────────────────────────────────────────
// Converts any material to MeshStandardMaterial for USDZ compatibility.
// If the material is already standard, returns a clone to avoid mutating the live scene.
function toStandardMaterial(mat) {
  if (!mat) return new THREE.MeshStandardMaterial({ color: 0xffffff })

  if (mat.isMeshStandardMaterial) return mat.clone()

  // Copy the properties that MeshStandardMaterial shares with other types
  return new THREE.MeshStandardMaterial({
    color:       mat.color?.clone() || 0xffffff,
    map:         mat.map || null,
    roughness:   mat.roughness  ?? 0.8,
    metalness:   mat.metalness  ?? 0,
    opacity:     mat.opacity    ?? 1,
    transparent: mat.transparent ?? false,
    alphaTest:   mat.alphaTest  ?? 0,
    side:        THREE.FrontSide // USDZ doesn't support DoubleSide
  })
}

// ─── distillSceneForAR ────────────────────────────────────────────────────────
// Walks the source scene and builds a flat group of individual Mesh objects
// suitable for USDZExporter. Two cases are handled:
//
//   InstancedMesh — each instance is expanded into a standalone Mesh with its
//     world matrix baked in. iOS AR doesn't support GPU instancing.
//
//   Regular Mesh  — cloned with standardised material and world matrix applied.
//     Technical meshes (colliders, indicators) are skipped.
function distillSceneForAR(source) {
  const root = new THREE.Group()

  // Ensure all world matrices are up-to-date before we start reading them
  source.updateMatrixWorld(true)

  source.traverse((node) => {
    // ── Flatten InstancedMesh ──────────────────────────────────────────────
    if (node.isInstancedMesh) {
      console.log(`AR Distiller: Flattening ${node.count} instances of ${node.name}`)

      // Clone geometry once; share it across all expanded instances
      const geometry = node.geometry.clone()
      const material = Array.isArray(node.material)
        ? node.material.map(toStandardMaterial)
        : toStandardMaterial(node.material)

      for (let i = 0; i < node.count; i++) {
        const instanceMatrix = new THREE.Matrix4()
        node.getMatrixAt(i, instanceMatrix)

        // Combine the instanced mesh's world transform with the per-instance offset
        const worldMatrix = new THREE.Matrix4()
        worldMatrix.copy(node.matrixWorld).multiply(instanceMatrix)

        const mesh = new THREE.Mesh(geometry, material)
        mesh.applyMatrix4(worldMatrix)
        root.add(mesh)
      }
    }
    // ── Regular Mesh ──────────────────────────────────────────────────────
    else if (node.isMesh && !node.isInstancedMesh) {
      const n = node.name.toLowerCase()

      // Skip invisible and technical meshes (colliders, visual indicators)
      const isTechnical = n.includes('col') || n.includes('ind') || n.includes('dropzone')
      if (isTechnical || !node.visible) return

      const mesh = new THREE.Mesh(
        node.geometry.clone(),
        Array.isArray(node.material)
          ? node.material.map(toStandardMaterial)
          : toStandardMaterial(node.material)
      )

      // Bake the world transform so the export is positioned correctly in AR space
      mesh.applyMatrix4(node.matrixWorld)
      root.add(mesh)
    }
  })

  return root
}

// ─── generateUSDZ ─────────────────────────────────────────────────────────────
// Entry point for Phase 1. Distills the scene and runs the USDZExporter.
// Returns a Blob object URL string on success, or null on failure.
// This is async and may take several seconds for complex scenes.
export async function generateUSDZ(scene) {
  if (!scene) {
    console.error('AR Generate Error: No scene provided.')
    return null
  }

  try {
    console.log('🚀 Starting USDZ Scene Distillation...')
    const startTime = performance.now()

    // Step 1: Flatten instances and standardise materials
    const distilledScene = distillSceneForAR(scene)
    const distillTime = performance.now() - startTime
    console.log(`✅ Distillation Complete in ${distillTime.toFixed(2)}ms`)

    let meshCount = 0
    distilledScene.traverse(n => { if (n.isMesh) meshCount++ })
    console.log(`📊 Export Payload: ${meshCount} standalone meshes in distilled hierarchy.`)

    // Step 2: Parse the distilled scene into USDZ binary
    const exporter = new USDZExporter()
    const parseStart = performance.now()
    const usdzData = await exporter.parseAsync(distilledScene, {
      quickLookCompatible: true // Ensure compatibility with Apple's AR Quick Look
    })
    const parseTime = performance.now() - parseStart
    console.log(`✅ USDZ Parse Complete in ${parseTime.toFixed(2)}ms. Payload Size: ${(usdzData.byteLength / 1024).toFixed(2)} KB`)

    // Step 3: Wrap binary in a Blob and return a temporary object URL
    const blob = new Blob([usdzData], { type: 'model/vnd.usdz+zip' })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('❌ USDZ Generation Failed:', error)
    return null
  }
}

// ─── launchARQuickLook ────────────────────────────────────────────────────────
// Phase 2 — must be called synchronously inside a user-gesture event handler.
// iOS requires a direct click chain to open the native AR viewer; calling this
// from an async callback after the gesture will be silently blocked.
//
// The trick: create a hidden <a rel="ar"> element and programmatically click it.
// Safari detects the rel="ar" attribute and opens AR Quick Look instead of downloading.
export function launchARQuickLook(url) {
  if (!url) {
    console.error('AR Launch Error: No model URL provided.')
    return
  }

  const link = document.createElement('a')
  link.setAttribute('rel', 'ar')    // Triggers iOS AR Quick Look
  link.setAttribute('href', url)

  const filename = `packout_${new Date().toISOString().slice(0, 10)}.usdz`
  link.setAttribute('download', filename)

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ─── isIOS ────────────────────────────────────────────────────────────────────
// Detects iPhone, iPad, and iPod via the User-Agent string.
// Also catches modern iPadOS 13+ devices which report as "Macintosh" in the
// User-Agent but expose touch events — the maxTouchPoints check disambiguates
// them from real Macs (which have maxTouchPoints === 0).
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS 13+ spoofs a Mac UA; distinguish via touch capability
    || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
}
