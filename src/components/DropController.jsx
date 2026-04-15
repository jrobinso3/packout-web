import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const DEFAULT_COLOR = new THREE.Color(0x00f0ff)
const HOVER_COLOR   = new THREE.Color(0xffffff)
const DEFAULT_OPACITY = 0.2
const HOVER_OPACITY   = 0.7

export default function DropController({ draggedProduct, onDisplayDrop }) {
  const { gl, camera, scene } = useThree()

  // Refs let stable event handlers always read the latest prop values
  const draggedProductRef = useRef(draggedProduct)
  const onDisplayDropRef  = useRef(onDisplayDrop)
  const hoveredMeshRef    = useRef(null)

  useEffect(() => { draggedProductRef.current = draggedProduct }, [draggedProduct])
  useEffect(() => { onDisplayDropRef.current  = onDisplayDrop  }, [onDisplayDrop])

  useEffect(() => {
    // ── Helpers ─────────────────────────────────────────────────────────────

    const getNDC = (e) => {
      const rect = gl.domElement.getBoundingClientRect()
      return {
        x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      }
    }

    // Returns the dropzone mesh closest to (x, y) in NDC, or null.
    // When multiple dropzones overlap along the ray we pick by which center
    // projects nearest to the cursor on screen — more intuitive than depth order.
    const findBestDropzone = (x, y) => {
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera({ x, y }, camera)

      const intersects = raycaster.intersectObjects(scene.children, true)
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

    // Update every isDropzoneVisual mesh inside a group
    const applyToVisuals = (group, color, opacity) => {
      if (!group) return
      group.traverse(child => {
        if (child.userData.isDropzoneVisual) {
          child.material.color.copy(color)
          child.material.opacity = opacity
        }
      })
    }

    // Swap the visual siblings of a collider between default and hover appearance.
    // The collider itself is invisible — we highlight its isDropzoneVisual siblings
    // inside the same parent group.
    const setHover = (collider) => {
      const prev = hoveredMeshRef.current
      if (prev === collider) return

      if (prev) {
        const group = prev.userData.visualGroup ?? prev.parent
        applyToVisuals(group, DEFAULT_COLOR, DEFAULT_OPACITY)
      }
      if (collider) {
        const group = collider.userData.visualGroup ?? collider.parent
        applyToVisuals(group, HOVER_COLOR, HOVER_OPACITY)
      }
      hoveredMeshRef.current = collider
    }

    const clearHover = () => setHover(null)

    // ── Event handlers ───────────────────────────────────────────────────────

    const handleMouseMove = (e) => {
      const { x, y } = getNDC(e)
      setHover(findBestDropzone(x, y))
    }

    const handleDragOver = (e) => {
      // Always preventDefault so the browser keeps the canvas as an active
      // drop target. Never use dropEffect='none' here — the first dragover
      // can fire before draggedProductRef is populated (React state is async),
      // and some browsers will cancel the entire drag if they see 'none' first.
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'

      const { x, y } = getNDC(e)
      setHover(findBestDropzone(x, y))
    }

    const handleDrop = (e) => {
      e.preventDefault()
      clearHover()

      if (!draggedProductRef.current) return

      const { x, y } = getNDC(e)
      const mesh = findBestDropzone(x, y)
      if (mesh) {
        onDisplayDropRef.current(mesh, draggedProductRef.current)
      }
    }

    gl.domElement.addEventListener('mousemove',  handleMouseMove)
    gl.domElement.addEventListener('mouseleave', clearHover)
    gl.domElement.addEventListener('dragover',   handleDragOver)
    gl.domElement.addEventListener('dragleave',  clearHover)
    gl.domElement.addEventListener('drop',       handleDrop)

    return () => {
      gl.domElement.removeEventListener('mousemove',  handleMouseMove)
      gl.domElement.removeEventListener('mouseleave', clearHover)
      gl.domElement.removeEventListener('dragover',   handleDragOver)
      gl.domElement.removeEventListener('dragleave',  clearHover)
      gl.domElement.removeEventListener('drop',       handleDrop)
    }
  }, [gl, camera, scene])

  return null
}
