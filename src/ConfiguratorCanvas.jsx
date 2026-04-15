import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, ContactShadows, Grid, SoftShadows } from '@react-three/drei'
import { Suspense } from 'react'
import DisplayModel from './components/DisplayModel'
import DropController from './components/DropController'
import PlacementsRenderer from './components/PlacementsRenderer'

export default function ConfiguratorCanvas({ displayUrl, draggedProduct, onDisplayDrop, placements }) {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas shadows camera={{ position: [2.5, 1, 4], fov: 22.6 }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
        {/* <SoftShadows size={15} samples={10} focus={0.5} /> */}
        <color attach="background" args={['#0d0f12']} />
        
        <ambientLight intensity={0.5} />
        {/* Main key light with high-res shadow map tuned for the volume */}
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
          {/* HDRI Skydome for realistic PBR reflections and lighting */}
          <Environment preset="warehouse" background blur={0.06} />
          
          {/* Listens for drops on the WebGL Canvas */}
          <DropController draggedProduct={draggedProduct} onDisplayDrop={onDisplayDrop} />

          {displayUrl && <DisplayModel url={displayUrl} />}
          
          {/* Renders instanced products attached to filled dropzones */}
          {placements && <PlacementsRenderer placements={placements} />}

          {/* Floor grid and shadows */}
          <Grid position={[0, -1.01, 0]} infiniteGrid fadeDistance={20} sectionColor="#00f0ff" cellColor="#00f0ff" sectionThickness={1.5} fadeStrength={5} opacity={0.2} />
          <ContactShadows resolution={1024} scale={20} blur={2} opacity={0.5} far={10} color="#000000" position={[0, -1, 0]} />
        </Suspense>

        <OrbitControls makeDefault target={[0, -0.3, 0]} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={2} maxDistance={20} />
      </Canvas>
    </div>
  )
}
