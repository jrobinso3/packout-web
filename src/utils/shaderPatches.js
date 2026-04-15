// ─── shaderPatches.js ────────────────────────────────────────────────────────
//
// Shader patches must be applied via onBeforeCompile BEFORE the material is
// first rendered — THREE.js caches compiled WebGL programs and won't recompile
// just because onBeforeCompile was set after the fact.
//
// Call these functions during scene traversal (e.g. in DisplayModel) so the
// callbacks are in place before the first draw call.

/**
 * Injects a `mapInfluence` uniform into a material's fragment shader.
 *
 *   mapInfluence = 1  →  full bitmap  (default, identical to stock behaviour)
 *   mapInfluence = 0  →  pure base color (bitmap completely suppressed)
 *
 * The uniform is stored at material.userData._mapInfluenceUniform so React UI
 * controls can update .value live without needing needsUpdate / recompile.
 */
export function patchMapInfluence(material) {
  if (!material.map) return                       // only meaningful with an albedo map
  if (material.userData._mapInfluencePatched) return // idempotent

  const uniform = { value: 1.0 }
  material.userData._mapInfluenceUniform = uniform
  material.userData._mapInfluencePatched = true

  material.onBeforeCompile = (shader) => {
    shader.uniforms.mapInfluence = uniform

    // Declare the uniform at the top of the fragment shader
    shader.fragmentShader =
      'uniform float mapInfluence;\n' + shader.fragmentShader

    // Replace the standard map_fragment include with our blended version.
    // mix(vec4(1.0), texel, 0) → vec4(1.0) → multiplying diffuseColor × 1 = base color
    // mix(vec4(1.0), texel, 1) → texel     → full bitmap
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */`
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        #ifdef DECODE_VIDEO_TEXTURE
          sampledDiffuseColor = sRGBTransferOETF( sampledDiffuseColor );
        #endif
        sampledDiffuseColor = mix( vec4(1.0), sampledDiffuseColor, mapInfluence );
        diffuseColor *= sampledDiffuseColor;
      #endif
      `
    )
  }

  // customProgramCacheKey makes THREE.js treat this as a distinct program
  // so it won't share the compiled shader with an unpatched material.
  material.customProgramCacheKey = () => 'mapInfluence'
}
