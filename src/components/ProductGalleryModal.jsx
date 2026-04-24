import { useState, useMemo, useRef } from 'react'
import { 
  X, Search, Plus, FileSpreadsheet, Upload, 
  CheckCircle2, Trash2, Edit3,
  Download, Folder, Palette, FolderPlus,
  Globe
} from 'lucide-react'
import ProductThumbnail from './ProductThumbnail'
import CustomProductCreator from './CustomProductCreator'
import { parseProductExcel, matchImagesToProducts, fileToBase64, downloadProductTemplate } from '../utils/excelParser'
import { useConfigurator } from '../context/ConfiguratorContext'

export default function ProductGalleryModal({ onClose }) {
  const {
    products,
    addProduct: onAddProduct,
    updateProduct: onUpdateProduct,
    removeProduct: onRemoveProduct,
    addProductsBatch: onBatchImport,
    stagedProductIds,
    handleToggleStagedProduct: onToggleStaging,
    handleOpenEditor: onOpenEditor
  } = useConfigurator()

  const [activeTab, setActiveTab] = useState('browse')
  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const [pendingProducts, setPendingProducts] = useState([])
  const [isParsing, setIsParsing] = useState(false)
  const [importStatus, setImportStatus] = useState('idle')
  const [selectedMockIds, setSelectedMockIds] = useState(new Set())
  const [hoveredMockId, setHoveredMockId] = useState(null)

  const mockBrandstoreResults = [
    { id: 'm1', upc: '037000123456', brand: 'Tide', name: 'Pods Original 31ct', dims: '8.5" x 4.2" x 10.1"', weight: '1.2 lbs', img: 'https://i5.walmartimages.com/seo/Tide-PODS-Laundry-Detergent-Packs-Original-Scent-31-Count_a8d468c6-93c5-49e9-bfa4-562242bd905e.8ad8f057b333d90cd710d2c271158246.jpeg?odnHeight=600&odnWidth=600&odnBg=FFFFFF' },
    { id: 'm2', upc: '037000987654', brand: 'Pampers', name: 'Swaddlers Size 4', dims: '12.0" x 8.0" x 14.5"', weight: '4.5 lbs', img: 'https://i5.walmartimages.com/seo/Pampers-Swaddlers-Baby-Diapers-Size-4-116-Count-Select-for-More-Options_b826150a-7b59-4eda-95f6-137b7110f174.959cf8bfeb43d6c3c4fbe630715fc3fd.jpeg?odnHeight=600&odnWidth=600&odnBg=FFFFFF' },
    { id: 'm3', upc: '047000555666', brand: 'Crest', name: '3D White Arctic', dims: '7.5" x 1.5" x 1.5"', weight: '0.4 lbs', img: 'https://i5.walmartimages.com/seo/3D-White-Advanced-Teeth-Whitening-Toothpaste-with-Fluoride-Arctic-Fresh-3-3-oz_c0162079-219b-44ff-a4a5-072b07eb994c.e6563588ba4773ff94f2f924b0f474ba.jpeg?odnHeight=600&odnWidth=600&odnBg=FFFFFF' }
  ]

  const excelRef = useRef()
  const imageRef = useRef()
  const manualRef = useRef()
  const [manualTargetIndex, setManualTargetIndex] = useState(null)
  const [emptyCategories, setEmptyCategories] = useState([])

  const folders = useMemo(() => {
    const set = new Set(products.map(p => p.folder || ((p.isCustom || p.textureUrl) ? 'Custom Product' : 'Standard Assets')))
    emptyCategories.forEach(cat => set.add(cat))
    return Array.from(set).sort()
  }, [products, emptyCategories])

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || '2D'))
    return ['All', ...Array.from(cats).filter(c => c !== 'All')]
  }, [products])

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

  const [draggedProductId, setDraggedProductId] = useState(null)
  const [dragOverFolder, setDragOverFolder] = useState(null)

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
    } catch (err) { setImportStatus('staged') }
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
           <p className="text-sm font-medium text-text-dim/80 leading-relaxed italic px-1">Search for single product or upload a list of product to import.</p>
           <div className="relative group/search">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim/60 group-hover/search:text-accent transition-colors" size={16} />
              <input type="text" placeholder="Search by UPC..." className="w-full pl-11 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-sm font-bold text-text-main focus:outline-none focus:border-accent/50 transition-all placeholder:text-text-dim/40 shadow-inner" />
           </div>
           <div className="bg-white/85 rounded-3xl border border-white/40 overflow-hidden shadow-2xl backdrop-blur-md">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="bg-zinc-100 border-b border-black/5 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                   <th className="px-5 py-4 w-12 text-center">Sel</th><th className="px-4 py-4">UPC</th><th className="px-4 py-4">Brand</th><th className="px-4 py-4">Product Name</th><th className="px-4 py-4">Dimensions</th><th className="px-4 py-4">Weight</th>
                 </tr>
               </thead>
               <tbody>
                 {mockBrandstoreResults.map((row) => (
                   <tr key={row.id} onClick={() => setSelectedMockIds(p => { const n = new Set(p); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n })} onMouseEnter={() => setHoveredMockId(row.id)} onMouseLeave={() => setHoveredMockId(null)} className={`border-b border-black/5 text-[11px] transition-all cursor-pointer group/row relative ${selectedMockIds.has(row.id) ? 'bg-accent/10' : 'text-zinc-800 hover:bg-black/5'}`}>
                     <td className="px-5 py-3 relative">
                       <div className={`w-5 h-5 rounded-lg border flex items-center justify-center mx-auto transition-all ${selectedMockIds.has(row.id) ? 'border-accent bg-accent' : 'border-black/10 group-hover/row:border-accent group-hover/row:bg-accent/10'}`}><div className={`w-2.5 h-2.5 rounded-sm bg-white transition-opacity ${selectedMockIds.has(row.id) ? 'opacity-100' : 'opacity-0'}`} /></div>
                       {hoveredMockId === row.id && <div className="absolute left-full ml-4 -top-16 z-[100] pointer-events-none transition-all animate-in fade-in zoom-in duration-200"><div className="p-2 bg-white rounded-2xl shadow-3xl border border-black/10 scale-125 overflow-hidden ring-4 ring-black/5"><img src={row.img} className="w-32 h-32 object-contain" alt="" /><div className="mt-2 text-center text-[9px] font-black uppercase text-zinc-400 tracking-widest">{row.brand} Verification</div></div></div>}
                     </td>
                     <td className={`px-4 py-3 font-mono font-bold ${selectedMockIds.has(row.id) ? 'text-accent' : 'text-zinc-500'}`}>{row.upc}</td><td className="px-4 py-3 font-bold text-zinc-900">{row.brand}</td><td className="px-4 py-3 font-bold text-zinc-900">{row.name}</td><td className="px-4 py-3 italic text-zinc-500">{row.dims}</td><td className="px-4 py-3 font-bold text-zinc-700">{row.weight}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
           <button className={`w-full py-4 rounded-2xl shadow-lg text-[11px] font-black uppercase tracking-widest text-white transition-all ${selectedMockIds.size > 0 ? 'bg-gradient-to-br from-accent to-blue-600 hover:scale-[1.01]' : 'bg-zinc-400 cursor-not-allowed opacity-50'}`}>{selectedMockIds.size > 0 ? `Import ${selectedMockIds.size} Selected Items` : 'Select Products to Import'}</button>
        </div>
      </div>
    </div>
  )

  const renderImportTab = () => (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between px-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim">Spreadsheet Batch Import</h4>
            <button onClick={downloadProductTemplate} className="text-[10px] font-black uppercase tracking-widest text-accent hover:underline flex items-center gap-1.5"><Download size={12}/> Download Excel Template</button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className={`flex flex-col gap-4 p-6 rounded-3xl border-2 border-dashed transition-all ${pendingProducts.length ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
              <div className="flex items-center gap-3"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${pendingProducts.length ? 'bg-emerald-500/20 text-emerald-400' : 'bg-accent/20 text-accent'}`}><FileSpreadsheet size={24} /></div><div><h3 className="text-sm font-bold text-text-main uppercase tracking-tight">1. Load Spreadsheet</h3><p className="text-[10px] text-text-dim uppercase tracking-wider font-black">EXCEL DATA</p></div></div>
              <button onClick={() => excelRef.current?.click()} className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">{isParsing ? 'Parsing...' : (pendingProducts.length ? 'Replace File' : 'Select Excel')}</button>
              <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setIsParsing(true); try { setPendingProducts(await parseProductExcel(f)); setImportStatus('staged') } catch(err) { alert(err.message) } finally { setIsParsing(false) } } }} />
            </div>
            <div className={`flex flex-col gap-4 p-6 rounded-3xl border-2 border-dashed transition-all ${!pendingProducts.length ? 'opacity-30 pointer-events-none' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
              <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-secondary/20 text-secondary flex items-center justify-center"><Upload size={24} /></div><div><h3 className="text-sm font-bold text-text-main uppercase tracking-tight">2. Match Images</h3><p className="text-[10px] text-text-dim uppercase tracking-wider font-black">DROP ASSETS</p></div></div>
              <button onClick={() => imageRef.current?.click()} className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Select Multiple Images</button>
              <input ref={imageRef} type="file" accept=".png,.jpg,.jpeg" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) setPendingProducts(matchImagesToProducts(pendingProducts, files).updated) }} />
              <input ref={manualRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file && manualTargetIndex !== null) { const updated = [...pendingProducts]; const prod = { ...updated[manualTargetIndex] }; if (prod.textureUrl) URL.revokeObjectURL(prod.textureUrl); prod.textureUrl = URL.createObjectURL(file); prod.rawFile = file; prod.isReady = true; updated[manualTargetIndex] = prod; setPendingProducts(updated); setManualTargetIndex(null) } }} />
            </div>
          </div>
          {pendingProducts.length > 0 && (
            <div className="flex flex-col bg-black/20 rounded-3xl p-6 border border-white/5 overflow-hidden mt-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim mb-4">Staging Area: {pendingProducts.filter(p => p.isReady).length} / {pendingProducts.length} Ready</h4>
              <div className="max-h-[300px] overflow-y-auto grid grid-cols-4 gap-4 pr-2 custom-scrollbar">
                {pendingProducts.map((p, i) => (
                  <div key={i} onClick={() => { setManualTargetIndex(i); manualRef.current?.click() }} className={`p-3 rounded-2xl border flex flex-col gap-2 relative transition-all cursor-pointer group ${p.isReady ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5 hover:border-accent/40'}`}>
                    <div className="aspect-square rounded-xl bg-black/40 overflow-hidden flex items-center justify-center border border-white/5">{p.textureUrl ? <img src={p.textureUrl} className="w-full h-full object-contain" alt="" /> : <div className="w-6 h-6 rounded-full" style={{ backgroundColor: p.color }} />}<div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"><Upload size={20} className="text-white" /></div></div>
                    <span className="text-[10px] font-bold text-text-main truncate text-center">{p.name}</span>
                  </div>
                ))}
              </div>
              <div className="pt-6 mt-6 border-t border-white/5 flex gap-4"><button onClick={() => { setPendingProducts([]); setImportStatus('idle') }} className="px-8 py-3 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all">Cancel</button><button onClick={handleFinalizeImport} disabled={importStatus === 'working' || !pendingProducts.length} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-accent to-blue-600 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-30">{importStatus === 'working' ? 'CONVERTING...' : 'EXECUTE BATCH IMPORT'}</button></div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-text-dim px-2">Manual Product Creation</h4>
          <div className="p-8 bg-white/5 rounded-3xl border border-white/5 text-center"><div className="w-16 h-16 rounded-3xl bg-accent text-white flex items-center justify-center mx-auto mb-6"><Palette size={32} /></div><h3 className="text-xl font-black text-text-main mb-6 uppercase tracking-tight">Product Studio</h3><CustomProductCreator onAdd={(p) => { onAddProduct(p); setActiveTab('browse') }} /></div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[85vh] bg-glass-bg border border-glass-border rounded-[2.5rem] shadow-3xl p-10 flex flex-col gap-8 overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="text-3xl font-black tracking-tighter text-text-main uppercase">Product Gallery</h2>
          <div className="flex items-center p-1.5 bg-black/40 rounded-2xl border border-white/5">
            {['browse', 'brandstore', 'import'].map(t => <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === t ? (t === 'brandstore' ? 'bg-orange-500 text-white' : t === 'import' ? 'bg-secondary text-white' : 'bg-white text-black') : 'text-text-dim hover:text-text-main'}`}>{t}</button>)}
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-text-dim hover:text-text-main transition-all active:scale-95"><X size={20} /></button>
        </div>
        {activeTab === 'browse' && (
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center gap-4 py-1">
              <div className="flex-1 relative group"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-accent" /><input type="text" placeholder="Search library..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/5 border border-white/5 focus:border-accent/40 rounded-xl py-3 pl-12 pr-4 text-xs text-text-main font-bold focus:outline-none transition-all" /></div>
              <button onClick={() => setIsCreatingFolder(true)} className="px-4 py-3 rounded-xl bg-accent text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest shadow-lg"><FolderPlus size={16} />New Product Category</button>
              <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5">{categories.map(cat => <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-accent text-white' : 'text-text-dim hover:text-text-main'}`}>{cat}</button>)}</div>
            </div>
            {isCreatingFolder && <div className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/20 rounded-2xl animate-in slide-in-from-top-4 duration-300"><input autoFocus type="text" placeholder="Category Name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} className="flex-1 bg-transparent border-none text-sm font-bold text-text-main focus:outline-none" /><button onClick={() => setIsCreatingFolder(false)} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-text-dim">Cancel</button><button onClick={handleCreateFolder} className="px-5 py-2 rounded-lg bg-accent text-white text-[10px] font-black uppercase tracking-widest">Create</button></div>}
            <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
              <div className="flex flex-col gap-8 pb-10">
                {folders.map(folderName => {
                  const items = filteredProducts.filter(p => (p.folder || ((p.isCustom || p.textureUrl) ? 'Custom Product' : 'Standard Assets')) === folderName)
                  if (items.length === 0 && !emptyCategories.includes(folderName)) return null
                  return (
                    <div key={folderName} className="flex flex-col gap-4 group/folder" onDragOver={e => e.preventDefault()} onDrop={async () => { if (draggedProductId) { await onUpdateProduct(draggedProductId, { folder: folderName }); setDraggedProductId(null) } }}>
                      <div className="flex items-center gap-3 p-2 -mx-2 rounded-xl"><div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center"><Folder size={14} /></div><span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main flex-1">{folderName} ({items.length})</span></div>
                      <div className="grid grid-cols-4 gap-4">
                        {items.map(product => (
                          <div key={product.id} draggable onDragStart={() => setDraggedProductId(product.id)} onClick={() => onOpenEditor(product)} className={`group flex flex-col gap-2 p-3 border rounded-2xl transition-all cursor-pointer ${stagedProductIds.includes(product.id) ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-accent/40'}`}>
                            <div className="aspect-square bg-black/40 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center">
                              <ProductThumbnail product={product} onUpdate={onUpdateProduct} />
                              <div onClick={(e) => { e.stopPropagation(); onToggleStaging(product.id) }} className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all z-10 ${stagedProductIds.includes(product.id) ? 'bg-emerald-500 text-white opacity-100 shadow-lg' : 'bg-black/40 text-white/40 opacity-0 group-hover:opacity-100'}`}><CheckCircle2 size={16} /></div>
                              <div className="absolute top-10 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-10"><button onClick={(e) => { e.stopPropagation(); onOpenEditor(product) }} className="w-7 h-7 rounded-lg bg-secondary text-white flex items-center justify-center"><Edit3 size={14} /></button><button onClick={(e) => { e.stopPropagation(); onRemoveProduct(product.id) }} className="w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center"><Trash2 size={14} /></button></div>
                            </div>
                            <div className="px-1 text-left"><span className="text-xs font-black text-text-main truncate block mb-0.5">{product.name}</span><span className="text-[9px] font-bold text-text-dim/60 uppercase tracking-widest block">{Math.round(product.dimensions[1] * 10)/10}" Tall</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'brandstore' && renderBrandstoreTab()}
        {activeTab === 'import' && renderImportTab()}
      </div>
    </div>
  )
}
