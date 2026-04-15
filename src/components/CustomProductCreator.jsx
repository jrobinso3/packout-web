import { useState, useRef } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'

const INCH_TO_M = 0.0254

// Small numeric field used for W / H / D inputs
function DimInput({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
-      <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{label} (in)</label>
+      <label className="text-[9px] font-bold uppercase tracking-widest text-white">{label} (in)</label>
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cp-dim-input"
        placeholder="0.00"
      />
    </div>
  )
}

export default function CustomProductCreator({ onAdd }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [name, setName]   = useState('')
  const [width, setWidth]   = useState('')
  const [height, setHeight] = useState('')
  const [depth, setDepth]   = useState('0.5')
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setName(file.name.replace(/\.[^.]+$/, ''))
  }

  const handleAdd = () => {
    if (!previewUrl || !width || !height) return

    onAdd({
      id:         `custom-${Date.now()}`,
      name:       name || 'Custom',
      geometry:   'box',
      dimensions: [
        parseFloat(width)  * INCH_TO_M,
        parseFloat(height) * INCH_TO_M,
        parseFloat(depth || '0.5') * INCH_TO_M,
      ],
      textureUrl: previewUrl,
      isCustom:   true,
    })

    // Reset form (keep depth as default)
    setPreviewUrl(null)
    setName('')
    setWidth('')
    setHeight('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setName('')
    setWidth('')
    setHeight('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const ready = previewUrl && width && height

  return (
    <div className="cp-creator">

      {/* Image upload / preview */}
      {previewUrl ? (
        <div className="cp-preview-wrap">
          <img src={previewUrl} className="cp-preview-img" alt="preview" />
          <button className="cp-clear-btn" onClick={clear} title="Remove">
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="cp-drop-zone">
          <ImagePlus size={22} className="text-white" />
          <span className="text-xs text-white mt-1">Upload product PNG</span>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
      )}

      {/* Name and dimensions side-by-side for compactness */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex flex-col gap-1">
-          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Product Name</label>
+          <label className="text-[10px] font-bold uppercase tracking-wider text-white">Product Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="cp-dim-input"
            placeholder="e.g. Cereal Box"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <DimInput label="Width" value={width}  onChange={setWidth} />
          <DimInput label="Height" value={height} onChange={setHeight} />
          <DimInput label="Depth" value={depth}  onChange={setDepth} />
        </div>
      </div>

      {/* Add button with hover effect */}
      <button
        onClick={handleAdd}
        disabled={!ready}
        className={`cp-add-btn transition-all duration-200 ${
          ready 
            ? 'bg-accent/20 text-accent hover:bg-accent hover:text-black shadow-[0_0_15px_rgba(0,240,255,0.2)]' 
            : 'opacity-40 cursor-not-allowed'
        }`}
      >
        <Plus size={14} strokeWidth={3} />
        <span>Create Product</span>
      </button>
    </div>
  )
}
