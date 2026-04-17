import { useState, useEffect, useRef } from 'react'
import ProductThumbnail from './ProductThumbnail'

/**
 * LazyThumbnail
 * Optimization wrapper that only mounts the ProductThumbnail (and its WebGL Canvas)
 * when the item becomes visible in the viewport.
 */
export default function LazyThumbnail({ product }) {
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // We set isVisible to true when it enters, 
        // and false when it leaves to FREE the WebGL context aggressively.
        setIsVisible(entry.isIntersecting)
      },
      {
        root: null, // use the viewport
        rootMargin: '100px', // Pre-load slightly before it scrolls in
        threshold: 0.01
      }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current)
      }
    }
  }, [])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ minHeight: '100px' }}
    >
      {isVisible ? (
        <ProductThumbnail product={product} />
      ) : (
        // Placeholder state while off-screen to prevent layout shift
        <div className="w-full h-full bg-white/5 animate-pulse rounded-lg" />
      )}
    </div>
  )
}
