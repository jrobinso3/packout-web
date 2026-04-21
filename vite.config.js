import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Custom plugin to automatically sync the display gallery manifest
const syncGalleryPlugin = () => {
  const sync = () => {
    const displaysDir = path.resolve(__dirname, 'public/displays')
    const previewsDir = path.resolve(__dirname, 'public/previews')
    
    if (!fs.existsSync(displaysDir)) return

    const library = []

    const scan = (dir, currentPath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      
      const categoryName = currentPath 
        ? currentPath.split(path.sep).pop().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : 'Fixtures'

      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        const relPath = path.join(currentPath, item.name)

        if (item.isDirectory()) {
          if (['blender'].includes(item.name.toLowerCase())) continue
          scan(fullPath, relPath)
        } else if (item.name.toLowerCase().endsWith('.glb')) {
          const id = item.name.replace(/\.glb$/i, '')
          const cleanId = id.replace(/\.\d+$/g, '')
          const name = cleanId.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
          
          const thumb = fs.existsSync(path.join(previewsDir, `${id}.png`)) 
            ? `${id}.png` 
            : null

          library.push({ 
            id, 
            name, 
            url: relPath.replace(/\\/g, '/'), 
            thumb,
            category: categoryName
          })
        }
      }
    }

    scan(displaysDir)

    fs.writeFileSync(
      path.join(displaysDir, 'manifest.json'),
      JSON.stringify(library, null, 2)
    )
    console.log(`[Sync] Updated display gallery with ${library.length} models across categories.`)
  }

  return {
    name: 'sync-gallery-manifest',
    buildStart() {
      sync()
    },
    configureServer(server) {
      const displaysDir = path.resolve(__dirname, 'public/displays')
      const previewsDir = path.resolve(__dirname, 'public/previews')
      const productsDir = path.resolve(__dirname, 'public/products')
      const dataDir     = path.resolve(__dirname, 'public/data')
      
      server.watcher.add([displaysDir, previewsDir])
      
      // ─── PERSISTENCE API: HANDLE DISK WRITING ─────────────────────────────────
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0]
        
        const getBody = () => new Promise((resolve) => {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => resolve(body))
        })

        if (req.method === 'POST' && url.includes('/api/save-product')) {
          console.log(`[API] POST save-product: ${url}`)
          const body = await getBody()
          try {
            const product = JSON.parse(body)
            const productsPath = path.join(dataDir, 'products.json')
            let currentProducts = []
            if (fs.existsSync(productsPath)) {
              currentProducts = JSON.parse(fs.readFileSync(productsPath, 'utf-8'))
            }
            const existingIdx = currentProducts.findIndex(p => p.id === product.id)
            if (existingIdx >= 0) {
              currentProducts[existingIdx] = product
            } else {
              currentProducts.push(product)
            }
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
            fs.writeFileSync(productsPath, JSON.stringify(currentProducts, null, 2))
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (err) {
            console.error('[API Error]', err)
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'POST' && url.includes('/api/save-products-batch')) {
          console.log(`[API] POST save-products-batch: ${url}`)
          const body = await getBody()
          try {
            const newProducts = JSON.parse(body)
            const productsPath = path.join(dataDir, 'products.json')
            let currentProducts = []
            if (fs.existsSync(productsPath)) {
              currentProducts = JSON.parse(fs.readFileSync(productsPath, 'utf-8'))
            }
            newProducts.forEach(product => {
              const existingIdx = currentProducts.findIndex(p => p.id === product.id)
              if (existingIdx >= 0) {
                currentProducts[existingIdx] = product
              } else {
                currentProducts.push(product)
              }
            })
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
            fs.writeFileSync(productsPath, JSON.stringify(currentProducts, null, 2))
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (err) {
            console.error('[API Error]', err)
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'POST' && url.includes('/api/remove-product')) {
          console.log(`[API] POST remove-product: ${url}`)
          const body = await getBody()
          try {
            const { id } = JSON.parse(body)
            const productsPath = path.join(dataDir, 'products.json')
            if (fs.existsSync(productsPath)) {
              const currentProducts = JSON.parse(fs.readFileSync(productsPath, 'utf-8'))
              const nextProducts = currentProducts.filter(p => p.id !== id)
              fs.writeFileSync(productsPath, JSON.stringify(nextProducts, null, 2))
            }
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true }))
          } catch (err) {
            console.error('[API Error]', err)
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'POST' && url.includes('/api/upload-texture')) {
          console.log(`[API] POST upload-texture: ${url}`)
          const body = await getBody()
          try {
            const { fileName, base64Data } = JSON.parse(body)
            const filePath = path.join(productsDir, fileName)
            if (!fs.existsSync(productsDir)) fs.mkdirSync(productsDir, { recursive: true })
            const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), 'base64')
            fs.writeFileSync(filePath, buffer)
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, url: `products/${fileName}` }))
          } catch (err) {
            console.error('[API Error]', err)
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'POST' && url.includes('/api/upload-model')) {
          console.log(`[API] POST upload-model: ${url}`)
          const body = await getBody()
          try {
            const { fileName, base64Data } = JSON.parse(body)
            const modelsDir = path.join(productsDir, '3D')
            if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true })
            const filePath = path.join(modelsDir, fileName)
            const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
            fs.writeFileSync(filePath, buffer)
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, url: `products/3D/${fileName}` }))
          } catch (err) {
            console.error('[API Error]', err)
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        
        if (req.method === 'POST' && url.includes('/api/save-display-thumb')) {
          console.log(`[API] POST save-display-thumb: ${url}`)
          const body = await getBody()
          try {
            const { displayId, base64Data } = JSON.parse(body)
            const fileName = `${displayId}.png`
            const filePath = path.join(previewsDir, fileName)
            if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true })
            const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
            fs.writeFileSync(filePath, buffer)
            const manifestPath = path.join(displaysDir, 'manifest.json')
            if (fs.existsSync(manifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
              const entry = manifest.find(d => d.id === displayId)
              if (entry) {
                entry.thumb = fileName
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
              }
            }
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, thumb: fileName }))
          } catch (err) {
            console.error('[API Error]', err)
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        
        next()
      })

      const onChange = (filePath) => {
        const fullPath = path.resolve(filePath)
        if (fullPath.startsWith(displaysDir) || fullPath.startsWith(previewsDir)) {
          if (!fullPath.endsWith('manifest.json')) {
            console.log(`[Sync] File change detected: ${path.basename(fullPath)}`)
            sync()
          }
        }
      }
      
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
      server.watcher.on('change', onChange)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    syncGalleryPlugin()
  ],
  server: {
    watch: {
      // Prevent full-page reloads when the app writes to the global registry
      ignored: ['**/public/data/**', '**/public/products/**']
    }
  },
  base: '/packout-web/',
})
