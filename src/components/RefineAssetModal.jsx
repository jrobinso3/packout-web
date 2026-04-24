import React from 'react'
import { X } from 'lucide-react'
import CustomProductCreator from './CustomProductCreator'
import { useConfigurator } from '../context/ConfiguratorContext'

export default function RefineAssetModal() {
  const { editingProduct, setEditingProduct, updateProduct } = useConfigurator()

  if (!editingProduct) return null

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-8">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300" 
        onClick={() => setEditingProduct(null)} 
      />
      <div className="relative w-full max-w-lg bg-glass-bg border border-glass-border rounded-[2rem] shadow-3xl p-10 flex flex-col gap-6 overflow-hidden animate-in zoom-in-95 duration-300">
         <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h3 className="text-xl font-black text-text-main tracking-tight">Refine Asset</h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Product Studio</span>
            </div>
            <button 
              onClick={() => setEditingProduct(null)} 
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-text-dim hover:text-text-main transition-all"
            >
              <X size={18} />
            </button>
         </div>

         <div className="py-2">
           <CustomProductCreator
             existingProduct={editingProduct}
             onUpdate={(id, updates) => {
               updateProduct(id, updates)
               setEditingProduct(null)
             }}
             onCancel={() => setEditingProduct(null)}
           />
         </div>
      </div>
    </div>
  )
}
