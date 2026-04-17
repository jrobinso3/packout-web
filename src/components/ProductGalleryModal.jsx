import { useState, useMemo, useRef } from 'react'
import { 
  X, Search, Filter, Plus, FileSpreadsheet, Upload, 
  CheckCircle2, AlertCircle, Trash2, Edit3, ImagePlus, ChevronRight,
  Download, FileJson, Folder
} from 'lucide-react'
import ProductThumbnail from './ProductThumbnail'
import { parseProductExcel, matchImagesToProducts, fileToBase64 } from '../utils/excelParser'

export default function ProductGalleryModal({ 
  products, 
  onAddProduct, 
  onUpdateProduct, 
  onRemoveProduct, 
  onBatchImport,
  stagedProductIds = [],
  onToggleStaging,
  onClose 
}) {
  const [activeTab, setActiveTab] = useState('browse') // 'browse' | 'import'
  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  // --- Import Context ---
  const [pendingProducts, setPendingProducts] = useState([])
  const [isParsing, setIsParsing] = useState(false)
  const [importStatus, setImportStatus] = useState('idle') // 'idle' | 'staged' | 'working'
  const excelRef = useRef()
  const imageRef = useRef()
  const jsonRef = useRef()
  const [collapsedFolders, setCollapsedFolders] = useState(new Set())

  // --- Filtering Logic ---
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || '3D'))
    return ['All', ...Array.from(cats)]
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      const matchCat    = categoryFilter === 'All' || (p.category || '3D') === categoryFilter
      return matchSearch && matchCat
    })
  }, [products, search, categoryFilter])

  // --- Excel Import Handlers ---
  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsParsing(true)
    try {
      const parsed = await parseProductExcel(file)
      setPendingProducts(parsed)
      setImportStatus('staged')
    } catch (err) {
      alert(err.message)
    } finally {
      setIsParsing(false)
    }
  }

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    
    const { updated } = matchImagesToProducts(pendingProducts, files)
    setPendingProducts(updated)
  }

  const handleFinalizeImport = async () => {
    setImportStatus('working')
    try {
      // Convert all staged images to Base64 for IDB storage
      const finalProducts = await Promise.all(pendingProducts.map(async (p) => {
        if (p.rawFile) {
          p.textureBase64 = await fileToBase64(p.rawFile)
          // Use the Base64 as the permanent URL for the IDB
          p.textureUrl = p.textureBase64 
        }
        // Cleanup staging props
        delete p.rawFile
        delete p.isReady
        return p
      }))

      await onBatchImport(finalProducts)
      setImportStatus('idle')
      setPendingProducts([])
      setActiveTab('browse')
    } catch (err) {
      console.error('Batch Import Failed:', err)
      alert('Internal error during data conversion.')
      setImportStatus('staged')
    }
  }
 
  // --- JSON Library Actions ---
  const handleExportCatalog = () => {
    const dataStr = JSON.stringify(products, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `packout-catalog-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportJSON = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const imported = JSON.parse(text)
      if (Array.isArray(imported)) {
        await onBatchImport(imported)
        alert(`Successfully imported ${imported.length} products!`)
      }
    } catch (err) {
      alert('Failed to parse catalog JSON.')
      console.error(err)
    } finally {
      if (jsonRef.current) jsonRef.current.value = ''
    }
  }

  // --- Components ---
  const renderImportStep = () => (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden">
      
      {/* STEP 1: DROP EXCEL */}
      <div className="grid grid-cols-2 gap-6">
        <div className={`flex flex-col gap-4 p-6 rounded-2xl border-2 border-dashed transition-all ${pendingProducts.length ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pendingProducts.length ? 'bg-emerald-500/20 text-emerald-400' : 'bg-accent/20 text-accent'}`}>
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-main">1. Load Spreadsheet</h3>
              <p className="text-[10px] text-text-dim uppercase tracking-wider font-black">Excel .xlsx or .xls</p>
            </div>
            {pendingProducts.length > 0 && <CheckCircle2 size={16} className="ml-auto text-emerald-400" />}
          </div>
          <button 
            onClick={() => excelRef.current?.click()}
            className="w-full py-2.5 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest text-text-main hover:bg-white/10 transition-all"
          >
            {isParsing ? 'Parsing...' : (pendingProducts.length ? 'Replace File' : 'Select Excel')}
          </button>
          <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
        </div>

        {/* STEP 2: DROP IMAGES */}
        <div className={`flex flex-col gap-4 p-6 rounded-2xl border-2 border-dashed transition-all ${!pendingProducts.length ? 'opacity-30 pointer-events-none grayscale' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/20 text-secondary flex items-center justify-center">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-main">2. Match Images</h3>
              <p className="text-[10px] text-text-dim uppercase tracking-wider font-black">Drop PNGs</p>
            </div>
          </div>
          <button 
            onClick={() => imageRef.current?.click()}
            className="w-full py-2.5 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest text-text-main hover:bg-white/10 transition-all"
          >
            Select Multiple Images
          </button>
          <input ref={imageRef} type="file" accept=".png,.jpg,.jpeg" multiple className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* VALIDATION DASHBOARD */}
      {pendingProducts.length > 0 && (
        <div className="flex-1 flex flex-col bg-black/20 rounded-2xl p-6 border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-dim">Import Staging: {pendingProducts.filter(p => p.isReady).length} / {pendingProducts.length} Matched</h4>
            <div className="flex gap-2 text-[10px] font-bold">
               <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12}/> Ready</span>
               <span className="flex items-center gap-1 text-amber-400"><AlertCircle size={12}/> Images Missing</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto grid grid-cols-5 gap-3 pr-2 custom-scrollbar content-start">
            {pendingProducts.map((p, i) => (
              <div key={i} className={`p-2 rounded-xl border flex flex-col gap-2 relative transition-all ${p.isReady ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`}>
                <div className="aspect-square rounded-lg bg-black/40 overflow-hidden flex items-center justify-center border border-white/5">
                  {p.textureUrl ? (
                    <img src={p.textureUrl} className="w-full h-full object-contain" alt="" />
                  ) : (
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                  )}
                </div>
                <span className="text-[9px] font-bold text-text-main truncate text-center">{p.name}</span>
                <div className="absolute -top-1 -right-1">
                   {p.isReady ? <CheckCircle2 size={14} className="text-emerald-400 fill-black" /> : <AlertCircle size={14} className="text-amber-400 fill-black" />}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 mt-4 border-t border-white/5 flex gap-4">
            <button 
              onClick={() => { setPendingProducts([]); setImportStatus('idle') }}
              className="px-6 py-3 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/20 hover:text-red-400 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleFinalizeImport}
              disabled={importStatus === 'working' || !pendingProducts.length}
              className="flex-1 py-3 rounded-xl bg-gradient-to-br from-accent to-blue-600 shadow-lg shadow-blue-500/20 text-[11px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:grayscale disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {importStatus === 'working' ? (
                <>
                   <Upload size={14} className="animate-bounce" />
                   CONVERTING BINARY DATABASE...
                </>
              ) : (
                <>
                   <Plus size={14} />
                   IMPORT {pendingProducts.length} PRODUCTS TO LIBRARY
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {!pendingProducts.length && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white/5 rounded-2xl border-2 border-dashed border-white/5">
           <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4">
            <FileSpreadsheet size={32} />
           </div>
           <h3 className="text-lg font-bold text-text-main mb-2">Retail Automation Engine</h3>
           <p className="text-sm text-text-dim max-w-sm">Load a product spreadsheet and match labels in bulk. Imported products are permanently saved to your JSON library.</p>
        </div>
      )}
    </div>
  )

  const renderBrowseGrid = () => {
    const grouped = {}
    filteredProducts.forEach(p => {
      const folder = p.folder || (p.isCustom ? 'Custom' : 'Standard Assets')
      if (!grouped[folder]) grouped[folder] = []
      grouped[folder].push(p)
    })

    const toggleFolder = (folderName) => {
      setCollapsedFolders(prev => {
        const next = new Set(prev)
        if (next.has(folderName)) next.delete(folderName)
        else next.add(folderName)
        return next
      })
    }

    return (
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        
        {/* SEARCH & FILTERS */}
        <div className="flex items-center gap-4 py-1">
          <div className="flex-1 relative group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-accent transition-colors" />
            <input 
              type="text" 
              placeholder="Search by name, SKU or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/5 focus:border-accent/40 rounded-xl py-3 pl-12 pr-4 text-xs text-text-main font-bold focus:outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-accent text-white' : 'text-text-dim hover:text-text-main'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
          <div className="flex flex-col gap-8 pb-10">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([folderName, items]) => {
              const isCollapsed = collapsedFolders.has(folderName)
              
              return (
                <div key={folderName} className="flex flex-col gap-4">
                  {/* FOLDER HEADER */}
                  <div 
                    onClick={() => toggleFolder(folderName)}
                    className="flex items-center justify-between group/folder cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isCollapsed ? 'bg-white/5 text-text-dim' : 'bg-accent/10 text-accent'}`}>
                        {isCollapsed ? <ChevronRight size={14} /> : <Folder size={14} />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main">{folderName}</span>
                        <span className="text-[8px] font-bold text-text-dim/40 uppercase tracking-widest">{items.length} Assets</span>
                      </div>
                    </div>
                    {!isCollapsed && <div className="h-px flex-1 bg-white/5 mx-6" />}
                  </div>

                  {/* FOLDER GRID */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {items.map(product => (
                        <div 
                          key={product.id} 
                          onClick={() => onToggleStaging(product.id)}
                          className={`group flex flex-col gap-2 p-3 border rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${
                            stagedProductIds.includes(product.id) 
                              ? 'bg-emerald-500/5 border-emerald-500/30' 
                              : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-accent/40'
                          }`}
                        >
                          <div className="aspect-square bg-black/40 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center border border-white/5">
                            <ProductThumbnail product={product} />
                            
                            <div className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                              stagedProductIds.includes(product.id)
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-100'
                                : 'bg-black/40 text-white/40 opacity-0 group-hover:opacity-100 scale-90 hover:scale-100 hover:bg-black/60'
                            }`}>
                              <CheckCircle2 size={16} />
                            </div>

                            <div className="absolute inset-x-0 inset-y-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[2px]">
                               <Plus size={24} className="text-white scale-75 group-hover:scale-100 transition-transform duration-300" />
                            </div>
                            {product.isCustom && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); onRemoveProduct(product.id) }}
                                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all hover:bg-red-500"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col text-left px-1">
                            <span className="text-xs font-black text-text-main truncate mb-0.5">{product.name}</span>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-text-dim/60 uppercase tracking-widest">{product.folder || (product.isCustom ? 'Custom' : 'Standard')}</span>
                              <span className="text-[10px] font-black text-accent">{Math.round(product.dimensions[1] * 10)/10}" Tall</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
      {/* OVERLAY */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={onClose} />
      
      {/* MODAL */}
      <div className="relative w-full max-w-5xl h-[85vh] bg-glass-bg border border-glass-border rounded-[2.5rem] shadow-3xl p-10 flex flex-col gap-8 overflow-hidden animate-in zoom-in-95 duration-500">
        
        {/* HEADER */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col">
            <h2 className="text-3xl font-black tracking-tighter text-text-main">PRODUCT GALLERY</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Retail Asset Manager</span>
              <span className="text-[10px] font-black text-text-dim/20">•</span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim/60">{products.length} Items Total</span>
            </div>
          </div>
          
          {/* TABS */}
          <div className="flex items-center p-1.5 bg-black/40 rounded-2xl border border-white/5 shadow-inner">
            <button 
              onClick={() => setActiveTab('browse')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'browse' ? 'bg-white text-black shadow-lg' : 'text-text-dim hover:text-text-main'}`}
            >
              <Search size={14} />
              Browse Library
            </button>
            <button 
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'import' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-dim hover:text-text-main'}`}
            >
              <FileSpreadsheet size={14} />
              Automation Hub
            </button>
          </div>

          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-text-dim hover:text-text-main transition-all active:scale-95">
            <X size={20} />
          </button>
        </div>

        {/* CATALOG MANAGEMENT BAR */}
        <div className="flex items-center justify-between px-6 py-3 bg-black/20 rounded-2xl border border-white/5">
          <div className="flex items-center gap-4">
             <div className="flex flex-col">
               <span className="text-[10px] font-black uppercase tracking-widest text-text-dim/60">Catalog Portability</span>
               <span className="text-[9px] font-bold text-text-dim/40">Backup or restore your entire library</span>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportCatalog}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-text-main hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <Download size={14} />
              Export JSON
            </button>
            <button 
              onClick={() => jsonRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-text-main hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <FileJson size={14} />
              Import JSON
            </button>
            <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
          </div>
        </div>

        {/* CONTENT */}
        {activeTab === 'browse' ? renderBrowseGrid() : renderImportStep()}

      </div>
    </div>
  )
}
