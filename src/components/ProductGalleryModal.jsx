import { useState, useMemo, useRef } from 'react'
import { 
  X, Search, Plus, FileSpreadsheet, Upload, 
  CheckCircle2, AlertCircle, Trash2, Edit3,
  Download, FileJson, Folder, Palette, FolderPlus, Box,
  CloudDownload, Globe, Database
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
  const [activeTab, setActiveTab] = useState('browse') // 'browse' | 'brandstore' | 'import'
  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // --- Import Context ---
  const [pendingProducts, setPendingProducts] = useState([])
  const [isParsing, setIsParsing] = useState(false)
  const [importStatus, setImportStatus] = useState('idle') // idle, staged, working
  const [selectedMockIds, setSelectedMockIds] = useState(new Set())
  const [hoveredMockId, setHoveredMockId] = useState(null)

  const mockBrandstoreResults = [
    { id: 'm1', upc: '037000123456', brand: 'Tide', name: 'Pods Original 31ct', dims: '8.5" x 4.2" x 10.1"', weight: '1.2 lbs', img: 'https://i5.walmartimages.com/seo/Tide-PODS-Laundry-Detergent-Packs-Original-Scent-31-Count_a8d468c6-93c5-49e9-bfa4-562242bd905e.8ad8f057b333d90cd710d2c271158246.jpeg?odnHeight=600&odnWidth=600&odnBg=FFFFFF' },
    { id: 'm2', upc: '037000987654', brand: 'Pampers', name: 'Swaddlers Size 4', dims: '12.0" x 8.0" x 14.5"', weight: '4.5 lbs', img: 'https://i5.walmartimages.com/seo/Pampers-Swaddlers-Baby-Diapers-Size-4-116-Count-Select-for-More-Options_b826150a-7b59-4eda-95f6-137b7110f174.959cf8bfeb43d6c3c4fbe630715fc3fd.jpeg?odnHeight=600&odnWidth=600&odnBg=FFFFFF' },
    { id: 'm3', upc: '047000555666', brand: 'Crest', name: '3D White Arctic', dims: '7.5" x 1.5" x 1.5"', weight: '0.4 lbs', img: 'https://i5.walmartimages.com/seo/3D-White-Advanced-Teeth-Whitening-Toothpaste-with-Fluoride-Arctic-Fresh-3-3-oz_c0162079-219b-44ff-a4a5-072b07eb994c.e6563588ba4773ff94f2f924b0f474ba.jpeg?odnHeight=600&odnWidth=600&odnBg=FFFFFF' }
  ]

  const toggleMockSelection = (id) => {
    setSelectedMockIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const renderBrandstoreTab = () => (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xl font-black text-text-main uppercase tracking-tight">P&G Brandstore</h3>
        <div className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[8px] font-black uppercase tracking-widest flex items-center gap-2">
          <Globe size={10} /> Live Enterprise Connection
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-6">
        <div className="p-6 rounded-3xl border border-white/10 bg-white/5 flex flex-col gap-6">
           <div className="flex flex-col gap-1 px-1">
             <p className="text-sm font-medium text-text-dim/80 leading-relaxed italic">
               Search for single product or upload a list of product to import.
             </p>
           </div>
           
           <div className="relative group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim/60 group-hover/search:text-accent transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="Search by UPC..." 
                className="w-full pl-11 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-sm font-bold text-text-main focus:outline-none focus:border-accent/50 transition-all placeholder:text-text-dim/40 shadow-inner"
              />
           </div>

           <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-4 p-6 rounded-3xl border-2 border-dashed border-white/10 bg-white/5 hover:border-accent/40 transition-all cursor-pointer group/dropzone">
                 <div className="flex items-center gap-3">
                   <div className="w-12 h-12 rounded-2xl bg-accent/20 text-accent flex items-center justify-center group-hover/dropzone:scale-110 transition-transform">
                     <FileSpreadsheet size={24} />
                   </div>
                   <div>
                      <h3 className="text-sm font-bold text-text-main uppercase tracking-tight">Batch UPC Import</h3>
                      <p className="text-[10px] text-text-dim uppercase tracking-wider font-black">XLSX Product List</p>
                   </div>
                 </div>
                 <button className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest text-text-main hover:bg-white/10 transition-all">
                   Select Excel File
                 </button>
              </div>
           </div>

           {/* Brandstore Results Window */}
           <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Search Results</h4>
                <span className="text-[9px] font-bold text-accent px-2 py-0.5 rounded-full bg-accent/10">3 Products Found</span>
              </div>
              <div className="bg-white/85 rounded-3xl border border-white/40 overflow-hidden shadow-2xl backdrop-blur-md">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-100 border-b border-black/5 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      <th className="px-5 py-4 w-12 text-center">Sel</th>
                      <th className="px-4 py-4">UPC</th>
                      <th className="px-4 py-4">Brand</th>
                      <th className="px-4 py-4">Product Name</th>
                      <th className="px-4 py-4">Dimensions</th>
                      <th className="px-4 py-4">Weight</th>
                    </tr>
                  </thead>
                  <tbody className="relative">
                    {mockBrandstoreResults.map((row) => {
                      const isSelected = selectedMockIds.has(row.id)
                      const isHovered = hoveredMockId === row.id
                      return (
                        <tr 
                          key={row.id} 
                          onClick={() => toggleMockSelection(row.id)}
                          onMouseEnter={() => setHoveredMockId(row.id)}
                          onMouseLeave={() => setHoveredMockId(null)}
                          className={`border-b border-black/5 text-[11px] transition-all cursor-pointer group/row relative ${isSelected ? 'bg-accent/10' : 'text-zinc-800 hover:bg-black/5'}`}
                        >
                          <td className="px-5 py-3 relative">
                            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center mx-auto transition-all ${isSelected ? 'border-accent bg-accent' : 'border-black/10 group-hover/row:border-accent group-hover/row:bg-accent/10'}`}>
                              <div className={`w-2.5 h-2.5 rounded-sm bg-white transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                            </div>

                            {/* Floating Preview Image */}
                            {isHovered && (
                              <div className="absolute left-full ml-4 -top-16 z-[100] pointer-events-none transition-all animate-in fade-in zoom-in duration-200">
                                 <div className="p-2 bg-white rounded-2xl shadow-3xl border border-black/10 scale-125 overflow-hidden ring-4 ring-black/5">
                                   <img src={row.img} className="w-32 h-32 object-contain" alt="" />
                                   <div className="mt-2 text-center text-[9px] font-black uppercase text-zinc-400 tracking-widest">{row.brand} Verification</div>
                                 </div>
                              </div>
                            )}
                          </td>
                          <td className={`px-4 py-3 font-mono font-bold ${isSelected ? 'text-accent' : 'text-zinc-500'}`}>{row.upc}</td>
                          <td className="px-4 py-3 font-bold text-zinc-900">{row.brand}</td>
                          <td className="px-4 py-3 font-bold text-zinc-900">{row.name}</td>
                          <td className="px-4 py-3 italic text-zinc-500">{row.dims}</td>
                          <td className="px-4 py-3 font-bold text-zinc-700">{row.weight}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
           </div>

           <button className={`w-full py-4 rounded-2xl shadow-lg text-[11px] font-black uppercase tracking-widest text-white transition-all shadow-accent/20 ${selectedMockIds.size > 0 ? 'bg-gradient-to-br from-accent to-blue-600 hover:scale-[1.01] active:scale-[0.99] hover:shadow-xl hover:shadow-accent/40' : 'bg-zinc-400 cursor-not-allowed opacity-50'}`}>
             {selectedMockIds.size > 0 ? `Import ${selectedMockIds.size} Selected Items` : 'Select Products to Import'}
           </button>
        </div>
      </div>
    </div>
  )

  const renderImportTab = () => (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-8">
        
        {/* Section 1: Spreadsheet Batch */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between px-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Spreadsheet Batch Import</h4>
            <button onClick={downloadProductTemplate} className="text-[10px] font-black uppercase tracking-widest text-accent hover:underline flex items-center gap-1.5"><Download size={12}/> Download Excel Template</button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className={`flex flex-col gap-4 p-6 rounded-3xl border-2 border-dashed transition-all ${pendingProducts.length ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${pendingProducts.length ? 'bg-emerald-500/20 text-emerald-400' : 'bg-accent/20 text-accent'}`}>
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-main uppercase tracking-tight">1. Load Spreadsheet</h3>
                  <p className="text-[10px] text-text-dim uppercase tracking-wider font-black">EXCEL DATA</p>
                </div>
              </div>
              <button onClick={() => excelRef.current?.click()} className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                {isParsing ? 'Parsing...' : (pendingProducts.length ? 'Replace File' : 'Select Excel')}
              </button>
              <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
            </div>
            <div className={`flex flex-col gap-4 p-6 rounded-3xl border-2 border-dashed transition-all ${!pendingProducts.length ? 'opacity-30 pointer-events-none grayscale' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-secondary/20 text-secondary flex items-center justify-center">
                  <Upload size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-main uppercase tracking-tight">2. Match Images</h3>
                  <p className="text-[10px] text-text-dim uppercase tracking-wider font-black">DROP ASSETS</p>
                </div>
              </div>
              <button onClick={() => imageRef.current?.click()} className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                Select Multiple Images
              </button>
              <input ref={imageRef} type="file" accept=".png,.jpg,.jpeg" multiple className="hidden" onChange={handleImageUpload} />
              <input ref={manualRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={handleManualImage} />
            </div>
          </div>

          {pendingProducts.length > 0 && (
            <div className="flex flex-col bg-black/20 rounded-3xl p-6 border border-white/5 overflow-hidden">
              <div className="flex items-center justify-between mb-4 px-1">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Staging Area: {pendingProducts.filter(p => p.isReady).length} / {pendingProducts.length} Ready</h4>
              </div>
              <div className="max-h-[300px] overflow-y-auto grid grid-cols-4 gap-4 pr-2 custom-scrollbar content-start">
                {pendingProducts.map((p, i) => (
                  <div 
                    key={i} 
                    onClick={() => { setManualTargetIndex(i); manualRef.current?.click() }}
                    className={`p-3 rounded-2xl border flex flex-col gap-2 relative transition-all cursor-pointer group ${p.isReady ? 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/50' : 'border-white/5 bg-white/5 hover:border-accent/40 shadow-lg'}`}
                  >
                    <div className="aspect-square rounded-xl bg-black/40 overflow-hidden flex items-center justify-center border border-white/5">
                      {p.textureUrl ? <img src={p.textureUrl} className="w-full h-full object-contain" alt="" /> : <div className="w-6 h-6 rounded-full" style={{ backgroundColor: p.color }} />}
                      <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[1px]">
                        <Upload size={20} className="text-white" />
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-text-main truncate text-center">{p.name}</span>
                  </div>
                ))}
              </div>
              <div className="pt-6 mt-6 border-t border-white/5 flex gap-4">
                <button onClick={() => { setPendingProducts([]); setImportStatus('idle') }} className="px-8 py-3 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/20 hover:text-red-400 transition-all">Cancel</button>
                <button onClick={handleFinalizeImport} disabled={importStatus === 'working' || !pendingProducts.length} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-accent to-blue-600 shadow-lg text-[11px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30">
                  {importStatus === 'working' ? 'CONVERTING BINARY DATABASE...' : `EXECUTE BATCH IMPORT`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Product Studio (Manual) */}
        <div className="flex flex-col gap-6">
          <div className="px-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Manual Product Creation</h4>
          </div>
          <div className="p-8 bg-white/5 rounded-3xl border border-white/5 text-center">
            <div className="w-16 h-16 rounded-3xl bg-accent text-white flex items-center justify-center shadow-2xl mx-auto mb-6 shadow-accent/20"><Palette size={32} /></div>
            <h3 className="text-xl font-black text-text-main mb-6 uppercase tracking-tight">Product Studio</h3>
            <CustomProductCreator onAdd={(p) => { onAddProduct(p); setActiveTab('browse') }} />
          </div>
        </div>
      </div>
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
            {Object.entries(grouped)
              .sort(([a], [b]) => a === 'Custom Product' ? -1 : b === 'Custom Product' ? 1 : a.localeCompare(b))
              .filter(([, items]) => {
                const isFiltered = search.trim() !== '' || categoryFilter !== 'All'
                return !isFiltered || items.length > 0
              })
              .map(([folderName, items]) => (
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
                          <ProductThumbnail product={product} onUpdate={onUpdateProduct} />
                          


                          <div 
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleStaging(product.id)
                            }}
                            className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all z-10 ${isStaged ? 'bg-emerald-500 text-white opacity-100 hover:bg-red-500 hover:scale-110 shadow-lg flex shadow-emerald-500/20' : 'bg-black/40 text-white/40 opacity-0 group-hover:opacity-100'}`}
                          >
                            <CheckCircle2 size={16} />
                          </div>
                          <div className="absolute top-10 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                            <button onClick={(e) => { e.stopPropagation(); onOpenEditor(product) }} className="w-7 h-7 rounded-lg bg-secondary text-white flex items-center justify-center hover:bg-secondary/80" title="Edit Properties"><Edit3 size={14} /></button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onRemoveProduct(product.id) }} 
                              className="w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500"
                              title="Delete Product"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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
            <button onClick={() => setActiveTab('browse')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'browse' ? 'bg-white text-black shadow-lg' : 'text-text-dim hover:text-text-main'}`}>Browse</button>
            <button onClick={() => setActiveTab('brandstore')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'brandstore' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-text-dim hover:text-text-main'}`}>Brandstore</button>
            <button onClick={() => setActiveTab('import')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'import' ? 'bg-secondary text-white shadow-lg shadow-secondary/20' : 'text-text-dim hover:text-text-main'}`}>Import</button>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-text-dim hover:text-text-main transition-all active:scale-95"><X size={20} /></button>
        </div>

        {activeTab === 'browse' && renderBrowseGrid()}
        {activeTab === 'brandstore' && renderBrandstoreTab()}
        {activeTab === 'import' && renderImportTab()}
      </div>
    </div>
  )
}
