import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const DEFAULT_COLOR = new THREE.Color(0x000000)
const HOVER_COLOR   = new THREE.Color(0x44ff88)
const ACTIVE_COLOR  = new THREE.Color(0xffffff)
const DEFAULT_OPACITY = 0.2
const HOVER_OPACITY   = 1
const ACTIVE_OPACITY  = 1

export default function DropController({ draggedProduct, onDisplayDrop, activeShelfId, onSelectShelf, onSelectPart, onOpenEditor, products }) {
  const { gl, camera, scene } = useThree()

  // Refs let stable event handlers always read the latest prop values
  const draggedProductRef = useRef(draggedProduct)
  const onDisplayDropRef  = useRef(onDisplayDrop)
  const onSelectShelfRef   = useRef(onSelectShelf)
  const activeShelfIdRef  = useRef(activeShelfId)
  const hoveredMeshRef    = useRef(null)
  const onSelectPartRef   = useRef(onSelectPart)
  const onOpenEditorRef   = useRef(onOpenEditor)
  const productsRef       = useRef(products)

  useEffect(() => { draggedProductRef.current = draggedProduct }, [draggedProduct])
  useEffect(() => { onDisplayDropRef.current  = onDisplayDrop  }, [onDisplayDrop])
  useEffect(() => { onSelectShelfRef.current   = onSelectShelf   }, [onSelectShelf])
  useEffect(() => { activeShelfIdRef.current  = activeShelfId  }, [activeShelfId])
  useEffect(() => { onSelectPartRef.current   = onSelectPart   }, [onSelectPart])
  useEffect(() => { onOpenEditorRef.current   = onOpenEditor   }, [onOpenEditor])
  useEffect(() => { productsRef.current       = products       }, [products])

  // Sync visual states when activeShelfId changes externally
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

  useEffect(() => {
    // ── Helpers ─────────────────────────────────────────────────────────────

    const getNDC = (e) => {
      const rect = gl.domElement.getBoundingClientRect()
      return {
        x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      }
    }

    const findBestDropzone = (x, y) => {
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera({ x, y }, camera)

      const intersects = raycaster.intersectObjects(scene.children, true)
      if (intersects.length === 0) return null

      // Check for product hits first to provide a "Bubble Up" selection
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

      // Fallback: Standard dropzone collider selection
      const firstReal = intersects.find(h => !h.object.userData?.isDropzoneVisual)
      if (!firstReal || !firstReal.object.userData?.isDropzone) return null

      // Filter hits to just dropzones for the "Best Fit" logic
      const hits = intersects.filter(h => h.object.userData?.isDropzone)
      if (hits.length === 0) return null
      if (hits.length === 1) return hits[0].object

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

    const applyToVisuals = (group, color, opacity) => {
      if (!group) return
      group.traverse(child => {
        if (child.userData.isDropzoneVisual) {
          if (child.material.emissive) child.material.emissive.copy(color)
          child.material.opacity = opacity
        }
      })
    }

    const setHover = (collider) => {
      const prev = hoveredMeshRef.current
      if (prev === collider) return

      // Restore previous mesh
      if (prev) {
        const group = prev.userData.visualGroup ?? prev.parent
        const isActive = activeShelfIdRef.current === prev.name
        applyToVisuals(group, isActive ? ACTIVE_COLOR : DEFAULT_COLOR, isActive ? ACTIVE_OPACITY : DEFAULT_OPACITY)
      }

      // Highlight new mesh
      if (collider) {
        const group = collider.userData.visualGroup ?? collider.parent
        const isActive = activeShelfIdRef.current === collider.name
        applyToVisuals(group, isActive ? ACTIVE_COLOR : HOVER_COLOR, isActive ? ACTIVE_OPACITY : HOVER_OPACITY)
      }

      hoveredMeshRef.current = collider
    }

    const clearHover = () => setHover(null)

    // ── Event handlers ───────────────────────────────────────────────────────

    const handlePointerMove = (e) => {
      const { x, y } = getNDC(e)
      setHover(findBestDropzone(x, y))
    }

    const handlePointerUp = (e) => {
      // If we were dragging a product, handle the "Drop"
      if (draggedProductRef.current) {
        const { x, y } = getNDC(e)
        const mesh = findBestDropzone(x, y)
        if (mesh) {
          onDisplayDropRef.current(mesh, draggedProductRef.current)
        }
        clearHover()
        // No need to clear draggedProduct here, App.jsx does it on pointerup
      }
    }

    const handleMouseClick = (e) => {
      const { x, y } = getNDC(e)
      const mesh = findBestDropzone(x, y)
      if (mesh) {
        onSelectShelfRef.current?.(mesh.name)
      } else {
        onSelectShelfRef.current?.(null)
        onSelectPartRef.current?.(null)
      }
    }


    const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }

    // Use window for move/up to ensure we catch events outside the canvas during a drag
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
    
    gl.domElement.addEventListener('mouseleave',  clearHover)
    gl.domElement.addEventListener('click',       handleMouseClick)
    gl.domElement.addEventListener('dragover',    handleDragOver)
    gl.domElement.addEventListener('drop',        handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup',   handlePointerUp)
      
      gl.domElement.removeEventListener('mouseleave',  clearHover)
      gl.domElement.removeEventListener('click',       handleMouseClick)
      gl.domElement.removeEventListener('dragover',    handleDragOver)
      gl.domElement.removeEventListener('drop',        handlePointerUp)
    }
  }, [gl, camera, scene])

  return null
}
