import { useState, useRef } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'

const INCH_TO_M = 0.0254

// Small numeric field used for W / H / D inputs
function DimInput({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim">{label} (in)</label>
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
  const [file, setFile] = useState(null)
  const [name, setName]   = useState('')
  const [width, setWidth]   = useState('')
  const [height, setHeight] = useState('')
  const [depth, setDepth]   = useState('')
  const fileRef = useRef()

  const handleFile = (e) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(picked)
    setPreviewUrl(url)
    setFile(picked)
    setName(picked.name.replace(/\.[^.]+$/, ''))
  }

  const handleAdd = async () => {
    if (!previewUrl || !width || !height) return

    // File is stored in state so it survives the input being unmounted
    if (!file) return

    try {
      // 2. Encode to Base64 for resilient transfer
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // 3. Physical Upload via Persistence API
      // We use endsWith check in middleware, so /api/upload-texture works
      const res = await fetch(`${import.meta.env.BASE_URL}api/upload-texture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64Data
        })
      })

      if (!res.ok) throw new Error('Physical upload failed')
      const { url } = await res.json()

      // 4. Register Product with permanent texture URL
      onAdd({
        id:         `custom-${Date.now()}`,
        name:       name || 'Custom',
        geometry:   'box',
        dimensions: [
          parseFloat(width),
          parseFloat(height),
          parseFloat(depth || '0.5'),
        ],
        textureUrl: url, 
        isCustom:   true,
      })

      // Reset form
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setFile(null)
      setName('')
      setWidth('')
      setHeight('')
      setDepth('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      console.error('Upload Failed:', err)
      alert(`Critical: Failed to persist product to global library. ${err.message}`)
    }
  }

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFile(null)
    setName('')
    setWidth('')
    setHeight('')
    setDepth('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const ready = previewUrl && width && height

  return (
    <div className="cp-creator">

      {/* Image upload / preview */}
      {previewUrl ? (
        <div className="cp-preview-wrap shadow-inner border-black/5">
          <img src={previewUrl} className="cp-preview-img" alt="preview" />
          <button className="cp-clear-btn shadow-lg" onClick={clear} title="Remove">
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="cp-drop-zone group">
          <ImagePlus size={22} className="text-accent group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest text-text-main mt-2">Upload product PNG</span>
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
      <div className="flex flex-col gap-3 mt-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim">Product Name</label>
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
        className="cp-add-btn group"
      >
        <Plus size={14} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
        <span>Create Product</span>
      </button>
    </div>
  )
}
