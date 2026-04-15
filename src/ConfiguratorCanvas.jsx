import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, ContactShadows, Grid } from '@react-three/drei'
import { Suspense, useRef, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import DisplayModel from './components/DisplayModel'
import DropController from './components/DropController'
import PlacementsRenderer from './components/PlacementsRenderer'

// ─── ExportCapture ────────────────────────────────────────────────────────────
// Sits inside the Canvas so it can access useThree().
// Receives a ref to the scene-helper group (Grid + ContactShadows) so it can
// toggle them off, render a clean transparent frame, then restore everything.

function ExportCapture({ onReady, helperGroupRef }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    if (!onReady) return

    onReady(() => {
      // ── 1. Hide scene helpers ──────────────────────────────────────────────
      // Grid + ContactShadows
      if (helperGroupRef.current) helperGroupRef.current.visible = false

      // Dropzone wire outlines
      const hiddenDropzones = []
      scene.traverse((child) => {
        if (child.userData.isDropzoneVisual && child.visible) {
          child.visible = false
          hiddenDropzones.push(child)
        }
      })

      // ── 2. Transparent background render ──────────────────────────────────
      const prevBackground = scene.background
      const prevClearAlpha = gl.getClearAlpha()
      const prevPixelRatio = gl.getPixelRatio()

      scene.background = null
      gl.setClearColor(0x000000, 0)
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      gl.render(scene, camera)

      // ── 3. Capture ────────────────────────────────────────────────────────
      const dataURL = gl.domElement.toDataURL('image/png')

      // ── 4. Restore everything ─────────────────────────────────────────────
      scene.background = prevBackground
      gl.setClearAlpha(prevClearAlpha)
      gl.setPixelRatio(prevPixelRatio)

      if (helperGroupRef.current) helperGroupRef.current.visible = true
      hiddenDropzones.forEach(c => { c.visible = true })

      gl.render(scene, camera) // put the viewport back to normal

      // ── 5. Download ───────────────────────────────────────────────────────
      const filename = `packout_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`
      const link = document.createElement('a')
      link.download = filename
      link.href = dataURL
      link.click()
    })
  }, [gl, scene, camera, onReady, helperGroupRef])

  return null
}

// ─── ConfiguratorCanvas ───────────────────────────────────────────────────────

export default function ConfiguratorCanvas({
  displayUrl,
  draggedProduct,
  onDisplayDrop,
  placements,
  activeShelfId,
  onSelectShelf,
  onMaterialsReady,
  onExportReady,
}) {
  // Ref to the group containing Grid + ContactShadows — toggled off during export
  const helperGroupRef = useRef()

  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        shadows
        camera={{ position: [2.5, 1, 4], fov: 22.6 }}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: true,
        }}
      >
        <color attach="background" args={['#0d0f12']} />

        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.5}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0001}
        />

        <Suspense fallback={null}>
          <Environment preset="warehouse" background blur={0.06} />
          <DropController draggedProduct={draggedProduct} onDisplayDrop={onDisplayDrop} />
          {displayUrl && <DisplayModel url={displayUrl} onMaterialsReady={onMaterialsReady} />}
          {placements && <PlacementsRenderer placements={placements} />}

          {/* Scene helpers — hidden during PNG export */}
          <group ref={helperGroupRef}>
            <Grid
              position={[0, -1.01, 0]}
              infiniteGrid
              fadeDistance={20}
              sectionColor="#00f0ff"
              cellColor="#00f0ff"
              sectionThickness={1.5}
              fadeStrength={5}
              opacity={0.2}
            />
            <ContactShadows
              resolution={1024}
              scale={20}
              blur={2}
              opacity={0.5}
              far={10}
              color="#000000"
              position={[0, -1, 0]}
            />
          </group>
        </Suspense>

        <OrbitControls makeDefault target={[0, -0.3, 0]} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={2} maxDistance={20} />

        <ExportCapture onReady={onExportReady} helperGroupRef={helperGroupRef} />
      </Canvas>
    </div>
  )
}
