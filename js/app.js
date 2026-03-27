import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';

/* ══════════════════════════════════════════════════════════
   SHARED STATE
   ══════════════════════════════════════════════════════════ */
const mouse = { x: 0, y: 0, nx: 0, ny: 0 };
let currentSection = 'hero';

/* ══════════════════════════════════════════════════════════
   GEAR GEOMETRY BUILDER
   ══════════════════════════════════════════════════════════ */
function buildGear(pitchRadius, toothHeight, depth, teeth, boreRadius) {
  const shape = new THREE.Shape();
  const step   = (Math.PI * 2) / teeth;
  const R      = pitchRadius;
  const Rt     = pitchRadius + toothHeight;
  const Rb     = boreRadius;

  for (let i = 0; i < teeth; i++) {
    const a  = i * step;
    const a1 = a  + step * 0.2;
    const a2 = a  + step * 0.3;
    const a3 = a  + step * 0.7;
    const a4 = a  + step * 0.8;

    if (i === 0) shape.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    else          shape.lineTo(Math.cos(a) * R, Math.sin(a) * R);

    shape.lineTo(Math.cos(a1) * R,  Math.sin(a1) * R);
    shape.lineTo(Math.cos(a2) * Rt, Math.sin(a2) * Rt);
    shape.lineTo(Math.cos(a3) * Rt, Math.sin(a3) * Rt);
    shape.lineTo(Math.cos(a4) * R,  Math.sin(a4) * R);
  }
  shape.closePath();

  const hole = new THREE.Path();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    if (i === 0) hole.moveTo(Math.cos(a) * Rb, Math.sin(a) * Rb);
    else          hole.lineTo(Math.cos(a) * Rb, Math.sin(a) * Rb);
  }
  shape.holes.push(hole);

  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2,
  });
}

/* ══════════════════════════════════════════════════════════
   MATERIALS
   ══════════════════════════════════════════════════════════ */
function steelMat(color = 0x2a2a35, rough = 0.35, metal = 0.95) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/* ══════════════════════════════════════════════════════════
   PARTICLE SYSTEM
   ══════════════════════════════════════════════════════════ */
