import { useState } from 'react'
import { Upload, Download, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import ProductThumbnail from './ProductThumbnail'
import MaterialEditor from './MaterialEditor'

// ─── Collapsible sidebar section ─────────────────────────────────────────────

function SidebarSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-hdr" onClick={() => setOpen(p => !p)}>
        <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">{title}</span>
        {open
          ? <ChevronUp   size={13} className="text-gray-500 flex-shrink-0" />
          : <ChevronDown size={13} className="text-gray-500 flex-shrink-0" />}
      </button>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function Sidebar({ setDisplayUrl, setDraggedProduct, displayMaterials, onExport }) {

  const handleDisplayUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) setDisplayUrl(URL.createObjectURL(file))
  }

  const products = [
    { id: 'box-1',      name: 'Box.glb',   geometry: 'box',      dimensions: [0.12, 0.15, 0.12], color: '#00f0ff' },
    { id: 'sphere-1',   name: 'Ball.glb',  geometry: 'sphere',   dimensions: [0.10, 0.10, 0.10], color: '#ff6b35' },
    { id: 'cylinder-1', name: 'Can.glb',   geometry: 'cylinder', dimensions: [0.08, 0.18, 0.08], color: '#44ff88' },
    { id: 'cone-1',     name: 'Cone.glb',  geometry: 'cone',     dimensions: [0.10, 0.16, 0.10], color: '#ff44cc' },
  ]

  const hasGroups = displayMaterials?.some(g => g.materials?.length > 0)

  return (
    <div className="absolute left-4 top-4 bottom-4 w-80 bg-glass-bg border border-glass-border backdrop-blur-md rounded-2xl p-6 flex flex-col z-10 shadow-2xl flex-shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#0088ff] flex items-center justify-center text-black">
          <Layers size={24} />
        </div>
        <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">PACKOUT</h1>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">

        <SidebarSection title="Display Model">
          <label className="flex flex-col items-center justify-center cursor-pointer p-5 border-2 border-dashed border-glass-border rounded-xl hover:border-accent hover:bg-white/5 transition-all w-full group mt-2">
            <Upload size={22} className="text-gray-400 mb-2 group-hover:text-accent transition-colors" />
            <span className="text-sm font-medium text-gray-300">Upload Display (.glb)</span>
            <input type="file" className="hidden" accept=".glb,.gltf" onChange={handleDisplayUpload} />
          </label>
        </SidebarSection>

        {hasGroups && (
          <SidebarSection title="Materials">
            <div className="mt-2">
              <MaterialEditor groups={displayMaterials} />
            </div>
          </SidebarSection>
        )}

        <SidebarSection title="Products">
          <div className="grid grid-cols-2 gap-3 mt-2">
            {products.map(product => (
              <div key={product.id} className="flex flex-col items-center gap-1">
                <div
                  className="bg-white/5 border border-glass-border rounded-xl p-2 cursor-grab active:cursor-grabbing hover:bg-white/10 transition-all w-full aspect-square"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; setDraggedProduct(product) }}
                  onDragEnd={() => setDraggedProduct(null)}
                >
                  <ProductThumbnail product={product} />
                </div>
                <span className="text-xs font-semibold">{product.name}</span>
              </div>
            ))}
          </div>
        </SidebarSection>

      </div>

      {/* Export */}
      <div className="pt-5 mt-auto border-t border-glass-border">
        <button
          onClick={onExport}
          className="w-full py-4 rounded-xl bg-white text-black font-bold text-sm tracking-wide flex items-center justify-center gap-2 hover:bg-[#00f0ff] hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all"
        >
          <Download size={18} />
          EXPORT PNG
        </button>
      </div>

    </div>
  )
}
