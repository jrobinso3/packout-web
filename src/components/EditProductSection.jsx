import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Layers, GripVertical, Link } from 'lucide-react'

export default function EditProductSection({ shelfId, placement, onUpdate }) {
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

  const moveItem = (index, direction) => {
    const newItems = [...items]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= newItems.length) return
    
    const [moved] = newItems.splice(index, 1)
    newItems.splice(targetIndex, 0, moved)
    onUpdate(shelfId, newItems)
  }

  // ─── Drag and Drop Logic ───────────────────────────────────────────────────
  
  const handleDragStart = (e, index) => {
    setDraggedIdx(index)
    // Create a subtle ghost image
    e.dataTransfer.effectAllowed = 'move'
    // Give it a small delay so the 'dragging' class can apply
    setTimeout(() => {
      e.target.classList.add('opacity-40')
    }, 0)
  }

  const handleDragEnd = (e) => {
    e.target.classList.remove('opacity-40')
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-2">
        <Layers size={14} className="text-accent" />
        <span className="text-xs font-bold tracking-widest text-text-main">{shelfName}</span>
      </div>

      {!items.length ? (
        <div className="text-center py-8 border-2 border-dashed border-white/5 rounded-xl">
          <span className="text-xs text-text-dim italic">No products on this shelf.<br/>Drag a product here to start.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div 
              key={item.id} 
              className={`bg-black/5 border border-black/5 rounded-xl p-3 flex flex-col gap-3 relative transition-all ${
                draggedIdx === idx ? 'opacity-20 translate-x-1' : ''
              }`}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
            >
              
              {/* Header: Name and Move/Delete */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  {/* GRAB HANDLE */}
                  <div className="cursor-grab active:cursor-grabbing p-0.5 text-text-dim/40 hover:text-accent transition-colors">
                    <GripVertical size={16} />
                  </div>

                  <div className="w-8 h-8 rounded-lg bg-white/10 flex-shrink-0 overflow-hidden border border-white/5">
                    {item.product.textureUrl ? (
                      <img src={item.product.textureUrl} className="w-full h-full object-contain" alt="" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: item.product.color }} />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-text-main truncate">{item.product.name}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 ml-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-2 gap-3">
                
                {/* Facings */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Facings</label>
                  <div className="flex items-center">
                    <button 
                      onClick={() => updateItem(item.id, { facings: Math.max(1, item.facings - 1) })}
                      className="w-7 h-7 bg-black/10 hover:bg-black/20 rounded-l-lg flex items-center justify-center text-text-main text-xs"
                    >-</button>
                    <input 
                      type="number"
                      value={item.facings}
                      onChange={(e) => updateItem(item.id, { facings: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-10 h-7 bg-black/5 border-y border-black/10 text-center text-xs text-text-main [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button 
                      onClick={() => updateItem(item.id, { facings: item.facings + 1 })}
                      className="w-7 h-7 bg-black/10 hover:bg-black/20 rounded-r-lg flex items-center justify-center text-text-main text-xs"
                    >+</button>
                  </div>
                </div>

                {/* Spacing */}
                <div className={`flex flex-col gap-1 transition-opacity ${item.autoFit ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">
                    Spacing (in) {item.autoFit && <span className="text-secondary tracking-normal">(AUTO)</span>}
                  </label>
                  <div className="flex items-center h-7 px-2 bg-black/5 border border-black/10 rounded-lg">
                    <input 
                      type="number"
                      step="0.1"
                      value={item.spacing}
                      onChange={(e) => updateItem(item.id, { spacing: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-transparent text-xs text-text-main border-none focus:outline-none"
                    />
                  </div>
                </div>

              </div>

              {/* Toggles (Full Width) */}
              <div className="flex flex-col gap-0.5 pt-1 border-t border-white/5 mt-0.5">
                {/* Stacking Toggle */}
                <div className="flex items-center justify-between bg-white/5 py-1 px-2 rounded-lg border border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-text-dim">Stack Product High</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={item.stackVertical}
                      onChange={(e) => updateItem(item.id, { stackVertical: e.target.checked })}
                    />
                    <div className="w-8 h-4 bg-black/40 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-secondary/40"></div>
                  </label>
                </div>

                {/* Auto-Fit Toggle (Shelf-Wide Linked) */}
                <div className="flex items-center justify-between bg-white/5 py-1 px-2 rounded-lg border border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-text-dim">Auto-Fit</span>
                    <Link size={10} className="text-secondary/60 translate-y-[0.5px]" />
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={item.autoFit}
                      onChange={(e) => {
                        const newVal = e.target.checked
                        onUpdate(shelfId, items.map(it => ({ ...it, autoFit: newVal })))
                      }}
                    />
                    <div className="w-8 h-4 bg-black/40 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-secondary/40"></div>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