function makeParticles(count, spread, color = 0x00d4ff) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    speeds[i]      = Math.random() * 0.5 + 0.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.speeds = speeds;
  const mat = new THREE.PointsMaterial({ color, size: 0.04, transparent: true, opacity: 0.6, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

/* ══════════════════════════════════════════════════════════
   RENDERER FACTORY
   ══════════════════════════════════════════════════════════ */
function makeRenderer(canvas, w, h, alpha = false) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
  r.setSize(w, h);
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.2;
  return r;
}

/* ══════════════════════════════════════════════════════════
   ██  HERO SCENE  ██
   ══════════════════════════════════════════════════════════ */
class HeroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = canvas.offsetWidth  || window.innerWidth;
    this.h = canvas.offsetHeight || window.innerHeight;
    this.clock = new THREE.Clock();

    this.renderer = makeRenderer(canvas, this.w, this.h);
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(55, this.w / this.h, 0.1, 100);
    this.camera.position.set(0, 1, 9);

    this.scene.fog = new THREE.FogExp2(0x060608, 0.06);

    this._buildLights();
    this._buildAssembly();
    this._buildParticles();
    this._buildPostFX();

    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x080818, 1.5));

    const dA = new THREE.DirectionalLight(0xff8800, 3);
    dA.position.set(4, 6, 3);
    this.scene.add(dA);

    const dB = new THREE.DirectionalLight(0x0088ff, 2.5);
    dB.position.set(-5, -3, 2);
    this.scene.add(dB);

    const pt = new THREE.PointLight(0x00d4ff, 4, 8);
    pt.position.set(0, 0, 3);
    this.scene.add(pt);
    this.centerLight = pt;
  }

  _buildAssembly() {
    const STEEL = steelMat(0x1e1e28, 0.25, 0.98);
    const STEEL2 = steelMat(0x2a2a3a, 0.4, 0.9);
    const CHROME = steelMat(0x8888a0, 0.1, 1.0);
    const BLUE_EMIT = new THREE.MeshStandardMaterial({
      color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.1,
    });

    /* ── Big Gear (16 teeth) ── */
    const bigGeo = buildGear(1.8, 0.32, 0.45, 16, 0.5);
    bigGeo.center();
    this.bigGear = new THREE.Mesh(bigGeo, STEEL);
    this.bigGear.position.set(-0.1, 0.2, 0);
    this.scene.add(this.bigGear);

    /* ── Medium Gear (10 teeth) ── */
    const midGeo = buildGear(1.12, 0.28, 0.45, 10, 0.32);
    midGeo.center();
    this.midGear = new THREE.Mesh(midGeo, STEEL2);
    this.midGear.position.set(-3.0, 0.2, 0.05);
    this.scene.add(this.midGear);

    /* ── Small Gear (8 teeth) ── */
    const smlGeo = buildGear(0.72, 0.22, 0.4, 8, 0.22);
    smlGeo.center();
    this.smlGear = new THREE.Mesh(smlGeo, STEEL);
    this.smlGear.position.set(2.6, -1.6, -0.05);
    this.scene.add(this.smlGear);

    /* ── Central shaft ── */
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 5, 24),
      CHROME,
    );
    shaft.position.set(-0.1, 0.2, 0);
    shaft.rotation.x = Math.PI / 2;
    this.scene.add(shaft);

    /* ── Shaft rings (decorative) ── */
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.045, 12, 32),
        BLUE_EMIT,
      );
      ring.position.set(-0.1, 0.2, -0.8 + i * 0.8);
      this.scene.add(ring);
    }

    /* ── Bolts on big gear ── */
    const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bolt = new THREE.Mesh(boltGeo, CHROME);
      bolt.position.set(
        -0.1 + Math.cos(a) * 1.2,
        0.2  + Math.sin(a) * 1.2,
        0,
      );
      bolt.rotation.x = Math.PI / 2;
      this.bigGear.add(bolt);
    }

    /* ── Background plate ── */
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.12, 64),
      steelMat(0x0e0e18, 0.8, 0.3),
    );
    plate.position.set(-0.1, 0.2, -0.5);
    plate.rotation.x = Math.PI / 2;
    this.scene.add(plate);

    /* ── Turbine blades behind ── */
    const bladeGeo = new THREE.BoxGeometry(0.1, 0.9, 0.08);
    const bladeMat = steelMat(0x333345, 0.5, 0.8);
    this.bladeGroup = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(Math.cos(a) * 2.4, Math.sin(a) * 2.4, -0.4);
      blade.rotation.z = a;
      this.bladeGroup.add(blade);
    }
    this.bladeGroup.position.set(-0.1, 0.2, 0);
    this.scene.add(this.bladeGroup);

    /* ── Piston rod ── */
    const rodMat = CHROME;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 12), rodMat);
    rod.position.set(3.8, 0, 0);
    rod.rotation.z = Math.PI / 2;
    this.scene.add(rod);
    this.pistonRod = rod;

    /* ── Piston head ── */
    const pistonHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.6, 24),
      STEEL2,
    );
    pistonHead.rotation.z = Math.PI / 2;
    this.scene.add(pistonHead);
    this.pistonHead = pistonHead;

    /* ── Grid floor ── */
    const grid = new THREE.GridHelper(20, 30, 0x00d4ff, 0x111122);
    grid.position.y = -3.5;
    grid.material.opacity = 0.3;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  _buildParticles() {
    this.particles = makeParticles(1200, 14, 0x00d4ff);
    this.scene.add(this.particles);

    this.sparks = makeParticles(300, 6, 0xff6b00);
    this.sparks.material.size = 0.06;
    this.sparks.material.opacity = 0.5;
    this.scene.add(this.sparks);
  }

  _buildPostFX() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(this.w, this.h), 0.9, 0.5, 0.82,
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
  }

  _resize() {
    const el = this.canvas.parentElement;
    this.w = el ? el.clientWidth  : window.innerWidth;
    this.h = el ? el.clientHeight : window.innerHeight;
    this.renderer.setSize(this.w, this.h);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(this.w, this.h);
  }

  tick() {
    const t = this.clock.getElapsedTime();

    /* Gear rotation with correct speed ratios */
    this.bigGear.rotation.z  =  t * 0.22;
    this.midGear.rotation.z  = -t * 0.22 * (1.8 / 1.12);
    this.smlGear.rotation.z  = -t * 0.22 * (1.8 / 0.72);

    /* Blades spin slower */
    this.bladeGroup.rotation.z = -t * 0.15;

    /* Piston motion (driven by small gear) */
    const pistonX = 4.6 + Math.sin(t * 0.22 * (1.8 / 0.72) * 2) * 0.9;
    this.pistonHead.position.set(pistonX, -1.6, -0.05);
    this.pistonRod.position.set(pistonX - 1.1, -1.6, -0.05);

    /* Particles drift */
    const pPos = this.particles.geometry.attributes.position;
    for (let i = 0; i < pPos.count; i++) {
      pPos.setY(i, pPos.getY(i) + 0.004 * this.particles.geometry.userData.speeds[i]);
      if (pPos.getY(i) > 7) pPos.setY(i, -7);
    }
    pPos.needsUpdate = true;

    /* Sparks spiral */
    const sPos = this.sparks.geometry.attributes.position;
    for (let i = 0; i < sPos.count; i++) {
      sPos.setX(i, sPos.getX(i) + 0.003 * (Math.random() - 0.5));
      sPos.setY(i, sPos.getY(i) + 0.006 * this.sparks.geometry.userData.speeds[i]);
      if (sPos.getY(i) > 4) {
        sPos.setY(i, -4);
        sPos.setX(i, (Math.random() - 0.5) * 6);
        sPos.setZ(i, (Math.random() - 0.5) * 6);
      }
    }
    sPos.needsUpdate = true;

    /* Center light pulse */
    this.centerLight.intensity = 3.5 + Math.sin(t * 2.2) * 0.8;

    /* Mouse camera parallax */
    const tx = mouse.nx * 1.4;
    const ty = mouse.ny * 0.8;
    this.camera.position.x += (tx - this.camera.position.x) * 0.04;
    this.camera.position.y += (ty + 1 - this.camera.position.y) * 0.04;
    this.camera.lookAt(0, 0, 0);

    this.composer.render();
  }
}

