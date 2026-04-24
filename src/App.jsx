import { useState, useEffect, useMemo } from 'react'
import ConfiguratorCanvas from './ConfiguratorCanvas'
import Sidebar from './components/Sidebar'
import PropertiesPanel from './components/PropertiesPanel'
import DisplaySelectorModal from './components/DisplaySelectorModal'
import ProductThumbnail from './components/ProductThumbnail'
import ProductGalleryModal from './components/ProductGalleryModal'
import SSOHeader from './components/SSOHeader'
import RotationController from './components/RotationController'
import RefineAssetModal from './components/RefineAssetModal'
import { useConfigurator } from './context/ConfiguratorContext'

function App() {
  const {
    isSelectorOpen, setIsSelectorOpen,
    showGallery, setShowGallery,
    exportFnRef,
    arUrl,
    draggedProduct, setDraggedProduct
  } = useConfigurator()

  // --- AR Launch Helper ---
  const handleLaunchAR = () => {
    if (arUrl) {
      import('./utils/ARUtility').then(({ launchARQuickLook }) => {
        launchARQuickLook(arUrl)
      })
    }
  }

  // --- Stale Storage Cleanup ---
  useEffect(() => {
    ['packout-display-url', 'packout-staged-ids', 'packout-placements', 'packout-materials', 'packout-prices', 'packout-costs']
      .forEach(key => localStorage.removeItem(key))
  }, [])

  // --- Touch Interaction Logic ---
  const isTouchDevice = useMemo(() => window.matchMedia("(pointer: coarse)").matches, [])
  const [dragPosition, setDragPosition] = useState(null)

  useEffect(() => {
    if (!draggedProduct || !isTouchDevice) return
    const handlePointerMove = (e) => setDragPosition({ x: e.clientX, y: e.clientY })
    const handlePointerUp   = () => { setDraggedProduct(null); setDragPosition(null) }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup',   handlePointerUp)
    }
  }, [draggedProduct, isTouchDevice, setDraggedProduct])

  return (
    <main className="w-screen h-screen overflow-hidden relative bg-[#0d0f12]">
      {/* 3D Canvas Layer */}
      <ConfiguratorCanvas />

      {/* Global SSO Mockup */}
      <SSOHeader userImage={`${import.meta.env.BASE_URL}ui/user_mockup.png`} />

      {/* Primary Sidebar - Now consumes context directly */}
      <Sidebar 
        onExport={() => exportFnRef.current?.()} 
        onLaunchAR={handleLaunchAR} 
      />

      {/* Touch Drag Preview Hud */}
      {isTouchDevice && draggedProduct && dragPosition && (
        <div
          className="fixed pointer-events-none z-[100] w-16 h-16 bg-white/20 border border-accent/40 rounded-xl backdrop-blur-sm shadow-2xl flex items-center justify-center p-1"
          style={{
            left: dragPosition.x - 32,
            top: dragPosition.y - 32,
            transform: 'scale(1.1)',
            opacity: 0.8
          }}
        >
          <div className="w-full h-full opacity-60">
            <ProductThumbnail product={draggedProduct} />
          </div>
        </div>
      )}

      {/* Bottom Profitability HUD */}
      <PropertiesPanel />

      {/* Rotation HUD HUD */}
      <RotationController />

      {/* Conditional Modals */}
      {isSelectorOpen && (
        <DisplaySelectorModal 
          onClose={() => setIsSelectorOpen(false)} 
        />
      )}

      {showGallery && (
        <ProductGalleryModal 
          onClose={() => setShowGallery(false)} 
        />
      )}

      {/* Universal Refine Studio Modal */}
      <RefineAssetModal />
    </main>
  )
}

export default App
