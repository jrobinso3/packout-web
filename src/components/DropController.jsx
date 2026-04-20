// ─── DropController.jsx ───────────────────────────────────────────────────────
// Invisible R3F component (renders null) that owns all pointer interaction with
// the 3D canvas. Handles:
//   • Hover highlighting on dropzone colliders (raycasting on pointermove)
//   • Product drop onto a shelf (pointerup while draggedProduct is set)
//   • Shelf click selection (click with no dragged product)
//   • HTML5 dragover/drop events from the sidebar (desktop drag-and-drop)
//
// Design: stable callback refs
// All event handlers are created once (in a single useEffect) and read prop
// values through refs. This prevents the handlers from going stale AND avoids
// re-registering event listeners every time a prop changes.
// ──────────────────────────────────────────────────────────────────────────────

import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Dropzone visual state constants
const DEFAULT_COLOR   = new THREE.Color(0x000000)
const HOVER_COLOR     = new THREE.Color(0x44ff88)
const ACTIVE_COLOR    = new THREE.Color(0xffffff)
const DEFAULT_OPACITY = 0.2
const HOVER_OPACITY   = 1
const ACTIVE_OPACITY  = 1

export default function DropController({ draggedProduct, onDisplayDrop, activeShelfId, onSelectShelf, onSelectPart, onOpenEditor, products }) {
  const { gl, camera, scene } = useThree()

  // ─── Callback refs ────────────────────────────────────────────────────────
  // Store every prop that the event handlers need in a ref so that when props
  // update, the handlers always read the latest value without being recreated.
  const draggedProductRef = useRef(draggedProduct)
  const onDisplayDropRef  = useRef(onDisplayDrop)
  const onSelectShelfRef  = useRef(onSelectShelf)
  const activeShelfIdRef  = useRef(activeShelfId)
  const hoveredMeshRef    = useRef(null)          // Currently highlighted dropzone mesh
  const onSelectPartRef   = useRef(onSelectPart)
  const onOpenEditorRef   = useRef(onOpenEditor)
  const productsRef       = useRef(products)

  // Keep all refs in sync with the latest props
  useEffect(() => { draggedProductRef.current = draggedProduct }, [draggedProduct])
  useEffect(() => { onDisplayDropRef.current  = onDisplayDrop  }, [onDisplayDrop])
  useEffect(() => { onSelectShelfRef.current  = onSelectShelf  }, [onSelectShelf])
  useEffect(() => { activeShelfIdRef.current  = activeShelfId  }, [activeShelfId])
  useEffect(() => { onSelectPartRef.current   = onSelectPart   }, [onSelectPart])
  useEffect(() => { onOpenEditorRef.current   = onOpenEditor   }, [onOpenEditor])
  useEffect(() => { productsRef.current       = products       }, [products])

  // ─── Active shelf visual sync ────────────────────────────────────────────
  // When activeShelfId changes from outside (e.g. after a drop), update the
  // visual state of all dropzone overlays without waiting for a pointer event.
  useEffect(() => {
    scene.traverse(node => {
      if (!node.userData?.isDropzone) return

      const isActive = activeShelfId === node.name
      const group    = node.userData.visualGroup ?? node.parent
      const color    = isActive ? ACTIVE_COLOR   : DEFAULT_COLOR
      const opacity  = isActive ? ACTIVE_OPACITY : DEFAULT_OPACITY

      group.traverse(v => {
        if (v.userData.isDropzoneVisual) {
          if (v.material.emissive) v.material.emissive.copy(color)
          v.material.opacity = opacity
        }
      })
    })
  }, [activeShelfId, scene])

  // ─── Event listener setup ────────────────────────────────────────────────
  // One large effect creates all handlers and returns the cleanup. Handlers
  // are defined inside the effect so they share the same closure over gl/camera/scene,
  // but read dynamic values through the refs above.
  useEffect(() => {

    // ── Helpers ────────────────────────────────────────────────────────────

    // Convert a DOM pointer event to Normalized Device Coordinates (-1..+1).
    const getNDC = (e) => {
      const rect = gl.domElement.getBoundingClientRect()
      return {
        x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      }
    }

    // Raycast from the camera and return the best dropzone mesh at (x, y) NDC.
    // Priority order:
    //   1. Product mesh hit → bubble up to find its parent dropzone ("Bubble Up" select)
    //   2. Dropzone collider hit → closest to screen centre if multiple overlap
    const findBestDropzone = (x, y) => {
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera({ x, y }, camera)

      const intersects = raycaster.intersectObjects(scene.children, true)
      if (intersects.length === 0) return null

      // "Bubble Up": if the user clicks an already-placed product, select its shelf
      const productHit = intersects.find(h => h.object.userData?.isProduct)
      if (productHit) {
        const targetShelfId = productHit.object.userData.shelfId
        let shelfMesh = null
        scene.traverse(node => {
          if (node.isMesh && node.userData?.isDropzone && node.name === targetShelfId) {
            shelfMesh = node
          }
        })
        if (shelfMesh) return shelfMesh
      }

      // Standard path: only consider invisible dropzone colliders
      const firstReal = intersects.find(h => !h.object.userData?.isDropzoneVisual)
      if (!firstReal || !firstReal.object.userData?.isDropzone) return null

      const hits = intersects.filter(h => h.object.userData?.isDropzone)
      if (hits.length === 0) return null
      if (hits.length === 1) return hits[0].object

      // "Best Fit": when multiple colliders overlap (e.g. nested shelf system),
      // pick the one whose projected center is closest to the cursor.
      let best = hits[0].object
      let bestDist = Infinity
      const worldCenter = new THREE.Vector3()

      for (const hit of hits) {
        hit.object.geometry.computeBoundingBox()
        hit.object.geometry.boundingBox.getCenter(worldCenter)
        hit.object.localToWorld(worldCenter)
        worldCenter.project(camera)

        const d = Math.hypot(worldCenter.x - x, worldCenter.y - y)
        if (d < bestDist) { bestDist = d; best = hit.object }
      }

      return best
    }

    // Apply a colour + opacity to all isDropzoneVisual children of a group
    const applyToVisuals = (group, color, opacity) => {
      if (!group) return
      group.traverse(child => {
        if (child.userData.isDropzoneVisual) {
          if (child.material.emissive) child.material.emissive.copy(color)
          child.material.opacity = opacity
        }
      })
    }

    // Update hover highlight: restore previous mesh, highlight new one.
    // Uses the ref to check whether the newly hovered shelf is also the active one
    // (active meshes keep the ACTIVE colour even when hovered).
    const setHover = (collider) => {
      const prev = hoveredMeshRef.current
      if (prev === collider) return

      // Restore previous mesh to its pre-hover state
      if (prev) {
        const group = prev.userData.visualGroup ?? prev.parent
        const isActive = activeShelfIdRef.current === prev.name
        applyToVisuals(group, isActive ? ACTIVE_COLOR : DEFAULT_COLOR, isActive ? ACTIVE_OPACITY : DEFAULT_OPACITY)
      }

      // Apply hover highlight to new mesh
      if (collider) {
        const group = collider.userData.visualGroup ?? collider.parent
        const isActive = activeShelfIdRef.current === collider.name
        applyToVisuals(group, isActive ? ACTIVE_COLOR : HOVER_COLOR, isActive ? ACTIVE_OPACITY : HOVER_OPACITY)
      }

      hoveredMeshRef.current = collider
    }

    const clearHover = () => setHover(null)

    // ── Event handlers ─────────────────────────────────────────────────────

    // pointermove: update hover highlight as the cursor moves
    const handlePointerMove = (e) => {
      const { x, y } = getNDC(e)
      setHover(findBestDropzone(x, y))
    }

    // pointerup: if a product is being dragged, attempt to drop it on a shelf
    const handlePointerUp = (e) => {
      if (draggedProductRef.current) {
        const { x, y } = getNDC(e)
        const mesh = findBestDropzone(x, y)
        if (mesh) {
          onDisplayDropRef.current(mesh, draggedProductRef.current)
        }
        clearHover()
        // App.jsx clears draggedProduct on its own pointerup listener
      }
    }

    // click: select or deselect a shelf / part (only fires without a drag)
    const handleMouseClick = (e) => {
      const { x, y } = getNDC(e)
      const mesh = findBestDropzone(x, y)
      if (mesh) {
        onSelectShelfRef.current?.(mesh.name)
      } else {
        // Click on empty space — deselect everything
        onSelectShelfRef.current?.(null)
        onSelectPartRef.current?.(null)
      }
    }

    // dragover: required to allow HTML5 drop events on the canvas element
    const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }

    // Listen on window for move/up so events are caught even when the pointer
    // leaves the canvas during a fast drag gesture
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)

    gl.domElement.addEventListener('mouseleave', clearHover)
    gl.domElement.addEventListener('click',      handleMouseClick)
    gl.domElement.addEventListener('dragover',   handleDragOver)
    gl.domElement.addEventListener('drop',       handlePointerUp) // Treat HTML5 drop like pointerup

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup',   handlePointerUp)

      gl.domElement.removeEventListener('mouseleave', clearHover)
      gl.domElement.removeEventListener('click',      handleMouseClick)
      gl.domElement.removeEventListener('dragover',   handleDragOver)
      gl.domElement.removeEventListener('drop',       handlePointerUp)
    }
  }, [gl, camera, scene]) // Re-run only if the canvas context or scene changes

  return null // No visual output — pure side-effect component
}
