import { useState, useEffect, useRef } from 'react'
import { Box, Loader2, Upload, AlertCircle } from 'lucide-react'
import { renderGlbThumbnailEnqueued, renderProceduralThumbnailEnqueued, resolveAssetUrl } from '../utils/textureUtils'

// ─── Module-level thumbnail cache ────────────────────────────────────────────
const thumbnailCache = new Map()
const inProgress = new Set()

// ─── ProductThumbnail ─────────────────────────────────────────────────────────
const ProductThumbnail = ({ product, onUpdate }) => {
  const cachedThumb = thumbnailCache.get(product.id) || null
  const [generatedThumb, setGeneratedThumb] = useState(cachedThumb)
  const [error, setError] = useState(false)
  const isMounted = useRef(true)
  const fileInputRef = useRef()

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const storedThumb = (product.thumbnailUrl && product.thumbnailUrl.startsWith('data:'))
    ? product.thumbnailUrl
    : null
  const imageUrl = storedThumb
    || generatedThumb
    || ((product.isCustom || product.textureUrl) ? resolveAssetUrl(product.textureUrl) : null)

  const isProceduralShape = product.category === '3D' && !product.glbUrl && !!product.geometry
  const isGlbModel = !!product.glbUrl
  const needs3D = isProceduralShape || isGlbModel

  // ── Background Generation Effect ─────────────────────────────────────────
  useEffect(() => {
    if (imageUrl) return
    if (!needs3D) return
    if (inProgress.has(product.id)) return
    if (thumbnailCache.has(product.id)) {
      setGeneratedThumb(thumbnailCache.get(product.id))
      return
    }

    inProgress.add(product.id)
    setError(false)

    const renderTask = isGlbModel
      ? renderGlbThumbnailEnqueued(product.glbUrl)
      : renderProceduralThumbnailEnqueued(product)

    renderTask
      .then(thumb => {
        inProgress.delete(product.id)
        if (!thumb) { if (isMounted.current) setError(true); return }
        thumbnailCache.set(product.id, thumb)
        if (isMounted.current) setGeneratedThumb(thumb)
        onUpdate?.(product.id, { thumbnailUrl: thumb })
      })
      .catch(() => {
        inProgress.delete(product.id)
        if (isMounted.current) setError(true)
      })
  }, [product.id])

  // ── Upload handler (click-to-pick, no drag needed) ────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const dataUrl = evt.target.result
      thumbnailCache.set(product.id, dataUrl)
      if (isMounted.current) {
        setGeneratedThumb(dataUrl)
        setError(false)
      }
      onUpdate?.(product.id, { thumbnailUrl: dataUrl })
    }
    reader.readAsDataURL(file)
    // Reset so the same file can be re-selected if needed
    e.target.value = ''
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (imageUrl && !error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/40 relative overflow-hidden group/thumb">
        <img
          src={imageUrl}
          alt={product.name}
          className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover/thumb:scale-110"
          onError={() => setError(true)}
        />
        {/* Repair overlay – click to replace */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Replace thumbnail"
          className="absolute inset-0 opacity-0 group-hover/thumb:opacity-100 flex items-end justify-end p-2 transition-opacity"
        >
          <span className="text-[7px] font-black uppercase tracking-widest bg-black/60 text-white px-2 py-1 rounded-md backdrop-blur-sm">
            Replace
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    )
  }

  // No image: show upload panel
  return (
    <div className="w-full h-full flex items-center justify-center bg-black/40 relative overflow-hidden">
      {/* Spinner badge for in-progress 3D generation */}
      {needs3D && !error && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 bg-accent/20 border border-accent/30 rounded-md">
          <Loader2 size={7} className="text-accent animate-spin" />
          <span className="text-[6px] font-black uppercase text-accent tracking-widest">Gen</span>
        </div>
      )}

      {/* Click-to-upload button — fills the whole tile */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 group/upload transition-colors hover:bg-accent/10"
      >
        <div className={`p-2.5 rounded-xl border-2 border-dashed transition-all
          ${error
            ? 'border-red-500/40 bg-red-500/10 group-hover/upload:border-red-400'
            : 'border-white/15 bg-white/5 group-hover/upload:border-accent/60 group-hover/upload:bg-accent/5'
          }`}
        >
          {error
            ? <AlertCircle size={16} className="text-red-400/70 group-hover/upload:text-red-400 transition-colors" />
            : <Upload size={16} className="text-white/30 group-hover/upload:text-accent transition-colors" />
          }
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className={`text-[8px] font-black uppercase tracking-widest transition-colors
            ${error
              ? 'text-red-400/60 group-hover/upload:text-red-400'
              : 'text-white/25 group-hover/upload:text-accent'
            }`}
          >
            {error ? 'Repair Preview' : 'Add Thumbnail'}
          </span>
          <span className="text-[6px] font-bold text-white/15 uppercase tracking-tight group-hover/upload:text-white/30 transition-colors">
            Click to browse
          </span>
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

export default ProductThumbnail
