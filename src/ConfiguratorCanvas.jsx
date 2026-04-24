import React, { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, ContactShadows, Grid } from '@react-three/drei'
import * as THREE from 'three'

import DisplayModel from './components/DisplayModel'
import DropController from './components/DropController'
import PlacementsRenderer from './components/PlacementsRenderer'
import ShelfFloatingMenu from './components/ShelfFloatingMenu'
import MaterialFloatingMenu from './components/MaterialFloatingMenu'
import { CameraAutoFit, ExportCapture } from './components/canvas/CanvasHelpers'
import { resolveAssetUrl } from './utils/textureUtils'
import { useConfigurator } from './context/ConfiguratorContext'

// --- Utility Functions (Local) ---
function normalizeName(name) {
  if (!name) return 'unnamed'
  return name.replace(/\.\d+$/g, '').trim()
}

function getInteractionGroupName(node) {
  if (!node) return 'unnamed'
  const parentName = node.parent?.name || ''
  const lpn = parentName.toLowerCase()
  const isParentGeneric = !parentName || lpn === 'scene' || lpn === 'rootnode' || lpn.includes('collection')
  const nameToUse = isParentGeneric ? node.name : parentName
  return normalizeName(nameToUse)
}

export default function ConfiguratorCanvas() {
  const {
    displayUrl,
    draggedProduct,
    handleDisplayDrop,
    placements,
    activeShelfId,
    handleSelectShelf,
    handleUpdateShelf,
    setDisplayMaterials,
    exportFnRef,
    exportARFnRef,
    displayRotation,
    activePartId,
    handleSelectPart,
    handleOpenEditor,
    products,
    displayMaterials,
    setDisplayModel
  } = useConfigurator()

  const helperGroupRef = useRef()
  const physicalGroupRef = useRef()
  const [loadedModel, setLoadedModel] = useState(null)

  // Sync loaded model to context
  useEffect(() => {
    setDisplayModel(loadedModel)
  }, [loadedModel, setDisplayModel])

  // Register AR group getter
  useEffect(() => {
    exportARFnRef.current = () => physicalGroupRef.current
  }, [exportARFnRef])

  const activeMaterialGroup = displayMaterials?.find(g => g.groupName === activePartId)

  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [2.5, 1, 4], fov: 22.6 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            console.warn('WebGL Context Lost. Reloading...')
            window.location.reload()
          }, false)
        }}
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
          <Environment files={resolveAssetUrl('studios/studio_small_09_4k.exr')} background blur={0.06} environmentIntensity={0.25} />

          <DropController
            draggedProduct={draggedProduct}
            onDisplayDrop={handleDisplayDrop}
            activeShelfId={activeShelfId}
            onSelectShelf={handleSelectShelf}
            onSelectPart={handleSelectPart}
            onOpenEditor={handleOpenEditor}
            products={products}
          />

          <group ref={physicalGroupRef}>
            <Suspense fallback={null}>
              {displayUrl && (
                <DisplayModel
                  key={displayUrl}
                  url={displayUrl}
                  onMaterialsReady={setDisplayMaterials}
                  onLoaded={setLoadedModel}
                  rotation={displayRotation}
                  onSelectPart={handleSelectPart}
                  activePartId={activePartId}
                />
              )}
            </Suspense>

            <Suspense fallback={null}>
              {placements && (
                <PlacementsRenderer
                  placements={placements}
                  rotation={displayRotation}
                  scene={loadedModel}
                />
              )}
            </Suspense>
          </group>

          {/* Spatial UI: Shelf Menu */}
          {activeShelfId && loadedModel && (() => {
            const placement = placements[activeShelfId] || { items: [] }
            let targetMesh = null
            loadedModel.traverse(node => {
              if (targetMesh) return
              if (node.isMesh && node.name === activeShelfId) targetMesh = node
            })

            if (!targetMesh) return null

            const center = new THREE.Vector3()
            if (targetMesh.geometry) {
              if (!targetMesh.geometry.boundingBox) targetMesh.geometry.computeBoundingBox()
              targetMesh.geometry.boundingBox.getCenter(center)
              targetMesh.updateMatrixWorld()
              targetMesh.localToWorld(center)
            }

            return (
              <ShelfFloatingMenu
                key={`menu-${activeShelfId}`}
                shelfId={activeShelfId}
                placement={{ ...placement, mesh: targetMesh }}
                onUpdate={handleUpdateShelf}
                onClose={() => handleSelectShelf(null)}
                anchorPosition={center}
              />
            )
          })()}

          {/* Spatial UI: Material Menu */}
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
                key={`mat-menu-${activePartId}-${displayRotation}`}
                group={activeMaterialGroup}
                onClose={() => handleSelectPart(null)}
                anchorPosition={center}
              />
            )
          })()}

          <group ref={helperGroupRef}>
            <Grid position={[0, -1.01, 0]} infiniteGrid fadeDistance={20} sectionColor="#00f0ff" cellColor="#00f0ff" sectionThickness={1.5} fadeStrength={5} opacity={0.15} />
            <ContactShadows resolution={2048} scale={20} blur={1.2} opacity={0.85} far={10} color="#000000" position={[0, -1, 0]} />
          </group>
        </Suspense>

        <OrbitControls makeDefault target={[0, -0.3, 0]} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={1} maxDistance={30} />
        <CameraAutoFit targetModel={loadedModel} />
        <ExportCapture onReady={(fn) => { exportFnRef.current = fn }} helperGroupRef={helperGroupRef} />
      </Canvas>
    </div>
  )
}
