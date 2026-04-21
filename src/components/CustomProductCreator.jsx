import { useState, useRef } from 'react'
import { ImagePlus, Plus, X, Box } from 'lucide-react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'
import { renderGlbThumbnail } from '../utils/textureUtils'

const INCH_TO_M = 0.0254

// Heuristic: infer the source unit from the largest bounding-box dimension.
// Consumer products are typically 1–36 inches. We pick whichever unit maps the
// largest axis into that range most cleanly.
//   mm  → max typically 25–900
//   cm  → max typically 2.5–90
//   in  → max typically 1–36
//   m   → max typically 0.025–0.9
function detectGlbUnit(size) {
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 50)   return 'mm'
  if (maxDim > 5)    return 'cm'
  if (maxDim > 0.3)  return 'in'
  return 'm'
}

const UNIT_TO_INCHES = { mm: 1 / 25.4, cm: 1 / 2.54, in: 1, m: 1 / INCH_TO_M }

// Loads a GLB file, returns { size: Vector3, thumbnail: dataURL }.
// Size is read via a lightweight GLTFLoader parse; thumbnail is delegated to
// the shared renderGlbThumbnail utility so the logic lives in one place.
async function readGlbInfo(file) {
  const blobUrl = URL.createObjectURL(file)

  const size = await new Promise((resolve, reject) => {
    new GLTFLoader().load(
      blobUrl,
      (gltf) => {
        const s = new THREE.Vector3()
        new THREE.Box3().setFromObject(gltf.scene).getSize(s)
        resolve(s)
      },
      undefined,
      reject
    )
  })

  const thumbnail = await renderGlbThumbnail(blobUrl)
  URL.revokeObjectURL(blobUrl)

  return { size, thumbnail }
}

function sizeToInches(size, unit) {
  const factor = UNIT_TO_INCHES[unit]
  return {
    width:  parseFloat((size.x * factor).toFixed(2)),
    height: parseFloat((size.y * factor).toFixed(2)),
    depth:  parseFloat((size.z * factor).toFixed(2)),
  }
}

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

