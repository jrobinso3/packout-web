// ─── App.jsx ──────────────────────────────────────────────────────────────────
// Root component. Owns all shared application state and acts as the "conductor":
// it connects the 3D canvas, sidebar, modals, and persistence engine together
// through callback chains. No rendering logic lives here — all visual output
// is delegated to child components.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
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
  // ─── Core Display State ─────────────────────────────────────────────────────
  // Default display is the Floorstand_3S fixture. BASE_URL is set by Vite to
  // '/packout-web/' for GitHub Pages deployment (see vite.config.js).
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/corrugate_displays/Floorstand_3S.glb`)

  // The product currently being dragged from the sidebar toward the 3D canvas.
  // Cleared by App once the pointer lifts (pointerup).
  const [draggedProduct, setDraggedProduct] = useState(null)

  // Modal visibility flags
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)

  // Products whose checkboxes are ticked in the Product Bin (sidebar).
  // These IDs control which products appear as draggable tiles.
  const [stagedProductIds, setStagedProductIds] = useState([])

  // The manifest.json catalogue of all GLB fixture files in public/displays/.
  // Generated automatically by the Vite syncGalleryPlugin on dev-server start.
  const [displayLibrary, setDisplayLibrary] = useState([])

  // Guard flag: don't write to IDB until the initial read ("hydration") is done,
  // otherwise we would overwrite saved state with empty defaults.
  const [isHydrated, setIsHydrated] = useState(false)

  // Full-screen product gallery modal
  const [showGallery, setShowGallery] = useState(false)

  // The product currently open in the "Refine Asset" / CustomProductCreator modal
  const [editingProduct, setEditingProduct] = useState(null)

  // Reference to the loaded Three.js scene object (set by DisplayModel via onLoaded).
  // Passed to PropertiesPanel so it can re-bind shelf meshes after IDB hydration.
  const [displayModel, setDisplayModel] = useState(null)

  const handleOpenEditor = (product) => {
    setEditingProduct(product)
  }

  // ─── Product Library Hook ───────────────────────────────────────────────────
  // Provides CRUD for the product catalogue. Reads from products.json + IndexedDB,
  // and writes back via the Vite middleware API.
  const {
    products,
    addProduct,
    addProductsBatch,
    updateProduct,
    removeProduct
  } = useProductLibrary()

  // ─── Display Library Fetch ──────────────────────────────────────────────────
  // The manifest is generated at build/dev-start time by syncGalleryPlugin.
  // We load it once on mount to populate the DisplaySelectorModal grid.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}displays/manifest.json`)
      .then(res => res.json())
      .then(data => setDisplayLibrary(data))
      .catch(err => console.error('Error loading manifest:', err))
  }, [])

  // ─── Placement State ────────────────────────────────────────────────────────
  // Shape: { [meshName]: { items: PlacementItem[] } }
  // Key = stable GLB mesh name (NOT a transient UUID). Using the mesh name as
  // the key allows the placement to survive model reloads and IDB round-trips.
  //
  // Each PlacementItem: { id, product, facings, stackVertical, spacing, autoFit }
  const [placements, setPlacements] = useState({})

  // The mesh name of the currently selected shelf (drives ShelfFloatingMenu).
  const [activeShelfId, setActiveShelfId] = useState(null)

  // Per-product pricing for the profitability report in PropertiesPanel.
  const [unitPrices, setUnitPrices] = useState({})
  const [unitCosts, setUnitCosts] = useState({})

  // The mesh group name of the currently selected display part (drives MaterialFloatingMenu).
  const [activePartId, setActivePartId] = useState(null)

  // All material groups discovered by DisplayModel during its useLayoutEffect setup.
  // Shape: { groupName, label, materials: [{ uuid, name, material }] }[]
  const [displayMaterials, setDisplayMaterials] = useState([])

  // Lightweight POJO overrides stored alongside IDB session.
  // Shape: { [groupName]: { [matUuid]: { color, roughness, artworkMix } } }
  // Materials themselves are NOT stored — only the override values are, so
  // we can re-apply them whenever a new material instance is created.
  const [materialConfigs, setMaterialConfigs] = useState({})

  // Y-axis rotation of the entire display fixture (degrees, 0-360).
  const [displayRotation, setDisplayRotation] = useState(0)

  // Refs holding the export callbacks registered by ConfiguratorCanvas.
  // Using refs (not state) so that App doesn't re-render when they are set.
  const exportFnRef = useRef(null)
  const exportARFnRef = useRef(null)

  // ─── AR Export State ────────────────────────────────────────────────────────
  // Two-phase AR flow:
  //   Phase 1 — 'generating': USDZExporter runs async; spinner is shown.
  //   Phase 2 — 'ready': USDZ blob URL is available; user can launch native AR.
  const [arStatus, setArStatus] = useState('idle') // 'idle' | 'generating' | 'ready'
  const [arUrl, setArUrl] = useState(null)

  // Detect iOS/iPad once. Only iOS supports AR Quick Look natively.
  const isIOSPlatform = useMemo(() => isIOS(), [])

  // ─── TOUCH/POINTER DRAG STATE ──────────────────────────────────────────────
  // On touch devices there is no native drag-over event visible to the 3D canvas.
  // We track pointer position globally and show a floating visual clone of the
  // dragged product so the user has feedback as they move their finger.
  const isTouchDevice = useMemo(() => window.matchMedia("(pointer: coarse)").matches, [])
  const [dragPosition, setDragPosition] = useState(null) // { x, y } in viewport pixels

  // Attach global listeners ONLY while a product is being dragged on touch.
  // The listeners are torn down on pointerup or when draggedProduct clears.
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

  // ─── PROFITABILITY HANDLERS ─────────────────────────────────────────────────
  // Simple keyed maps: { [productId]: number }. Passed straight to PropertiesPanel.
  const handleUnitPriceChange = useCallback((productId, price) => {
    setUnitPrices(prev => ({ ...prev, [productId]: price }))
  }, [])

  const handleUnitCostChange = useCallback((productId, cost) => {
    setUnitCosts(prev => ({ ...prev, [productId]: cost }))
  }, [])

  // ─── EXPORT CALLBACKS ───────────────────────────────────────────────────────
  // ConfiguratorCanvas registers a PNG-export closure via onExportReady.
  // App stores it in a ref and triggers it on button click.
  const handleExportReady = useCallback((fn) => { exportFnRef.current = fn }, [])
  const handleExport = useCallback(() => { exportFnRef.current?.() }, [])

  // ConfiguratorCanvas also registers an AR-group getter (returns physicalGroupRef).
  const handleExportARReady = useCallback((fn) => { exportARFnRef.current = fn }, [])

  // Phase 1: Kick off the (slow) USDZ generation
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

  // ─── STABILITY RESCUE ────────────────────────────────────────────────────────
  // Early versions stored session data in localStorage, causing QuotaExceeded
  // errors when large Base64 textures were saved. This clears the stale keys once.
  useEffect(() => {
    ['packout-display-url', 'packout-staged-ids', 'packout-placements', 'packout-materials', 'packout-prices', 'packout-costs']
      .forEach(key => localStorage.removeItem(key))
  }, [])

  // ─── PERSISTENCE ENGINE — IDB Hydration ─────────────────────────────────────
  // On first mount, read the saved session from IndexedDB and restore state.
  // setIsHydrated(true) is called in the finally block so the auto-save effect
  // (below) never fires before we have restored the saved values.
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

  // ─── PERSISTENCE ENGINE — Async Auto-Save ───────────────────────────────────
  // Whenever key state changes, debounce a write to IndexedDB.
  // Placements are sanitised before saving: any accidental Three.js object
  // references (mesh, functions) are stripped so IDB can serialise cleanly.
  useEffect(() => {
    if (!isHydrated) return // Don't save before hydration is complete

    const saveData = async () => {
      try {
        // Strip any Three.js objects that may have leaked into placement state
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
          materialConfigs, // Lightweight POJO overrides only
          unitPrices,
          unitCosts
        })
      } catch (err) {
        console.error('Failed to save session:', err)
      }
    }

    // 500 ms debounce prevents excessive IDB writes during rapid interactions
    const timer = setTimeout(saveData, 500)
    return () => clearTimeout(timer)
  }, [displayUrl, stagedProductIds, placements, displayMaterials, unitPrices, unitCosts, isHydrated])

  // ─── PLACEMENT SYNC ──────────────────────────────────────────────────────────
  // Any product physically on the display should automatically appear in the Bin.
  // This handles the IDB-hydration case: placements are restored before the
  // product library loads, so we must reconcile once placements change.
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

  // Phase 2: Direct synchronous launch of iOS AR viewer using the pre-built USDZ blob
  const handleLaunchAR = useCallback(() => {
    if (arUrl) {
      launchARQuickLook(arUrl)
      // Reset so the button returns to "VIEW IN AR" after launching
      setArStatus('idle')
      setArUrl(null)
    }
  }, [arUrl])

  // ─── DISPLAY SELECTION ──────────────────────────────────────────────────────
  // Switching displays resets all scene-dependent state to prevent ghost
  // selections (a shelf or part from the old model staying "active").
  const handleDisplaySelect = useCallback((url) => {
    setDisplayUrl(url)
    setActivePartId(null)
    setActiveShelfId(null)
    setDisplayRotation(0)
    setIsSelectorOpen(false)
    setPlacements({})
    setDisplayMaterials([])

    // Revoke the old USDZ blob URL to free memory
    setArStatus('idle')
    if (arUrl) URL.revokeObjectURL(arUrl)
    setArUrl(null)
  }, [arUrl])

  // ─── CONTEXT SWITCHING ──────────────────────────────────────────────────────
  // Selecting a shelf and selecting a material part are mutually exclusive.
  // Activating one deactivates the other to keep exactly one floating menu open.
  const handleSelectShelf = useCallback((id) => {
    setActiveShelfId(id)
    if (id) setActivePartId(null)
  }, [])

  const handleSelectPart = useCallback((id) => {
    setActivePartId(id)
    if (id) setActiveShelfId(null)
  }, [])

  // ─── DISPLAY DROP HANDLER ───────────────────────────────────────────────────
  // Called by DropController when a dragged product is released over a dropzone.
  // Calculates an initial "facings" count based on the shelf's world-space width
  // and the product's physical width, then distributes the count across all items.
  const handleDisplayDrop = (mesh, product) => {
    if (!mesh?.name) return
    const shelfId = mesh.name // Stable GLB name used as the map key

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

      // Calculate initial facings using TRUE WORLD dimensions (accounts for scale)
      if (!mesh?.geometry) return prev

      mesh.geometry.computeBoundingBox()
      if (!mesh.geometry.boundingBox) return prev

      const worldScale = new THREE.Vector3()
      mesh.getWorldScale(worldScale)

      const localWidth = mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x
      const worldWidth = localWidth * worldScale.x

      // Distribute shelf width evenly across all products currently on the shelf
      const targetWidthPerProduct = worldWidth / newItems.length

      newItems.forEach(item => {
        // product.dimensions[0] is width in inches; multiply by 0.0254 → metres
        item.facings = Math.max(1, Math.floor(targetWidthPerProduct / (item.product.dimensions[0] * 0.0254)))
      })

      return {
        ...prev,
        [shelfId]: { items: newItems }
      }
    })

    setActiveShelfId(shelfId) // Immediately open the shelf's edit menu
  }

  // ─── SHELF UPDATE ───────────────────────────────────────────────────────────
  // Called by ShelfFloatingMenu when facings/spacing/stacking are changed.
  const handleUpdateShelf = useCallback((shelfId, newItems) => {
    setPlacements(prev => ({
      ...prev,
      [shelfId]: { ...prev[shelfId], items: newItems }
    }))
  }, [])

  // ─── MATERIAL READY CALLBACK ─────────────────────────────────────────────────
  // Called by DisplayModel after it has set up all materials for the loaded GLB.
  // We immediately re-apply any saved overrides from materialConfigs so colours
  // and artwork mixes are restored without requiring user interaction.
  const handleMaterialsReady = useCallback((groups) => {
    setDisplayMaterials(groups)

    // Re-hydration: apply saved POJO overrides to the newly created material instances
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

  // ─── MATERIAL UPDATE CALLBACK ────────────────────────────────────────────────
  // Called by MaterialCard whenever colour, roughness, or artwork mix changes.
  // Merges the new values into the lightweight materialConfigs POJO which is
  // then persisted to IDB by the auto-save effect above.
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

  // ─── STAGING TOGGLE ─────────────────────────────────────────────────────────
  // Adds or removes a product from the Bin (stagedProductIds array).
  // When removing, also sweeps all placements of that product from every shelf.
  const handleToggleStagedProduct = useCallback((id) => {
    setStagedProductIds(prev => {
      const isRemoving = prev.includes(id)
      if (isRemoving) {
        // Remove from all shelves so no orphaned instances remain on the display
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

  // ─── LIVE PRODUCT SYNC ───────────────────────────────────────────────────────
  // When a product is edited (e.g. dimensions or texture replaced), all placed
  // instances must receive the updated product object so they re-render correctly.
  const handleProductUpdated = useCallback(async (id, updates) => {
    const updated = await updateProduct(id, updates)
    if (!updated) return

    // Patch every shelf item that references this product
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

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <main className="w-screen h-screen overflow-hidden relative bg-[#0d0f12]">
      {/* 3D Canvas — occupies the entire viewport as a background layer (z-0) */}
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
        onOpenEditor={handleOpenEditor}
        products={products}
        displayMaterials={displayMaterials}
        onLoaded={setDisplayModel}
      />

      {/* Left sidebar panel — display picker, product bin, export controls */}
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

      {/* ─── VIRTUAL DRAG PREVIEW (TOUCH ONLY) ────────────────────────────────
          On touch devices, the HTML drag API doesn't work across the 3D canvas.
          We render a floating preview clone at the pointer's position instead. */}
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

      {/* Bottom-right profitability summary panel */}
      <PropertiesPanel
        placements={placements}
        unitPrices={unitPrices}
        unitCosts={unitCosts}
        onUnitPriceChange={handleUnitPriceChange}
        onUnitCostChange={handleUnitCostChange}
        scene={displayModel}
      />

      {/* ─── ROTATION CONTROLLER ──────────────────────────────────────────────
          Bottom-center HUD. Animates in after 500ms (animate-[slide-in-bottom]).
          Syncs a number input and a range slider to the same displayRotation value. */}
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
                // Fill the track up to the current value with the accent colour
                background: `linear-gradient(to right, #0088ff ${(displayRotation/360)*100}%, rgba(0,0,0,0.05) ${(displayRotation/360)*100}%)`
              }}
            />
          </div>
        </div>
      </div>

      {/* Display selector modal — shown when user clicks "Change Display" */}
      {isSelectorOpen && (
        <DisplaySelectorModal
          currentUrl={displayUrl}
          setDisplayUrl={handleDisplaySelect}
          onClose={() => setIsSelectorOpen(false)}
          displayLibrary={displayLibrary}
        />
      )}

      {/* Full product gallery — shown when user clicks "Manage Products" */}
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

      {/* ─── REFINE ASSET MODAL ───────────────────────────────────────────────
          Shown when user edits an existing custom product. Wraps CustomProductCreator
          in an overlay so it can be triggered from multiple places (sidebar, gallery). */}
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
