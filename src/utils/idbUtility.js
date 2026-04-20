// ─── idbUtility.js ────────────────────────────────────────────────────────────
// Thin abstraction over the browser's IndexedDB API via the `idb` library.
// Provides three object stores:
//
//   Products       — persistent user-created/imported product catalogue
//                    keyed by product.id with indexes on name, category, isCustom
//
//   HiddenProducts — list of product IDs that should be hidden from the gallery
//                    (even if they exist in the default JSON catalog).
//
//   Session        — single-key store for the current configurator state
//                    (displayUrl, placements, materialConfigs, prices, etc.)
// ──────────────────────────────────────────────────────────────────────────────

import { openDB } from 'idb'

const DB_NAME         = 'PackoutDB'
const STORE_NAME      = 'Products'
const HIDDEN_STORE    = 'HiddenProducts'
const SESSION_STORE   = 'Session'
const VERSION         = 3  // Bumped to v3 for HiddenProducts store

export async function initDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // Initial setup (v1)
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('name', 'name')
        store.createIndex('category', 'category')
        store.createIndex('isCustom', 'isCustom')
        db.createObjectStore(SESSION_STORE)
      }
      if (oldVersion < 3) {
        // v3 migration: Add HiddenProducts store
        if (!db.objectStoreNames.contains(HIDDEN_STORE)) {
          db.createObjectStore(HIDDEN_STORE)
        }
      }
    },
  })
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

export async function getAllProducts() {
  const db = await initDB()
  return db.getAll(STORE_NAME)
}

export async function saveProduct(product) {
  const db = await initDB()
  return db.put(STORE_NAME, product)
}

export async function saveProductsBatch(products) {
  const db = await initDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  await Promise.all([
    ...products.map(p => tx.store.put(p)),
    tx.done
  ])
}

export async function deleteProduct(id) {
  const db = await initDB()
  return db.delete(STORE_NAME, id)
}

export async function clearLibrary() {
  const db = await initDB()
  return db.clear(STORE_NAME)
}

// ─── Hidden Products Logic ────────────────────────────────────────────────────

export async function hideProduct(id) {
  const db = await initDB()
  return db.put(HIDDEN_STORE, true, id)
}

export async function unhideProduct(id) {
  const db = await initDB()
  return db.delete(HIDDEN_STORE, id)
}

export async function getHiddenProductIds() {
  const db = await initDB()
  const keys = await db.getAllKeys(HIDDEN_STORE)
  return new Set(keys)
}

export async function clearHiddenProducts() {
  const db = await initDB()
  return db.clear(HIDDEN_STORE)
}

// ─── Session Persistence ──────────────────────────────────────────────────────

export async function saveSession(data) {
  const db = await initDB()
  return db.put(SESSION_STORE, data, 'current-session')
}

export async function getSession() {
  const db = await initDB()
  return db.get(SESSION_STORE, 'current-session')
}
