import { useState } from 'react'
import { Upload, Download, Layers, Box, ChevronDown, ChevronUp, ChevronRight, X, Monitor } from 'lucide-react'
import ProductThumbnail from './ProductThumbnail'
import MaterialEditor from './MaterialEditor'
import CustomProductCreator from './CustomProductCreator'
import EditProductSection from './EditProductSection'

// ─── Collapsible sidebar sub-section ─────────────────────────────────────────

function SidebarSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-hdr" onClick={() => setOpen(p => !p)}>
        <span className="text-[11px] font-black uppercase tracking-widest text-text-dim">{title}</span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      <div className={open ? '' : 'hidden'}>
        <div className="sidebar-section-body">{children}</div>
      </div>
    </div>
  )
}

// ─── Main Category Header ────────────────────────────────────────────────────

function SidebarCategory({ title, icon: Icon, defaultOpen = false, disabled = false, alert, children }) {
  const [open, setOpen] = useState(defaultOpen)
  
  // Keep open state in sync with external disabled state if needed, 
  // but primarily we just block interaction.
  const handleToggle = () => {
    if (!disabled) setOpen(p => !p)
  }

  return (
    <div className="sidebar-category">
      <button 
        className={`sidebar-category-hdr flex items-center justify-between w-full transition-opacity ${disabled ? 'opacity-30 cursor-not-allowed select-none' : ''}`} 
        onClick={handleToggle}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${disabled ? 'bg-black/10 text-text-dim' : 'bg-accent/10 text-accent'} flex items-center justify-center transition-colors`}>
            <Icon size={18} />
          </div>
          <span className="text-sm font-bold uppercase tracking-widest text-text-main">{title}</span>
        </div>
        {!disabled && (
          <div className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <ChevronDown size={16} className="text-text-dim/40" />
          </div>
        )}
      </button>

      {disabled && alert && (
        <div className="mt-[-2px] ml-10 flex items-center gap-2">
          <span className="text-[10px] font-bold text-accent italic uppercase tracking-wider">{alert}</span>
        </div>
      )}

      <div className={open && !disabled ? '' : 'hidden'}>
        <div className="sidebar-category-body pl-2 ml-4 border-l border-white/5 mt-2 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export default function Sidebar({ 
  setDisplayUrl, 
  setDraggedProduct, 
  displayMaterials, 
  onExport,
  placements,
  activeShelfId,
  onSelectShelf,
  onUpdateShelf,
  onOpenDisplaySelector,
  currentDisplayUrl,
  displayLibrary
}) {
  const [demoOpen, setDemoOpen]       = useState(false)
  const [customOpen, setCustomOpen]   = useState(false)
  const [customProducts, setCustomProducts] = useState([])

  const handleDisplayUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) setDisplayUrl(URL.createObjectURL(file))
  }

  const handleAddCustomProduct = (product) => {
    setCustomProducts(prev => [...prev, product])
  }

  const handleRemoveCustomProduct = (id) => {
    setCustomProducts(prev => {
      const target = prev.find(p => p.id === id)
      if (target?.textureUrl) URL.revokeObjectURL(target.textureUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  const demoProducts = [
    { id: 'box-1',      name: 'Box.glb',   geometry: 'box',      dimensions: [0.12, 0.15, 0.12], color: '#ffffff' },
    { id: 'sphere-1',   name: 'Ball.glb',  geometry: 'sphere',   dimensions: [0.10, 0.10, 0.10], color: '#ff6b35' },
    { id: 'cylinder-1', name: 'Can.glb',   geometry: 'cylinder', dimensions: [0.08, 0.18, 0.08], color: '#44ff88' },
    { id: 'cone-1',     name: 'Cone.glb',  geometry: 'cone',     dimensions: [0.10, 0.16, 0.10], color: '#ff44cc' },
  ]

  const hasGroups = displayMaterials?.some(g => g.materials?.length > 0)

  const renderProductCard = (product) => (
    <div key={product.id} className="flex flex-col items-center gap-1 relative">
      <div
        className="bg-white/5 border border-glass-border rounded-xl p-2 cursor-grab active:cursor-grabbing hover:bg-white/10 transition-all w-full aspect-square"
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; setDraggedProduct(product) }}
        onDragEnd={() => setDraggedProduct(null)}
      >
        <ProductThumbnail product={product} />
      </div>
      <span className="text-xs font-semibold text-center leading-tight text-text-main">{product.name?.replace(/\.glb$/i, '')}</span>
      {product.isCustom && (
        <button
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center"
          onClick={() => handleRemoveCustomProduct(product.id)}
          title="Remove"
        >
          <X size={9} />
        </button>
      )}
    </div>
  )

  return (
    <div className="absolute left-4 top-4 bottom-4 w-80 bg-glass-bg border border-glass-border backdrop-blur-md rounded-2xl p-6 flex flex-col z-10 shadow-2xl flex-shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#0088ff] flex items-center justify-center text-black">
          <Layers size={24} />
        </div>
        <h1 className="text-2xl font-black tracking-wider text-text-main">PACKOUT</h1>
      </div>

      {/* Scrollable contents */}
      <div className="flex-1 overflow-y-auto space-y-8 pr-1 custom-scrollbar">

        {/* ─── DISPLAY CATEGORY ─── */}
        <SidebarCategory title="Display" icon={Layers} defaultOpen={false}>
          
          {/* Active Model Summary & Change Trigger */}
          <SidebarSection title="Display Structure" defaultOpen={false}>
            <button
              onClick={onOpenDisplaySelector}
              className="w-full mt-2 p-1.5 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-accent/40 transition-all group flex items-center gap-3 active:scale-[0.98]"
            >
              <div className="w-14 h-14 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex-shrink-0 shadow-inner">
                {(() => {
                  const active = displayLibrary.find(d => currentDisplayUrl.includes(d.url))
                  if (active) {
                    return (
                      <img 
                        src={`${import.meta.env.BASE_URL}previews/${active.thumb}`} 
                        alt="Active Preview"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    )
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center text-text-dim/20 bg-accent/5">
                      <Box size={20} />
                    </div>
                  )
                })()}
              </div>
              <div className="flex flex-col text-left overflow-hidden">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                    <Monitor size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Change Display</span>
                    <span className="text-xs font-bold text-text-main truncate max-w-[140px]">
                      {currentDisplayUrl.split('/').pop().replace('.glb', '').replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="text-text-dim/40 group-hover:translate-x-1 transition-transform" />
            </button>
          </SidebarSection>

          {hasGroups && (
            <SidebarSection title="Display Graphics">
              <div className="mt-2 text-text-main">
                <MaterialEditor groups={displayMaterials} />
              </div>
            </SidebarSection>
          )}

        </SidebarCategory>

        {/* ─── ADD PRODUCTS CATEGORY ─── */}
        <SidebarCategory title="Add Products" icon={Box}>
          <div className="space-y-3 pt-2">
            
            {/* Custom Products Sub-group */}
            <div className="mat-group">
              <button className="mat-group-header" onClick={() => setCustomOpen(p => !p)}>
                <span className="mat-group-name">Custom Products</span>
                {customOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {customOpen && (
                <div className="mat-group-cards">
                  <CustomProductCreator onAdd={handleAddCustomProduct} />
                  {customProducts.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {customProducts.map(renderProductCard)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Demo Shapes Sub-group */}
            <div className="mat-group">
              <button className="mat-group-header" onClick={() => setDemoOpen(p => !p)}>
                <span className="mat-group-name">Demo Shapes</span>
                {demoOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {demoOpen && (
                <div className="mat-group-cards">
                  <div className="grid grid-cols-2 gap-2 p-1">
                    {demoProducts.map(renderProductCard)}
                  </div>
                </div>
              )}
            </div>

          </div>
        </SidebarCategory>

      </div>

      {/* Export */}
      <div className="pt-5 mt-auto border-t border-glass-border">
        <button
          onClick={onExport}
          className="w-full py-4 rounded-xl bg-text-main text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 hover:bg-zinc-800 hover:shadow-[0_0_20px_rgba(0,136,255,0.3)] transition-all"
        >
          <Download size={18} />
          EXPORT PNG
        </button>
      </div>

    </div>
  )
}
