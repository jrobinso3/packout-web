// ─── excelParser.js ───────────────────────────────────────────────────────────
// Utilities for the batch product import workflow.
//
//   parseProductExcel      — parse an .xlsx/.xls file into product stubs
//   matchImagesToProducts  — fuzzy-match uploaded image files to product stubs
//   fileToBase64           — encode a File to a Base64 data URL for IDB storage
//   downloadProductTemplate — generate and download a starter Excel template
//
// Column name mapping is intentionally permissive so the importer accepts
// files from common retail/POS systems without requiring reformatting.
// ──────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx'

const MM_TO_INCH = 1 / 25.4 // Conversion factor for millimetre inputs

// ─── parseProductExcel ────────────────────────────────────────────────────────
// Reads the first sheet of an Excel workbook and maps rows to product stubs.
// Supports flexible column naming (e.g. "Width", "W", "Width (in)", "Width_In")
// and automatic unit conversion when the UOM column contains "mm".
export async function parseProductExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Always use the first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        const rows = XLSX.utils.sheet_to_json(worksheet)

        const products = rows.map((row, index) => {
          // ── Column normalisation: try multiple common header names ──────────
          const name  = row.Name      || row.Product    || row.Title
                      || row['Product Name'] || row['Item Name'] || row.SKU
                      || `Product-${index + 1}`

          const wIn   = parseFloat(row.Width_In  || row.Width  || row.W || row['Width (in)']  || 0)
          const hIn   = parseFloat(row.Height_In || row.Height || row.H || row['Height (in)'] || 0)
          const dIn   = parseFloat(row.Depth_In  || row.Depth  || row.D || row['Depth (in)']  || 0)

          // UOM column: treat anything other than "mm" as inches
          const uStr  = String(row.Units || row.UOM || 'in').toLowerCase()

          const color    = row.Color || row.Hex || row.Hexcode || '#ffffff'
          const category = row.Category || row.Tag || row.Type || row.Folder || 'Imported'

          // Optional explicit image filename hint (overrides fuzzy matching)
          const imageHint = row.Image || row.Texture || row.Artwork || row['Image Name'] || null

          // Convert dimensions to inches if the spreadsheet uses millimetres
          const multiplier = uStr === 'mm' ? MM_TO_INCH : 1

          return {
            id: `imported-${Date.now()}-${index}`,
            name: String(name).trim(),
            geometry: 'box',
            dimensions: [
              wIn * multiplier,
              hIn * multiplier,
              dIn * multiplier
            ],
            // Normalise hex colour: ensure leading '#'
            color: String(color).startsWith('#') ? color : `#${color}`,
            category: String(category),
            imageHint: imageHint ? String(imageHint).trim() : null,
            isCustom: true,
            textureUrl: null,
            isReady: false // Will be set to true once an image is matched
          }
        })

        resolve(products)
      } catch (err) {
        reject(new Error('Failed to parse Excel file. Ensure it is a valid .xlsx or .xls file.'))
      }
    }

    reader.onerror = () => reject(new Error('File reading error.'))
    reader.readAsArrayBuffer(file)
  })
}

// ─── matchImagesToProducts ────────────────────────────────────────────────────
// Two-pass fuzzy matcher that links uploaded image Files to product stubs.
//
// Pass 1 — Exact / Explicit matches (high confidence):
//   a. Explicit hint: the spreadsheet's Image column matches the filename exactly
//   b. Exact title:   the product name matches the filename exactly (ignoring ext)
//   Matched images are added to a `matchedFiles` set to prevent reuse.
//
// Pass 2 — Substring / Fuzzy matches (low confidence):
//   Only runs on images that were NOT claimed in Pass 1, and only on products
//   that still lack an image. Prevents a fuzzy match from "stealing" an image
//   that belongs to a different product with a similar name.
export function matchImagesToProducts(pendingProducts, files) {
  // Deep copy so React detects the state change correctly
  const updated = pendingProducts.map(p => ({ ...p }))
  const matchedFiles = new Set() // Tracks filenames already assigned

  // Normalise strings for comparison: lowercase, strip non-alphanumeric
  const normalize = (str) =>
    String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '')

  // ── Pass 1: Explicit hints and exact title matches ─────────────────────────
  files.forEach(file => {
    const rawFileName  = file.name.replace(/\.[^.]+$/, '') // Strip extension
    const cleanFileName = normalize(rawFileName)
    if (!cleanFileName) return

    updated.forEach(prod => {
      const explicitMatch = prod.imageHint && (
        prod.imageHint.toLowerCase() === file.name.toLowerCase() ||
        normalize(prod.imageHint) === cleanFileName
      )

      const exactTitleMatch = normalize(prod.name) === cleanFileName

      if (explicitMatch || exactTitleMatch) {
        if (prod.textureUrl) URL.revokeObjectURL(prod.textureUrl)
        prod.textureUrl = URL.createObjectURL(file)
        prod.rawFile    = file
        prod.isReady    = true
        matchedFiles.add(file.name) // Mark as claimed
      }
    })
  })

  // ── Pass 2: Substring fuzzy matching on unclaimed images ───────────────────
  files.forEach(file => {
    // Skip images already claimed in Pass 1
    if (matchedFiles.has(file.name)) return

    const cleanFileName = normalize(file.name.replace(/\.[^.]+$/, ''))
    if (cleanFileName.length < 3) return // Too short to match reliably

    updated.forEach(prod => {
      if (prod.isReady) return // Skip products that already have an image

      const prodName = normalize(prod.name)
      if (prodName.length < 3) return

      // Match if either string contains the other as a substring
      if (prodName.includes(cleanFileName) || cleanFileName.includes(prodName)) {
        prod.textureUrl = URL.createObjectURL(file)
        prod.rawFile    = file
        prod.isReady    = true
        matchedFiles.add(file.name)
      }
    })
  })

  return { updated, matchedFiles: Array.from(matchedFiles) }
}

// ─── fileToBase64 ─────────────────────────────────────────────────────────────
// Converts a File to a Base64-encoded data URL string.
// Used before persisting texture files to IDB so they survive page reloads
// (object URLs created by URL.createObjectURL are session-scoped).
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result) // Returns "data:<mime>;base64,<data>"
    reader.onerror = error => reject(error)
    reader.readAsDataURL(file)
  })
}

// ─── downloadProductTemplate ──────────────────────────────────────────────────
// Generates a pre-populated Excel template and triggers a browser download.
// Provides a concrete example row so users understand the expected column format.
export function downloadProductTemplate() {
  const headers = [
    ['Name', 'Width_In', 'Height_In', 'Depth_In', 'Units', 'Color', 'Category', 'Image'],
    ['Sample Product A', '4.5', '10', '4.5', 'in', '#ff0000', 'Beverage', 'apple_juice.png'],
    ['Sample Product B', '3',   '6',  '3',   'in', '#00ff00', 'Snacks',   'chips_bag.jpg'],
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(headers)
  const workbook  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Template')

  // XLSX.writeFile triggers the browser download directly
  XLSX.writeFile(workbook, 'packout_template.xlsx')
}
