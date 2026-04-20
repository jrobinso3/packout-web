// ─── idbUtility.js ────────────────────────────────────────────────────────────
// Thin abstraction over the browser's IndexedDB API via the `idb` library.
// Provides two object stores:
//
//   Products  — persistent user-created/imported product catalogue
//               keyed by product.id with indexes on name, category, isCustom
//
//   Session   — single-key store for the current configurator state
//               (displayUrl, placements, materialConfigs, prices, etc.)
//               Written on every significant state change (debounced in App.jsx)
//
// Every exported function opens the DB independently. `openDB` returns the same
// connection if the DB is already open (idb handles caching internally).
// ──────────────────────────────────────────────────────────────────────────────

import { openDB } from 'idb'

const DB_NAME     = 'PackoutDB'
const STORE_NAME  = 'Products'
const SESSION_STORE = 'Session'
const VERSION     = 2  // Bump this when schema changes; triggers the upgrade callback

// ─── initDB ───────────────────────────────────────────────────────────────────
// Open (or create) the IndexedDB database. The `upgrade` callback runs only when
// the version number increases, allowing non-destructive schema migrations.
export async function initDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      // Create Products store if it doesn't exist yet (first install or v1 → v2)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('name', 'name')         // For name-based lookups
        store.createIndex('category', 'category') // For category filtering
        store.createIndex('isCustom', 'isCustom') // To separate custom vs. default
      }
      // Create Session store if it doesn't exist yet
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE)
      }
    },
  })
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

// Return all products in the Products store (unordered)
export async function getAllProducts() {
  const db = await initDB()
  return db.getAll(STORE_NAME)
}

// Upsert a single product (put replaces an existing record with the same id)
export async function saveProduct(product) {
  const db = await initDB()
  return db.put(STORE_NAME, product)
}

// Upsert multiple products in a single transaction for atomicity and performance
export async function saveProductsBatch(products) {
  const db = await initDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  await Promise.all([
    ...products.map(p => tx.store.put(p)),
    tx.done // Resolves when the transaction commits
  ])
}

// Delete a product by its id key
export async function deleteProduct(id) {
  const db = await initDB()
  return db.delete(STORE_NAME, id)
}

// Wipe the entire Products store (used by the "Clear Library" dev action)
export async function clearLibrary() {
  const db = await initDB()
  return db.clear(STORE_NAME)
}

// ─── Session Persistence ──────────────────────────────────────────────────────
// The session is stored as a single record under the fixed key 'current-session'.
// App.jsx writes a sanitised POJO (no Three.js objects) on every meaningful
// state change, debounced at 500 ms to avoid excessive writes.

// Save (overwrite) the current session state
export async function saveSession(data) {
  const db = await initDB()
  return db.put(SESSION_STORE, data, 'current-session')
}

// Read the last saved session, or undefined if none exists yet
export async function getSession() {
  const db = await initDB()
  return db.get(SESSION_STORE, 'current-session')
}
