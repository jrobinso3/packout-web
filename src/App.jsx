import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { 
  Package, Layout, Grid, Settings, 
  ChevronRight, Box, Layers, Play,
  Plus, X, Settings2
} from 'lucide-react'
import * as THREE from 'three'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'
import PropertiesPanel from './components/PropertiesPanel'
import DisplaySelectorModal from './components/DisplaySelectorModal'
import ProductThumbnail from './components/ProductThumbnail'
import ProductGalleryModal from './components/ProductGalleryModal'
import CustomProductCreator from './components/CustomProductCreator'
import { generateUSDZ, launchARQuickLook, isIOS } from './utils/ARUtility'
import { useProductLibrary } from './hooks/useProductLibrary'
import { getSession, saveSession } from './utils/idbUtility'

function App() {
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/corrugate_displays/Floorstand_3S.glb`)
  const [draggedProduct, setDraggedProduct] = useState(null)
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const [isLibraryOpen, setIsLibraryOpen]  = useState(false)
  const [stagedProductIds, setStagedProductIds] = useState([])
  const [displayLibrary, setDisplayLibrary] = useState([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  
  const handleOpenEditor = (product) => {
    setEditingProduct(product)
  }
  
  const { 
    products, 
    addProduct, 
    addProductsBatch, 
    updateProduct, 
    removeProduct 
  } = useProductLibrary()
  
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
  const [unitPrices, setUnitPrices] = useState({})
  const [unitCosts, setUnitCosts] = useState({})
  
  const [activePartId, setActivePartId] = useState(null)
  const [displayMaterials, setDisplayMaterials] = useState([])
  const [materialConfigs, setMaterialConfigs] = useState({}) // Stores POJO overrides: { groupName: { matUuid: { color, mix } } }
  const [displayRotation, setDisplayRotation] = useState(0)
  const exportFnRef = useRef(null)
  const exportARFnRef = useRef(null)

  // AR Management State
  const [arStatus, setArStatus] = useState('idle') // 'idle' | 'generating' | 'ready'
  const [arUrl, setArUrl] = useState(null)

  // Detect iOS/iPad support
  const isIOSPlatform = useMemo(() => isIOS(), [])
  
  // ─── TOUCH/POINTER DRAG STATE ──────────────────────────────────────────────
  const isTouchDevice = useMemo(() => window.matchMedia("(pointer: coarse)").matches, [])
  const [dragPosition, setDragPosition] = useState(null) // { x, y }
  
  // Global pointer move listener for virtual drag preview (TOUCH ONLY)
  useEffect(() => {
    if (!draggedProduct || !isTouchDevice) return
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
  
  // Phase 1: Heavy Async Generation
  const handleGenerateAR = useCallback(async () => {
    const group = exportARFnRef.current?.()
    if (!group) return
    
    setArStatus('generating')
    const url = await generateUSDZ(group)
    if (url) {
      setArUrl(url)
      setArStatus('ready')
    } else {
      setArStatus('idle')
    }
  }, [])
  // ─── STABILITY RESCUE (Fix QuotaExceeded crash) ───────────────────────────
  useEffect(() => {
    // Clear problematic legacy keys to restore site stability
    ['packout-display-url', 'packout-staged-ids', 'packout-placements', 'packout-materials', 'packout-prices', 'packout-costs']
      .forEach(key => localStorage.removeItem(key))
  }, [])

  // ─── PERSISTENCE ENGINE (IDB Hydration) ───────────────────────────────────
  useEffect(() => {
    const hydrate = async () => {
      try {
        const session = await getSession()
        if (session) {
          if (session.displayUrl) setDisplayUrl(session.displayUrl)
          if (session.stagedProductIds) setStagedProductIds(session.stagedProductIds)
          if (session.placements) setPlacements(session.placements)
          if (session.materialConfigs) setMaterialConfigs(session.materialConfigs)
          if (session.displayMaterials) setDisplayMaterials(session.displayMaterials)
          if (session.unitPrices) setUnitPrices(session.unitPrices)
          if (session.unitCosts) setUnitCosts(session.unitCosts)
        }
      } catch (err) {
        console.error('Failed to hydrate session:', err)
      } finally {
        setIsHydrated(true)
      }
    }
    hydrate()
  }, [])

  // ─── PERSISTENCE ENGINE (Async Auto-Save) ─────────────────────────────────
  useEffect(() => {
    if (!isHydrated) return // Don't save before hydration is complete
    
    const saveData = async () => {
      try {
        // Final Sanitization: Ensure NO non-POJOs reach IDB
        // We strip any accidental .mesh or functions that might have leaked
        const sanitizedPlacements = {}
        Object.keys(placements).forEach(key => {
          sanitizedPlacements[key] = {
            items: placements[key].items || []
          }
        })

        await saveSession({
          displayUrl,
          stagedProductIds,
          placements: sanitizedPlacements,
          materialConfigs, // Save lightweight POJO configs instead of materials
          unitPrices,
          unitCosts
        })
      } catch (err) {
        console.error('Failed to save session:', err)
      }
    }

    const timer = setTimeout(saveData, 500) // Debounce saves by 500ms
    return () => clearTimeout(timer)
  }, [displayUrl, stagedProductIds, placements, displayMaterials, unitPrices, unitCosts, isHydrated])

  // ─── PLACEMENT SYNC ───────────────────────────────────────────────────────
  // Ensure any product physically on the display is automatically in the Bin
  useEffect(() => {
    const placedIds = new Set()
    Object.values(placements).forEach(p => {
      p.items?.forEach(item => {
        if (item.product?.id) placedIds.add(item.product.id)
      })
    })

    if (placedIds.size > 0) {
      setStagedProductIds(prev => {
        const missing = Array.from(placedIds).filter(id => !prev.includes(id))
        if (missing.length === 0) return prev
        return [...prev, ...missing]
      })
    }
  }, [placements])

  // Phase 2: Direct Synchronous Launch
  const handleLaunchAR = useCallback(() => {
    if (arUrl) {
      launchARQuickLook(arUrl)
      // Reset for next time
      setArStatus('idle')
      setArUrl(null)
    }
  }, [arUrl])

  const handleDisplaySelect = useCallback((url) => {
    setDisplayUrl(url)
    // Reset context to prevent "Ghost Selections" on the new model
    setActivePartId(null)
    setActiveShelfId(null)
    setDisplayRotation(0)
    setIsSelectorOpen(false)
    setPlacements({})
    setDisplayMaterials([])
    
    // Reset AR
    setArStatus('idle')
    if (arUrl) URL.revokeObjectURL(arUrl)
    setArUrl(null)
  }, [arUrl])

  const handleSelectShelf = useCallback((id) => {
    setActiveShelfId(id)
    if (id) setActivePartId(null) // Context switch
  }, [])

  const handleSelectPart = useCallback((id) => {
    setActivePartId(id)
    if (id) setActiveShelfId(null) // Context switch
  }, [])

  const handleDisplayDrop = (mesh, product) => {
    if (!mesh?.name) return
    const shelfId = mesh.name // Use stable GLB name, not transient UUID

    setPlacements((prev) => {
      const existing = prev[shelfId] || { items: [] }
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
        item.facings = Math.max(1, Math.floor(targetWidthPerProduct / (item.product.dimensions[0] * 0.0254)))
      })

      return {
        ...prev,
        [shelfId]: { items: newItems }
      }
    })
    
    setActiveShelfId(shelfId)
  }

  const handleUpdateShelf = useCallback((shelfId, newItems) => {
    setPlacements(prev => ({
      ...prev,
      [shelfId]: { ...prev[shelfId], items: newItems }
    }))
  }, [])

  const handleMaterialsReady = useCallback((groups) => {
    setDisplayMaterials(groups)

    // Re-hydration: Apply saved configs to the new material instances
    groups.forEach(group => {
      const savedGroup = materialConfigs[group.groupName]
      if (!savedGroup) return

      group.materials.forEach(entry => {
        const savedMat = savedGroup[entry.uuid]
        if (!savedMat) return

        const mat = entry.material
        if (savedMat.color && mat.color) mat.color.set(savedMat.color)
        if (savedMat.roughness !== undefined) mat.roughness = savedMat.roughness
        if (savedMat.artworkMix !== undefined) {
          mat.userData.artworkMix = savedMat.artworkMix
          applyArtworkMix(mat, savedMat.artworkMix)
        }
        mat.needsUpdate = true
      })
    })
  }, [materialConfigs])

  const handleMaterialUpdate = useCallback((groupName, matUuid, config) => {
    setMaterialConfigs(prev => {
      const next = { ...prev }
      if (!next[groupName]) next[groupName] = {}
      next[groupName][matUuid] = {
        ...(next[groupName][matUuid] || {}),
        ...config
      }
      return next
    })
  }, [])

  const handleToggleStagedProduct = useCallback((id) => {
    setStagedProductIds(prev => {
      const isRemoving = prev.includes(id)
      if (isRemoving) {
        // Automatically sweep this product from all shelves
        setPlacements(current => {
          const next = { ...current }
          Object.keys(next).forEach(shelfId => {
            next[shelfId] = {
              ...next[shelfId],
              items: next[shelfId].items.filter(item => item.product?.id !== id)
            }
          })
          return next
        })
        return prev.filter(pid => pid !== id)
      }
      return [...prev, id]
    })
  }, [])

  // --- LIVE SYNC: When a product is updated in the library, sync all placed instances ---
  const handleProductUpdated = useCallback(async (id, updates) => {
    const updated = await updateProduct(id, updates)
    if (!updated) return

    setPlacements(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(shelfId => {
        next[shelfId] = {
          ...next[shelfId],
          items: next[shelfId].items.map(item => 
            item.product.id === id ? { ...item, product: updated } : item
          )
        }
      })
      return next
    })
  }, [updateProduct])

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
        onGenerateAR={handleGenerateAR}
        onLaunchAR={handleLaunchAR}
        arStatus={arStatus}
        isIOS={isIOSPlatform}
        placements={placements}
        activeShelfId={activeShelfId}
        onSelectShelf={handleSelectShelf}
        onUpdateShelf={handleUpdateShelf}
        onOpenDisplaySelector={() => setIsSelectorOpen(true)}
        onOpenProductGallery={() => setShowGallery(true)}
        onOpenEditor={handleOpenEditor}
        currentDisplayUrl={displayUrl}
        displayLibrary={displayLibrary}
        productLibrary={products}
        onAddProduct={addProduct}
        onRemoveProduct={removeProduct}
        stagedProductIds={stagedProductIds}
        onToggleStaging={handleToggleStagedProduct}
        onUpdateMaterialConfig={handleMaterialUpdate}
      />

      {/* ─── VIRTUAL DRAG PREVIEW (TOUCH ONLY) ─── */}
      {isTouchDevice && draggedProduct && dragPosition && (
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

      {showGallery && (
        <ProductGalleryModal 
          products={products}
          onAddProduct={addProduct}
          onUpdateProduct={handleProductUpdated}
          onRemoveProduct={removeProduct}
          onBatchImport={addProductsBatch}
          stagedProductIds={stagedProductIds}
          onToggleStaging={handleToggleStagedProduct}
          onOpenEditor={handleOpenEditor}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* ─── DEDICATED REFINE STUDIO MODAL ─── */}
      {editingProduct && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setEditingProduct(null)} />
          <div className="relative w-full max-w-lg bg-glass-bg border border-glass-border rounded-[2rem] shadow-3xl p-10 flex flex-col gap-6 overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-text-main tracking-tight">Refine Asset</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Product Studio</span>
                </div>
                <button onClick={() => setEditingProduct(null)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-text-dim hover:text-text-main transition-all">
                  <X size={18} />
                </button>
             </div>
             
             <div className="py-2">
               <CustomProductCreator 
                 existingProduct={editingProduct}
                 onUpdate={(id, updates) => {
                   handleProductUpdated(id, updates)
                   setEditingProduct(null)
                 }}
                 onCancel={() => setEditingProduct(null)}
               />
             </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
