import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * CameraAutoFit: Smootly lerps the camera to frame the loaded model.
 */
export function CameraAutoFit({ targetModel }) {
  const { camera, controls } = useThree()
  const destPos    = useRef(null)
  const destTarget = useRef(null)
  const animating  = useRef(false)

  useEffect(() => {
    if (!targetModel || !controls) return

    const box = new THREE.Box3().setFromObject(targetModel)
    const center = new THREE.Vector3()
    const size   = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    const maxDim = Math.max(size.x, size.y, size.z)
    const fov    = camera.fov * (Math.PI / 180)
    let cameraZ  = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.2

    destTarget.current = center.clone()
    destPos.current = new THREE.Vector3(
      center.x + cameraZ * 0.6,
      center.y + cameraZ * 0.3,
      center.z + cameraZ * 0.8
    )
    animating.current = true

    const onStart = () => { animating.current = false }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [targetModel, camera, controls])

  useFrame(() => {
    if (!animating.current || !destPos.current || !destTarget.current || !controls) return

    camera.position.lerp(destPos.current, 0.06)
    controls.target.lerp(destTarget.current, 0.06)
    controls.update()

    if (camera.position.distanceTo(destPos.current) < 0.001) {
      camera.position.copy(destPos.current)
      controls.target.copy(destTarget.current)
      controls.update()
      animating.current = false
    }
  })

  return null
}

/**
 * ExportCapture: Registers a callback to capture the canvas as a PNG.
 */
export function ExportCapture({ onReady, helperGroupRef }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    if (!onReady) return

    onReady(() => {
      if (helperGroupRef.current) helperGroupRef.current.visible = false

      const hiddenDropzones = []
      scene.traverse((child) => {
        if (child.userData.isDropzoneVisual && child.visible) {
          child.visible = false
          hiddenDropzones.push(child)
        }
      })

      const prevBackground = scene.background
      const prevClearAlpha = gl.getClearAlpha()
      const prevPixelRatio = gl.getPixelRatio()

      scene.background = null
      gl.setClearColor(0x000000, 0)
      gl.setPixelRatio(3)

      gl.render(scene, camera)
      const dataURL = gl.domElement.toDataURL('image/png')

      scene.background = prevBackground
      gl.setClearAlpha(prevClearAlpha)
      gl.setPixelRatio(prevPixelRatio)

      if (helperGroupRef.current) helperGroupRef.current.visible = true
      hiddenDropzones.forEach(c => { c.visible = true })

      gl.render(scene, camera)

      const filename = `packout_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`
      const link = document.createElement('a')
      link.download = filename
      link.href = dataURL
      link.click()
    })
  }, [gl, scene, camera, onReady, helperGroupRef])

  return null
}
