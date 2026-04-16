import { useState, useCallback, useRef, useEffect } from 'react'
import * as THREE from 'three'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'
import PropertiesPanel from './components/PropertiesPanel'
import DisplaySelectorModal from './components/DisplaySelectorModal'

function App() {
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/Floorstand_3S.glb`)
  const [draggedProduct, setDraggedProduct] = useState(null)
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const [displayLibrary, setDisplayLibrary] = useState([])
  
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}displays/manifest.json`)
      .then(res => res.json())
      .then(data => setDisplayLibrary(data))
      .catch(err => console.error('Error loading manifest:', err))
  }, [])
  
  // Track placements as { [uuid]: { mesh, items: [] } }
  // Each item: { id, product, facings, stackVertical, spacing }
  const [placements, setPlacements] = useState({})
  const [activeShelfId, setActiveShelfId] = useState(null)
  const [unitPrices, setUnitPrices] = useState({}) // product.id -> Number
  const [unitCosts, setUnitCosts] = useState({})   // product.id -> Number
  
  const [displayMaterials, setDisplayMaterials] = useState([])
  const exportFnRef = useRef(null)
  
  const handleUnitPriceChange = useCallback((productId, price) => {
    setUnitPrices(prev => ({ ...prev, [productId]: price }))
  }, [])

  const handleUnitCostChange = useCallback((productId, cost) => {
    setUnitCosts(prev => ({ ...prev, [productId]: cost }))
  }, [])

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
        onOpenDisplaySelector={() => setIsSelectorOpen(true)}
        currentDisplayUrl={displayUrl}
        displayLibrary={displayLibrary}
      />

      <PropertiesPanel 
        placements={placements}
        unitPrices={unitPrices}
        unitCosts={unitCosts}
        onUnitPriceChange={handleUnitPriceChange}
        onUnitCostChange={handleUnitCostChange}
      />

      {isSelectorOpen && (
        <DisplaySelectorModal 
          currentUrl={displayUrl}
          setDisplayUrl={handleSetDisplayUrl}
          onClose={() => setIsSelectorOpen(false)}
          displayLibrary={displayLibrary}
        />
      )}
    </main>
  )
}

export default App
