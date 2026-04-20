import { useState, useMemo, useRef } from 'react'
import { 
  X, Search, Plus, FileSpreadsheet, Upload, 
  CheckCircle2, AlertCircle, Trash2, Edit3,
  Download, FileJson, Folder, Palette, FolderPlus, Box
} from 'lucide-react'
import ProductThumbnail from './ProductThumbnail'
import CustomProductCreator from './CustomProductCreator'
import { parseProductExcel, matchImagesToProducts, fileToBase64, downloadProductTemplate } from '../utils/excelParser'

export default function ProductGalleryModal({ 
  products, 
  onAddProduct, 
  onUpdateProduct, 
  onRemoveProduct, 
  onBatchImport,
  stagedProductIds = [],
  onToggleStaging,
  onOpenEditor,
  onClose 
}) {
  const [activeTab, setActiveTab] = useState('browse') // 'browse' | 'import' | 'design'
  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // --- Import Context ---
  const [pendingProducts, setPendingProducts] = useState([])
  const [isParsing, setIsParsing] = useState(false)
  const [importStatus, setImportStatus] = useState('idle')
  const excelRef = useRef()
  const imageRef = useRef()
  const jsonRef = useRef()
  const manualRef = useRef()
  const [manualTargetIndex, setManualTargetIndex] = useState(null)
  const [collapsedFolders, setCollapsedFolders] = useState(new Set())
  const [emptyCategories, setEmptyCategories] = useState([])

  // --- Organization Logic ---
  const folders = useMemo(() => {
    const set = new Set(products.map(p => p.folder || ((p.isCustom || p.textureUrl) ? 'Custom Product' : 'Standard Assets')))
    emptyCategories.forEach(cat => set.add(cat))
    return Array.from(set).sort()
  }, [products, emptyCategories])

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || '2D'))
    // Ensure system categories are always present or at least handled
    const list = Array.from(cats).filter(c => c !== 'All')
    return ['All', ...list]
  }, [products])

  const handleRemoveCategoryTag = async (e, cat) => {
    e.stopPropagation()
    if (!window.confirm(`Are you sure you want to remove the category "${cat}" and all products in it?`)) return
    
    const toRemove = products.filter(p => (p.category || '2D') === cat)
    for (const p of toRemove) {
      await onRemoveProduct(p.id)
    }
    
    // If we were filtering by this category, reset to All
    if (categoryFilter === cat) setCategoryFilter('All')
    
    // Also clear from empty categories if it was there
    setEmptyCategories(prev => prev.filter(c => c !== cat))
  }

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      const folder = p.folder || ((p.isCustom || p.textureUrl) ? 'Custom Product' : 'Standard Assets')
      const matchSearch = !q || p.name.toLowerCase().includes(q) || folder.toLowerCase().includes(q)
      const matchCat    = categoryFilter === 'All' || (p.category || '2D') === categoryFilter
      return matchSearch && matchCat
    })
  }, [products, search, categoryFilter])

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    setEmptyCategories(prev => [...new Set([...prev, newFolderName.trim()])])
    setIsCreatingFolder(false)
    setNewFolderName('')
  }

  const handleRemoveCategory = (catName) => {
    setEmptyCategories(prev => prev.filter(c => c !== catName))
  }

  // --- Drag & Drop Organization ---
  const [draggedProductId, setDraggedProductId] = useState(null)
  const [dragOverFolder, setDragOverFolder] = useState(null)

  const handleDragStart = (e, productId) => {
    setDraggedProductId(productId)
    e.dataTransfer.setData('productId', productId)
  }

  const handleDropOnFolder = async (folderName) => {
    if (!draggedProductId) return
    await onUpdateProduct(draggedProductId, { folder: folderName })
    setDraggedProductId(null)
    setDragOverFolder(null)
  }

  // --- Import Handlers ---
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

  const handleManualImage = (e) => {
    const file = e.target.files?.[0]
    if (!file || manualTargetIndex === null) return
    const updated = [...pendingProducts]
    const prod = { ...updated[manualTargetIndex] }
    if (prod.textureUrl) URL.revokeObjectURL(prod.textureUrl)
    prod.textureUrl = URL.createObjectURL(file)
    prod.rawFile = file 
    prod.isReady = true
    updated[manualTargetIndex] = prod
    setPendingProducts(updated)
    setManualTargetIndex(null)
    if (manualRef.current) manualRef.current.value = ''
  }

  const handleFinalizeImport = async () => {
    setImportStatus('working')
    try {
      const finalProducts = await Promise.all(pendingProducts.map(async (p) => {
        if (p.rawFile) {
          p.textureBase64 = await fileToBase64(p.rawFile)
          p.textureUrl = p.textureBase64 
        }
        delete p.rawFile
        delete p.isReady
        return p
      }))
      await onBatchImport(finalProducts)
      setImportStatus('idle')
      setActiveTab('browse')
    } catch (err) {
      setImportStatus('staged')
    }
  }

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
    } finally {
      if (jsonRef.current) jsonRef.current.value = ''
    }
  }

  const renderImportStep = () => (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden">
      <div className="flex items-center justify-between px-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Spreadsheet Batch Import</h4>
        <button onClick={downloadProductTemplate} className="text-[10px] font-black uppercase tracking-widest text-accent hover:underline flex items-center gap-1.5"><Download size={12}/> Download Excel Template</button>
      </div>
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
          </div>
          <button onClick={() => excelRef.current?.click()} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
            {isParsing ? 'Parsing...' : (pendingProducts.length ? 'Replace File' : 'Select Excel')}
          </button>
          <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
        </div>
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
          <button onClick={() => imageRef.current?.click()} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
            Select Multiple Images
          </button>
          <input ref={imageRef} type="file" accept=".png,.jpg,.jpeg" multiple className="hidden" onChange={handleImageUpload} />
          <input ref={manualRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={handleManualImage} />
        </div>
      </div>

      {pendingProducts.length > 0 && (
        <div className="flex-1 flex flex-col bg-black/20 rounded-2xl p-6 border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-dim">Import Staging: {pendingProducts.filter(p => p.isReady).length} / {pendingProducts.length} Matched</h4>
          </div>
          <div className="flex-1 overflow-y-auto grid grid-cols-5 gap-3 pr-2 custom-scrollbar content-start">
            {pendingProducts.map((p, i) => (
              <div 
                key={i} 
                onClick={() => { setManualTargetIndex(i); manualRef.current?.click() }}
                className={`p-2 rounded-xl border flex flex-col gap-2 relative transition-all cursor-pointer group ${p.isReady ? 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/50' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}
              >
                <div className="aspect-square rounded-lg bg-black/40 overflow-hidden flex items-center justify-center border border-white/5">
                  {p.textureUrl ? <img src={p.textureUrl} className="w-full h-full object-contain" alt="" /> : <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />}
                  <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[1px]">
                    <Upload size={16} className="text-white" />
                  </div>
                </div>
                <span className="text-[9px] font-bold text-text-main truncate text-center">{p.name}</span>
              </div>
            ))}
          </div>
          <div className="pt-6 mt-4 border-t border-white/5 flex gap-4">
            <button onClick={() => { setPendingProducts([]); setImportStatus('idle') }} className="px-6 py-3 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/20 hover:text-red-400 transition-all">Cancel</button>
            <button onClick={handleFinalizeImport} disabled={importStatus === 'working' || !pendingProducts.length} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-accent to-blue-600 shadow-lg text-[11px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30">
              {importStatus === 'working' ? 'CONVERTING BINARY DATABASE...' : `IMPORT ${pendingProducts.length} PRODUCTS`}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const renderBrowseGrid = () => {
    const grouped = {}
    folders.forEach(f => grouped[f] = [])
    if (newFolderName) grouped[newFolderName] = []

    filteredProducts.forEach(p => {
      const folder = p.folder || ((p.isCustom || p.textureUrl) ? 'Custom Product' : 'Standard Assets')
      if (!grouped[folder]) grouped[folder] = []
      grouped[folder].push(p)
    })

    return (
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="flex items-center gap-4 py-1">
          <div className="flex-1 relative group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-accent transition-colors" />
            <input type="text" placeholder="Search library..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/5 border border-white/5 focus:border-accent/40 rounded-xl py-3 pl-12 pr-4 text-xs text-text-main font-bold focus:outline-none transition-all" />
          </div>
          
          <button 
            onClick={() => setIsCreatingFolder(true)}
            className="px-4 py-3 rounded-xl bg-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20"
          >
            <FolderPlus size={16} />
            New Product Category
          </button>

          <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5">
            {categories.map(cat => {
              const isSystem = ['All', '2D', '3D'].includes(cat)
              return (
                <button 
                  key={cat} 
                  onClick={() => setCategoryFilter(cat)} 
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 group/cat ${categoryFilter === cat ? 'bg-accent text-white' : 'text-text-dim hover:text-text-main'}`}
                >
                  {cat}
                  {!isSystem && (
                    <X 
                      size={12} 
                      onClick={(e) => handleRemoveCategoryTag(e, cat)}
                      className="opacity-0 group-hover/cat:opacity-100 hover:text-red-400 transition-all ml-1" 
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {isCreatingFolder && (
          <div className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/20 rounded-2xl animate-in slide-in-from-top-4 duration-300">
             <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center"><FolderPlus size={20}/></div>
             <input autoFocus type="text" placeholder="Category Name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} className="flex-1 bg-transparent border-none text-sm font-bold text-text-main focus:outline-none" />
             <div className="flex gap-2">
               <button onClick={() => setIsCreatingFolder(false)} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all">Cancel</button>
               <button onClick={handleCreateFolder} className="px-5 py-2 rounded-lg bg-accent text-white text-[10px] font-black uppercase tracking-widest transition-all">Create</button>
             </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
          <div className="flex flex-col gap-8 pb-10">
            {Object.entries(grouped).sort(([a], [b]) => a === 'Custom Product' ? -1 : b === 'Custom Product' ? 1 : a.localeCompare(b)).filter(([, items]) => !search || items.length > 0).map(([folderName, items]) => (
              <div key={folderName} className="flex flex-col gap-4 group/folder" onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folderName) }} onDragLeave={() => setDragOverFolder(null)} onDrop={() => handleDropOnFolder(folderName)}>
                <div className={`flex items-center gap-3 p-2 -mx-2 rounded-xl transition-all ${dragOverFolder === folderName ? 'bg-accent/20 scale-[1.01] border-2 border-dashed border-accent' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${dragOverFolder === folderName ? 'bg-accent text-white' : 'bg-accent/10 text-accent'}`}><Folder size={14} /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main flex-1">{folderName} ({items.length})</span>
                  {emptyCategories.includes(folderName) && items.length === 0 && (
                    <button 
                      onClick={() => handleRemoveCategory(folderName)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-text-dim hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover/folder:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {items.map(product => {
                    const isStaged = stagedProductIds.includes(product.id)
                    return (
                      <div 
                        key={product.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, product.id)}
                        onClick={() => onOpenEditor(product)} 
                        className={`group flex flex-col gap-2 p-3 border rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${isStaged ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-accent/40'} ${draggedProductId === product.id ? 'opacity-30' : ''}`}
                      >
                        <div className="aspect-square bg-black/40 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center">
                          <ProductThumbnail product={product} />
                          


                          <div 
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleStaging(product.id)
                            }}
                            className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all z-10 ${isStaged ? 'bg-emerald-500 text-white opacity-100 hover:bg-red-500 hover:scale-110 shadow-lg flex shadow-emerald-500/20' : 'bg-black/40 text-white/40 opacity-0 group-hover:opacity-100'}`}
                          >
                            <CheckCircle2 size={16} />
                          </div>
                          {product.isCustom && (
                            <div className="absolute top-10 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                              <button onClick={(e) => { e.stopPropagation(); onOpenEditor(product) }} className="w-7 h-7 rounded-lg bg-secondary text-white flex items-center justify-center hover:bg-secondary/80"><Edit3 size={14} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onRemoveProduct(product.id) }} className="w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500"><Trash2 size={14} /></button>
                            </div>
                          )}
                          {!isStaged && <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[2px]"><Plus size={24} className="text-white" /></div>}
                        </div>
                        <div className="px-1 text-left">
                          <span className="text-xs font-black text-text-main truncate block mb-0.5">{product.name}</span>
                          <span className="text-[9px] font-bold text-text-dim/60 uppercase tracking-widest block">{Math.round(product.dimensions[1] * 10)/10}" Tall</span>
                        </div>
                      </div>
                    )
                  })}
                  {items.length === 0 && (
                    <div className="col-span-4 py-8 text-center border-2 border-dashed border-white/5 rounded-2xl opacity-20"><span className="text-[10px] font-black uppercase tracking-widest">Drag products here to organize</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[85vh] bg-glass-bg border border-glass-border rounded-[2.5rem] shadow-3xl p-10 flex flex-col gap-8 overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col"><h2 className="text-3xl font-black tracking-tighter text-text-main uppercase">Product Gallery</h2></div>
          <div className="flex items-center p-1.5 bg-black/40 rounded-2xl border border-white/5">
            <button onClick={() => setActiveTab('browse')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'browse' ? 'bg-white text-black' : 'text-text-dim hover:text-text-main'}`}>Browse</button>
            <button onClick={() => setActiveTab('import')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'import' ? 'bg-secondary text-white' : 'text-text-dim hover:text-text-main'}`}>Batch Import</button>
            <button onClick={() => setActiveTab('design')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'design' ? 'bg-accent text-white' : 'text-text-dim hover:text-text-main'}`}>Create Product</button>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-text-dim hover:text-text-main transition-all active:scale-95"><X size={20} /></button>
        </div>



        {activeTab === 'browse' && renderBrowseGrid()}
        {activeTab === 'import' && renderImportStep()}
        {activeTab === 'design' && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-full max-w-lg p-12 bg-white/5 rounded-[2.5rem] border border-white/5 text-center">
              <div className="w-16 h-16 rounded-3xl bg-accent text-white flex items-center justify-center shadow-xl mx-auto mb-6"><Palette size={32} /></div>
              <h3 className="text-2xl font-black text-text-main mb-6 uppercase tracking-tight">Product Studio</h3>
              <CustomProductCreator onAdd={(p) => { onAddProduct(p); setActiveTab('browse') }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
