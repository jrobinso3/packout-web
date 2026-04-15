import { useState } from 'react'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'

function App() {
  // Default to the floorstand model without spaces
  const [displayUrl, setDisplayUrl] = useState('/displays/Floorstand_3S.glb')

  // Drag and Drop shared state
  const [draggedProduct, setDraggedProduct] = useState(null)
  const [placements, setPlacements] = useState({})

  const handleSetDisplayUrl = (url) => {
    setDisplayUrl(url)
    setPlacements({}) // clear drops when switching displays
  }

  const handleDisplayDrop = (mesh, product) => {
    setPlacements((prev) => ({
      ...prev,
      // Use the UUID of the THREE.js mesh as the key
      [mesh.uuid]: {
        product,
        mesh
      }
    }))
  }

  return (
    <main className="w-screen h-screen overflow-hidden relative bg-[#0d0f12]">
      <ConfiguratorCanvas 
        displayUrl={displayUrl} 
        draggedProduct={draggedProduct}
        onDisplayDrop={handleDisplayDrop}
        placements={placements}
      />
      <Sidebar 
        setDisplayUrl={handleSetDisplayUrl} 
        setDraggedProduct={setDraggedProduct}
      />
    </main>
  )
}

export default App
