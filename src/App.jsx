import { useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'

function App() {
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/Floorstand_3S.glb`)
  const [draggedProduct, setDraggedProduct] = useState(null)
  
  // Track placements as { [uuid]: { mesh, items: [] } }
  // Each item: { id, product, facings, stackVertical, spacing }
  const [placements, setPlacements] = useState({})
  const [activeShelfId, setActiveShelfId] = useState(null)
  
  const [displayMaterials, setDisplayMaterials] = useState([])
  const exportFnRef = useRef(null)

  const handleExportReady = useCallback((fn) => { exportFnRef.current = fn }, [])
  const handleExport = useCallback(() => { exportFnRef.current?.() }, [])

  const handleSetDisplayUrl = (url) => {
    setDisplayUrl(url)
    setPlacements({})
    setDisplayMaterials([])
    setActiveShelfId(null)
  }

  const handleSelectShelf = useCallback((id) => {
    setActiveShelfId(id)
  }, [])

  const handleDisplayDrop = (mesh, product) => {
    setPlacements((prev) => {
      const existing = prev[mesh.uuid] || { mesh, items: [] }
      const newItems = [...existing.items]
      
      const newItem = {
        id: `item-${Date.now()}`,
        product,
        facings: 1,
        stackVertical: false,
        spacing: 0,
        autoFit: false
      }

      newItems.push(newItem)

      // Initial Split Logic: Calculate capacity using TRUE WORLD dimensions
      if (!mesh?.geometry) return prev
      
      mesh.geometry.computeBoundingBox()
      if (!mesh.geometry.boundingBox) return prev

      const worldScale = new THREE.Vector3()
      mesh.getWorldScale(worldScale)

      const localWidth = mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x
      const worldWidth = localWidth * worldScale.x
      
      const targetWidthPerProduct = worldWidth / newItems.length
      
      newItems.forEach(item => {
        item.facings = Math.max(1, Math.floor(targetWidthPerProduct / item.product.dimensions[0]))
      })

      return {
        ...prev,
        [mesh.uuid]: { ...existing, items: newItems }
      }
    })
    
    setActiveShelfId(mesh.uuid)
  }

  const handleUpdateShelf = useCallback((shelfId, newItems) => {
    setPlacements(prev => ({
      ...prev,
      [shelfId]: { ...prev[shelfId], items: newItems }
    }))
  }, [])

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
        activeShelfId={activeShelfId}
        onSelectShelf={handleSelectShelf}
        onMaterialsReady={handleMaterialsReady}
        onExportReady={handleExportReady}
      />
      <Sidebar
        setDisplayUrl={handleSetDisplayUrl}
        setDraggedProduct={setDraggedProduct}
        displayMaterials={displayMaterials}
        onExport={handleExport}
        placements={placements}
        activeShelfId={activeShelfId}
        onSelectShelf={handleSelectShelf}
        onUpdateShelf={handleUpdateShelf}
      />
    </main>
  )
}

export default App
