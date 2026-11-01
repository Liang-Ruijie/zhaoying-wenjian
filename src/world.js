// Renderer, camera rigs, the sketchbook arena, the floating neural network and
// the post-processing stack (bloom + an "ink" pass: grain, vignette, glitch).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ARENA_R, C } from './config.js';
import {mistTexture} from './ink-art.js';
import { FEATURE_GROUPS } from './brain.js';

const INK = '#253238';
const NIGHT = '#EEE8DC';
export const BRAIN_POS = new THREE.Vector3(0, 13, -31);

// Small deterministic PRNG for decoration so textures never disturb gameplay RNG.
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const InkShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    aberration: { value: 0 },
    glitch: { value: 0 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    resolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, aberration, glitch, flash;
    uniform vec3 flashColor;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      if (glitch > 0.001) {
        float row = floor(uv.y * 28.0);
        float tick = floor(time * 24.0);
        float on = step(0.72, hash(vec2(row, tick)));
        uv.x += (hash(vec2(row * 1.7, tick + 3.0)) - 0.5) * 0.08 * glitch * on;
      }
      vec2 d = uv - 0.5;
      float ab = 0.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ab).b;
      float g = hash(uv * resolution + fract(time * 7.13) * 91.0) - 0.5;
      col += g * 0.018;
      float v = smoothstep(0.92, 0.32, length(d * vec2(1.0, 0.85)));
      col *= mix(0.96, 1.0, v);
      col = mix(col, flashColor, flash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class World {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setClearColor(C.night);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.className = 'gl';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.night);
    scene.fog = new THREE.FogExp2(C.night, 0.008);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 300);
    this.camPos = new THREE.Vector3(0, 30, 30);
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.camPos);

    scene.add(new THREE.HemisphereLight(0xfff7e5, 0x778782, 2.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.2);
    sun.position.set(-8, 20, 10);
    scene.add(sun);

    this.buildFloor();
    this.buildBoundaryMist();
    this.brain = new BrainViz(scene);
    this.dots = new DecisionDots(scene);

    // Post-processing.
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.12, 0.3, 1.3);
    this.composer.addPass(this.bloom);
    this.ink = new ShaderPass(InkShader);
    this.composer.addPass(this.ink);
    this.composer.addPass(new OutputPass());

    this.quality = 2;
    this.fx = { aberration: 0, glitch: 0, flash: 0 };
    this.time = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, this.mobile?1.5:2);
    const pr = this.quality >= 2 ? dpr : this.quality === 1 ? Math.min(1, dpr) : 0.75;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.enabled = !this.mobile && this.quality >= 1;
    this.camera.aspect = w / h;
    // Keep the arena framed on tall (phone) screens.
    this.camera.fov = w / h < 1 ? 62 : 48;
    this.camera.updateProjectionMatrix();
    this.ink.uniforms.resolution.value.set(w * pr, h * pr);
    this.aspect = w / h;
  }

  // Camera rig: move towards (pos, look) with exponential smoothing; shake is added on top.
  updateCamera(dt, pos, look, sharpness, shake) {
    const k = 1 - Math.exp(-sharpness * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (shake) this.camera.position.add(shake);
    this.camera.lookAt(this.camLook);
  }

  snapCamera(pos, look) {
    this.camPos.copy(pos);
    this.camLook.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  updateFx(dt) {
    this.time += dt;
    const f = this.fx;
    f.aberration = Math.max(0, f.aberration - dt * 2.5);
    f.glitch = Math.max(0, f.glitch - dt * 1.8);
    f.flash = Math.max(0, f.flash - dt * 4);
  }

  render() {
    const f = this.fx;
    const u = this.ink.uniforms;
    u.time.value = this.time;
    u.aberration.value = 0;
    u.glitch.value = 0;
    u.flash.value = this.reducedMotion ? 0 : Math.min(0.06, f.flash * 0.08);
    this.composer.render();
  }

  // ---------------------------------------------------------------------------

  buildFloor() {
    const worldSize = (ARENA_R + 9) * 2;
    const tex = new THREE.CanvasTexture(drawFloorCanvas(2048, worldSize));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(worldSize, worldSize),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // A big dark apron so the fog has something to swallow.
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: C.night }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.02;
    this.scene.add(apron);
  }

  buildBoundaryMist() {
    // A broad, noisy wash hints at the collider without drawing its circumference.
    const material=new THREE.MeshBasicMaterial({map:mistTexture('boundary'),color:0x7f927f,transparent:true,opacity:.78,fog:false,depthWrite:false,side:THREE.DoubleSide});
    const mist=new THREE.Mesh(new THREE.PlaneGeometry(64,64),material);mist.rotation.x=-Math.PI/2;mist.position.y=.035;
    mist.renderOrder=-1;mist.name='arena-boundary-mist';mist.userData={style:'soft-gradient',colliderRadius:ARENA_R};this.scene.add(mist);this.boundaryMist=mist;
  }

}

// -----------------------------------------------------------------------------
// The sketchbook floor: night paper, hand-ruled grid, hatching outside the ring,
// little margin notes.

