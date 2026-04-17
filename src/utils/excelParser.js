import * as XLSX from 'xlsx'

const MM_TO_INCH = 1 / 25.4

/**
 * Utility to parse Product Excel files
 * Supports automated creation of product libraries from spreadsheet data
 */
export async function parseProductExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        
        // Use the first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // Convert to JSON
        const rows = XLSX.utils.sheet_to_json(worksheet)
        
        // Map rows to our product staging format
        const products = rows.map((row, index) => {
          // Normalize headers: expand to support common industry variants
          const name     = row.Name      || row.Product    || row.Title || row['Product Name'] || row['Item Name'] || row.SKU || `Product-${index + 1}`
          const wIn      = parseFloat(row.Width_In  || row.Width  || row.W || row['Width (in)'] || 0)
          const hIn      = parseFloat(row.Height_In || row.Height || row.H || row['Height (in)'] || 0)
          const dIn      = parseFloat(row.Depth_In  || row.Depth  || row.D || row['Depth (in)'] || 0)
          const uStr     = String(row.Units || row.UOM || 'in').toLowerCase()
          const color    = row.Color || row.Hex || row.Hexcode || '#ffffff'
          const category = row.Category || row.Tag || row.Type || row.Folder || 'Imported'
          
          // Image Hint: allow the spreadsheet to explicitly link to a filename
          const imageHint = row.Image || row.Texture || row.Artwork || row['Image Name'] || null
          
          // The application stores dimensions in INCHES. 
          // If the spreadsheet provides MM, we convert to inches. 
          // If it provides inches, we use it as-is.
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
            color: String(color).startsWith('#') ? color : `#${color}`,
            category: String(category),
            imageHint: imageHint ? String(imageHint).trim() : null,
            isCustom: true,
            textureUrl: null,
            isReady: false 
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

/**
 * Helper to match images to pending product stubs.
 * Uses a tiered priority strategy to ensure the best matches are found first:
 * 1. Explicit Image Hint Match
 * 2. Exact Title Match
 * 3. Fuzzy Substring Matching (restricted to unclaimed images only)
 */
export function matchImagesToProducts(pendingProducts, files) {
  // Create deep copy to ensure React state updates correctly
  const updated = pendingProducts.map(p => ({ ...p }))
  const matchedFiles = new Set()

  const normalize = (str) => 
    String(str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '')

  // Pass 1: Handle Explicit Hints and Exact Matches
  files.forEach(file => {
    const rawFileName = file.name.replace(/\.[^.]+$/, '')
    const cleanFileName = normalize(rawFileName)
    if (!cleanFileName) return

    updated.forEach(prod => {
      // Check for explicit filename hint
      const explicitMatch = prod.imageHint && (
        prod.imageHint.toLowerCase() === file.name.toLowerCase() || 
        normalize(prod.imageHint) === cleanFileName
      )

      const exactTitleMatch = normalize(prod.name) === cleanFileName

      if (explicitMatch || exactTitleMatch) {
         if (prod.textureUrl) URL.revokeObjectURL(prod.textureUrl)
         prod.textureUrl = URL.createObjectURL(file)
         prod.rawFile = file 
         prod.isReady = true
         matchedFiles.add(file.name)
      }
    })
  })

  // Pass 2: Fuzzy/Substring matches for remaining unready items
  files.forEach(file => {
    // IMPORTANT: If an image was already matched exactly in Pass 1, 
    // do not use it for fuzzy/substring guessing. This "claims" the image
    // for its proper owner and prevents fuzzy false-positives.
    if (matchedFiles.has(file.name)) return 

    const cleanFileName = normalize(file.name.replace(/\.[^.]+$/, ''))
    if (cleanFileName.length < 3) return 

    updated.forEach(prod => {
      // Only fuzzy match products that still lack an image
      if (prod.isReady) return
      
      const prodName = normalize(prod.name)
      if (prodName.length < 3) return

      if (prodName.includes(cleanFileName) || cleanFileName.includes(prodName)) {
        prod.textureUrl = URL.createObjectURL(file)
        prod.rawFile = file 
        prod.isReady = true
        matchedFiles.add(file.name)
      }
    })
  })

  return { updated, matchedFiles: Array.from(matchedFiles) }
}

/**
 * Convert a File to Base64 for permanent IndexedDB storage
 */
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = error => reject(error)
    reader.readAsDataURL(file)
  })
}

/**
 * Generate and download a starter Excel template
 */
export function downloadProductTemplate() {
  const headers = [
    ['Name', 'Width_In', 'Height_In', 'Depth_In', 'Units', 'Color', 'Category', 'Image'],
    ['Sample Product A', '4.5', '10', '4.5', 'in', '#ff0000', 'Beverage', 'apple_juice.png'],
    ['Sample Product B', '3', '6', '3', 'in', '#00ff00', 'Snacks', 'chips_bag.jpg'],
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(headers)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Template')

  // Generate binary and trigger download
  XLSX.writeFile(workbook, 'packout_template.xlsx')
}