/* ══════════════════════════════════════════════════════════
   ██  GALLERY PROJECT CANVASES  ██
   ══════════════════════════════════════════════════════════ */
function buildProjectScene(idx) {
  const colors  = [0x1e3a5f, 0x1a2e1a, 0x2a1a3a, 0x3a2a1a, 0x1a2a3a, 0x2a1a1a];
  const accents = [0x00d4ff, 0x00ff88, 0xaa44ff, 0xff8800, 0x00ccff, 0xff4444];
  const scene   = new THREE.Scene();
  scene.background = new THREE.Color(colors[idx]);
  scene.fog = new THREE.FogExp2(colors[idx], 0.12);

  const light1 = new THREE.DirectionalLight(accents[idx], 3);
  light1.position.set(2, 4, 3);
  scene.add(light1);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const pt = new THREE.PointLight(accents[idx], 4, 5);
  pt.position.set(0, 1, 2);
  scene.add(pt);

  const STEEL = steelMat(0x303040, 0.3, 0.95);
  const ACCENT = new THREE.MeshStandardMaterial({
    color: accents[idx], emissive: accents[idx], emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.1,
  });

  let group = new THREE.Group();

  if (idx === 0) {
    /* Turbine blade assembly */
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 24), STEEL);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.18), STEEL);
      blade.position.set(Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0);
      blade.rotation.z = a;
      group.add(blade);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), ACCENT);
    group.add(ring);

  } else if (idx === 1) {
    /* Gear system */
    const g1 = buildGear(0.7, 0.14, 0.2, 12, 0.2);
    g1.center();
    const m1 = new THREE.Mesh(g1, STEEL);
    m1.position.x = -0.5;
    group.add(m1);

    const g2 = buildGear(0.45, 0.1, 0.2, 8, 0.13);
    g2.center();
    const m2 = new THREE.Mesh(g2, steelMat(0x404050, 0.4, 0.9));
    m2.position.x = 0.8;
    group.add(m2);
    group.userData.m1 = m1; group.userData.m2 = m2;

  } else if (idx === 2) {
    /* Robotic arm */
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 16), STEEL);
    group.add(base);
    const link1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), STEEL);
    link1.position.y = 0.5;
    group.add(link1);
    const joint1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), ACCENT);
    joint1.position.y = 1.0;
    group.add(joint1);
    const link2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), STEEL);
    link2.position.set(0.25, 1.35, 0);
    link2.rotation.z = -0.5;
    group.add(link2);
    const eff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 8), ACCENT);
    eff.position.set(0.5, 1.7, 0);
    group.add(eff);

  } else if (idx === 3) {
    /* FEA bracket — organic lattice feel */
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), STEEL);
    group.add(base);
    const vert = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.5), STEEL);
    vert.position.set(-0.64, 0.56, 0);
    group.add(vert);
    const hyp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.12), ACCENT);
    hyp.position.set(-0.18, 0.55, 0.19);
    hyp.rotation.z = 0.7;
    group.add(hyp);
    for (let i = 0; i < 4; i++) {
      const hole = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), ACCENT);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(-0.45 + i * 0.32, 0, 0);
      group.add(hole);
    }

  } else if (idx === 4) {
    /* Heat exchanger — cylinders with fins */
    for (let i = 0; i < 3; i++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 16), STEEL);
      tube.position.set(-0.4 + i * 0.4, 0, 0);
      group.add(tube);
      for (let f = 0; f < 5; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), ACCENT);
        fin.position.set(-0.4 + i * 0.4, -0.5 + f * 0.25, 0);
        group.add(fin);
      }
    }

  } else {
    /* Factory layout — city-like blocks */
    const flr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.4), steelMat(0x1a1a28, 0.9, 0.2));
    flr.position.y = -0.6;
    group.add(flr);
    const buildings = [[0, 0.3], [0.5, 0.55], [-0.5, 0.4], [0.9, 0.3], [-0.9, 0.5]];
    buildings.forEach(([x, h]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), STEEL);
      b.position.set(x, -0.6 + h / 2, (Math.random() - 0.5) * 0.8);
      group.add(b);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.22), ACCENT);
      top.position.set(x, -0.6 + h, (Math.random() - 0.5) * 0.8);
      group.add(top);
    });
  }

  scene.add(group);
  return { scene, group };
}

