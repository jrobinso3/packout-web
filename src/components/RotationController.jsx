import React from 'react'
import { useConfigurator } from '../context/ConfiguratorContext'

export default function RotationController() {
  const { displayRotation, setDisplayRotation } = useConfigurator()

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none group">
      <div className="px-4 py-3 bg-glass-bg border border-glass-border backdrop-blur-xl rounded-2xl shadow-3xl pointer-events-auto flex items-center gap-5 min-w-[320px] transition-all duration-500 hover:scale-[1.02] hover:border-accent/30 translate-y-2 opacity-0 animate-[slide-in-bottom_0.6s_cubic-bezier(0.16,1,0.3,1)_0.5s_forwards]">
        <div className="flex flex-col gap-0.5 min-w-[80px]">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim/60">Rotate Display</span>
          <div className="flex items-center gap-0.5">
            <input
              type="number" min="0" max="360"
              value={Math.round(displayRotation)}
              onChange={(e) => setDisplayRotation(Math.max(0, Math.min(360, parseFloat(e.target.value) || 0)))}
              className="w-10 bg-white/40 border border-black/5 rounded-md text-xs font-black text-text-main text-center focus:outline-none focus:border-accent/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs font-black text-text-main/40">°</span>
          </div>
        </div>
        <div className="flex-1 relative flex items-center group/slider">
          <input
            type="range" min="0" max="360" step="1"
            value={displayRotation}
            onChange={(e) => setDisplayRotation(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-black/5 rounded-full appearance-none cursor-pointer accent-accent"
            style={{
              background: `linear-gradient(to right, #0088ff ${(displayRotation/360)*100}%, rgba(0,0,0,0.05) ${(displayRotation/360)*100}%)`
            }}
          />
        </div>
      </div>
    </div>
  )
}
