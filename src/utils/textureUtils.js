// ─── textureUtils.js ──────────────────────────────────────────────────────────
// Canvas-based texture blending utilities.
//
// applyArtworkMix implements the "Artwork Mix" feature: a 0–1 slider that
// composites the original artwork texture over a solid white base.
//
//   mixValue = 0  →  solid white  (blank branding face, ready for custom artwork)
//   mixValue = 1  →  full texture (original artwork fully visible)
//   0 < mix < 1   →  artwork drawn at `mix` opacity over white
//
// This is done via an off-screen <canvas> rather than a shader so that the
// result is compatible with Three.js's standard texture pipeline and can be
// exported to USDZ without any custom shader workarounds.
// ──────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Base URL handling for Vite environments (handles subpath deployments like GitHub Pages)
const BASE = (import.meta.env?.BASE_URL || '/').endsWith('/') 
  ? (import.meta.env?.BASE_URL || '/') 
  : (import.meta.env?.BASE_URL || '/') + '/';

/**
 * Ensures a URL is correctly resolved relative to the app's base path.
 * Skips resolution for blobs, data-URIs, and absolute HTTP links.
 */
export function resolveAssetUrl(url) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http')) return url
  const target = url.startsWith('/') ? url.slice(1) : url
  return BASE + target
}

/**
 * Loads a GLB from a URL and renders a 512×512 thumbnail using an offscreen
 * WebGLRenderer. Returns a PNG data URL, or null if rendering fails.
 */
export async function renderGlbThumbnail(glbUrl) {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      resolveAssetUrl(glbUrl),
      (gltf) => {
        try {
          const W = 512, H = 512
          const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
          renderer.setSize(W, H)
          renderer.setPixelRatio(1)
          renderer.outputColorSpace = THREE.SRGBColorSpace

          const scene = new THREE.Scene()
          scene.add(new THREE.AmbientLight(0xffffff, 1.2))
          const sun = new THREE.DirectionalLight(0xffffff, 2)
          sun.position.set(1, 2, 2)
          scene.add(sun)
          scene.add(gltf.scene)

          const box    = new THREE.Box3().setFromObject(gltf.scene)
          const size   = new THREE.Vector3()
          const center = new THREE.Vector3()
          box.getSize(size)
          box.getCenter(center)

          const radius = size.length() * 0.5
          const camera = new THREE.PerspectiveCamera(45, W / H, radius * 0.01, radius * 100)
          const dist   = radius / Math.sin((45 * Math.PI) / 180 / 2) * 1.1
          camera.position.set(
            center.x + dist * 0.6,
            center.y + dist * 0.5,
            center.z + dist * 0.8
          )
          camera.lookAt(center)

          renderer.render(scene, camera)
          const dataUrl = renderer.domElement.toDataURL('image/png')
          renderer.dispose()
          resolve(dataUrl)
        } catch (err) {
          console.warn('GLB thumbnail render failed:', err)
          resolve(null)
        }
      },
      undefined,
      (err) => { console.warn('GLB load failed for thumbnail:', err); resolve(null) }
    )
  })
}

/**
 * Blends a material's albedo texture over a white background at the given opacity.
 *
 * @param {THREE.Material} material - The material whose .map will be replaced
 * @param {number} mixValue - 0 (solid white) to 1 (full original texture)
 */
export function applyArtworkMix(material, mixValue) {
  const tex = material.map;
  if (!tex || !tex.image) return; // Nothing to blend if there is no texture

  const img = tex.image;
  const isHTMLImage = img instanceof HTMLImageElement;

  const apply = () => {
    // Create a fresh canvas at the texture's native resolution
    const canvas = document.createElement('canvas');
    canvas.width  = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    // Layer 1: solid white base
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Layer 2: artwork drawn at mixValue opacity
    // globalAlpha = 0 → invisible (shows only white base)
    // globalAlpha = 1 → fully opaque (shows only artwork)
    ctx.globalAlpha = mixValue;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Wrap in a Three.js CanvasTexture and copy the original texture's settings
    // so tiling, offset, rotation, and flip are all preserved.
    const newTex = new THREE.CanvasTexture(canvas);
    newTex.wrapS           = THREE.RepeatWrapping;
    newTex.wrapT           = THREE.RepeatWrapping;
    newTex.repeat.copy(tex.repeat);
    newTex.offset.copy(tex.offset);
    newTex.center.copy(tex.center);
    newTex.rotation        = tex.rotation;
    newTex.flipY           = tex.flipY;
    newTex.colorSpace      = tex.colorSpace;
    newTex.matrixAutoUpdate = tex.matrixAutoUpdate;

    // Replace the material's albedo map and flag for GPU re-upload
    material.map = newTex;
    material.needsUpdate = true;
  };

  // If the image hasn't finished loading yet, defer until the load event fires.
  // This can happen when a session is hydrated before all textures are decoded.
  if (isHTMLImage && !img.complete) {
    img.addEventListener('load', apply, { once: true });
  } else {
    apply();
  }
}