class GalleryScenes {
  constructor() {
    this.items = [];
    const canvases = document.querySelectorAll('.proj-canvas');
    canvases.forEach((canvas, idx) => {
      const { scene, group } = buildProjectScene(idx);
      const w = canvas.clientWidth  || 320;
      const h = canvas.clientHeight || 240;
      const renderer = makeRenderer(canvas, w, h);
      const camera   = new THREE.PerspectiveCamera(50, w / h, 0.1, 30);
      camera.position.set(0, 0.5, 3.2);
      camera.lookAt(0, 0, 0);
      this.items.push({ renderer, scene, camera, group, idx });

      /* Hover interaction — speed up rotation */
      const card = canvas.closest('.proj-card');
      card.addEventListener('mouseenter', () => { group.userData.hovered = true; });
      card.addEventListener('mouseleave', () => { group.userData.hovered = false; });
    });

    window.addEventListener('resize', () => {
      this.items.forEach(({ renderer, camera, group }) => {
        const canvas = renderer.domElement;
        const w = canvas.clientWidth  || 320;
        const h = canvas.clientHeight || 240;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
    });
  }

  tick(t) {
    this.items.forEach(({ renderer, scene, camera, group, idx }) => {
      const speed = group.userData.hovered ? 2.0 : 0.5;
      group.rotation.y = t * speed * 0.3 + idx * 0.5;

      if (idx === 1 && group.userData.m1) {
        group.userData.m1.rotation.z = t * 0.8;
        group.userData.m2.rotation.z = -t * 0.8 * (0.7 / 0.45);
      }

      renderer.render(scene, camera);
    });
  }
}

/* ══════════════════════════════════════════════════════════
   ██  PROCESS SCENE  ██
   ══════════════════════════════════════════════════════════ */
class ProcessScene {
  constructor(canvas) {
    this.canvas = canvas;
    const w = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.offsetHeight || window.innerHeight;
    this.clock = new THREE.Clock();

    this.renderer = makeRenderer(canvas, w, h, true);
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 8);

    this._build();
    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _build() {
    const geo = new THREE.IcosahedronGeometry(2.5, 3);

    /* Wireframe version */
    this.wireFrame = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true, opacity: 0.3, transparent: true }),
    );
    this.scene.add(this.wireFrame);

