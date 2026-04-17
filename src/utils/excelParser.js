import * as XLSX from 'xlsx'

const INCH_TO_M = 0.0254
const MM_TO_M = 0.001

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
          // Normalize headers: we look for variations of the names
          const name      = row.Name || row.Product || row.Title || `Product-${index + 1}`
          const wIn     = parseFloat(row.Width_In || row.Width || row.W || 0)
          const hIn     = parseFloat(row.Height_In || row.Height || row.H || 0)
          const dIn     = parseFloat(row.Depth_In || row.Depth || row.D || 0)
          const uStr    = (row.Units || 'in').toLowerCase()
          const color     = row.Color || row.Hex || '#ffffff'
          const category  = row.Category || row.Tag || 'Imported'
          
          const multiplier = uStr === 'mm' ? MM_TO_M : INCH_TO_M
          
          return {
            id: `imported-${Date.now()}-${index}`,
            name: String(name),
            geometry: 'box',
            dimensions: [
              wIn * multiplier,
              hIn * multiplier,
              dIn * multiplier
            ],
            color: String(color).startsWith('#') ? color : `#${color}`,
            category: String(category),
            isCustom: true,
            // These will be filled by the Image Handshake UI
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
 * Helper to match images to pending product stubs
 */
export function matchImagesToProducts(pendingProducts, files) {
  const updated = [...pendingProducts]
  const matchedFiles = []

  files.forEach(file => {
    // Remove extension to get the clean name
    const cleanFileName = file.name.replace(/\.[^.]+$/, '').toLowerCase()
    
    updated.forEach(prod => {
      if (prod.name.toLowerCase() === cleanFileName) {
        // We don't save the URL yet, we'll convert to Base64 in the final step
        // for permanent IDB storage. For the UI preview, we use the Blob URL.
        prod.textureUrl = URL.createObjectURL(file)
        prod.rawFile = file // Keep for final base64 conversion
        prod.isReady = true
        matchedFiles.push(file.name)
      }
    })
  })

  return { updated, matchedFiles }
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
