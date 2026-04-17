import { NodeIO } from '@gltf-transform/core';

async function checkWrapping() {
    const io = new NodeIO();
    const document = await io.read('public/displays/corrugate_displays/4-Sided_Pallet.glb');
    const root = document.getRoot();

    console.log('--- Texture Wrapping Audit (4-Sided_Pallet.glb) ---');

    document.getRoot().listTextures().forEach((texture, i) => {
        console.log(`Texture ${i}: ${texture.getName() || 'unnamed'}`);
    });

    document.getRoot().listMaterials().forEach((mat, i) => {
        const tex = mat.getBaseColorTexture();
        if (tex) {
            console.log(`Material "${mat.getName()}": Has Texture`);
        } else {
            console.log(`Material "${mat.getName()}": NO Texture`);
        }
    });

    // Note: gltf-transform doesn't expose wrap modes directly on texture, 
    // they are in the texture's info (Sampler).
}

checkWrapping().catch(console.error);