    /* Solid version */
    this.solid = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x1a2030,
        roughness: 0.2,
        metalness: 0.95,
        opacity: 0,
        transparent: true,
      }),
    );
    this.scene.add(this.solid);

    /* Lights */
    const dl = new THREE.DirectionalLight(0x00d4ff, 2);
    dl.position.set(3, 5, 3);
    this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xff6b00, 1.5);
    dl2.position.set(-4, -3, 2);
    this.scene.add(dl2);
    this.scene.add(new THREE.AmbientLight(0x080818, 2));

    /* Background particles */
    this.bgParticles = makeParticles(800, 20, 0x00d4ff);
    this.bgParticles.material.size = 0.03;
    this.scene.add(this.bgParticles);

    /* Grid lines */
    const grid = new THREE.GridHelper(30, 40, 0x001122, 0x001122);
    grid.position.y = -4;
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  _resize() {
    const el = this.canvas.parentElement;
    const w  = el ? el.clientWidth  : window.innerWidth;
    const h  = el ? el.clientHeight : window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const t = this.clock.getElapsedTime();

    /* Oscillate between wireframe and solid */
    const mix = (Math.sin(t * 0.5) * 0.5 + 0.5);
    this.wireFrame.material.opacity = 0.12 + (1 - mix) * 0.35;
    this.solid.material.opacity     = mix * 0.85;

    this.wireFrame.rotation.y = t * 0.18;
    this.wireFrame.rotation.x = t * 0.09;
    this.solid.rotation.y     = t * 0.18;
    this.solid.rotation.x     = t * 0.09;

    /* Particle drift */
    const pp = this.bgParticles.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      pp.setY(i, pp.getY(i) + 0.003 * this.bgParticles.geometry.userData.speeds[i]);
      if (pp.getY(i) > 10) pp.setY(i, -10);
    }
    pp.needsUpdate = true;

    /* Camera subtle orbit */
    this.camera.position.x = Math.sin(t * 0.12) * 2;
    this.camera.position.y = Math.cos(t * 0.08) * 1;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }
}

/* ══════════════════════════════════════════════════════════
   ██  CONTACT SCENE  ██
   ══════════════════════════════════════════════════════════ */
class ContactScene {
  constructor(canvas) {
    this.canvas = canvas;
    const w = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.offsetHeight || window.innerHeight;
    this.clock = new THREE.Clock();

    this.renderer = makeRenderer(canvas, w, h, true);
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(70, w / h, 0.1, 200);
    this.camera.position.set(0, 0, 10);

    this._build();
    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _build() {
    /* Stars */
    this.stars = makeParticles(3000, 80, 0xffffff);
    this.stars.material.size = 0.06;
    this.stars.material.opacity = 0.8;
    this.scene.add(this.stars);

    /* Blue nebula particles */
    const neb = makeParticles(600, 25, 0x00d4ff);
    neb.material.size = 0.12;
    neb.material.opacity = 0.15;
    this.scene.add(neb);

    /* Orange nebula */
    const neb2 = makeParticles(400, 20, 0xff6b00);
    neb2.material.size = 0.1;
    neb2.material.opacity = 0.12;
    this.scene.add(neb2);

    /* Holographic rings */
    this.rings = [];
    const ringColors = [0x00d4ff, 0xff6b00, 0x8888ff];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.0 + i * 1.2, 0.025, 8, 80),
        new THREE.MeshBasicMaterial({ color: ringColors[i], transparent: true, opacity: 0.25 }),
      );
      ring.rotation.x = Math.PI / 2 + (i * 0.3);
      ring.rotation.y = i * 0.5;
      this.rings.push(ring);
      this.scene.add(ring);
    }

    /* Central orb */
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0x00d4ff,
        emissive: 0x00d4ff,
        emissiveIntensity: 1.2,
        metalness: 0.2,
        roughness: 0.05,
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.scene.add(orb);
    this.orb = orb;

    const ptLight = new THREE.PointLight(0x00d4ff, 6, 20);
    ptLight.position.set(0, 0, 0);
    this.scene.add(ptLight);
    this.ptLight = ptLight;

    this.scene.add(new THREE.AmbientLight(0x050510, 2));
  }

  _resize() {
    const el = this.canvas.parentElement;
    const w  = el ? el.clientWidth  : window.innerWidth;
    const h  = el ? el.clientHeight : window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const t = this.clock.getElapsedTime();

    this.rings.forEach((ring, i) => {
      ring.rotation.z = t * (0.15 + i * 0.06);
      ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.3 + i) * 0.3;
      ring.material.opacity = 0.15 + Math.sin(t * 1.2 + i) * 0.12;
    });

    this.orb.scale.setScalar(1 + Math.sin(t * 2.5) * 0.08);
    this.ptLight.intensity = 5 + Math.sin(t * 2.2) * 2;

    /* Star parallax with mouse */
    this.stars.rotation.y = mouse.nx * 0.05;
    this.stars.rotation.x = mouse.ny * 0.03;

    this.renderer.render(this.scene, this.camera);
  }
}

