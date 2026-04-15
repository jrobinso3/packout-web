import { ChevronUp, ChevronDown, Trash2, Layers } from 'lucide-react'

export default function EditProductSection({ shelfId, placement, onUpdate }) {
  if (!placement) return null

  const { mesh, items } = placement
  const shelfName = mesh.name ? mesh.name.replace(/_/g, ' ').toUpperCase() : 'SELECTED SHELF'

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-2">
        <Layers size={14} className="text-accent" />
        <span className="text-xs font-bold tracking-widest text-white">{shelfName}</span>
      </div>

      {!items.length ? (
        <div className="text-center py-8 border-2 border-dashed border-white/5 rounded-xl">
          <span className="text-xs text-white/30 italic">No products on this shelf.<br/>Drag a product here to start.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-3 relative group">
              
              {/* Header: Name and Move/Delete */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex-shrink-0 overflow-hidden border border-white/5">
                    {item.product.textureUrl ? (
                      <img src={item.product.textureUrl} className="w-full h-full object-contain" alt="" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: item.product.color }} />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-white truncate">{item.product.name}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button 
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === items.length - 1}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white"
                  >
                    <ChevronDown size={12} />
                  </button>
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
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Facings</label>
                  <div className="flex items-center">
                    <button 
                      onClick={() => updateItem(item.id, { facings: Math.max(1, item.facings - 1) })}
                      className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-l-lg flex items-center justify-center text-white text-xs"
                    >-</button>
                    <input 
                      type="number"
                      value={item.facings}
                      onChange={(e) => updateItem(item.id, { facings: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-10 h-7 bg-white/5 border-y border-white/10 text-center text-xs text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button 
                      onClick={() => updateItem(item.id, { facings: item.facings + 1 })}
                      className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-r-lg flex items-center justify-center text-white text-xs"
                    >+</button>
                  </div>
                </div>

                {/* Spacing */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Spacing (in)</label>
                  <div className="flex items-center h-7 px-2 bg-white/5 border border-white/10 rounded-lg">
                    <input 
                      type="number"
                      step="0.1"
                      value={item.spacing}
                      onChange={(e) => updateItem(item.id, { spacing: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-transparent text-xs text-white border-none focus:outline-none"
                    />
                  </div>
                </div>

                {/* Stacking Toggle */}
                <div className="col-span-2 flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                  <span className="text-[10px] font-bold text-white/60">Stack Product High</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={item.stackVertical}
                      onChange={(e) => updateItem(item.id, { stackVertical: e.target.checked })}
                    />
                    <div className="w-8 h-4 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-accent after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent/40"></div>
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
