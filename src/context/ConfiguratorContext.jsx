import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getSession, saveSession, getAllDisplayThumbs, saveDisplayThumb } from '../utils/idbUtility'
import { useProductLibrary } from '../hooks/useProductLibrary'
import { generateUSDZ, isIOS } from '../utils/ARUtility'

const ConfiguratorContext = createContext()

export function useConfigurator() {
  const context = useContext(ConfiguratorContext)
  if (!context) {
    throw new Error('useConfigurator must be used within a ConfiguratorProvider')
  }
  return context
}

export function ConfiguratorProvider({ children }) {
  // --- Display state ---
  const [displayUrl, setDisplayUrl] = useState(`${import.meta.env.BASE_URL}displays/corrugate_displays/Floorstand_3S.glb`)
  const [displayLibrary, setDisplayLibrary] = useState([])
  const [displayThumbs, setDisplayThumbs] = useState({})
  const [displayModel, setDisplayModel] = useState(null)
  
  // --- Product state ---
  const { products, addProduct, addProductsBatch, updateProduct, removeProduct } = useProductLibrary()
  const [stagedProductIds, setStagedProductIds] = useState([])
  const [draggedProduct, setDraggedProduct] = useState(null)
  
  // --- UI/Modal state ---
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  
  // --- Placement state ---
  const [placements, setPlacements] = useState({})
  const [activeShelfId, setActiveShelfId] = useState(null)
  
  // --- Materials state ---
  const [activePartId, setActivePartId] = useState(null)
  const [displayMaterials, setDisplayMaterials] = useState([])
  const [materialConfigs, setMaterialConfigs] = useState({})
  
  // --- Pricing state ---
  const [unitPrices, setUnitPrices] = useState({})
  const [unitCosts, setUnitCosts] = useState({})
  
  // --- Transform state ---
  const [displayRotation, setDisplayRotation] = useState(0)
  
  // --- AR state ---
  const [arStatus, setArStatus] = useState('idle')
  const [arUrl, setArUrl] = useState(null)
  const isIOSPlatform = useMemo(() => isIOS(), [])
  
  // --- Persistence state ---
  const [isHydrated, setIsHydrated] = useState(false)
  
  // --- Export Refs ---
  const exportFnRef = useRef(null)
  const exportARFnRef = useRef(null)

  // --- Handlers ---
  const handleOpenEditor = useCallback((product) => {
    setEditingProduct(product)
  }, [])

  const handleSaveDisplayThumb = useCallback(async (displayId, dataUrl) => {
    setDisplayThumbs(prev => ({ ...prev, [displayId]: dataUrl }))
    try { await saveDisplayThumb(displayId, dataUrl) } catch (e) { console.warn('IDB thumb save failed', e) }
    if (import.meta.env.DEV) {
      try {
        await fetch(`${import.meta.env.BASE_URL}api/save-display-thumb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayId, base64Data: dataUrl })
        })
      } catch (e) { console.warn('Disk thumb sync failed', e) }
    }
  }, [])

  const handleDisplaySelect = useCallback((url) => {
    setDisplayUrl(url)
    setActivePartId(null)
    setActiveShelfId(null)
    setDisplayRotation(0)
    setIsSelectorOpen(false)
    setPlacements({})
    setDisplayMaterials([])
    setArStatus('idle')
    if (arUrl) URL.revokeObjectURL(arUrl)
    setArUrl(null)
  }, [arUrl])

  const handleSelectShelf = useCallback((id) => {
    setActiveShelfId(id)
    if (id) setActivePartId(null)
  }, [])

  const handleSelectPart = useCallback((id) => {
    setActivePartId(id)
    if (id) setActiveShelfId(null)
  }, [])

  const handleUpdateShelf = useCallback((shelfId, newItems) => {
    setPlacements(prev => ({
      ...prev,
      [shelfId]: { ...prev[shelfId], items: newItems }
    }))
  }, [])

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

  const handleRemoveProductAction = useCallback(async (id) => {
    if (!window.confirm("Are you sure you want to delete this product? It will be removed from all shelves.")) return
    await removeProduct(id)
    setStagedProductIds(prev => prev.filter(pid => pid !== id))
    setPlacements(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(shelfId => {
        next[shelfId] = {
          ...next[shelfId],
          items: next[shelfId].items.filter(item => item.product?.id !== id)
        }
      })
      return next
    })
  }, [removeProduct])

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

  const handleDisplayDrop = useCallback((mesh, product) => {
    if (!mesh?.name) return
    const shelfId = mesh.name

    setPlacements((prev) => {
      const existing = prev[shelfId] || { items: [] }
      const newItems = [...existing.items]
      const newItem = {
        id: `item-${Date.now()}`,
        product,
        facings: 1,
        stackVertical: false,
        spacing: 0,
        autoFit: true
      }
      newItems.push(newItem)

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

      return { ...prev, [shelfId]: { items: newItems } }
    })
    setActiveShelfId(shelfId)
  }, [])

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

  // --- Effects ---
  
  // Load library manifest
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}displays/manifest.json`)
      .then(res => res.json())
      .then(data => setDisplayLibrary(data))
      .catch(err => console.error('Error loading manifest:', err))
  }, [])

  // Load display thumbs
  useEffect(() => {
    getAllDisplayThumbs().then(saved => {
      if (saved && Object.keys(saved).length > 0) setDisplayThumbs(saved)
    }).catch(() => {})
  }, [])

  // Hydration
  useEffect(() => {
    const hydrate = async () => {
      try {
        const session = await getSession()
        if (session) {
          if (session.displayUrl) setDisplayUrl(session.displayUrl)
          if (session.stagedProductIds) setStagedProductIds(session.stagedProductIds)
          if (session.placements) setPlacements(session.placements)
          if (session.materialConfigs) setMaterialConfigs(session.materialConfigs)
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

  // Auto-save
  useEffect(() => {
    if (!isHydrated) return
    const saveData = async () => {
      try {
        const sanitizedPlacements = {}
        Object.keys(placements).forEach(key => {
          sanitizedPlacements[key] = { items: placements[key].items || [] }
        })
        await saveSession({
          displayUrl,
          stagedProductIds,
          placements: sanitizedPlacements,
          materialConfigs,
          unitPrices,
          unitCosts
        })
      } catch (err) { console.error('Failed to save session:', err) }
    }
    const timer = setTimeout(saveData, 500)
    return () => clearTimeout(timer)
  }, [displayUrl, stagedProductIds, placements, materialConfigs, unitPrices, unitCosts, isHydrated])

  // Sync staged products with placements
  useEffect(() => {
    const placedIds = new Set()
    Object.values(placements).forEach(p => {
      p.items?.forEach(item => { if (item.product?.id) placedIds.add(item.product.id) })
    })
    if (placedIds.size > 0) {
      setStagedProductIds(prev => {
        const missing = Array.from(placedIds).filter(id => !prev.includes(id))
        if (missing.length === 0) return prev
        return [...prev, ...missing]
      })
    }
  }, [placements])

  const value = {
    // State
    displayUrl, setDisplayUrl: handleDisplaySelect,
    displayLibrary,
    displayThumbs,
    displayModel, setDisplayModel,
    products, addProduct, addProductsBatch, updateProduct: handleProductUpdated, removeProduct: handleRemoveProductAction,
    stagedProductIds, handleToggleStagedProduct,
    draggedProduct, setDraggedProduct,
    isSelectorOpen, setIsSelectorOpen,
    showGallery, setShowGallery,
    editingProduct, setEditingProduct, handleOpenEditor,
    placements, handleUpdateShelf, handleDisplayDrop,
    activeShelfId, handleSelectShelf,
    activePartId, handleSelectPart,
    displayMaterials, setDisplayMaterials,
    materialConfigs, handleMaterialUpdate,
    unitPrices, setUnitPrices,
    unitCosts, setUnitCosts,
    displayRotation, setDisplayRotation,
    arStatus, arUrl, isIOSPlatform, handleGenerateAR,
    exportFnRef, exportARFnRef,
    handleSaveDisplayThumb
  }

  return (
    <ConfiguratorContext.Provider value={value}>
      {children}
    </ConfiguratorContext.Provider>
  )
}
