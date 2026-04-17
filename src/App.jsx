import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Settings2 } from 'lucide-react'
import * as THREE from 'three'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'
import PropertiesPanel from './components/PropertiesPanel'
import DisplaySelectorModal from './components/DisplaySelectorModal'
import ProductThumbnail from './components/ProductThumbnail'
import { exportToAR, isIOS } from './utils/ARUtility'

function App() {
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/corrugate_displays/Floorstand_3S.glb`)
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
  
  const [activePartId, setActivePartId] = useState(null)
  const [displayMaterials, setDisplayMaterials] = useState([])
  const [displayRotation, setDisplayRotation] = useState(0)
  const exportFnRef = useRef(null)
  const exportARFnRef = useRef(null)

  // Detect iOS/iPad support
  const isIOSPlatform = useMemo(() => isIOS(), [])
  
  // ─── TOUCH/POINTER DRAG STATE ──────────────────────────────────────────────
  const [dragPosition, setDragPosition] = useState(null) // { x, y }
  
  // Global pointer move listener for virtual drag preview
  useEffect(() => {
    if (!draggedProduct) return
    const handlePointerMove = (e) => setDragPosition({ x: e.clientX, y: e.clientY })
    const handlePointerUp   = () => { setDraggedProduct(null); setDragPosition(null) }
    
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup',   handlePointerUp)
    }
  }, [draggedProduct])
  
  const handleUnitPriceChange = useCallback((productId, price) => {
    setUnitPrices(prev => ({ ...prev, [productId]: price }))
  }, [])

  const handleUnitCostChange = useCallback((productId, cost) => {
    setUnitCosts(prev => ({ ...prev, [productId]: cost }))
  }, [])

  const handleExportReady = useCallback((fn) => { exportFnRef.current = fn }, [])
  const handleExport = useCallback(() => { exportFnRef.current?.() }, [])

  const handleExportARReady = useCallback((fn) => { exportARFnRef.current = fn }, [])
  const handleExportAR = useCallback(async () => {
    const group = exportARFnRef.current?.()
    if (group) {
      await exportToAR(group)
    }
  }, [])

  const handleDisplaySelect = useCallback((url) => {
    setDisplayUrl(url)
    // Reset context to prevent "Ghost Selections" on the new model
    setActivePartId(null)
    setActiveShelfId(null)
    setDisplayRotation(0)
    setIsSelectorOpen(false)
    setPlacements({})
    setDisplayMaterials([])
  }, [])

  const handleSelectShelf = useCallback((id) => {
    setActiveShelfId(id)
    if (id) setActivePartId(null) // Context switch
  }, [])

  const handleSelectPart = useCallback((id) => {
    setActivePartId(id)
    if (id) setActiveShelfId(null) // Context switch
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
        dragPosition={dragPosition}
        onDisplayDrop={handleDisplayDrop}
        placements={placements}
        activeShelfId={activeShelfId}
        onSelectShelf={handleSelectShelf}
        onUpdateShelf={handleUpdateShelf}
        onMaterialsReady={handleMaterialsReady}
        onExportReady={handleExportReady}
        onExportARReady={handleExportARReady}
        rotation={displayRotation}
        activePartId={activePartId}
        onSelectPart={handleSelectPart}
        displayMaterials={displayMaterials}
      />
      
      <Sidebar
        setDisplayUrl={handleDisplaySelect}
        setDraggedProduct={setDraggedProduct}
        draggedProduct={draggedProduct}
        displayMaterials={displayMaterials}
        onExport={handleExport}
        onExportAR={handleExportAR}
        isIOS={isIOSPlatform}
        placements={placements}
        activeShelfId={activeShelfId}
        onSelectShelf={handleSelectShelf}
        onUpdateShelf={handleUpdateShelf}
        onOpenDisplaySelector={() => setIsSelectorOpen(true)}
        currentDisplayUrl={displayUrl}
        displayLibrary={displayLibrary}
      />

      {/* ─── VIRTUAL DRAG PREVIEW ─── */}
      {draggedProduct && dragPosition && (
        <div 
          className="fixed pointer-events-none z-[100] w-16 h-16 bg-white/20 border border-accent/40 rounded-xl backdrop-blur-sm shadow-2xl flex items-center justify-center p-1"
          style={{ 
            left: dragPosition.x - 32, 
            top: dragPosition.y - 32,
            transform: 'scale(1.1)',
            opacity: 0.8
          }}
        >
          <div className="w-full h-full opacity-60">
            <ProductThumbnail product={draggedProduct} />
          </div>
        </div>
      )}

      <PropertiesPanel 
        placements={placements}
        unitPrices={unitPrices}
        unitCosts={unitCosts}
        onUnitPriceChange={handleUnitPriceChange}
        onUnitCostChange={handleUnitCostChange}
      />

      {/* ─── ROTATION CONTROLLER ─── */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none group">
        <div className="px-4 py-3 bg-glass-bg border border-glass-border backdrop-blur-xl rounded-2xl shadow-3xl pointer-events-auto flex items-center gap-5 min-w-[320px] transition-all duration-500 hover:scale-[1.02] hover:border-accent/30 translate-y-2 opacity-0 animate-[slide-in-bottom_0.6s_cubic-bezier(0.16,1,0.3,1)_0.5s_forwards]">
          <div className="flex flex-col gap-0.5 min-w-[80px]">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim/60">Rotate Display</span>
            <div className="flex items-center gap-0.5">
              <input 
                type="number" min="0" max="360"
                value={Math.round(displayRotation)}
                onChange={(e) => setDisplayRotation(Math.max(0, Math.min(360, parseFloat(e.target.value) || 0)))}
                className="w-10 bg-white/40 border border-black/5 rounded-md text-xs font-black text-text-main text-center focus:outline-none focus:border-accent/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs font-black text-text-main/40">°</span>
            </div>
          </div>
          <div className="flex-1 relative flex items-center group/slider">
            <input 
              type="range" min="0" max="360" step="1"
              value={displayRotation}
              onChange={(e) => setDisplayRotation(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-black/5 rounded-full appearance-none cursor-pointer accent-accent"
              style={{
                background: `linear-gradient(to right, #0088ff ${(displayRotation/360)*100}%, rgba(0,0,0,0.05) ${(displayRotation/360)*100}%)`
              }}
            />
          </div>
        </div>
      </div>

      {isSelectorOpen && (
        <DisplaySelectorModal 
          currentUrl={displayUrl}
          setDisplayUrl={handleDisplaySelect}
          onClose={() => setIsSelectorOpen(false)}
          displayLibrary={displayLibrary}
        />
      )}
    </main>
  )
}

export default App
