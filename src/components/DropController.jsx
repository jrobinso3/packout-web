import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const DEFAULT_COLOR = new THREE.Color(0x00f0ff)
const HOVER_COLOR   = new THREE.Color(0x00ffff)
const ACTIVE_COLOR  = new THREE.Color(0xffffff)
const DEFAULT_OPACITY = 0.2
const HOVER_OPACITY   = 0.5
const ACTIVE_OPACITY  = 0.8

export default function DropController({ draggedProduct, onDisplayDrop, activeShelfId, onSelectShelf }) {
  const { gl, camera, scene } = useThree()

  // Refs let stable event handlers always read the latest prop values
  const draggedProductRef = useRef(draggedProduct)
  const onDisplayDropRef  = useRef(onDisplayDrop)
  const onSelectShelfRef   = useRef(onSelectShelf)
  const activeShelfIdRef  = useRef(activeShelfId)
  const hoveredMeshRef    = useRef(null)

  useEffect(() => { draggedProductRef.current = draggedProduct }, [draggedProduct])
  useEffect(() => { onDisplayDropRef.current  = onDisplayDrop  }, [onDisplayDrop])
  useEffect(() => { onSelectShelfRef.current   = onSelectShelf   }, [onSelectShelf])
  useEffect(() => { activeShelfIdRef.current  = activeShelfId  }, [activeShelfId])

  // Sync visual states when activeShelfId changes externally
  useEffect(() => {
    scene.traverse(child => {
      if (child.userData.isDropzone) {
        const isHovered = hoveredMeshRef.current === child
        const isActive  = activeShelfId === child.uuid
        const group = child.userData.visualGroup ?? child.parent
        
        let color = DEFAULT_COLOR
        let opacity = DEFAULT_OPACITY

        if (isActive) {
          color = ACTIVE_COLOR
          opacity = ACTIVE_OPACITY
        } else if (isHovered) {
          color = HOVER_COLOR
          opacity = HOVER_OPACITY
        }

        group.traverse(v => {
          if (v.userData.isDropzoneVisual) {
            v.material.color.copy(color)
            v.material.opacity = opacity
          }
        })
      }
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
          child.material.color.copy(color)
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
        const isActive = activeShelfIdRef.current === prev.uuid
        applyToVisuals(group, isActive ? ACTIVE_COLOR : DEFAULT_COLOR, isActive ? ACTIVE_OPACITY : DEFAULT_OPACITY)
      }

      // Highlight new mesh
      if (collider) {
        const group = collider.userData.visualGroup ?? collider.parent
        const isActive = activeShelfIdRef.current === collider.uuid
        applyToVisuals(group, isActive ? ACTIVE_COLOR : HOVER_COLOR, isActive ? ACTIVE_OPACITY : HOVER_OPACITY)
      }

      hoveredMeshRef.current = collider
    }

    const clearHover = () => setHover(null)

    // ── Event handlers ───────────────────────────────────────────────────────

    const handleMouseMove = (e) => {
      const { x, y } = getNDC(e)
      setHover(findBestDropzone(x, y))
    }

    const handleMouseClick = (e) => {
      const { x, y } = getNDC(e)
      const mesh = findBestDropzone(x, y)
      if (mesh) {
        onSelectShelfRef.current?.(mesh.uuid)
      } else {
        onSelectShelfRef.current?.(null)
      }
    }

    const handleDragOver = (e) => {
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
    gl.domElement.addEventListener('click',      handleMouseClick)
    gl.domElement.addEventListener('dragover',   handleDragOver)
    gl.domElement.addEventListener('dragleave',  clearHover)
    gl.domElement.addEventListener('drop',       handleDrop)

    return () => {
      gl.domElement.removeEventListener('mousemove',  handleMouseMove)
      gl.domElement.removeEventListener('mouseleave', clearHover)
      gl.domElement.removeEventListener('click',      handleMouseClick)
      gl.domElement.removeEventListener('dragover',   handleDragOver)
      gl.domElement.removeEventListener('dragleave',  clearHover)
      gl.domElement.removeEventListener('drop',       handleDrop)
    }
  }, [gl, camera, scene])

  return null
}
