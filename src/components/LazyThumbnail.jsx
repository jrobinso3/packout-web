import { useState, useEffect, useRef } from 'react'
import ProductThumbnail from './ProductThumbnail'

/**
 * LazyThumbnail
 * Optimization wrapper that delays mounting ProductThumbnail until visible.
 * 
 * IMPORTANT: We do NOT unmount on scroll-out. We only mount once (on first 
 * intersection). Unmounting was destroying in-progress generation work and 
 * causing the "stuck on Generating" bug.
 */
export default function LazyThumbnail({ product, onUpdate }) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Mount once, then keep mounted — never tear down
          setHasBeenVisible(true)
          observer.disconnect()
        }
      },
      {
        root: null,
        rootMargin: '200px', // generous pre-load margin
        threshold: 0.01
      }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ minHeight: '100px' }}
    >
      {hasBeenVisible ? (
        <ProductThumbnail product={product} onUpdate={onUpdate} />
      ) : (
        <div className="w-full h-full bg-white/5 animate-pulse rounded-lg" />
      )}
    </div>
  )
}
