// ─── ConfiguratorCanvas.jsx ───────────────────────────────────────────────────
// Owns the entire Three.js scene. Renders inside a react-three/fiber <Canvas>
// that fills the full viewport behind all 2D UI. Responsibilities:
//   • Scene lighting, environment (HDR), shadows, ground grid
//   • Display model + product placements
//   • Spatial floating menus (shelf edit, material edit) anchored to 3D objects
//   • PNG export capture helper
//   • Camera auto-fit animation when a new model loads
// ──────────────────────────────────────────────────────────────────────────────

import { Environment, OrbitControls, ContactShadows, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import DisplayModel from './components/DisplayModel'
import DropController from './components/DropController'
import PlacementsRenderer from './components/PlacementsRenderer'
import ShelfFloatingMenu from './components/ShelfFloatingMenu'
import MaterialFloatingMenu from './components/MaterialFloatingMenu'
import { resolveAssetUrl } from './utils/textureUtils'

// ─── normalizeName ────────────────────────────────────────────────────────────
// Blender often exports meshes with ".001", ".002" suffixes when names clash.
// Strip them so matching against the clean GLB name works reliably.
function normalizeName(name) {
  if (!name) return 'unnamed'
  return name.replace(/\.\d+$/g, '').trim()
}

// ─── getInteractionGroupName ──────────────────────────────────────────────────
// Resolves the "logical part name" for a mesh by inspecting its parent hierarchy.
// If the parent is a meaningful named group (not Scene/RootNode/Collection),
// the parent name is used so all child meshes share the same selection group.
// This lets a user click any face of "Front Panel" and select the whole part.
function getInteractionGroupName(node) {
  if (!node) return 'unnamed'
  const parentName = node.parent?.name || ''
  const lpn = parentName.toLowerCase()
  const isParentGeneric = !parentName || lpn === 'scene' || lpn === 'rootnode' || lpn.includes('collection')

  const nameToUse = isParentGeneric ? node.name : parentName
  return normalizeName(nameToUse)
}

// ─── CameraAutoFit ────────────────────────────────────────────────────────────
// Render-loop helper. When targetModel changes, computes its bounding box and
// smoothly lerps the camera + orbit target into a well-framed position.
// Returns null — purely a side-effect component.
function CameraAutoFit({ targetModel }) {
  const { camera, controls } = useThree()
  const destPos    = useRef(null)  // Desired camera world position
  const destTarget = useRef(null)  // Desired orbit target
  const animating  = useRef(false) // True while the lerp is in progress

  // Recompute destination whenever the loaded model changes
  useEffect(() => {
    if (!targetModel || !controls) return

    const box = new THREE.Box3().setFromObject(targetModel)
    const center = new THREE.Vector3()
    const size   = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    // Distance needed to fit the largest dimension in the camera's FOV
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov    = camera.fov * (Math.PI / 180)
    let cameraZ  = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.2

    destTarget.current = center.clone()
    // Offset the camera slightly up and to the right for a natural 3/4 view
    destPos.current = new THREE.Vector3(
      center.x + cameraZ * 0.6,
      center.y + cameraZ * 0.3,
      center.z + cameraZ * 0.8
    )
    animating.current = true

    // Interrupt animation if the user starts a manual interaction
    const onStart = () => { animating.current = false }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)

  }, [targetModel, camera, controls])

  // Lerp camera position each frame until we are close enough to stop
  useFrame(() => {
    if (!animating.current || !destPos.current || !destTarget.current || !controls) return

    camera.position.lerp(destPos.current, 0.06)    // 6% closer each frame → smooth ease-out
    controls.target.lerp(destTarget.current, 0.06)
    controls.update()

    // Snap once within 1mm to avoid infinite micro-lerps
    if (camera.position.distanceTo(destPos.current) < 0.001) {
      camera.position.copy(destPos.current)
      controls.target.copy(destTarget.current)
      controls.update()
      animating.current = false
    }
  })

  return null
}

