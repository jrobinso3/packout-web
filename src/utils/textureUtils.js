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

// Singleton renderer to avoid exhausting WebGL contexts
let sharedRenderer = null
function getSharedRenderer() {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace
  }
  return sharedRenderer
}

/**
 * Core rendering logic: takes a Three.js scene and returns a PNG data URL.
 */
export async function renderGlbThumbnailFromScene(modelScene) {
  try {
    const W = 512, H = 512
    const renderer = getSharedRenderer()
    renderer.setSize(W, H)
    renderer.setPixelRatio(1)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.position.set(1, 2, 2)
    scene.add(sun)
    scene.add(modelScene)

    const box    = new THREE.Box3().setFromObject(modelScene)
    const size   = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const radius = size.length() * 0.5
    const camera = new THREE.PerspectiveCamera(45, W / H, radius * 0.01, radius * 100)
    const dist   = radius / Math.sin((45 * Math.PI) / 180 / 2) * 1.1
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.5, center.z + dist * 0.8)
    camera.lookAt(center)

    renderer.clear()
    renderer.render(scene, camera)
    const dataUrl = renderer.domElement.toDataURL('image/png')
    
    scene.clear()
    return dataUrl
  } catch (err) {
    console.warn('GLB scene thumbnail render failed:', err)
    return null
  }
}

/**
 * Loads a GLB from a URL and renders a 512×512 thumbnail.
 */
export async function renderGlbThumbnail(glbUrl) {
  if (!glbUrl) return null
  return new Promise((resolve) => {
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.warn('GLB thumbnail render timed out:', glbUrl)
        resolve(null)
      }
    }, 8000)

    try {
      new GLTFLoader().load(
        resolveAssetUrl(glbUrl),
        async (gltf) => {
          if (resolved) return
          const dataUrl = await renderGlbThumbnailFromScene(gltf.scene)
          
          gltf.scene.traverse(node => {
            if (node.isMesh) {
              node.geometry.dispose()
              if (Array.isArray(node.material)) {
                node.material.forEach(m => m.dispose())
              } else {
                node.material.dispose()
              }
            }
          })
          resolved = true
          clearTimeout(timeout)
          resolve(dataUrl)
        },
        undefined,
        (err) => { 
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            console.warn('GLB load failed for thumbnail:', err)
            resolve(null) 
          }
        }
      )
    } catch (e) {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        console.warn('Synchronous error loading GLB thumbnail:', e)
        resolve(null)
      }
    }
  })
}

/**
 * Global Queue for thumbnail generation to prevent WebGL context exhaustion.
 */
class ThumbnailQueue {
  constructor() {
    this.queue = []
    this.running = false
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.process()
    })
  }

  async process() {
    if (this.running || this.queue.length === 0) return
    this.running = true
    
    const { task, resolve, reject } = this.queue.shift()
    try {
      // Force completion even if the task stalls internally
      const result = await Promise.race([
        task(),
        new Promise((_, r) => setTimeout(() => r(new Error("Queue Task Timeout")), 8000))
      ])
      resolve(result)
    } catch (err) {
      console.warn('Queue task failed or timed out:', err)
      resolve(null) // Resolve with null so caller can handle gracefully
    } finally {
      this.running = false
      setTimeout(() => this.process(), 50)
    }
  }
}

const generatorQueue = new ThumbnailQueue()

/**
 * Enqueued version of GLB thumbnail rendering.
 */
export async function renderGlbThumbnailEnqueued(url) {
  return generatorQueue.add(() => renderGlbThumbnail(url))
}

/**
 * Enqueued version of procedural thumbnail rendering.
 */
export async function renderProceduralThumbnailEnqueued(product) {
  return generatorQueue.add(() => renderProceduralThumbnail(product))
}

/**
 * Renders a procedural geometry (box, sphere, etc.) to a thumbnail.
 */
export async function renderProceduralThumbnail(product) {
  try {
    const W = 512, H = 512
    const renderer = getSharedRenderer()
    renderer.setSize(W, H)
    renderer.setPixelRatio(1)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.position.set(1, 2, 2)
    scene.add(sun)

    const [wi, hi, di] = product.dimensions || [4.7, 5.9, 4.7]
    const w = wi * 0.0254
    const h = hi * 0.0254
    const d = di * 0.0254

    let geometry
    switch (product.geometry) {
      case 'sphere':   geometry = new THREE.SphereGeometry(w/2, 32, 32); break
      case 'cylinder': geometry = new THREE.CylinderGeometry(w/2, w/2, h, 32); break
      case 'cone':     geometry = new THREE.ConeGeometry(w/2, h, 32); break
      default:         geometry = new THREE.BoxGeometry(w, h, d)
    }

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ 
      color: product.color || '#ffffff',
      roughness: 0.3,
      metalness: 0.4
    }))
    mesh.rotation.y = -0.6
    scene.add(mesh)

    const box    = new THREE.Box3().setFromObject(mesh)
    const size   = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const radius = size.length() * 0.5
    const camera = new THREE.PerspectiveCamera(45, W / H, radius * 0.01, radius * 100)
    const dist   = radius / Math.sin((45 * Math.PI) / 180 / 2) * 1.5
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.5, center.z + dist * 0.8)
    camera.lookAt(center)

    renderer.clear()
    renderer.render(scene, camera)
    const dataUrl = renderer.domElement.toDataURL('image/png')
    
    // Cleanup memory 
    geometry.dispose()
    mesh.material.dispose()
    scene.clear()
    
    return dataUrl
  } catch (err) {
    console.warn('Procedural thumbnail render failed:', err)
    return null
  }
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

    // Dispose the old texture to free GPU memory, but ONLY if it's a CanvasTexture
    // we created (to avoid accidentally disposing shared source textures).
    if (tex && tex.isCanvasTexture) {
      tex.dispose();
    }

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