/* ══════════════════════════════════════════════════════════
   GALLERY BG SCENE (showroom background)
   ══════════════════════════════════════════════════════════ */
class GalleryBgScene {
  constructor(canvas) {
    this.canvas = canvas;
    const w = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.offsetHeight || window.innerHeight;
    this.clock = new THREE.Clock();

    this.renderer = makeRenderer(canvas, w, h, true);
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    this.camera.position.set(0, 2, 10);
    this.camera.lookAt(0, 0, 0);

    this._build();
    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _build() {
    this.scene.fog = new THREE.FogExp2(0x04040a, 0.05);
    this.scene.add(new THREE.AmbientLight(0x060618, 3));

    const dl = new THREE.DirectionalLight(0x0044aa, 1);
    dl.position.set(0, 8, 4);
    this.scene.add(dl);

    /* Floating pedestals */
    this.pedestals = [];
    const positions = [
      [-4.5, 0, -2], [0, 0, -2], [4.5, 0, -2],
      [-4.5, 0,  3], [0, 0,  3], [4.5, 0,  3],
    ];
    positions.forEach((pos, i) => {
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.1, 1.2),
        steelMat(0x1a1a28, 0.6, 0.5),
      );
      g.add(plinth);
      const pedGeo = new THREE.CylinderGeometry(0.08, 0.14, 0.5, 8);
      const ped = new THREE.Mesh(pedGeo, steelMat(0x333345, 0.3, 0.9));
      ped.position.y = -0.3;
      g.add(ped);

      /* Glow ring under platform */
      const gRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.02, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 }),
      );
      gRing.rotation.x = Math.PI / 2;
      gRing.position.y = -0.5;
      g.add(gRing);

      g.position.set(...pos);
      this.scene.add(g);
      this.pedestals.push({ group: g, gRing });
    });

    /* Grid floor */
    const grid = new THREE.GridHelper(30, 40, 0x001133, 0x001133);
    grid.position.y = -0.6;
    grid.material.opacity = 0.5;
    grid.material.transparent = true;
    this.scene.add(grid);

    /* Background particles */
    this.bgP = makeParticles(500, 20, 0x00d4ff);
    this.bgP.material.size = 0.03;
    this.bgP.material.opacity = 0.3;
    this.scene.add(this.bgP);
  }

  _resize() {
    const el = this.canvas.parentElement;
    const w  = el ? el.clientWidth  : window.innerWidth;
    const h  = el ? el.clientHeight : window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const t = this.clock.getElapsedTime();
    this.pedestals.forEach(({ group, gRing }, i) => {
      group.position.y = Math.sin(t * 0.6 + i * 1.1) * 0.08;
      gRing.material.opacity = 0.25 + Math.sin(t * 1.5 + i) * 0.15;
    });

    const pp = this.bgP.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      pp.setY(i, pp.getY(i) + 0.005);
      if (pp.getY(i) > 10) pp.setY(i, -10);
    }
    pp.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}

