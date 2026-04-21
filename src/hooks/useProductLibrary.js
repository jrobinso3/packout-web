import { useState, useEffect, useCallback } from 'react'
import * as idb from '../utils/idbUtility'

export function useProductLibrary() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]  = useState(true)

  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    try {
      const stored = await idb.getAllProducts()
      const hiddenIds = await idb.getHiddenProductIds()
      
      let defaults = []
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/products.json`)
        if (res.ok) defaults = await res.json()
      } catch (err) {
        console.warn('Defaults fetch failed', err)
      }

      // Merge logic: IDB (stored) takes priority over defaults
      const mergedMap = new Map()
      
      // 1. Load defaults
      defaults.forEach(d => {
        if (!hiddenIds.has(d.id)) mergedMap.set(d.id, d)
      })
      
      // 2. Overwrite with IDB items (this preserves our thumbnails)
      stored.forEach(s => {
        if (!hiddenIds.has(s.id)) mergedMap.set(s.id, s)
      })

      setProducts(Array.from(mergedMap.values()))
    } catch (err) {
      console.error('Failed to load product library:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLibrary()
  }, [fetchLibrary])

  const addProduct = useCallback(async (product) => {
    try {
      // If this ID was previously hidden, un-hide it
      await idb.unhideProduct(product.id)

      // 1. Sync to disk (silently ignored on static hosts with no API)
      await fetch(`${import.meta.env.BASE_URL}api/save-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      }).catch(() => {})

      // 2. Always persist locally
      await idb.saveProduct(product)
      await fetchLibrary()
    } catch (err) {
      console.warn('Local save failed:', err)
    }
  }, [fetchLibrary])

  const addProductsBatch = useCallback(async (newProducts) => {
    try {
      // Un-hide any IDs we are batch importing
      for(const p of newProducts) await idb.unhideProduct(p.id)

      await fetch(`${import.meta.env.BASE_URL}api/save-products-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProducts)
      }).catch(() => {})

      await idb.saveProductsBatch(newProducts)
      await fetchLibrary()
    } catch (err) {
      console.warn('Batch local save failed:', err)
    }
  }, [fetchLibrary])

  const updateProduct = useCallback(async (id, updates) => {
    // 1. Always get the latest from DB first to avoid race conditions with React state
    const allStored = await idb.getAllProducts()
    const storedMatch = allStored.find(p => p.id === id)
    
    // 2. If not in DB, it might be a default product we haven't touched yet
    const existing = storedMatch || products.find(p => p.id === id)
    
    if (!existing) return
    
    const updated = { ...existing, ...updates }
    
    try {
      // 3. Sync to the global JSON registry (silently ignored on static hosts)
      await fetch(`${import.meta.env.BASE_URL}api/save-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      }).catch(() => {})

      // 4. Update local persistence
      await idb.saveProduct(updated)
      await fetchLibrary()
    } catch (err) {
      console.warn('Local update failed:', err)
    }
    return updated
  }, [products, fetchLibrary])

  const removeProduct = useCallback(async (id) => {
    try {
      // 1. Sync removal to global registry (silently ignored on static hosts)
      await fetch(`${import.meta.env.BASE_URL}api/remove-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      }).catch(() => {})

      // 2. Local cleanup
      await idb.deleteProduct(id)
      await idb.hideProduct(id)
      await fetchLibrary()
    } catch (err) {
      console.warn('Local hide failed:', err)
    }
  }, [fetchLibrary])

  const clearLibrary = useCallback(async () => {
    await idb.clearLibrary()
    await idb.clearHiddenProducts()
    await fetchLibrary()
  }, [fetchLibrary])

  return {
    products,
    loading,
    addProduct,
    addProductsBatch,
    updateProduct,
    removeProduct,
    clearLibrary,
    refresh: fetchLibrary
  }
}
