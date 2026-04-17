import { openDB } from 'idb'

const DB_NAME = 'PackoutDB'
const STORE_NAME = 'Products'
const VERSION = 1

/**
 * Packs out Local Database Utility
 * Handles persistent storage of Products and textures using IndexedDB
 */
export async function initDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        // Create indexes for rich searching
        store.createIndex('name', 'name')
        store.createIndex('category', 'category')
        store.createIndex('isCustom', 'isCustom')
      }
    },
  })
}

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