export default function CustomProductCreator({ onAdd, existingProduct, onUpdate, onCancel }) {
  const [previewUrl, setPreviewUrl] = useState(existingProduct?.textureUrl || existingProduct?.glbUrl || null)
  const [file, setFile] = useState(null)
  const [productType, setProductType] = useState(existingProduct?.type || '2D')
  const [name, setName]   = useState(existingProduct?.name || '')
  const [width, setWidth]   = useState(existingProduct?.dimensions?.[0] || '')
  const [height, setHeight] = useState(existingProduct?.dimensions?.[1] || '')
  const [depth, setDepth]   = useState(existingProduct?.dimensions?.[2] || '')
  const [glbUnit, setGlbUnit] = useState('auto')
  const [rawGlbSize, setRawGlbSize] = useState(null)
  const [glbThumb, setGlbThumb] = useState(null)
  const fileRef = useRef()

  const applyUnit = (size, unit) => {
    const resolved = unit === 'auto' ? detectGlbUnit(size) : unit
    const dims = sizeToInches(size, resolved)
    setWidth(String(dims.width))
    setHeight(String(dims.height))
    setDepth(String(dims.depth))
  }

  const handleFile = async (e) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    if (previewUrl && !existingProduct) URL.revokeObjectURL(previewUrl)

    const isGlb = picked.name.toLowerCase().endsWith('.glb')
    setProductType(isGlb ? '3D' : '2D')

    const url = URL.createObjectURL(picked)
    setPreviewUrl(url)
    setFile(picked)
    setName(picked.name.replace(/\.[^.]+$/, ''))

    if (isGlb) {
      try {
        const { size, thumbnail } = await readGlbInfo(picked)
        setRawGlbSize(size)
        setGlbThumb(thumbnail)
        setGlbUnit('auto')
        applyUnit(size, 'auto')
      } catch (err) {
        console.warn('Could not read GLB dimensions:', err)
      }
    }
  }

  const handleUnitChange = (unit) => {
    setGlbUnit(unit)
    if (rawGlbSize) applyUnit(rawGlbSize, unit)
  }

  const handleAdd = async () => {
    // Validation: Dimensions are always required for bounding boxes.
    if (!width || !height) return
    if (!existingProduct && !file) return

    try {
      let finalUrl = productType === '3D' ? (existingProduct?.glbUrl || previewUrl) : (existingProduct?.textureUrl || previewUrl)

      // 1. If a new file was picked, perform a physical upload
      if (file) {
        // Encode to Base64 for resilient transfer
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        if (import.meta.env.DEV) {
          // Physical Upload via Persistence API (Development only)
          const endpoint = productType === '3D' ? 'upload-model' : 'upload-texture'
          try {
            const res = await fetch(`${import.meta.env.BASE_URL}api/${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                base64Data
              })
            })

            if (res.ok) {
              const data = await res.json()
              finalUrl = data.url
            } else {
              // Fallback to Base64 if server exists but reject (e.g. error 500)
              finalUrl = base64Data
            }
          } catch (e) {
            // Fallback to Base64 on network error
            finalUrl = base64Data
          }
        } else {
          // In production, we MUST use the Base64 data as the URL 
          // because a static host cannot store new files.
          finalUrl = base64Data
        }
      }

      const productPayload = {
        name:       name || (productType === '3D' ? 'New 3D Asset' : 'Custom 2D'),
        category:   productType,
        geometry:   productType === '3D' ? 'mesh' : 'box',
        dimensions: [
          parseFloat(width),
          parseFloat(height),
          parseFloat(depth || '0.5'),
        ],
        textureUrl:   productType === '2D' ? finalUrl : null,
        glbUrl:       productType === '3D' ? finalUrl : null,
        thumbnailUrl: productType === '3D' ? glbThumb : null,
        isCustom:     true,
      }

      if (existingProduct) {
        onUpdate(existingProduct.id, productPayload)
      } else {
        onAdd({
          id: `custom-${Date.now()}`,
          ...productPayload
        })
      }

      // Reset form
      if (file && previewUrl && !existingProduct) URL.revokeObjectURL(previewUrl)
      
      if (!existingProduct) {
        setPreviewUrl(null)
        setFile(null)
        setProductType('2D')
        setName('')
        setWidth('')
        setHeight('')
        setDepth('')
      }
      
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      console.error('Operation Failed:', err)
      alert(`Critical: Action failed. ${err.message}`)
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
    setRawGlbSize(null)
    setGlbThumb(null)
    setGlbUnit('auto')
    if (fileRef.current) fileRef.current.value = ''
  }

  const ready = previewUrl && width && height

  return (
    <div className="cp-creator">

      {/* Image/Model upload / preview */}
      {previewUrl ? (
        <div className="cp-preview-wrap shadow-inner border-black/5">
          {productType === '3D' ? (
            glbThumb
              ? <img src={glbThumb} className="cp-preview-img" alt="3D preview" />
              : <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 text-accent">
                  <Box size={40} className="mb-2" />
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60">3D GLB Asset</span>
                </div>
          ) : (
            <img src={previewUrl} className="cp-preview-img" alt="preview" />
          )}
          <button className="cp-clear-btn shadow-lg" onClick={clear} title="Remove">
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="cp-drop-zone group">
          <div className="flex items-center gap-2">
            <ImagePlus size={22} className="text-accent group-hover:scale-110 transition-transform" />
            <Box size={22} className="text-secondary group-hover:scale-110 transition-transform" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-text-main mt-2">Upload PNG (2D) or GLB (3D)</span>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.glb"
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

        {productType === '3D' && rawGlbSize && (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-dim">Source Unit</label>
            <select
              value={glbUnit}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="cp-dim-input"
            >
              <option value="auto">Auto-detect</option>
              <option value="mm">Millimeters (mm)</option>
              <option value="cm">Centimeters (cm)</option>
              <option value="in">Inches (in)</option>
              <option value="m">Meters (m)</option>
            </select>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <DimInput label="Width" value={width}  onChange={setWidth} />
          <DimInput label="Height" value={height} onChange={setHeight} />
          <DimInput label="Depth" value={depth}  onChange={setDepth} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 w-full">
        {onCancel && (
          <button onClick={onCancel} className="cp-cancel-btn flex-1">
            Cancel
          </button>
        )}
        <button
          onClick={handleAdd}
          disabled={!ready}
          className={`cp-add-btn group flex-[2] ${existingProduct ? 'bg-secondary' : 'bg-accent'}`}
        >
          {existingProduct ? (
            <Plus size={14} className="rotate-45" />
          ) : (
            <Plus size={14} className="group-hover:rotate-90 transition-transform" />
          )}
          <span>{existingProduct ? 'Update Product' : 'Create Product'}</span>
        </button>
      </div>
    </div>
  )
}
