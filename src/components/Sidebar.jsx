import { useState, useMemo } from 'react'
import { Download, Layers, Box, ChevronDown, ChevronUp, ChevronRight, X, Search, PackageSearch, Edit3 } from 'lucide-react'
import ProductThumbnail from './ProductThumbnail'
import LazyThumbnail from './LazyThumbnail'
import MaterialEditor from './MaterialEditor'
import { useConfigurator } from '../context/ConfiguratorContext'

// --- Collapsible sidebar sub-section ---
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

// --- Main Category Header ---
function SidebarCategory({ title, icon: Icon, defaultOpen = false, disabled = false, alert, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const handleToggle = () => { if (!disabled) setOpen(p => !p) }

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

// --- Sidebar ---
export default function Sidebar({ onExport, onLaunchAR }) {
  const {
    displayUrl,
    displayLibrary,
    displayThumbs,
    setIsSelectorOpen,
    setShowGallery,
    displayMaterials,
    handleMaterialUpdate,
    products,
    stagedProductIds,
    handleToggleStagedProduct,
    setDraggedProduct,
    handleOpenEditor,
    updateProduct,
    arStatus,
    handleGenerateAR,
    isIOSPlatform
  } = useConfigurator()

  const stagedProducts = useMemo(() => 
    products.filter(p => stagedProductIds.includes(p.id)), 
    [products, stagedProductIds]
  )

  const hasGroups = displayMaterials?.some(g => g.materials?.length > 0)

  const renderProductCard = (product, isStaged = false) => {
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches
    return (
      <div key={product.id} className="flex flex-col items-center gap-1 relative">
        <div
          className="bg-white/5 border border-glass-border rounded-xl p-2 cursor-grab active:cursor-grabbing hover:bg-white/10 transition-all w-full aspect-square"
          style={{ touchAction: 'none' }}
          draggable={!isTouchDevice}
          onClick={() => { if (product.isCustom) handleOpenEditor(product) }}
          onDragStart={(e) => {
            if (!isTouchDevice) {
              setDraggedProduct(product)
              e.dataTransfer.effectAllowed = 'copy'
            }
          }}
          onDragEnd={() => { if (!isTouchDevice) setDraggedProduct(null) }}
          onPointerDown={(e) => {
            if (!isTouchDevice) return
            const startX = e.clientX
            const startY = e.clientY
            const handleMove = (emove) => {
              if (Math.hypot(emove.clientX - startX, emove.clientY - startY) > 15) {
                setDraggedProduct(product)
                window.removeEventListener('pointermove', handleMove)
              }
            }
            window.addEventListener('pointermove', handleMove)
            window.addEventListener('pointerup', () => window.removeEventListener('pointermove', handleMove), { once: true })
          }}
        >
          <LazyThumbnail product={product} onUpdate={updateProduct} />
        </div>
        <span className="text-[10px] font-semibold text-center leading-tight text-text-main truncate w-full px-1">{product.name?.replace(/\.glb$/i, '')}</span>
        {isStaged && (
          <div className="absolute -top-1 -right-1 flex gap-1 items-center">
            {product.isCustom && (
              <button
                className="w-5 h-5 rounded-full bg-white/10 border border-white/20 text-white hover:bg-secondary hover:text-white flex items-center justify-center transition-all shadow-lg"
                onClick={() => handleOpenEditor(product)}
                title="Edit Product"
              >
                <Edit3 size={8} />
              </button>
            )}
            <button
              className="w-5 h-5 rounded-full bg-accent/20 border border-accent/40 text-accent hover:bg-accent hover:text-white flex items-center justify-center transition-all shadow-lg"
              onClick={() => handleToggleStagedProduct(product.id)}
              title="Remove from Bin"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="absolute left-4 top-4 bottom-4 w-80 bg-glass-bg border border-glass-border backdrop-blur-md rounded-2xl p-6 flex flex-col z-10 shadow-2xl flex-shrink-0">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#0088ff] flex items-center justify-center text-black">
          <Layers size={24} />
        </div>
        <h1 className="text-2xl font-black tracking-wider text-text-main">PACKOUT</h1>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pr-1 custom-scrollbar">
        <SidebarCategory title="Display" icon={Layers} defaultOpen={false}>
          <button
            onClick={() => setIsSelectorOpen(true)}
            className="w-full mt-2 p-1.5 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-accent/40 transition-all group flex items-center gap-3 active:scale-[0.98]"
          >
            <div className="w-14 h-14 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex-shrink-0 shadow-inner">
              {(() => {
                const active = displayLibrary.find(d => displayUrl.includes(d.url))
                if (active) {
                  const src = displayThumbs[active.id] || (active.thumb ? `${import.meta.env.BASE_URL}previews/${active.thumb}` : null)
                  if (src) return (
                    <img 
                      src={src} 
                      alt="Active Preview"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                  )
                }
                return <div className="w-full h-full flex items-center justify-center text-text-dim/20 bg-accent/5"><Box size={20} /></div>
              })()}
            </div>
              <div className="flex flex-col text-left overflow-hidden">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Change Display</span>
                <span className="text-xs font-bold text-text-main truncate max-w-[140px]">
                  {displayUrl.split('/').pop().replace('.glb', '').replace(/_/g, ' ')}
                </span>
              </div>
            <ChevronRight size={16} className="text-text-dim/40 group-hover:translate-x-1 transition-transform" />
          </button>

          {hasGroups && (
            <SidebarSection title="Display Graphics">
              <div className="mt-2 text-text-main">
                <MaterialEditor 
                  groups={displayMaterials} 
                  onUpdateConfig={handleMaterialUpdate}
                />
              </div>
            </SidebarSection>
          )}
        </SidebarCategory>

        <SidebarCategory title="Product Bin" icon={Box} defaultOpen={true}>
          <div className="space-y-3 pt-2">
            <button
              onClick={() => setShowGallery(true)}
              className="w-full mb-3 p-3 rounded-xl bg-accent/10 border border-accent/20 hover:bg-accent/20 hover:border-accent/40 transition-all group flex items-center justify-between active:scale-[0.98]"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center group-hover:rotate-12 transition-transform">
                  <Search size={16} />
                </div>
                <div className="flex flex-col text-left"><span className="text-[10px] font-black uppercase tracking-widest text-accent">Manage Products</span></div>
              </div>
              <ChevronRight size={14} className="text-accent/60 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="mat-group bg-accent/5 border border-accent/10 rounded-xl p-3 pt-2 min-h-[120px] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Staged Product</span>
                <span className="text-[10px] font-bold text-accent/60">{stagedProducts.length}</span>
              </div>
              {stagedProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">{stagedProducts.map(p => renderProductCard(p, true))}</div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-accent/20 rounded-lg">
                  <PackageSearch size={24} className="text-accent/20 mb-2" />
                  <p className="text-[9px] font-bold text-text-dim/40 uppercase tracking-widest leading-relaxed">Bin is currently empty.<br/>Add assets from the gallery.</p>
                </div>
              )}
            </div>
          </div>
        </SidebarCategory>
      </div>

      <div className="pt-5 mt-auto border-t border-glass-border space-y-2.5">
        {isIOSPlatform && (
          <button
            onClick={arStatus === 'ready' ? onLaunchAR : (arStatus === 'generating' ? null : handleGenerateAR)}
            disabled={arStatus === 'generating'}
            className={`w-full py-4 rounded-xl text-white font-black text-xs tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-xl ${
              arStatus === 'ready' 
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20 active:scale-95' 
                : arStatus === 'generating'
                  ? 'bg-white/10 text-text-dim animate-pulse cursor-wait'
                  : 'bg-gradient-to-br from-accent to-blue-600 shadow-blue-500/20 active:scale-[0.98]'
            }`}
          >
            <Box size={18} className={arStatus === 'generating' ? 'animate-spin' : ''} />
            {arStatus === 'ready' ? 'LAUNCH AR' : (arStatus === 'generating' ? 'PREPARING...' : 'VIEW IN AR')}
          </button>
        )}
        <button
          onClick={onExport}
          className="w-full py-3.5 rounded-xl bg-text-main text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all active:scale-[0.98]"
        >
          <Download size={18} />
          EXPORT PNG
        </button>
      </div>
    </div>
  )
}
