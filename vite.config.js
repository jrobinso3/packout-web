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
      
      server.watcher.add([displaysDir, previewsDir])
      
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
  base: '/packout-web/',
})
