import { useState, useCallback, useRef } from 'react'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'

function App() {
  // Default to the floorstand model without spaces, prepended by the Vite base URL for correct asset loading on GitHub Pages.
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/Floorstand_3S.glb`)

  // Drag and Drop shared state
  const [draggedProduct, setDraggedProduct] = useState(null)
  const [placements, setPlacements] = useState({})

  // Materials extracted from the currently-loaded GLB
  const [displayMaterials, setDisplayMaterials] = useState([])

  // Export function reference — populated by ExportCapture inside the Canvas
  const exportFnRef = useRef(null)
  const handleExportReady = useCallback((fn) => { exportFnRef.current = fn }, [])
  const handleExport = useCallback(() => { exportFnRef.current?.() }, [])

  const handleSetDisplayUrl = (url) => {
    setDisplayUrl(url)
    setPlacements({})        // clear drops when switching displays
    setDisplayMaterials([])  // clear stale material list
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

  const handleMaterialsReady = useCallback((mats) => {
    setDisplayMaterials(mats)
  }, [])

  return (
    <main className="w-screen h-screen overflow-hidden relative bg-[#0d0f12]">
      <ConfiguratorCanvas
        displayUrl={displayUrl}
        draggedProduct={draggedProduct}
        onDisplayDrop={handleDisplayDrop}
        placements={placements}
        onMaterialsReady={handleMaterialsReady}
        onExportReady={handleExportReady}
      />
      <Sidebar
        setDisplayUrl={handleSetDisplayUrl}
        setDraggedProduct={setDraggedProduct}
        displayMaterials={displayMaterials}
        onExport={handleExport}
      />
    </main>
  )
}

export default App
