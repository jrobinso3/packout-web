import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { PieChart, TrendingUp, Package, DollarSign, ChevronDown, ChevronUp } from 'lucide-react'

export default function PropertiesPanel({ placements, unitPrices, unitCosts, onUnitPriceChange, onUnitCostChange }) {
  const [minimized, setMinimized] = useState(false)
  
  const reportData = useMemo(() => {
    // Safety guard: if placements hasn't initialized or is null, return empty report
    if (!placements || typeof placements !== 'object') return { rows: [], totalCount: 0, totalValue: 0 }
    
    const productsMap = new Map() // productId -> { product, quantity }
    
    Object.values(placements).forEach((placement) => {
      const { mesh, items } = placement || {}
      if (!mesh || !items || !items.length || !mesh.geometry) return
      
      try {
        const worldScale = new THREE.Vector3()
        mesh.getWorldScale(worldScale)
        if (worldScale.x === 0) worldScale.x = 1
        if (worldScale.y === 0) worldScale.y = 1
        if (worldScale.z === 0) worldScale.z = 1

        mesh.geometry.computeBoundingBox()
        const bbox = mesh.geometry.boundingBox
        if (!bbox) return

        const localHeight = bbox.max.y - bbox.min.y
        const localDepth  = bbox.max.z - bbox.min.z

        items.forEach(item => {
          const { product, facings = 1, stackVertical = false } = item
          if (!product?.dimensions) return

          const [pWidth, pHeight, pDepth] = product.dimensions
          const lpHeight = pHeight / worldScale.y
          const lpDepth  = pDepth / worldScale.z

          const countY = stackVertical ? Math.max(1, Math.floor(localHeight / lpHeight)) : 1
          const countZ = Math.max(1, Math.floor(localDepth / lpDepth))
          
          const totalQtyOnShelf = facings * countY * countZ
          
          if (!productsMap.has(product.id)) {
            productsMap.set(product.id, { product, quantity: 0 })
          }
          productsMap.get(product.id).quantity += totalQtyOnShelf
        })
      } catch (e) {
        console.warn("Report skip on shelf:", mesh.name, e)
      }
    })
    
    const rows = Array.from(productsMap.values()).map(row => {
      const unitPrice = unitPrices[row.product.id] || 0
      const unitCost  = unitCosts[row.product.id] || 0
      const rowPrice  = row.quantity * unitPrice
      const rowCost   = row.quantity * unitCost
      
      return {
        ...row,
        unitPrice,
        unitCost,
        totalPrice: rowPrice,
        profit: rowPrice - rowCost
      }
    })

    const totalCount = rows.reduce((sum, r) => sum + r.quantity, 0)
    const totalValue = rows.reduce((sum, r) => sum + r.totalPrice, 0)
    const totalProfit = rows.reduce((sum, r) => sum + r.profit, 0)

    return { rows, totalCount, totalValue, totalProfit }
  }, [placements, unitPrices, unitCosts])

  if (!reportData || reportData.rows.length === 0) return null

  return (
    <div className={`absolute bottom-4 right-4 ${minimized ? 'w-[480px] p-3 px-5' : 'w-[580px] p-5'} bg-glass-bg border border-glass-border backdrop-blur-lg rounded-2xl z-10 shadow-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 transition-all duration-300`}>
      
      {/* Panel Branding & Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 opacity-40">
          <Package size={12} className="text-accent" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-text-main">Display Summary</h2>
        </div>
        
        {/* Minimize Toggle & Affordance */}
        <div className="flex items-center gap-3">
          {minimized && (
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-text-main opacity-30 animate-in fade-in slide-in-from-right-2 duration-500">
              Click to Expand
            </span>
          )}
          <button 
            onClick={() => setMinimized(!minimized)}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-text-dim hover:text-text-main transition-all z-20"
            title={minimized ? "Expand Report" : "Minimize Report"}
          >
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Header Summary */}
      <div className={`grid grid-cols-3 gap-4 relative ${minimized ? '' : 'pb-4 border-b border-white/10'}`}>

        <div className="flex flex-col gap-1 border-r border-white/5 py-1">
          <div className="flex items-center gap-1.5 opacity-50">
            <TrendingUp size={12} className="text-accent flex-shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-dim whitespace-nowrap">Product Value</span>
          </div>
          <span className="text-lg font-black text-text-main tabular-nums leading-none">
            ${reportData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        
        <div className="flex flex-col gap-1 border-r border-white/5 px-2 py-1">
          <div className="flex items-center gap-1.5 opacity-50">
            <Package size={12} className="text-secondary flex-shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-dim whitespace-nowrap">Product Count</span>
          </div>
          <span className="text-lg font-black text-text-main tabular-nums leading-none">
            {reportData.totalCount}
          </span>
        </div>

        <div className="flex flex-col gap-1 py-1">
          <div className="flex items-center gap-1.5 opacity-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-dim whitespace-nowrap">Total Profit</span>
            <DollarSign size={12} className="text-emerald-400 flex-shrink-0" />
          </div>
          <span className={`text-lg font-black tabular-nums leading-none ${reportData.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${reportData.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Conditional Table Section */}
      {!minimized && (
        <div className="mt-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center gap-2 mb-3">
            <PieChart size={14} className="text-accent" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-main">Product Report</h3>
          </div>

          <div className="max-h-[240px] overflow-y-auto pr-1 -mr-1 custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest text-text-dim/60">
                  <th className="px-1 font-black whitespace-nowrap">Qty</th>
                  <th className="px-2 whitespace-nowrap">Product Name</th>
                  <th className="px-2 whitespace-nowrap">List Price</th>
                  <th className="px-2 whitespace-nowrap">Unit Cost</th>
                  <th className="px-2 whitespace-nowrap">Profit</th>
                  <th className="px-2 whitespace-nowrap">Total Price</th>
                </tr>
              </thead>
              <tbody>
                {reportData.rows.map((row) => (
                  <tr key={row.product.id} className="group transition-all hover:translate-x-0.5">
                    {/* Qty */}
                    <td className="px-1 py-2 bg-black/5 first:rounded-l-xl last:rounded-r-xl border-y border-l border-black/5 transition-colors group-hover:bg-black/10">
                      <span className="text-xs font-black text-accent tabular-nums">{row.quantity}</span>
                    </td>
                    
                    {/* Name */}
                    <td className="px-2 py-2 bg-black/5 first:rounded-l-xl last:rounded-r-xl border-y border-black/5 group-hover:bg-black/10">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-text-main truncate max-w-[100px]">{row.product.name?.replace(/\.glb$/i, '')}</span>
                        <span className="text-[8px] text-text-dim uppercase tracking-tighter opacity-50">SKU-{row.product.id.slice(-4).toUpperCase()}</span>
                      </div>
                    </td>
                    
                    {/* List Price (Input) */}
                    <td className="px-2 py-2 bg-black/5 first:rounded-l-xl last:rounded-r-xl border-y border-black/5 group-hover:bg-black/10">
                      <div className="flex items-center gap-1 bg-white/60 rounded-lg px-2 py-1 border border-black/5 focus-within:border-accent/40 transition-colors max-w-[70px]">
                        <span className="text-[10px] text-text-dim/60">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={unitPrices[row.product.id] || ''}
                          onChange={(e) => onUnitPriceChange(row.product.id, parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-[11px] font-bold text-text-main outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-text-main/20"
                        />
                      </div>
                    </td>

                    {/* Unit Cost (Input) */}
                    <td className="px-2 py-2 bg-black/5 first:rounded-l-xl last:rounded-r-xl border-y border-black/5 group-hover:bg-black/10">
                      <div className="flex items-center gap-1 bg-white/60 rounded-lg px-2 py-1 border border-black/5 focus-within:border-secondary/40 transition-colors max-w-[70px]">
                        <span className="text-[10px] text-text-dim/60">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={unitCosts[row.product.id] || ''}
                          onChange={(e) => onUnitCostChange(row.product.id, parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-[11px] font-bold text-text-main outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-text-dim/20"
                        />
                      </div>
                    </td>

                    {/* Profit */}
                    <td className="px-2 py-2 bg-black/5 first:rounded-l-xl last:rounded-r-xl border-y border-black/5 group-hover:bg-black/10">
                      <span className={`text-[11px] font-black tabular-nums ${row.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${row.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    
                    {/* Total Price */}
                    <td className="px-2 py-2 bg-black/5 first:rounded-l-xl last:rounded-r-xl border-y border-r border-black/5 group-hover:bg-black/10">
                      <span className="text-[11px] font-black text-text-main tabular-nums">
                        ${row.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