/* ══════════════════════════════════════════════════════════
   CURSOR
   ══════════════════════════════════════════════════════════ */
function initCursor() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  let rx = 0, ry = 0;

  document.addEventListener('mousemove', (e) => {
    const x = e.clientX, y = e.clientY;
    dot.style.left  = x + 'px';
    dot.style.top   = y + 'px';
    rx += (x - rx) * 0.14;
    ry += (y - ry) * 0.14;
  });

  function ringTick() {
    const tx = parseFloat(dot.style.left) || 0;
    const ty = parseFloat(dot.style.top)  || 0;
    rx += (tx - rx) * 0.14;
    ry += (ty - ry) * 0.14;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(ringTick);
  }
  ringTick();

  document.querySelectorAll('a, button, .proj-card, .sdot').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });
}

/* ══════════════════════════════════════════════════════════
   HERO NAME PARALLAX
   ══════════════════════════════════════════════════════════ */
function initNameParallax() {
  const rows = document.querySelectorAll('.name-row');
  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;
    rows.forEach(row => {
      const d = parseFloat(row.dataset.depth) || 0.04;
      row.style.transform = `translate(${dx * d * 60}px, ${dy * d * 30}px)`;
    });
  });
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATION
   ══════════════════════════════════════════════════════════ */
function notify(msg, duration = 3000) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION & SCROLL
   ══════════════════════════════════════════════════════════ */
function initNav() {
  const sections = ['hero', 'gallery', 'process', 'contact'];
  const dots     = document.querySelectorAll('.sdot');
  const links    = document.querySelectorAll('.nav-link');

  function setActive(id) {
    currentSection = id;
    dots.forEach(d => d.classList.toggle('active', d.dataset.s === id));
    links.forEach(l => l.classList.toggle('active', l.dataset.s === id));
  }

  dots.forEach(d => {
    d.addEventListener('click', () => {
      document.getElementById(d.dataset.s)?.scrollIntoView({ behavior: 'smooth' });
    });
  });
  links.forEach(l => {
    l.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector(l.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* Intersection Observer for active section */
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
  }, { threshold: 0.4 });
  sections.forEach(id => obs.observe(document.getElementById(id)));
}

/* ══════════════════════════════════════════════════════════
   SKILL BARS (animate on scroll)
   ══════════════════════════════════════════════════════════ */
function initSkillBars() {
  const fills = document.querySelectorAll('.sk-fill');
  const obs   = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.width = e.target.dataset.w + '%';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });
  fills.forEach(f => obs.observe(f));
}

/* ══════════════════════════════════════════════════════════
   STAT COUNTERS
   ══════════════════════════════════════════════════════════ */
function initCounters() {
  const els = document.querySelectorAll('.stat-n');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const target = parseInt(e.target.dataset.count, 10);
      let cur = 0;
      const step = Math.ceil(target / 40);
      const iv = setInterval(() => {
        cur = Math.min(cur + step, target);
        e.target.textContent = cur + (target > 10 ? '+' : '');
        if (cur >= target) clearInterval(iv);
      }, 40);
      obs.unobserve(e.target);
    });
  }, { threshold: 0.4 });
  els.forEach(el => obs.observe(el));
}

/* ══════════════════════════════════════════════════════════
   PIPELINE STEPS ANIMATION
   ══════════════════════════════════════════════════════════ */
function initPipeline() {
  const steps = document.querySelectorAll('.pipe-step');
  const obs   = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), parseInt(e.target.dataset.step) * 120);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });
  steps.forEach(s => obs.observe(s));
}

/* ══════════════════════════════════════════════════════════
   CONTACT FORM
   ══════════════════════════════════════════════════════════ */
function initContact() {
  const form = document.getElementById('contact-form');
  const out  = document.getElementById('term-out');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('cf-name').value.trim();
    const email = document.getElementById('cf-email').value.trim();
    if (!name || !email) { notify('⚠ Please fill name and email.'); return; }

    const line = document.createElement('div');
    line.className = 'term-line';
    line.innerHTML = `<span class="t-nv">[NV]</span>  Transmission received from <span class="t-hi">${name}</span>. Will respond to <span class="t-hi">${email}</span> shortly.`;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    form.reset();
    notify('✓ Message transmitted!');
  });
}