function drawFloorCanvas(size, worldSize) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const rng = lcg(1337);
  const s = size / worldSize;
  const c = size / 2;
  const W = (x) => c + x * s;

  g.fillStyle = NIGHT;
  g.fillRect(0, 0, size, size);

  // Paper tooth.
  for (let i = 0; i < 70000; i++) {
    const v = rng();
    g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(37,50,56,0.035)';
    g.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }

  // Keep the centre open. Low-contrast paper/stone washes replace all concentric floor lines.
  for(let i=0;i<18;i++){
    const x=rng()*size,y=rng()*size,r=(.03+rng()*.09)*size;
    const wash=g.createRadialGradient(x,y,0,x,y,r);wash.addColorStop(0,'rgba(96,111,101,0.018)');wash.addColorStop(1,'rgba(96,111,101,0)');g.fillStyle=wash;g.fillRect(x-r,y-r,r*2,r*2);
  }
  return cv;
}

// -----------------------------------------------------------------------------
// The neural network, floating above the arena. Edges are coloured by weight
// sign (cyan +, pink −) and brightened by the activity flowing through them.

class BrainViz {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.copy(BRAIN_POS);
    scene.add(this.group);
    this.sizes = null;
    this.net = null;
    this.level = 0.35; // overall brightness
    this.pulse = 0;
    this.time = 0;
    this.c = new THREE.Color();
    this.cPos = new THREE.Color(C.electric);
    this.cNeg = new THREE.Color(C.pink);
  }

  // (Re)build geometry for a layer layout.
  build(sizes) {
    if (this.sizes && this.sizes.join() === sizes.join()) return;
    this.sizes = sizes.slice();
    this.group.clear();
    const spanX = 22;
    const pos = [];
    this.layerStart = [];
    sizes.forEach((n, l) => {
      this.layerStart.push(pos.length);
      const x = -spanX / 2 + (l / (sizes.length - 1)) * spanX;
      const h = l === 0 || l === sizes.length - 1 ? 9.5 : 10.5;
      for (let i = 0; i < n; i++) {
        const y = n === 1 ? 0 : h / 2 - (i / (n - 1)) * h;
        const z = l > 0 && l < sizes.length - 1 ? (i % 2 ? 0.9 : -0.9) : 0;
        pos.push(new THREE.Vector3(x, y, z));
      }
    });
    this.nodePos = pos;

    const nodeGeo = new THREE.IcosahedronGeometry(0.2, 1);
    this.nodes = new THREE.InstancedMesh(nodeGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), pos.length);
    const m = new THREE.Matrix4();
    pos.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      this.nodes.setMatrixAt(i, m);
      this.nodes.setColorAt(i, this.c.setRGB(0.3, 0.3, 0.3));
    });
    this.group.add(this.nodes);

    // Edges: one segment per weight.
    const edges = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      for (let o = 0; o < sizes[l + 1]; o++) {
        for (let i = 0; i < sizes[l]; i++) edges.push([this.layerStart[l] + i, this.layerStart[l + 1] + o, l, o * sizes[l] + i]);
      }
    }
    this.edges = edges;
    const ep = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], k) => {
      ep.set([pos[a].x, pos[a].y, pos[a].z, pos[b].x, pos[b].y, pos[b].z], k * 6);
    });
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    this.edgeColors = new Float32Array(edges.length * 6);
    eg.setAttribute('color', new THREE.BufferAttribute(this.edgeColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.edgeMesh = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    this.group.add(this.edgeMesh);

    // Hand-lettered labels for the input groups and outputs.
    const lx = -spanX / 2 - 1.2;
    for (const gr of FEATURE_GROUPS) {
      const a = pos[this.layerStart[0] + gr.from];
      const b = pos[this.layerStart[0] + gr.to];
      this.group.add(labelSprite(gr.name, lx - 1.6, (a.y + b.y) / 2, 0, 'right'));
    }
    const ox = spanX / 2 + 1.0;
    this.group.add(labelSprite('移动', ox + 1.5, 2.2, 0, 'left'));
    this.group.add(labelSprite('冲刺', ox + 1.5, pos[this.layerStart[3] + 9].y, 0, 'left'));
    this.group.add(labelSprite('出剑', ox + 1.6, pos[this.layerStart[3] + 10].y, 0, 'left'));
    this.group.add(labelSprite('剑路 →', lx - 1.6, 6.8, 0, 'right', '#216D68'));
    this.group.add(labelSprite('镜剑 →', ox + 2.0, 6.0, 0, 'left', '#B34232'));
  }

  setNet(net) {
    this.net = net;
    this.build(net.sizes);
  }

  // Input node world position (for the "data flies into the brain" effect).
  inputNodeWorld(i, out) {
    const p = this.nodePos[this.layerStart[0] + (i % this.sizes[0])];
    return out.copy(p).applyMatrix4(this.group.matrixWorld);
  }

  outputWorld(out) {
    const p = this.nodePos[this.layerStart[this.sizes.length - 1] + 3];
    return out.copy(p).applyMatrix4(this.group.matrixWorld);
  }

  update(dt) {
    if (!this.net) return;
    this.time += dt;
    this.pulse = Math.max(0, this.pulse - dt * 2);
    this.group.rotation.y = Math.sin(this.time * 0.25) * 0.12;
    this.group.position.y = BRAIN_POS.y + Math.sin(this.time * 0.6) * 0.3;
    const { net, sizes } = this;
    const lvl = this.level + this.pulse * 0.6;

    // Nodes: brightness by |activation|; hue by sign.
    let idx = 0;
    for (let l = 0; l < sizes.length; l++) {
      const acts = net.acts[l];
      const out = l === sizes.length - 1;
      for (let i = 0; i < sizes[l]; i++, idx++) {
        let a = acts[i];
        if (out) a = Math.tanh(a * 0.5);
        const mag = Math.min(1, Math.abs(a));
        const base = a >= 0 ? this.cPos : this.cNeg;
        const k = (0.18 + mag * 2.6) * (0.4 + lvl);
        this.nodes.setColorAt(idx, this.c.copy(base).multiplyScalar(k));
      }
    }
    this.nodes.instanceColor.needsUpdate = true;

    // Edges: weight magnitude × source activity × a travelling shimmer.
    const col = this.edgeColors;
    const t = this.time;
    for (let k = 0; k < this.edges.length; k++) {
      const [a, , l, wi] = this.edges[k];
      const w = net.W[l][wi];
      const src = Math.abs(net.acts[l][a - this.layerStart[l]]);
      const shimmer = 0.75 + 0.25 * Math.sin(t * 6 + k * 0.37);
      const v = Math.min(1, Math.abs(w) * 0.55) * (0.08 + src * 0.6) * shimmer * (0.25 + lvl);
      const base = w >= 0 ? this.cPos : this.cNeg;
      const o = k * 6;
      col[o] = base.r * v * 0.6; col[o + 1] = base.g * v * 0.6; col[o + 2] = base.b * v * 0.6;
      col[o + 3] = base.r * v; col[o + 4] = base.g * v; col[o + 5] = base.b * v;
    }
    this.edgeMesh.geometry.attributes.color.needsUpdate = true;
  }
}

