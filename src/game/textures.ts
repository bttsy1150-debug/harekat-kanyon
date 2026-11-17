import * as THREE from 'three';

export interface ProceduralTextureSet {
  groundColor: THREE.CanvasTexture;
  groundBump: THREE.CanvasTexture;
  concreteColor: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  crateColor: THREE.CanvasTexture;
  crateBump: THREE.CanvasTexture;
  containerOlive: THREE.CanvasTexture;
  containerRust: THREE.CanvasTexture;
  containerBump: THREE.CanvasTexture;
  barrelColor: THREE.CanvasTexture;
  sandbagColor: THREE.CanvasTexture;
  asphaltColor: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  snowColor: THREE.CanvasTexture;
  snowBump: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number, darkOnly = false) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = darkOnly ? -Math.random() * alpha : (Math.random() - 0.5) * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
  }
  ctx.putImageData(img, 0, 0);
}

function finalizeTex(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const all: THREE.Texture[] = [];

  // 1. Compound ground (weathered desert earth + gravel + tire tracks)
  const [gCanvas, gCtx] = makeCanvas(512, 512);
  gCtx.fillStyle = '#5c5342';
  gCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    gCtx.fillStyle = i % 2 === 0 ? 'rgba(72,64,50,0.28)' : 'rgba(116,104,82,0.22)';
    gCtx.beginPath();
    gCtx.arc(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 22, 0, Math.PI * 2);
    gCtx.fill();
  }
  // Gravel flecks
  for (let i = 0; i < 2400; i++) {
    gCtx.fillStyle = Math.random() > 0.5 ? 'rgba(42,38,32,0.45)' : 'rgba(145,134,112,0.4)';
    gCtx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  addNoise(gCtx, 512, 512, 22);
  const groundColor = finalizeTex(gCanvas, true, maxAniso, 36, 36);

  const [gbCanvas, gbCtx] = makeCanvas(256, 256);
  gbCtx.fillStyle = '#808080';
  gbCtx.fillRect(0, 0, 256, 256);
  addNoise(gbCtx, 256, 256, 65);
  const groundBump = finalizeTex(gbCanvas, false, maxAniso, 36, 36);

  // 2. Concrete bunker / wall texture
  const [cCanvas, cCtx] = makeCanvas(512, 512);
  cCtx.fillStyle = '#8a867d';
  cCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 128) {
    cCtx.fillStyle = 'rgba(40,38,34,0.38)';
    cCtx.fillRect(0, y, 512, 3);
    // Formwork tie holes
    for (let x = 64; x < 512; x += 128) {
      cCtx.fillStyle = 'rgba(35,34,32,0.55)';
      cCtx.beginPath();
      cCtx.arc(x, y + 64, 4, 0, Math.PI * 2);
      cCtx.fill();
    }
  }
  for (let x = 0; x < 512; x += 256) {
    cCtx.fillStyle = 'rgba(45,42,38,0.28)';
    cCtx.fillRect(x, 0, 2, 512);
  }
  // Weathering streaks
  for (let i = 0; i < 40; i++) {
    const gx = Math.random() * 512;
    const grad = cCtx.createLinearGradient(gx, 0, gx, 160 + Math.random() * 240);
    grad.addColorStop(0, 'rgba(35,33,28,0.22)');
    grad.addColorStop(1, 'rgba(35,33,28,0)');
    cCtx.fillStyle = grad;
    cCtx.fillRect(gx, 0, 6 + Math.random() * 14, 400);
  }
  addNoise(cCtx, 512, 512, 24);
  const concreteColor = finalizeTex(cCanvas, true, maxAniso, 2, 2);

  const [cbCanvas, cbCtx] = makeCanvas(256, 256);
  cbCtx.fillStyle = '#888888';
  cbCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    cbCtx.fillStyle = '#383838';
    cbCtx.fillRect(0, y, 256, 2);
  }
  addNoise(cbCtx, 256, 256, 48);
  const concreteBump = finalizeTex(cbCanvas, false, maxAniso, 2, 2);

  // 3. Military wood supply crate
  const [wCanvas, wCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#7b5b39';
  wCtx.fillRect(0, 0, 256, 256);
  // Planks
  for (let y = 0; y < 256; y += 42) {
    wCtx.fillStyle = 'rgba(40,25,12,0.5)';
    wCtx.fillRect(0, y, 256, 2);
    wCtx.fillStyle = y % 84 === 0 ? 'rgba(255,220,180,0.06)' : 'rgba(0,0,0,0.06)';
    wCtx.fillRect(0, y + 2, 256, 40);
  }
  // Frame border + diagonal brace
  wCtx.strokeStyle = '#5a3f22';
  wCtx.lineWidth = 22;
  wCtx.strokeRect(11, 11, 234, 234);
  wCtx.beginPath();
  wCtx.moveTo(14, 242);
  wCtx.lineTo(242, 14);
  wCtx.lineWidth = 18;
  wCtx.stroke();
  // Stencil badge
  wCtx.fillStyle = 'rgba(28,24,18,0.72)';
  wCtx.font = 'bold 20px monospace';
  wCtx.fillText('7.62 NATO', 68, 134);
  addNoise(wCtx, 256, 256, 18);
  const crateColor = finalizeTex(wCanvas, true, maxAniso, 1, 1);

  const [wbCanvas, wbCtx] = makeCanvas(256, 256);
  wbCtx.fillStyle = '#808080';
  wbCtx.fillRect(0, 0, 256, 256);
  wbCtx.strokeStyle = '#c8c8c8';
  wbCtx.lineWidth = 22;
  wbCtx.strokeRect(11, 11, 234, 234);
  addNoise(wbCtx, 256, 256, 32);
  const crateBump = finalizeTex(wbCanvas, false, maxAniso, 1, 1);

  // 4. Corrugated shipping container
  const makeContainer = (baseHex: string, rustHex: string) => {
    const [cv, cx] = makeCanvas(256, 256);
    cx.fillStyle = baseHex;
    cx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const grad = cx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.1)');
      grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      cx.fillStyle = grad;
      cx.fillRect(x, 0, 16, 256);
    }
    // Rust streaks
    for (let i = 0; i < 24; i++) {
      cx.fillStyle = rustHex;
      cx.fillRect(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 22, 4 + Math.random() * 28);
    }
    addNoise(cx, 256, 256, 16);
    return finalizeTex(cv, true, maxAniso, 2, 1);
  };
  const containerOlive = makeContainer('#3e4a38', 'rgba(110,58,28,0.26)');
  const containerRust = makeContainer('#5e372a', 'rgba(65,42,32,0.3)');

  const [ctbCanvas, ctbCtx] = makeCanvas(256, 256);
  for (let x = 0; x < 256; x += 16) {
    const grad = ctbCtx.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, '#303030');
    grad.addColorStop(0.5, '#d8d8d8');
    grad.addColorStop(1, '#303030');
    ctbCtx.fillStyle = grad;
    ctbCtx.fillRect(x, 0, 16, 256);
  }
  const containerBump = finalizeTex(ctbCanvas, false, maxAniso, 2, 1);

  // 5. Hazard red fuel barrel
  const [bCanvas, bCtx] = makeCanvas(256, 256);
  bCtx.fillStyle = '#99221d';
  bCtx.fillRect(0, 0, 256, 256);
  // Rib bands
  bCtx.fillStyle = '#6e1612';
  bCtx.fillRect(0, 74, 256, 10);
  bCtx.fillRect(0, 172, 256, 10);
  // Yellow hazard stripe
  bCtx.fillStyle = '#eab308';
  bCtx.fillRect(0, 108, 256, 40);
  bCtx.fillStyle = '#1c1917';
  for (let x = -32; x < 288; x += 32) {
    bCtx.beginPath();
    bCtx.moveTo(x, 108);
    bCtx.lineTo(x + 16, 108);
    bCtx.lineTo(x + 4, 148);
    bCtx.lineTo(x - 12, 148);
    bCtx.closePath();
    bCtx.fill();
  }
  addNoise(bCtx, 256, 256, 18);
  const barrelColor = finalizeTex(bCanvas, true, maxAniso, 1, 1);

  // 6. Sandbag weave
  const [sCanvas, sCtx] = makeCanvas(128, 128);
  sCtx.fillStyle = '#9b8b6c';
  sCtx.fillRect(0, 0, 128, 128);
  sCtx.strokeStyle = 'rgba(65,55,38,0.25)';
  sCtx.lineWidth = 1;
  for (let i = 0; i < 128; i += 4) {
    sCtx.beginPath();
    sCtx.moveTo(i, 0);
    sCtx.lineTo(i, 128);
    sCtx.stroke();
    sCtx.beginPath();
    sCtx.moveTo(0, i);
    sCtx.lineTo(128, i);
    sCtx.stroke();
  }
  addNoise(sCtx, 128, 128, 20);
  const sandbagColor = finalizeTex(sCanvas, true, maxAniso, 2, 1);

  // 7. Wet Port Asphalt
  const [aCanvas, aCtx] = makeCanvas(512, 512);
  aCtx.fillStyle = '#26292e';
  aCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 240; i++) {
    aCtx.fillStyle = i % 2 === 0 ? 'rgba(20,23,28,0.38)' : 'rgba(55,62,72,0.22)';
    aCtx.beginPath();
    aCtx.arc(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 26, 0, Math.PI * 2);
    aCtx.fill();
  }
  // Subtle port dock hazard line
  aCtx.fillStyle = 'rgba(202, 138, 4, 0.35)';
  aCtx.fillRect(0, 248, 512, 12);
  addNoise(aCtx, 512, 512, 26);
  const asphaltColor = finalizeTex(aCanvas, true, maxAniso, 28, 28);

  const [abCanvas, abCtx] = makeCanvas(256, 256);
  abCtx.fillStyle = '#808080';
  abCtx.fillRect(0, 0, 256, 256);
  addNoise(abCtx, 256, 256, 55);
  const asphaltBump = finalizeTex(abCanvas, false, maxAniso, 28, 28);

  // 8. Alpine Snow Ground
  const [snCanvas, snCtx] = makeCanvas(512, 512);
  snCtx.fillStyle = '#d6e1ea';
  snCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 220; i++) {
    snCtx.fillStyle = i % 2 === 0 ? 'rgba(180,200,220,0.28)' : 'rgba(248,252,255,0.45)';
    snCtx.beginPath();
    snCtx.ellipse(
      Math.random() * 512,
      Math.random() * 512,
      14 + Math.random() * 32,
      6 + Math.random() * 14,
      0.3,
      0,
      Math.PI * 2
    );
    snCtx.fill();
  }
  addNoise(snCtx, 512, 512, 14);
  const snowColor = finalizeTex(snCanvas, true, maxAniso, 34, 34);

  const [snbCanvas, snbCtx] = makeCanvas(256, 256);
  snbCtx.fillStyle = '#888888';
  snbCtx.fillRect(0, 0, 256, 256);
  addNoise(snbCtx, 256, 256, 40);
  const snowBump = finalizeTex(snbCanvas, false, maxAniso, 34, 34);

  all.push(
    groundColor,
    groundBump,
    concreteColor,
    concreteBump,
    crateColor,
    crateBump,
    containerOlive,
    containerRust,
    containerBump,
    barrelColor,
    sandbagColor,
    asphaltColor,
    asphaltBump,
    snowColor,
    snowBump
  );

  return {
    groundColor,
    groundBump,
    concreteColor,
    concreteBump,
    crateColor,
    crateBump,
    containerOlive,
    containerRust,
    containerBump,
    barrelColor,
    sandbagColor,
    asphaltColor,
    asphaltBump,
    snowColor,
    snowBump,
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}
