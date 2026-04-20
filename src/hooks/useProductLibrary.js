// ─── useProductLibrary.js ─────────────────────────────────────────────────────
// Custom hook that manages the product catalogue. Provides CRUD operations
// backed by two storage layers:
//
//   1. Global JSON  — public/data/products.json, written by the Vite middleware.
//      Persists products across all browser sessions / devices that share the
//      dev server (or the deployed build).
//
//   2. IndexedDB    — local per-browser backup via idbUtility.
//      Used as a fast read cache and as a fallback when the server API is
//      unavailable (e.g. in production without a backend).
//
// Load order: IDB custom products are merged with the JSON defaults, with IDB
// entries taking priority (so edits made in-browser are not overwritten).
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import * as idb from '../utils/idbUtility'

export function useProductLibrary() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]  = useState(true)

  // ─── fetchLibrary ──────────────────────────────────────────────────────────
  // Merged read: fetch the public JSON catalogue + IDB custom products, then
  // de-duplicate by ID so defaults can't shadow existing custom entries.
  const fetchLibrary = useCallback(async () => {
    setLoading(true)
    try {
      // Step 1: Load standard/default products from the JSON file.
      // Falls back to a single placeholder if the file is missing (e.g. first run).
      let defaults = []
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/products.json`)
        if (res.ok) defaults = await res.json()
      } catch (err) {
        console.warn('Standard catalog JSON not found, using minimal fallback.')
        defaults = [{ id: 'box-1', name: 'Box.glb', geometry: 'box', dimensions: [4.7, 5.9, 4.7], color: '#ffffff', category: 'Standard' }]
      }

      // Step 2: Load all user-created / imported products from IndexedDB.
      const stored = await idb.getAllProducts()

      // Step 3: Merge — IDB entries first (higher priority), then append any
      // default that isn't already present in IDB.
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

  // Load on first mount
  useEffect(() => {
    fetchLibrary()
  }, [fetchLibrary])

  // ─── addProduct ────────────────────────────────────────────────────────────
  // Persist a single new product to both the server JSON and IDB.
  // Falls back to IDB-only if the API call fails (production/static deployment).
  const addProduct = useCallback(async (product) => {
    try {
      // Write to the global JSON via Vite middleware (dev) or API endpoint (prod)
      const res = await fetch(`${import.meta.env.BASE_URL}api/save-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      })

      if (!res.ok) throw new Error('Failed to save to global registry')

      // Mirror to IDB for fast local reads
      await idb.saveProduct(product)

      // Re-fetch so the merged list is always the source of truth
      await fetchLibrary()
    } catch (err) {
      console.error('Persistence Error:', err)
      // Graceful degradation: keep the product in IDB even if the server is down
      await idb.saveProduct(product)
      await fetchLibrary()
    }
  }, [fetchLibrary])

  // ─── addProductsBatch ──────────────────────────────────────────────────────
  // Persist multiple products atomically (used by the Excel batch import flow).
  const addProductsBatch = useCallback(async (newProducts) => {
    try {
      await fetch(`${import.meta.env.BASE_URL}api/save-products-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProducts)
      })
      await idb.saveProductsBatch(newProducts)
      await fetchLibrary()
    } catch (err) {
      console.error('Batch Persistence Error:', err)
      await idb.saveProductsBatch(newProducts)
      await fetchLibrary()
    }
  }, [fetchLibrary])

  // ─── updateProduct ─────────────────────────────────────────────────────────
  // Merge updates into an existing product and persist to IDB.
  // Returns the updated product object so callers (App.jsx shelf sync) can use it.
  // NOTE: currently only writes to IDB, not the server JSON — intentional for
  // in-session edits. A future improvement would sync to the server too.
  const updateProduct = useCallback(async (id, updates) => {
    const existing = products.find(p => p.id === id)
    if (!existing) return

    const updated = { ...existing, ...updates }
    await idb.saveProduct(updated)
    await fetchLibrary()

    return updated // Returned so App.jsx can patch all placed instances live
  }, [products, fetchLibrary])

  // ─── removeProduct ─────────────────────────────────────────────────────────
  // Delete a product from IDB and refresh. The product will also disappear from
  // the merged list on next fetchLibrary (unless it exists in the JSON defaults).
  const removeProduct = useCallback(async (id) => {
    await idb.deleteProduct(id)
    await fetchLibrary()
  }, [fetchLibrary])

  // ─── clearLibrary ─────────────────────────────────────────────────────────
  // Wipe the entire IDB product store. Defaults from the JSON file will still
  // appear after the next fetchLibrary call.
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
