import { useState, useEffect } from 'react'
import { X, Upload, Box, Check, Loader2 } from 'lucide-react'

export default function DisplaySelectorModal({ currentUrl, setDisplayUrl, onClose }) {
  const [displayLibrary, setDisplayLibrary] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}displays/manifest.json`)
      .then(res => res.json())
      .then(data => {
        setDisplayLibrary(data)
        setIsLoading(false)
      })
      .catch(err => {
        console.error('Error loading displays:', err)
        setIsLoading(false)
      })
  }, [])

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setDisplayUrl(URL.createObjectURL(file))
      onClose()
    }
  }

  const handleSelect = (url) => {
    setDisplayUrl(`${import.meta.env.BASE_URL}displays/${url}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl bg-glass-bg border border-glass-border rounded-[2.5rem] shadow-3xl overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/5">
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-black tracking-tight text-white uppercase">Select Display</h2>
            <p className="text-text-dim text-sm font-medium">Choose a fixture from our library or upload your own 3D model.</p>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all border border-white/5"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Gallery Grid */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <Box size={18} className="text-accent" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-dim">Display Library</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isLoading ? (
                  <div className="md:col-span-2 flex flex-col items-center justify-center py-20 gap-4 text-accent/40">
                    <Loader2 size={40} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Scanning Catalog...</span>
                  </div>
                ) : displayLibrary.map((d) => {
                  const fullUrl = `${import.meta.env.BASE_URL}displays/${d.url}`
                  const isActive = currentUrl === fullUrl

                  return (
                    <button
                      key={d.id}
                      onClick={() => handleSelect(d.url)}
                      className={`group relative flex flex-col rounded-3xl border-2 transition-all overflow-hidden ${
                        isActive 
                          ? 'border-accent bg-accent/5' 
                          : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      {/* Image Preview */}
                      <div className="aspect-[16/10] overflow-hidden bg-black/40 relative">
                        <img 
                          src={`${import.meta.env.BASE_URL}previews/${d.thumb}`}
                          alt={d.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        {isActive && (
                          <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-accent flex items-center justify-center text-black shadow-lg">
                            <Check size={18} strokeWidth={3} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-5 flex flex-col gap-1 text-left">
                        <span className="text-lg font-bold text-white tracking-tight">{d.name}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-dim/60">Standard Fixture</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Upload Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <Upload size={18} className="text-secondary" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-dim">Custom Model</h3>
              </div>

              <label className="flex flex-col items-center justify-center aspect-square md:aspect-auto md:h-[calc(100%-40px)] rounded-3xl border-2 border-dashed border-white/10 bg-white/5 hover:border-accent hover:bg-accent/5 transition-all cursor-pointer group p-8 text-center gap-6">
                <div className="w-20 h-20 rounded-2.5xl bg-white/5 flex items-center justify-center text-white/20 group-hover:text-accent group-hover:bg-accent/10 transition-all border border-white/5 group-hover:border-accent/20">
                  <Upload size={40} />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-lg font-bold text-white">Upload GLB</span>
                  <p className="text-sm text-text-dim font-medium leading-relaxed">
                    Drag and drop your own display model here or click to browse.
                  </p>
                </div>
                <div className="px-4 py-2 rounded-full bg-white/5 text-[10px] font-black text-text-dim/60 uppercase tracking-widest">
                  Supports .glb & .gltf
                </div>
                <input type="file" className="hidden" accept=".glb,.gltf" onChange={handleFileUpload} />
              </label>
            </div>

          </div>
        </div>

        {/* Footer Info */}
        <div className="p-6 bg-black/20 border-t border-white/5 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-dim/40 max-w-2xl mx-auto">
            Ensure display models include <span className="text-accent underline decoration-accent/40 decoration-wavy underline-offset-4">_col</span> or <span className="text-accent underline decoration-accent/40 decoration-wavy underline-offset-4">_ind</span> suffixes for shelf identification.
          </p>
        </div>

      </div>
    </div>
  )
}
