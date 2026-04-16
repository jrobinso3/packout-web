import { useState } from 'react'
import { Trash2, Layers, GripVertical, Link, X, ArrowRight } from 'lucide-react'
import { Html } from '@react-three/drei'

export default function ShelfFloatingMenu({ shelfId, placement, onUpdate, onClose, anchorPosition }) {
  const [draggedIdx, setDraggedIdx] = useState(null)
  
  if (!placement) return null

  const { mesh, items } = placement
  const shelfName = mesh.name 
    ? mesh.name.replace(/[ _]?(col|ind)(\b|$)/gi, '').replace(/_/g, ' ').toUpperCase() 
    : 'SELECTED SHELF'

  const updateItem = (itemId, updates) => {
    const newItems = items.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    )
    onUpdate(shelfId, newItems)
  }

  const removeItem = (itemId) => {
    const newItems = items.filter(item => item.id !== itemId)
    onUpdate(shelfId, newItems)
  }

  // ─── Drag and Drop Logic ───────────────────────────────────────────────────
  
  const handleDragStart = (e, index) => {
    setDraggedIdx(index)
    e.dataTransfer.effectAllowed = 'move'
    // Create a visual feedback for dragging
    setTimeout(() => {
      const card = e.target.closest('.floating-item-card')
      if (card) card.style.opacity = '0.3'
    }, 0)
  }

  const handleDragEnd = (e) => {
    const card = e.target.closest('.floating-item-card')
    if (card) card.style.opacity = '1'
    setDraggedIdx(null)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, targetIdx) => {
    e.preventDefault()
    if (draggedIdx === null || draggedIdx === targetIdx) return

    const newItems = [...items]
    const [movedItem] = newItems.splice(draggedIdx, 1)
    newItems.splice(targetIdx, 0, movedItem)
    onUpdate(shelfId, newItems)
    setDraggedIdx(null)
  }

  return (
    <Html
      position={anchorPosition || [0, 0, 0]}
      center
      style={{ transform: 'translate(calc(-50% - 440px), -50%)' }}
      className="pointer-events-none select-none"
    >
      <div className="pointer-events-auto bg-glass-bg backdrop-blur-2xl border border-glass-border rounded-[2rem] shadow-3xl w-[320px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-black/5 bg-black/5">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-secondary" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main">
              Edit Shelf : <span className="text-text-dim">{shelfName}</span>
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-text-dim/40 hover:text-text-main transition-all border border-black/5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="max-h-[280px] overflow-y-auto p-5 custom-scrollbar space-y-4" onWheel={e => e.stopPropagation()}>
          {!items.length ? (
            <div className="py-12 border-2 border-dashed border-black/5 rounded-2xl flex flex-col items-center justify-center gap-3">
              <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest text-center px-4">
                No products on this shelf
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div 
                  key={item.id} 
                  className={`floating-item-card bg-black/5 border border-black/5 rounded-2xl p-4 flex flex-col gap-4 relative transition-all ${
                    draggedIdx === idx ? 'opacity-20 translate-x-2' : ''
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  
                  {/* Item Header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="cursor-grab active:cursor-grabbing p-1 text-text-dim/20 hover:text-secondary transition-colors">
                        <GripVertical size={16} />
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-black/40 p-1 flex-shrink-0 border border-black/5">
                        {item.product.textureUrl ? (
                          <img src={item.product.textureUrl} className="w-full h-full object-contain" alt="" />
                        ) : (
                          <div className="w-full h-full rounded-lg" style={{ backgroundColor: item.product.color }} />
                        )}
                      </div>
                      <span className="text-xs font-bold text-text-main tracking-tight truncate">
                        {item.product.name?.replace(/\.glb$/i, '')}
                      </span>
                    </div>
                    
                    <button 
                      onClick={() => removeItem(item.id)}
                      className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-red flex items-center justify-center transition-all"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>

                  {/* Controls Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black uppercase tracking-widest text-text-dim">Facings</label>
                      <div className="flex items-center h-8 bg-white/60 rounded-xl border border-black/10">
                        <button 
                          onClick={() => updateItem(item.id, { facings: Math.max(1, item.facings - 1) })}
                          className="w-8 h-full hover:bg-black/5 flex items-center justify-center text-text-main/60"
                        >-</button>
                        <span className="flex-1 text-center text-xs font-bold text-text-main">{item.facings}</span>
                        <button 
                          onClick={() => updateItem(item.id, { facings: item.facings + 1 })}
                          className="w-8 h-full hover:bg-black/5 flex items-center justify-center text-text-main/60"
                        >+</button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black uppercase tracking-widest text-text-dim">Spacing (in)</label>
                      <div className={`h-8 px-3 bg-white/60 rounded-xl border border-black/10 flex items-center ${item.autoFit ? 'opacity-30' : ''}`}>
                        <input 
                          type="number" step="0.1"
                          disabled={item.autoFit}
                          value={item.spacing}
                          onChange={(e) => updateItem(item.id, { spacing: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent text-xs font-bold text-text-main border-none focus:outline-none placeholder:text-text-main/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                    <div className="flex items-center justify-between bg-black/20 p-2 rounded-xl border border-white/5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-text-dim">Stack Vertically</span>
                      <label className="relative inline-flex items-center cursor-pointer scale-90">
                        <input type="checkbox" checked={item.stackVertical} onChange={(e) => updateItem(item.id, { stackVertical: e.target.checked })} className="sr-only peer" />
                        <div className="w-8 h-4 bg-white/5 rounded-full peer peer-checked:bg-secondary/40 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/20 peer-checked:after:bg-secondary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between bg-black/20 p-2 rounded-xl border border-white/5">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-text-dim">Auto-Fit Shelf</span>
                        <Link size={8} className="text-secondary/60" />
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer scale-90">
                        <input 
                          type="checkbox" 
                          checked={item.autoFit} 
                          onChange={(e) => {
                            const newVal = e.target.checked
                            onUpdate(shelfId, items.map(it => ({ ...it, autoFit: newVal })))
                          }} 
                          className="sr-only peer" 
                        />
                        <div className="w-8 h-4 bg-white/5 rounded-full peer peer-checked:bg-secondary/40 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/20 peer-checked:after:bg-secondary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Submit Button */}
        <div className="p-5 border-t border-white/5 bg-white/5 flex items-center justify-between">
          <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">
            {items.length} Type{items.length !== 1 ? 's' : ''}
          </span>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-black shadow-lg hover:scale-110 active:scale-95 transition-all group"
            title="Accept Changes"
          >
            <ArrowRight size={24} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

      </div>
    </Html>
  )
}