/* ══════════════════════════════════════════════════════════
   XR MODE
   ══════════════════════════════════════════════════════════ */
async function initXR(heroScene) {
  const btn1 = document.getElementById('btn-enter-xr');
  const btn2 = document.getElementById('btn-xr-nav');

  async function tryXR() {
    if (!navigator.xr) { notify('⚠ WebXR not supported in this browser.'); return; }
    const supported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    if (!supported) { notify('⚠ Immersive VR not available. Try a VR headset.'); return; }

    heroScene.renderer.xr.enabled = true;
    const session = await navigator.xr.requestSession('immersive-vr');
    heroScene.renderer.xr.setSession(session);
    notify('✓ Entering XR — put on your headset!');
    session.addEventListener('end', () => {
      heroScene.renderer.xr.enabled = false;
      notify('XR session ended.');
    });
  }

  [btn1, btn2].forEach(b => b?.addEventListener('click', tryXR));
}

/* ══════════════════════════════════════════════════════════
   LOADER
   ══════════════════════════════════════════════════════════ */
function drawLoaderGear() {
  const path = document.getElementById('gear-path');
  if (!path) return;
  const teeth = 10, R = 40, T = 12, r = 18;
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const a1 = a + step * 0.2, a2 = a + step * 0.3, a3 = a + step * 0.7, a4 = a + step * 0.8;
    const cmd = i === 0 ? 'M' : 'L';
    d += `${cmd}${50 + Math.cos(a) * R} ${50 + Math.sin(a) * R} `;
    d += `L${50 + Math.cos(a1) * R} ${50 + Math.sin(a1) * R} `;
    d += `L${50 + Math.cos(a2) * (R + T)} ${50 + Math.sin(a2) * (R + T)} `;
    d += `L${50 + Math.cos(a3) * (R + T)} ${50 + Math.sin(a3) * (R + T)} `;
    d += `L${50 + Math.cos(a4) * R} ${50 + Math.sin(a4) * R} `;
  }
  d += 'Z ';
  d += `M${50 + r} 50 A${r} ${r} 0 1 0 ${50 - r} 50 A${r} ${r} 0 1 0 ${50 + r} 50 Z`;
  path.setAttribute('d', d);
  path.setAttribute('fill-rule', 'evenodd');
}

function runLoader(onDone) {
  drawLoaderGear();
  const bar = document.getElementById('loader-bar');
  const pct = document.getElementById('loader-pct');
  let p = 0;
  const iv = setInterval(() => {
    p += Math.random() * 12 + 3;
    if (p >= 100) { p = 100; clearInterval(iv); setTimeout(onDone, 400); }
    bar.style.width = p + '%';
    pct.textContent = Math.floor(p) + '%';
  }, 80);
}

/* ══════════════════════════════════════════════════════════
   MAIN INIT
   ══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {

  /* Mouse tracking */
  document.addEventListener('mousemove', (e) => {
    mouse.x  = e.clientX;
    mouse.y  = e.clientY;
    mouse.nx = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.ny = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  runLoader(() => {
    document.getElementById('loader').classList.add('hidden');

    /* Init all scenes */
    const heroCanvas    = document.getElementById('hero-canvas');
    const galleryCanvas = document.getElementById('gallery-canvas');
    const processCanvas = document.getElementById('process-canvas');
    const contactCanvas = document.getElementById('contact-canvas');

    const heroScene    = new HeroScene(heroCanvas);
    const galleryBg    = new GalleryBgScene(galleryCanvas);
    const processScene = new ProcessScene(processCanvas);
    const contactScene = new ContactScene(contactCanvas);
    const galleryItems = new GalleryScenes();

    /* Unified animation loop */
    let raf;
    function loop() {
      raf = requestAnimationFrame(loop);
      const t = performance.now() * 0.001;
      heroScene.tick();
      galleryBg.tick();
      processScene.tick();
      contactScene.tick();
      galleryItems.tick(t);
    }
    loop();

    /* Init UI */
    initCursor();
    initNameParallax();
    initNav();
    initSkillBars();
    initCounters();
    initPipeline();
    initContact();
    initXR(heroScene);
  });
});