// ─── ExportCapture ────────────────────────────────────────────────────────────
// Registers an export closure with App via onReady.
// When triggered:
//   1. Hides helper geometry (grid, contact shadows, dropzone visuals)
//   2. Sets a transparent background
//   3. Renders one frame and grabs the PNG data URL
//   4. Restores everything and triggers a browser download
// Returns null — purely a side-effect component.
function ExportCapture({ onReady, helperGroupRef }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    if (!onReady) return

    onReady(() => {
      // Hide the grid/shadow helpers so they don't appear in the export
      if (helperGroupRef.current) helperGroupRef.current.visible = false

      // Hide drop-zone visual overlays (semi-transparent shelf highlights)
      const hiddenDropzones = []
      scene.traverse((child) => {
        if (child.userData.isDropzoneVisual && child.visible) {
          child.visible = false
          hiddenDropzones.push(child)
        }
      })

      // Swap to transparent background for the single export render
      const prevBackground = scene.background
      const prevClearAlpha = gl.getClearAlpha()
      const prevPixelRatio = gl.getPixelRatio()

      scene.background = null
      gl.setClearColor(0x000000, 0)
      gl.setPixelRatio(3) // 3× supersampling for high-res export

      gl.render(scene, camera)

      const dataURL = gl.domElement.toDataURL('image/png')

      // Restore scene state exactly as it was
      scene.background = prevBackground
      gl.setClearAlpha(prevClearAlpha)
      gl.setPixelRatio(prevPixelRatio)

      if (helperGroupRef.current) helperGroupRef.current.visible = true
      hiddenDropzones.forEach(c => { c.visible = true })

      gl.render(scene, camera) // Render once more to restore canvas visually

      // Trigger browser download with ISO timestamp in the filename
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
  onUpdateShelf,
  onMaterialsReady,
  onExportReady,
  onExportARReady,
  rotation = 0,
  activePartId,
  onSelectPart,
  onOpenEditor,
  products,
  displayMaterials = [],
  onLoaded
}) {
  // helperGroupRef wraps the grid + contact shadows. Hidden during PNG export.
  const helperGroupRef = useRef()

  // physicalGroupRef wraps the display model + product placements.
  // Passed to ARUtility as the scene root for USDZ export.
  const physicalGroupRef = useRef()

  // The loaded Three.js Object3D scene (set by DisplayModel's onLoaded callback).
  const [loadedModel, setLoadedModel] = useState(null)

  // Bubble the loaded model up to App so PropertiesPanel can re-bind shelf meshes
  useEffect(() => {
    if (onLoaded) onLoaded(loadedModel)
  }, [loadedModel, onLoaded])

  // Register the AR group getter with App once on mount.
  // Returns a fresh ref value each time it's called, so the getter is always current.
  useEffect(() => {
    if (onExportARReady) {
      onExportARReady(() => physicalGroupRef.current)
    }
  }, [onExportARReady])

  // Look up the active material group from the registry so we can pass it
  // to MaterialFloatingMenu without traversing the array in the render body.
  const activeMaterialGroup = displayMaterials.find(g => g.groupName === activePartId)

  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}    // PCF gives soft shadow edges
        camera={{ position: [2.5, 1, 4], fov: 22.6 }} // Narrow FOV = less perspective distortion
        gl={{
          preserveDrawingBuffer: true, // Required for toDataURL() PNG export
          antialias: true,
          alpha: true,
        }}
      >
        {/* Scene background colour matches the outer <main> bg for seamless blending */}
        <color attach="background" args={['#0d0f12']} />

        {/* Low-intensity ambient fill so shadows aren't pure black */}
        <ambientLight intensity={0.2} />

        {/* Primary directional light with high-res shadow map */}
        <directionalLight
          position={[2, 8, 4]}
          intensity={4.8}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-camera-near={0.1}
          shadow-camera-far={25}
          shadow-camera-left={-2}
          shadow-camera-right={2}
          shadow-camera-top={2}
          shadow-camera-bottom={-2}
          shadow-bias={-0.0002}     // Prevents shadow acne
          shadow-normalBias={0.04}  // Smooths shadow edge at grazing angles
          shadow-radius={4}         // PCF kernel radius for soft penumbra
        />

        <Suspense fallback={null}>
          {/* HDR environment map for realistic PBR reflections and ambient IBL */}
          <Environment files={resolveAssetUrl('studios/studio_small_09_4k.exr')} background blur={0.06} environmentIntensity={0.25} />

          {/* Invisible raycaster-based controller that handles drop/hover/click events
              on the dropzone collider meshes. No visual output. */}
          <DropController
            draggedProduct={draggedProduct}
            onDisplayDrop={onDisplayDrop}
            activeShelfId={activeShelfId}
            onSelectShelf={onSelectShelf}
            onSelectPart={onSelectPart}
            onOpenEditor={onOpenEditor}
            products={products}
          />

          {/* physicalGroupRef wraps everything that should appear in AR export */}
          <group ref={physicalGroupRef}>
            <Suspense fallback={null}>
              {/* key={displayUrl} forces a full remount when the display changes,
                  which avoids stale material references from the previous model */}
              {displayUrl && (
                <DisplayModel
                  key={displayUrl}
                  url={displayUrl}
                  onMaterialsReady={onMaterialsReady}
                  onLoaded={setLoadedModel}
                  rotation={rotation}
                  onSelectPart={onSelectPart}
                  activePartId={activePartId}
                />
              )}
            </Suspense>

            <Suspense fallback={null}>
              {/* Renders all placed product instances for each shelf */}
              {placements && (
                <PlacementsRenderer
                  placements={placements}
                  rotation={rotation}
                  scene={loadedModel}
                />
              )}
            </Suspense>
          </group>

          {/* ─── SPATIAL UI: SHELF EDIT MENU ──────────────────────────────────
              Uses an IIFE to avoid creating a named component just for this
              re-bind logic. Finds the live mesh by its stable name, computes
              its world-space center, and passes it as the anchor position. */}
          {activeShelfId && loadedModel && (() => {
            const placement = placements[activeShelfId] || { items: [] }

            // Re-bind: find the live mesh in the scene tree by name
            let targetMesh = null
            loadedModel.traverse(node => {
              if (targetMesh) return
              if (node.isMesh && node.name === activeShelfId) {
                targetMesh = node
              }
            })

            if (!targetMesh) return null

            const center = new THREE.Vector3()
            if (targetMesh.geometry) {
              if (!targetMesh.geometry.boundingBox) targetMesh.geometry.computeBoundingBox()
              targetMesh.geometry.boundingBox.getCenter(center)
              // Force world matrix update so the anchor is correct while rotating
              targetMesh.updateMatrixWorld()
              targetMesh.localToWorld(center)
            }

            return (
              <ShelfFloatingMenu
                key={`menu-${activeShelfId}`}
                shelfId={activeShelfId}
                placement={{ ...placement, mesh: targetMesh }}
                onUpdate={onUpdateShelf}
                onClose={() => onSelectShelf(null)}
                anchorPosition={center}
              />
            )
          })()}

          {/* helperGroupRef: grid + contact shadow — hidden during PNG export */}
          <group ref={helperGroupRef}>
            <Grid
              position={[0, -1.01, 0]}
              infiniteGrid
              fadeDistance={20}
              sectionColor="#00f0ff"
              cellColor="#00f0ff"
              sectionThickness={1.5}
              fadeStrength={5}
              opacity={0.15}
            />
            <ContactShadows
              resolution={2048}
              scale={20}
              blur={1.2}
              opacity={0.85}
              far={10}
              color="#000000"
              position={[0, -1, 0]}
            />
          </group>

          {/* ─── SPATIAL UI: MATERIAL EDIT MENU ────────────────────────────────
              Same re-bind pattern as the shelf menu — find the first mesh in the
              active part group and anchor the floating panel to its center. */}
          {activePartId && activeMaterialGroup && loadedModel && (() => {
            const center = new THREE.Vector3()
            let targetMesh = null

            loadedModel.traverse(node => {
              if (targetMesh) return
              if (node.isMesh) {
                const meshName = getInteractionGroupName(node)
                if (meshName === activePartId) targetMesh = node
              }
            })

            if (targetMesh) {
              if (!targetMesh.geometry.boundingBox) targetMesh.geometry.computeBoundingBox()
              targetMesh.geometry.boundingBox.getCenter(center)
              targetMesh.updateMatrixWorld()
              targetMesh.localToWorld(center)
            }

            return (
              <MaterialFloatingMenu
                // Include rotation in the key so the menu repositions when the
                // display rotates (the anchor world position changes)
                key={`mat-menu-${activePartId}-${rotation}`}
                group={activeMaterialGroup}
                onClose={() => onSelectPart(null)}
                anchorPosition={center}
              />
            )
          })()}
        </Suspense>

        {/* Orbit controls: constrain vertical angle to avoid going underground */}
        <OrbitControls makeDefault target={[0, -0.3, 0]} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={1} maxDistance={30} />

        {/* Smooth camera animation when a new display model loads */}
        <CameraAutoFit targetModel={loadedModel} />

        {/* PNG export capture — registers its closure with App.jsx via onReady */}
        <ExportCapture onReady={onExportReady} helperGroupRef={helperGroupRef} />
      </Canvas>
    </div>
  )
}
