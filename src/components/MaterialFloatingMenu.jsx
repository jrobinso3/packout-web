import { useState, useRef } from 'react'
import { Html } from '@react-three/drei'
import { ArrowRight, Box, X } from 'lucide-react'
import { MaterialCard } from './MaterialEditor'

/**
 * Spatial Menu for editing materials of a specific display part.
 * Anchored in 3D space relative to the mesh center.
 */
export default function MaterialFloatingMenu({
  group,
  onClose,
  anchorPosition
}) {
  // High-performance dragging refs
  const containerRef = useRef()
  const dragOffset  = useRef({ x: 0, y: 0 })
  const isDragging  = useRef(false)
  const dragStart   = useRef({ x: 0, y: 0 })

  if (!group) return null

  const handleHeaderPointerDown = (e) => {
    e.stopPropagation()
    const headerNode = e.currentTarget
    headerNode.setPointerCapture(e.pointerId)
    
    const startX = e.clientX
    const startY = e.clientY
    const { x: initialX, y: initialY } = dragOffset.current
    
    const handleMove = (emove) => {
      const dx = emove.clientX - startX
      const dy = emove.clientY - startY
      
      const newX = initialX + dx
      const newY = initialY + dy
      
      dragOffset.current = { x: newX, y: newY }
      
      if (containerRef.current) {
        containerRef.current.style.transform = `translate(calc(440px + ${newX}px), ${newY}px)`
      }
    }
    
    const handleUp = (eup) => {
      try { headerNode.releasePointerCapture(eup.pointerId) } catch (err) {}
      window.removeEventListener('pointermove', handleMove, { capture: true })
      window.removeEventListener('pointerup', handleUp, { capture: true })
    }
    
    window.addEventListener('pointermove', handleMove, { capture: true })
    window.addEventListener('pointerup', handleUp, { capture: true })
  }

  // Filter out internal structural materials (fluting)
  const visibleMaterials = (group.materials || []).filter(
    m => !m.name.toLowerCase().includes('fluting')
  )

  return (
    <Html
      position={anchorPosition}
      center
      className="pointer-events-none select-none"
    >
      {/* 
        Outer wrapper isolates our spatial drag transform from Tailwind's 
        animate-in transform, ensuring the offset isn't destroyed.
      */}
      <div 
        ref={containerRef}
        style={{ transform: `translate(calc(440px + ${dragOffset.current.x}px), ${dragOffset.current.y}px)` }}
      >
        <div
          className="pointer-events-auto bg-glass-bg backdrop-blur-2xl border border-glass-border rounded-[2rem] shadow-3xl w-[320px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300"
          onPointerDown={e => e.stopPropagation()}
          onPointerMove={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
        >

        {/* Header - Optimized Drag Handle */}
        <div 
          className="flex items-center justify-between p-5 border-b border-black/5 bg-black/5 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handleHeaderPointerDown}
        >
          <div className="flex items-center gap-2">
            <Box size={14} className="text-secondary" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main">
              Edit Material : <span className="text-text-dim">{group.label}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            onPointerDown={e => e.stopPropagation()} // Prevent drag start when clicking close
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-text-dim/40 hover:text-text-main transition-all border border-black/5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="max-h-[360px] overflow-y-auto p-5 custom-scrollbar space-y-2"
          onWheel={e => e.stopPropagation()}
        >
          {visibleMaterials.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-black/5 rounded-2xl flex flex-col items-center justify-center gap-3">
              <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest text-center px-4">
                No editable materials
              </span>
            </div>
          ) : (
            visibleMaterials.map(entry => (
              <MaterialCard key={entry.uuid} entry={entry} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-white/5 flex items-center justify-between">
          <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest">
            {visibleMaterials.length} Material{visibleMaterials.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-black shadow-lg hover:scale-110 active:scale-95 transition-all group"
            title="Finish Editing"
          >
            <ArrowRight size={24} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

      </div>
    </div>
  </Html>
  )
}
