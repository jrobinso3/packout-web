import { Environment, OrbitControls, ContactShadows, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import DisplayModel from './components/DisplayModel'
import DropController from './components/DropController'
import PlacementsRenderer from './components/PlacementsRenderer'
import ShelfFloatingMenu from './components/ShelfFloatingMenu'
import MaterialFloatingMenu from './components/MaterialFloatingMenu'

// Utility to clean suffixes like .001
function normalizeName(name) {
  if (!name) return 'unnamed'
  return name.replace(/\.\d+$/g, '').trim()
}

// Hierarchy search for meaningful part name
function getInteractionGroupName(node) {
  if (!node) return 'unnamed'
  const parentName = node.parent?.name || ''
  const lpn = parentName.toLowerCase()
  const isParentGeneric = !parentName || lpn === 'scene' || lpn === 'rootnode' || lpn.includes('collection')
  
  const nameToUse = isParentGeneric ? node.name : parentName
  return normalizeName(nameToUse)
}

// ─── CameraAutoFit Helper ──────────────────────────────────────────────────
// Calculates the bounding box of the loaded model and moves the camera
// so that the entire object is elegantly framed.
function CameraAutoFit({ targetModel }) {
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

// ─── ExportCapture ────────────────────────────────────────────────────────────
function ExportCapture({ onReady, helperGroupRef }) {
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
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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
  displayMaterials = []
}) {
  const helperGroupRef = useRef()
  const physicalGroupRef = useRef()
  const [loadedModel, setLoadedModel] = useState(null)

  // Handle AR Export Readiness
  useEffect(() => {
    if (onExportARReady) {
      // Pass a getter that always evaluates the current ref
      onExportARReady(() => physicalGroupRef.current)
    }
  }, [onExportARReady])

  // Find the selected display group from registry
  const activeMaterialGroup = displayMaterials.find(g => g.groupName === activePartId)

  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [2.5, 1, 4], fov: 22.6 }}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: true,
        }}
      >
        <color attach="background" args={['#0d0f12']} />
        
        <ambientLight intensity={0.2} />
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
          shadow-bias={-0.0002}
          shadow-normalBias={0.04}
          shadow-radius={4}
        />

        <Suspense fallback={null}>
          <Environment files="/packout-web/studios/studio_small_09_4k.exr" background blur={0.06} environmentIntensity={0.25} />
          <DropController 
            draggedProduct={draggedProduct} 
            onDisplayDrop={onDisplayDrop} 
            activeShelfId={activeShelfId} 
            onSelectShelf={onSelectShelf} 
            onSelectPart={onSelectPart}
          />
          
          <group ref={physicalGroupRef}>
            <Suspense fallback={null}>
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
              {placements && (
                <PlacementsRenderer 
                  placements={placements} 
                  rotation={rotation} 
                  scene={loadedModel} 
                />
              )}
            </Suspense>
          </group>

          {/* ─── SPATIAL UI: FLOATING EDIT MENU ─── */}
          {activeShelfId && loadedModel && (() => {
            const placement = placements[activeShelfId] || { items: [] }
            
            // Re-bind: Find the live mesh instance in the scene by its stable name
            let targetMesh = null
            loadedModel.traverse(node => {
              if (targetMesh) return
              if (node.isMesh && node.name === activeShelfId) {
                targetMesh = node
              }
            })

            if (!targetMesh) return null

            const { items = [] } = placement || {}
            const center = new THREE.Vector3()
            if (targetMesh.geometry) {
              if (!targetMesh.geometry.boundingBox) targetMesh.geometry.computeBoundingBox()
              targetMesh.geometry.boundingBox.getCenter(center)
              targetMesh.updateMatrixWorld() // Force world matrix update for accurate tethering during rotation
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

          {/* ─── SPATIAL UI: MATERIAL EDIT MENU ─── */}
          {activePartId && activeMaterialGroup && loadedModel && (() => {
            const center = new THREE.Vector3()
            let targetMesh = null
            
            // Find the first mesh in the group to anchor the menu
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
                key={`mat-menu-${activePartId}-${rotation}`}
                group={activeMaterialGroup}
                onClose={() => onSelectPart(null)}
                anchorPosition={center}
              />
            )
          })()}
        </Suspense>

        <OrbitControls makeDefault target={[0, -0.3, 0]} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={1} maxDistance={30} />
        
        {/* Helper to fit camera when model loads */}
        <CameraAutoFit targetModel={loadedModel} />

        <ExportCapture onReady={onExportReady} helperGroupRef={helperGroupRef} />
      </Canvas>
    </div>
  )
}