function labelSprite(text, x, y, z, align = 'center', color = INK) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '52px "Songti SC", serif';
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.textAlign = align;
  const tx = align === 'left' ? 8 : align === 'right' ? 504 : 256;
  g.fillText(text, tx, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
  sp.scale.set(4, 1, 1);
  sp.position.set(x, y, z);
  return sp;
}

// -----------------------------------------------------------------------------
// Decision dots: every recorded sample leaves a glowing speck where you were.
// At training time they lift off and stream into the network's input layer.

class DecisionDots {
  constructor(scene, max = 2600) {
    this.max = max;
    const geo = new THREE.OctahedronGeometry(0.09, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.pos = [];
    this.n = 0;
    this.flying = false;
    this.t = 0;
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    this.v = new THREE.Vector3();
    this.base = new THREE.Color(C.electric);
  }

  clear() {
    this.pos.length = 0;
    this.n = 0;
    this.flying = false;
    this.mesh.count = 0;
  }

  add(x, z, born) {
    if (this.n >= this.max) return;
    this.pos.push({ x, z, born, tx: 0, ty: 0, tz: 0, delay: 0 });
    this.n++;
  }

  // Start the lift-off towards the brain's input nodes.
  fly(brain) {
    this.flying = true;
    this.t = 0;
    const n = this.pos.length;
    this.pos.forEach((p, i) => {
      brain.inputNodeWorld(i * 7, this.v);
      p.tx = this.v.x;
      p.ty = this.v.y;
      p.tz = this.v.z;
      p.delay = (i / Math.max(1, n)) * 0.9;
    });
  }

  update(dt, now) {
    const m = this.m;
    let visible = 0;
    if (this.flying) this.t += dt;
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      let x = p.x;
      let y = 0.08;
      let z = p.z;
      let bright = 1;
      const age = now - p.born;
      let s = Math.min(1, age * 6) * (1 + Math.max(0, 0.6 - age) * 2);
      if (this.flying) {
        const k = Math.min(1, Math.max(0, (this.t - p.delay) / 0.9));
        if (k >= 1) continue;
        const e = k * k * (3 - 2 * k);
        x = p.x + (p.tx - p.x) * e;
        z = p.z + (p.tz - p.z) * e;
        y = 0.08 + (p.ty - 0.08) * e + Math.sin(e * Math.PI) * 6;
        bright = 1.6 + e * 2;
        s = 1.4 - e * 0.6;
      } else {
        bright = 0.55 + Math.max(0, 1 - age) * 2.5;
      }
      m.makeScale(s, s, s);
      m.setPosition(x, y, z);
      this.mesh.setMatrixAt(visible, m);
      this.mesh.setColorAt(visible, this.c.copy(this.base).multiplyScalar(bright));
      visible++;
    }
    this.mesh.count = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.flying && this.t > 2.2) this.clear();
  }
}
