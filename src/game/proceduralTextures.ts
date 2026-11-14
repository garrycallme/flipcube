import * as THREE from 'three';

export interface ProceduralTextureSet {
  goldFace: THREE.CanvasTexture;
  cyanFace: THREE.CanvasTexture;
  neutralFace: THREE.CanvasTexture;
  hazardStripe: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. GOLD Face Texture (Radiant amber diamond core on dark anodized slate)
  const [goldCanvas, gCtx] = makeCanvas(256);
  gCtx.fillStyle = '#1d2438';
  gCtx.fillRect(0, 0, 256, 256);

  // Outer gold bezel frame
  gCtx.strokeStyle = '#fbbf24';
  gCtx.lineWidth = 14;
  gCtx.strokeRect(18, 18, 220, 220);

  // Subtle inner metallic gradient diamond
  const gGrad = gCtx.createRadialGradient(128, 128, 12, 128, 128, 86);
  gGrad.addColorStop(0, '#fef08a');
  gGrad.addColorStop(0.45, '#f59e0b');
  gGrad.addColorStop(1, '#b45309');
  gCtx.fillStyle = gGrad;
  gCtx.beginPath();
  gCtx.moveTo(128, 46);
  gCtx.lineTo(210, 128);
  gCtx.lineTo(128, 210);
  gCtx.lineTo(46, 128);
  gCtx.closePath();
  gCtx.fill();

  // Inner dark jewel core
  gCtx.fillStyle = '#fffbeb';
  gCtx.beginPath();
  gCtx.moveTo(128, 92);
  gCtx.lineTo(164, 128);
  gCtx.lineTo(128, 164);
  gCtx.lineTo(92, 128);
  gCtx.closePath();
  gCtx.fill();

  const goldFace = configureColorTexture(goldCanvas, maxAnisotropy);

  // 2. CYAN Face Texture (Electric cyan circuit ring on deep slate)
  const [cyanCanvas, cCtx] = makeCanvas(256);
  cCtx.fillStyle = '#142038';
  cCtx.fillRect(0, 0, 256, 256);

  cCtx.strokeStyle = '#22d3ee';
  cCtx.lineWidth = 14;
  cCtx.strokeRect(18, 18, 220, 220);

  cCtx.strokeStyle = '#67e8f9';
  cCtx.lineWidth = 16;
  cCtx.beginPath();
  cCtx.arc(128, 128, 58, 0, Math.PI * 2);
  cCtx.stroke();

  cCtx.fillStyle = '#cffafe';
  cCtx.beginPath();
  cCtx.arc(128, 128, 20, 0, Math.PI * 2);
  cCtx.fill();

  const cyanFace = configureColorTexture(cyanCanvas, maxAnisotropy);

  // 3. NEUTRAL Face Texture (Pearl satin tile with clean geometric recess)
  const [neutCanvas, nCtx] = makeCanvas(256);
  nCtx.fillStyle = '#e2e8f0';
  nCtx.fillRect(0, 0, 256, 256);

  nCtx.strokeStyle = '#94a3b8';
  nCtx.lineWidth = 10;
  nCtx.strokeRect(20, 20, 216, 216);

  nCtx.fillStyle = '#cbd5e1';
  nCtx.fillRect(68, 68, 120, 120);

  nCtx.fillStyle = '#64748b';
  nCtx.beginPath();
  nCtx.arc(128, 128, 14, 0, Math.PI * 2);
  nCtx.fill();

  const neutralFace = configureColorTexture(neutCanvas, maxAnisotropy);

  // 4. Hazard Stripe Texture (for spike tiles)
  const [hazCanvas, hCtx] = makeCanvas(128);
  hCtx.fillStyle = '#1e1b2e';
  hCtx.fillRect(0, 0, 128, 128);
  hCtx.strokeStyle = '#f97316';
  hCtx.lineWidth = 14;
  for (let i = -128; i < 256; i += 32) {
    hCtx.beginPath();
    hCtx.moveTo(i, 0);
    hCtx.lineTo(i + 128, 128);
    hCtx.stroke();
  }
  hCtx.fillStyle = '#1e1b2e';
  hCtx.fillRect(16, 16, 96, 96);
  const hazardStripe = configureColorTexture(hazCanvas, maxAnisotropy);

  // 5. Soft Radial Contact Shadow Texture
  const [shadCanvas, sCtx] = makeCanvas(128);
  const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  sGrad.addColorStop(0, 'rgba(3, 6, 18, 0.72)');
  sGrad.addColorStop(0.55, 'rgba(3, 6, 18, 0.34)');
  sGrad.addColorStop(1, 'rgba(3, 6, 18, 0.0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = configureColorTexture(shadCanvas, 1);

  return {
    goldFace,
    cyanFace,
    neutralFace,
    hazardStripe,
    contactShadow,
    dispose: () => {
      goldFace.dispose();
      cyanFace.dispose();
      neutralFace.dispose();
      hazardStripe.dispose();
      contactShadow.dispose();
    },
  };
}
