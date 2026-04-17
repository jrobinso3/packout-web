import * as THREE from 'three';

/**
 * Applies a white-blend to a material's map texture.
 * Used to implement the "Artwork Mix" feature.
 * @param {THREE.Material} material The material to modify
 * @param {number} mixValue 0 (Solid White) to 1 (Original Artwork)
 */
export function applyArtworkMix(material, mixValue) {
  const tex = material.map;
  if (!tex || !tex.image) return;

  const img = tex.image;
  const isHTMLImage = img instanceof HTMLImageElement;

  const apply = () => {
    // Create or reuse canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    // Draw base white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw artwork on top with opacity = mixValue
    ctx.globalAlpha = mixValue;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Create a new texture from the canvas
    const newTex = new THREE.CanvasTexture(canvas);
    
    // Explicitly enable RepeatWrapping for both AXA and Tiling support
    newTex.wrapS = THREE.RepeatWrapping;
    newTex.wrapT = THREE.RepeatWrapping;
    newTex.repeat.copy(tex.repeat);
    newTex.offset.copy(tex.offset);
    newTex.center.copy(tex.center);
    newTex.rotation = tex.rotation;
    newTex.flipY = tex.flipY;
    newTex.colorSpace = tex.colorSpace;
    newTex.matrixAutoUpdate = tex.matrixAutoUpdate;

    // Replace the material map
    material.map = newTex;
    material.needsUpdate = true;
  };

  if (isHTMLImage && !img.complete) {
    img.addEventListener('load', apply, { once: true });
  } else {
    apply();
  }
}
