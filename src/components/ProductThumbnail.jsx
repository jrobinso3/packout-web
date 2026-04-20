import { useState, useEffect, useRef } from 'react'
import { Box, Loader2, AlertCircle } from 'lucide-react'
import { renderGlbThumbnailEnqueued, renderProceduralThumbnailEnqueued, resolveAssetUrl } from '../utils/textureUtils'

// ─── Module-level thumbnail cache ────────────────────────────────────────────
// Keyed by product.id. Survives component unmount/remount cycles.
// This is the key fix: LazyThumbnail tears down our component on scroll-out,
// but this cache ensures we never re-generate what we already have.
const thumbnailCache = new Map()

// Track in-progress tasks so multiple mounts don't double-queue
const inProgress = new Set()

// ─── ProductThumbnail ─────────────────────────────────────────────────────────

const ProductThumbnail = ({ product, onUpdate }) => {
  // Seed local state from the module cache immediately (no async wait)
  const cachedThumb = thumbnailCache.get(product.id) || null
  const [generatedThumb, setGeneratedThumb] = useState(cachedThumb)
  const [error, setError] = useState(false)
  const isMounted = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  // ── Resolve the best available image ──────────────────────────────────────
  // Priority: 1. stored thumbnailUrl from library/IDB (persisted from prev session)
  //           2. just-generated thumb (module cache / local state)
  //           3. direct textureUrl for 2D products
  const storedThumb = (product.thumbnailUrl && product.thumbnailUrl.startsWith('data:')) 
    ? product.thumbnailUrl 
    : null
  const imageUrl = storedThumb 
    || generatedThumb 
    || ((product.isCustom || product.textureUrl) ? resolveAssetUrl(product.textureUrl) : null)

  // ── Identify if this is a 3D product that needs generation ───────────────
  const isProceduralShape = product.category === '3D' && !product.glbUrl && !!product.geometry
  const isGlbModel = !!product.glbUrl
  const needs3D = isProceduralShape || isGlbModel

  // ── Background Generation Effect ─────────────────────────────────────────
  useEffect(() => {
    // Already have an image for this product — skip
    if (imageUrl) return
    // Not a 3D product — skip
    if (!needs3D) return
    // Another mount of this component is already generating — skip (avoid double-queue)
    if (inProgress.has(product.id)) return
    // Module cache already has it (race condition guard)
    if (thumbnailCache.has(product.id)) {
      setGeneratedThumb(thumbnailCache.get(product.id))
      return
    }

    // Mark as in-progress before going async
    inProgress.add(product.id)
    setError(false)

    const renderTask = isGlbModel
      ? renderGlbThumbnailEnqueued(product.glbUrl)
      : renderProceduralThumbnailEnqueued(product)

    renderTask
      .then(thumb => {
        inProgress.delete(product.id)
        if (!thumb) {
          if (isMounted.current) setError(true)
          return
        }
        // 1. Store in module-level cache immediately (survives unmount)
        thumbnailCache.set(product.id, thumb)
        // 2. Update local component state if still mounted
        if (isMounted.current) setGeneratedThumb(thumb)
        // 3. Persist to IDB via onUpdate so it survives full page refresh
        //    This is fire-and-forget; the cache handles in-session use.
        onUpdate?.(product.id, { thumbnailUrl: thumb })
      })
      .catch(() => {
        inProgress.delete(product.id)
        if (isMounted.current) setError(true)
      })
  }, [product.id]) // Only re-run if the product itself changes — stable dep array

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 relative overflow-hidden group/thumb">
      {imageUrl && !error ? (
        <img
          src={imageUrl}
          alt={product.name}
          className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover/thumb:scale-110"
          onError={() => setError(true)}
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50" />
          <div className="relative z-10 flex flex-col items-center gap-2 text-center px-4">
            {error ? (
              <div className="flex flex-col items-center gap-2 text-red-400/80">
                <AlertCircle size={22} />
                <span className="text-[7px] font-black uppercase tracking-[0.1em]">Preview Failed</span>
              </div>
            ) : needs3D ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Box size={22} className="text-accent animate-pulse" />
                  <Loader2 size={11} className="absolute -top-1 -right-1 text-accent animate-spin" />
                </div>
                <span className="text-[7px] font-black uppercase tracking-[0.3em] text-accent/60">Generating...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-text-dim/30">
                <Box size={28} strokeWidth={1} />
                <span className="text-[7px] font-black uppercase tracking-[0.2em]">No Preview</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default ProductThumbnail
