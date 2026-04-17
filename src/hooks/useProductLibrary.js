import { useState, useEffect, useCallback } from 'react'
import * as idb from '../utils/idbUtility'

/**
 * Robust Product Library Hook
 * Synchronizes browser-side persistence with the application state
 */
export function useProductLibrary() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]  = useState(true)

  // Initial load from IndexedDB
  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch Standard Defaults from JSON
      let defaults = []
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/products.json`)
        if (res.ok) defaults = await res.json()
      } catch (err) {
        console.warn('Standard catalog JSON not found, using minimal fallback.')
        defaults = [{ id: 'box-1', name: 'Box.glb', geometry: 'box', dimensions: [4.7, 5.9, 4.7], color: '#ffffff', category: 'Standard' }]
      }

      // 2. Fetch User Custom Products from IndexedDB
      const stored = await idb.getAllProducts()

      // 3. Merge: Ensure defaults aren't duplicated
      const merged = [...stored]
      defaults.forEach(d => {
        if (!merged.find(p => p.id === d.id)) merged.push(d)
      })

      setProducts(merged)
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
    await idb.saveProduct(product)
    await fetchLibrary()
  }, [fetchLibrary])

  const addProductsBatch = useCallback(async (newProducts) => {
    await idb.saveProductsBatch(newProducts)
    await fetchLibrary()
  }, [fetchLibrary])

  const updateProduct = useCallback(async (id, updates) => {
    const existing = products.find(p => p.id === id)
    if (!existing) return
    
    const updated = { ...existing, ...updates }
    await idb.saveProduct(updated)
    await fetchLibrary()
    
    return updated // Return for shelf-sync logic
  }, [products, fetchLibrary])

  const removeProduct = useCallback(async (id) => {
    await idb.deleteProduct(id)
    await fetchLibrary()
  }, [fetchLibrary])

  const clearLibrary = useCallback(async () => {
    await idb.clearLibrary()
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
