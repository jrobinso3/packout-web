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

    const files = fs.readdirSync(displaysDir)
      .filter(f => f.toLowerCase().endsWith('.glb'))
      .map(f => {
        const id = f.replace(/\.glb$/i, '')
        const cleanId = id.replace(/\.\d+$/g, '')
        const name = cleanId.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
        const thumb = fs.existsSync(path.join(previewsDir, `${id}.png`)) 
          ? `${id}.png` 
          : null

        return { id, name, url: f, thumb }
      })

    fs.writeFileSync(
      path.join(displaysDir, 'manifest.json'),
      JSON.stringify(files, null, 2)
    )
    console.log(`[Sync] Updated display gallery with ${files.length} models.`)
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
      
      const onChange = (file) => {
        if (file.includes('public/displays') || file.includes('public/previews')) sync()
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
