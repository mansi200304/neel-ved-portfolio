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
function makeParticles(count, spread, color = 0xB07535) {
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
   ██  HERO SCENE — Warm Workspace + Scroll Camera  ██
   ══════════════════════════════════════════════════════════ */
class HeroScene {
  constructor(canvas) {
    this.canvas  = canvas;
    this.clock   = new THREE.Clock();
    this.w       = window.innerWidth;
    this.h       = window.innerHeight;

    /* Renderer — warm white clear */
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(this.w, this.h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xFDFAF5, 1);
    this.renderer.shadowMap.enabled = true;

    this.scene  = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xFDFAF5, 18, 38);

    this.camera = new THREE.PerspectiveCamera(52, this.w / this.h, 0.1, 80);

    /* Camera waypoints for scroll */
    this.cam = {
      pos:    new THREE.Vector3(0.3, 1.2, 3.0),
      target: new THREE.Vector3(0, 0.3, 0),
    };
    this.camTarget = new THREE.Vector3();
    this.camera.position.copy(this.cam.pos);

    this._buildLights();
    this._buildWorkspace();
    this._buildDripSystem();
    this._buildFloatingGears();
    this._buildDustParticles();
    this._setupScrollCamera();

    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _buildLights() {
    /* Warm ambient */
    this.scene.add(new THREE.AmbientLight(0xFFF5E8, 1.8));

    /* Key — warm gold from top-right */
    const key = new THREE.DirectionalLight(0xFFD4A0, 3.5);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    /* Fill — cool soft from left */
    const fill = new THREE.DirectionalLight(0xDCECFF, 1.2);
    fill.position.set(-6, 3, 2);
    this.scene.add(fill);

    /* Rim — warm orange from below-back */
    const rim = new THREE.DirectionalLight(0xFFAA55, 0.8);
    rim.position.set(0, -3, -5);
    this.scene.add(rim);

    /* Nozzle hot-spot (updates with drip) */
    this.nozzleLight = new THREE.PointLight(0xFFAA44, 2.5, 2.5);
    this.nozzleLight.position.set(0, 1.38, 0);
    this.scene.add(this.nozzleLight);
  }

  _buildWorkspace() {
    /* ─ Desk surface (warm wood) ─ */
    const deskMat = new THREE.MeshStandardMaterial({
      color: 0x9B7140, roughness: 0.82, metalness: 0.05,
    });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 5), deskMat);
    desk.position.set(0, -1.5, 0);
    desk.receiveShadow = true;
    this.scene.add(desk);

    /* Desk legs */
    const legMat = steelMat(0x7A5C35, 0.7, 0.1);
    [[-3.8, -2.3, -1.8], [3.8, -2.3, -1.8], [-3.8, -2.3, 1.8], [3.8, -2.3, 1.8]].forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), legMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      this.scene.add(leg);
    });

    /* ─ 3D Printer frame ─ */
    const frameMat = steelMat(0xC8C8D0, 0.35, 0.7);
    const darkMat  = steelMat(0x3A3A42, 0.5, 0.6);

    const printerGroup = new THREE.Group();

    /* Main frame posts */
    [[-.45, 0], [.45, 0]].forEach(([x]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.05), frameMat);
      post.position.set(x, 0, 0);
      post.castShadow = true;
      printerGroup.add(post);
    });
    /* Top crossbar */
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.05, 0.05), frameMat);
    topBar.position.y = 1.1;
    printerGroup.add(topBar);
    /* Base plate */
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.8), darkMat);
    basePlate.position.y = -1.1;
    basePlate.castShadow = true;
    printerGroup.add(basePlate);
    /* Build plate */
    const buildPlate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.6), steelMat(0x9898A8, 0.4, 0.8));
    buildPlate.position.set(0, -0.9, 0);
    printerGroup.add(buildPlate);
    this.buildPlateY = -0.9 + 0.02;

    /* Extruder carriage */
    const carriageMat = steelMat(0xA0A0B0, 0.3, 0.75);
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.14), carriageMat);
    carriage.position.set(0, 0.7, 0.05);
    printerGroup.add(carriage);

    /* Nozzle */
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.01, 0.18, 8),
      steelMat(0xE8C060, 0.2, 0.9),
    );
    nozzle.position.set(0, 0.6, 0.05);
    printerGroup.add(nozzle);
    this.nozzleWorldY = -1.5 + 0.6 + 0.01;  /* desk + printer offset + nozzle tip */

    /* Cooling fan */
    const fan = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), darkMat);
    fan.position.set(0.12, 0.7, 0.1);
    printerGroup.add(fan);

    /* Small display */
    const dispMat = new THREE.MeshStandardMaterial({ color: 0x446688, emissive: 0x223344, emissiveIntensity: 0.8 });
    const disp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.02), dispMat);
    disp.position.set(-0.35, -0.7, 0.42);
    printerGroup.add(disp);

    printerGroup.position.set(-0.4, -1.5 + 1.1, 0.2);
    this.scene.add(printerGroup);
    this.printerGroup = printerGroup;
    this.carriageMesh = carriage;

    /* ─ Monitor (to the right of printer) ─ */
    const monitorGroup = new THREE.Group();
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x334455, emissive: 0x1A3A5A, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.1,
    });
    const screenFrame = steelMat(0x2A2A2E, 0.5, 0.8);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.05), screenMat);
    monitorGroup.add(screen);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.04), screenFrame);
    bezel.position.z = -0.02;
    monitorGroup.add(bezel);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), screenFrame);
    stand.position.y = -0.7;
    monitorGroup.add(stand);
    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.25), screenFrame);
    standBase.position.y = -0.95;
    monitorGroup.add(standBase);
    monitorGroup.position.set(2.6, -0.8, -0.5);
    monitorGroup.rotation.y = -0.2;
    this.scene.add(monitorGroup);

    /* ─ Book stack ─ */
    const bookColors = [0xB44444, 0x4466AA, 0x55885A];
    bookColors.forEach((c, i) => {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.06 + i * 0.01, 0.4),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.0 }),
      );
      book.position.set(3.5, -1.42 + i * 0.07, 0.8);
      book.rotation.y = (i - 1) * 0.08;
      this.scene.add(book);
    });

    /* ─ Coffee mug ─ */
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xCCA85A, roughness: 0.7, metalness: 0.0 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.18, 16), mugMat);
    mug.position.set(1.8, -1.42, 0.9);
    this.scene.add(mug);
    /* Handle */
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 6, 12, Math.PI), mugMat);
    handle.position.set(1.88, -1.42, 0.9);
    handle.rotation.y = Math.PI / 2;
    this.scene.add(handle);

    /* ─ Floor / warm paper texture ─ */
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xF0E8D8, roughness: 1.0, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    /* ─ Back wall ─ */
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0xF8F3EB, roughness: 1.0 }));
    wall.position.set(0, 4, -8);
    this.scene.add(wall);
  }

  _buildDripSystem() {
    this.drips      = [];
    this.dripTimer  = 0;
    this.dripGeo    = new THREE.SphereGeometry(0.045, 7, 7);
    this.moltenMat  = new THREE.MeshStandardMaterial({
      color: 0xE8A040, emissive: 0xD07820, emissiveIntensity: 0.7,
      metalness: 0.2, roughness: 0.4,
    });
    this.settledMat = new THREE.MeshStandardMaterial({
      color: 0xA0A8B8, metalness: 0.65, roughness: 0.35,
    });
    /* Pre-settled drops forming a small gear-like layer on build plate */
    this.settledGroup = new THREE.Group();
    this.settledGroup.position.set(-0.4, -1.5 + 1.1 - 0.9 + 0.02 + 0.045, 0.2);
    this.scene.add(this.settledGroup);
  }

  _buildFloatingGears() {
    const gearMat = new THREE.MeshStandardMaterial({
      color: 0xC8A050, roughness: 0.35, metalness: 0.85,
    });
    this.floatingGears = [];
    const configs = [
      { r: 0.5, t: 8, d: 0.1, pos: [3.2, 0.4, -1.2], speed: 0.18 },
      { r: 0.32, t: 6, d: 0.08, pos: [3.8, 0.9, -0.9], speed: -0.28 },
      { r: 0.22, t: 5, d: 0.06, pos: [-3.0, 1.1, -0.8], speed: 0.35 },
    ];
    configs.forEach(cfg => {
      const geo = buildGear(cfg.r, cfg.r * 0.18, cfg.d, cfg.t, cfg.r * 0.3);
      geo.center();
      const mesh = new THREE.Mesh(geo, gearMat);
      mesh.position.set(...cfg.pos);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.floatingGears.push({ mesh, speed: cfg.speed, baseY: cfg.pos[1] });
    });
  }

  _buildDustParticles() {
    const count = 600;
    const pos   = new Float32Array(count * 3);
    const spd   = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      spd[i]         = Math.random() * 0.3 + 0.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.userData.speeds = spd;
    const mat = new THREE.PointsMaterial({
      color: 0xC8A060, size: 0.025, transparent: true, opacity: 0.45, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  _setupScrollCamera() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    /* Waypoints: [posX, posY, posZ,  lookX, lookY, lookZ] */
    const WP = [
      [0.3,  1.0, 3.0,   0,   0.2, 0],
      [1.8,  2.2, 7.5,   0,  -0.3, 0],
      [0.0,  5.5, 14.0,  0,  -1.5, 0],
    ];

    this.scrollProg = { t: 0 };

    ScrollTrigger.create({
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1.8,
      onUpdate: (self) => {
        this.scrollProg.t = self.progress;
      },
    });

    this._wp = WP;
  }

  _lerp(a, b, t) { return a + (b - a) * t; }

  _applyScrollCamera(t) {
    if (!this._wp) return;
    const WP = this._wp;
    const seg = t < 0.5 ? 0 : 1;
    const lt  = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const w0  = WP[seg], w1 = WP[seg + 1];
    const ease = lt * lt * (3 - 2 * lt);

    this.cam.pos.set(
      this._lerp(w0[0], w1[0], ease),
      this._lerp(w0[1], w1[1], ease),
      this._lerp(w0[2], w1[2], ease),
    );
    this.cam.target.set(
      this._lerp(w0[3], w1[3], ease),
      this._lerp(w0[4], w1[4], ease),
      this._lerp(w0[5], w1[5], ease),
    );
  }

  _resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setSize(this.w, this.h);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const t  = this.clock.getElapsedTime();
    const dt = this.clock.getDelta ? 0.016 : 0.016;

    /* ── Scroll camera ── */
    const sp = this.scrollProg ? this.scrollProg.t : 0;
    this._applyScrollCamera(sp);

    /* Smooth camera to target */
    this.camera.position.lerp(this.cam.pos, 0.06);
    this.camTarget.lerp(this.cam.target, 0.06);

    /* Mouse parallax (subtle, only on x/y, scaled by inverse scroll) */
    const parallaxScale = Math.max(0, 1 - sp * 2);
    this.camera.position.x += (mouse.nx * 0.6 * parallaxScale - 0) * 0.03;
    this.camera.position.y += (mouse.ny * 0.4 * parallaxScale - 0) * 0.03;
    this.camera.lookAt(this.camTarget);

    /* ── Drip system ── */
    this.dripTimer += 0.016;
    if (this.dripTimer > 0.38 && this.drips.length < 28) {
      this.dripTimer = 0;
      const mesh = new THREE.Mesh(this.dripGeo, this.moltenMat.clone());
      mesh.position.set(-0.4, -1.5 + 1.1 + 0.61, 0.2);
      mesh.castShadow = true;
      mesh.userData.vy = 0;
      this.scene.add(mesh);
      this.drips.push(mesh);
    }
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      if (d.userData.settled) {
        /* Fade emissive to settled over 2s */
        if (d.material.emissiveIntensity > 0) {
          d.material.emissiveIntensity -= 0.008;
        }
        continue;
      }
      d.userData.vy -= 5 * 0.016;
      d.position.y  += d.userData.vy * 0.016;
      const groundY = this.buildPlateY - 1.5 + 1.1 + 0.045;
      if (d.position.y <= groundY) {
        d.position.y   = groundY;
        d.userData.settled = true;
        d.scale.set(1.6, 0.35, 1.6);
        d.material = this.settledMat.clone();
        d.material.emissiveIntensity = 0;
        /* Glow burst on landing */
        this.nozzleLight.intensity = 5.0;
      }
    }

    /* Nozzle glow pulse + settle fade */
    const nGlow = 2.0 + Math.sin(t * 4) * 0.5;
    this.nozzleLight.intensity += (nGlow - this.nozzleLight.intensity) * 0.08;

    /* ── Floating gears ── */
    this.floatingGears.forEach((g, i) => {
      g.mesh.rotation.z += g.speed * 0.016;
      g.mesh.position.y = g.baseY + Math.sin(t * 0.6 + i * 1.2) * 0.08;
    });

    /* ── Dust particles ── */
    const dPos = this.dust.geometry.attributes.position;
    const spds = this.dust.geometry.userData.speeds;
    for (let i = 0; i < dPos.count; i++) {
      dPos.setY(i, dPos.getY(i) + 0.003 * spds[i]);
      dPos.setX(i, dPos.getX(i) + Math.sin(t * 0.2 + i) * 0.0008);
      if (dPos.getY(i) > 5)  dPos.setY(i, -5);
      if (dPos.getY(i) < -5) dPos.setY(i, 5);
    }
    dPos.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}

/* ══════════════════════════════════════════════════════════
   ██  GALLERY PROJECT CANVASES  ██
   ══════════════════════════════════════════════════════════ */
function buildProjectScene(idx) {
  const bgColors = [0xF5EFE4, 0xEFF5E4, 0xF0EAF8, 0xF8F0E4, 0xE4EFF5, 0xF8EAE4];
  const accents  = [0xB07535, 0x5A8844, 0x8844CC, 0xC07020, 0x2288BB, 0xCC3344];
  const scene    = new THREE.Scene();
  scene.background = new THREE.Color(bgColors[idx]);
  scene.fog = new THREE.FogExp2(bgColors[idx], 0.1);

  const light1 = new THREE.DirectionalLight(0xFFD4A0, 3.5);
  light1.position.set(2, 4, 3);
  scene.add(light1);
  scene.add(new THREE.AmbientLight(0xFFF5E8, 1.2));

  const pt = new THREE.PointLight(accents[idx], 3, 6);
  pt.position.set(0, 1, 2);
  scene.add(pt);

  const STEEL = steelMat(0xB0A898, 0.4, 0.7);
  const ACCENT = new THREE.MeshStandardMaterial({
    color: accents[idx], emissive: accents[idx], emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.2,
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
    const flr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.4), steelMat(0xD0C8B8, 0.9, 0.1));
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
      new THREE.MeshBasicMaterial({ color: 0xB07535, wireframe: true, opacity: 0.35, transparent: true }),
    );
    this.scene.add(this.wireFrame);

    /* Solid version */
    this.solid = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xD4C0A0,
        roughness: 0.3,
        metalness: 0.7,
        opacity: 0,
        transparent: true,
      }),
    );
    this.scene.add(this.solid);

    /* Lights */
    const dl = new THREE.DirectionalLight(0xFFD4A0, 2.5);
    dl.position.set(3, 5, 3);
    this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xC94C18, 1.2);
    dl2.position.set(-4, -3, 2);
    this.scene.add(dl2);
    this.scene.add(new THREE.AmbientLight(0xFFF5E8, 2.5));

    /* Background particles */
    this.bgParticles = makeParticles(800, 20, 0xB07535);
    this.bgParticles.material.size = 0.03;
    this.scene.add(this.bgParticles);

    /* Grid lines */
    const grid = new THREE.GridHelper(30, 40, 0xD4C4A0, 0xE8DCC8);
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
    const neb = makeParticles(600, 25, 0xB07535);
    neb.material.size = 0.12;
    neb.material.opacity = 0.15;
    this.scene.add(neb);

    /* Orange nebula */
    const neb2 = makeParticles(400, 20, 0xC94C18);
    neb2.material.size = 0.1;
    neb2.material.opacity = 0.12;
    this.scene.add(neb2);

    /* Holographic rings */
    this.rings = [];
    const ringColors = [0xB07535, 0xC94C18, 0x8888ff];
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
        color: 0xB07535,
        emissive: 0xB07535,
        emissiveIntensity: 1.2,
        metalness: 0.2,
        roughness: 0.05,
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.scene.add(orb);
    this.orb = orb;

    const ptLight = new THREE.PointLight(0xB07535, 6, 20);
    ptLight.position.set(0, 0, 0);
    this.scene.add(ptLight);
    this.ptLight = ptLight;

    this.scene.add(new THREE.AmbientLight(0xFFF5E8, 2));
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
    this.scene.fog = new THREE.FogExp2(0xF3EDE1, 0.04);
    this.scene.add(new THREE.AmbientLight(0xFFF5E8, 2.5));

    const dl = new THREE.DirectionalLight(0xFFD4A0, 2.5);
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
        steelMat(0xD8CDB8, 0.6, 0.2),
      );
      g.add(plinth);
      const pedGeo = new THREE.CylinderGeometry(0.08, 0.14, 0.5, 8);
      const ped = new THREE.Mesh(pedGeo, steelMat(0xC0B090, 0.4, 0.4));
      ped.position.y = -0.3;
      g.add(ped);

      /* Glow ring under platform */
      const gRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.02, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0xB07535, transparent: true, opacity: 0.4 }),
      );
      gRing.rotation.x = Math.PI / 2;
      gRing.position.y = -0.5;
      g.add(gRing);

      g.position.set(...pos);
      this.scene.add(g);
      this.pedestals.push({ group: g, gRing });
    });

    /* Grid floor */
    const grid = new THREE.GridHelper(30, 40, 0xD4C4A0, 0xE8DCC8);
    grid.position.y = -0.6;
    grid.material.opacity = 0.5;
    grid.material.transparent = true;
    this.scene.add(grid);

    /* Background particles */
    this.bgP = makeParticles(500, 20, 0xB07535);
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
