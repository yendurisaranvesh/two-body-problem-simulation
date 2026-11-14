/* ==========================================================================
   SceneRenderer.js — everything Three.js.

   Reads physics state (positions/velocities/diagnostics); never writes it.
   ========================================================================== */
(function (TBS) {
  'use strict';
  const C = TBS.COLORS;

  /* ======================================================= body factory */
  const ATMO_VS = `
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const ATMO_FS = `
    uniform vec3 color; uniform float power; uniform float strength; uniform float opacity;
    varying vec3 vN; varying vec3 vV;
    void main(){
      float f = pow(clamp(0.72 + dot(vN, vV), 0.0, 1.0), power);
      gl_FragColor = vec4(color * f * strength, f * opacity);
    }`;

  TBS.BodyFactory = {
    /** @returns THREE.Group with .userData {core, atmo, glow} — unit radius, scale the group. */
    create(kind) {
      const color = kind === 'cyan' ? C.cyan : C.amber;
      const deep = kind === 'cyan' ? C.cyanDeep : C.amberDeep;
      const group = new THREE.Group();

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshStandardMaterial({
          map: TBS.Textures.surface(kind), roughness: 0.62, metalness: 0.05,
          emissive: new THREE.Color(deep), emissiveIntensity: 0.32,
        }));
      core.castShadow = true;
      core.rotation.z = kind === 'cyan' ? 0.35 : -0.2;
      group.add(core);

      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(1.22, 48, 32),
        new THREE.ShaderMaterial({
          vertexShader: ATMO_VS, fragmentShader: ATMO_FS, side: THREE.BackSide,
          blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
          uniforms: { color: { value: new THREE.Color(color) }, power: { value: 3.2 }, strength: { value: 1.6 }, opacity: { value: 1 } },
        }));
      group.add(atmo);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TBS.Textures.glow(), color, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, opacity: 0.55,
      }));
      glow.scale.set(6, 6, 1);
      group.add(glow);

      group.userData = { core, atmo, glow, kind, color };
      return group;
    },
  };

  /* ===================================================== particle pool */
  class Particles {
    constructor(scene, max = 1500) {
      this.max = max; this.n = 0;
      this.pos = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.vel = new Float32Array(max * 3);
      this.life = new Float32Array(max);
      this.maxLife = new Float32Array(max);
      this.base = new Float32Array(max * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.mat = new THREE.PointsMaterial({
        size: 0.6, map: TBS.Textures.dot(), vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.geo = g;
      scene.add(this.points);
    }
    emit(p, v, color, life) {
      let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color(color);
      this.base.set([c.r, c.g, c.b], i * 3);
      this.life[i] = this.maxLife[i] = life;
    }
    burst(p, color, count, speed, life = 1.2) {
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2, up = Math.random() * 0.5;
        const s = speed * (0.4 + Math.random() * 0.8);
        this.emit(p, { x: Math.cos(a) * s, y: up * s, z: Math.sin(a) * s }, color, life * (0.6 + Math.random() * 0.6));
      }
    }
    update(dt) {
      for (let i = 0; i < this.n; i++) {
        if (this.life[i] <= 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
        this.life[i] -= dt;
        const k = Math.max(0, this.life[i] / this.maxLife[i]);
        const drag = Math.exp(-1.8 * dt);
        for (let j = 0; j < 3; j++) {
          this.vel[i * 3 + j] *= drag;
          this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt;
          this.col[i * 3 + j] = this.base[i * 3 + j] * k * k;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.setDrawRange(0, this.n);
    }
    clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  }

  /* ============================================================ trail */
  class Trail {
    constructor(scene, color, capacity = 6000) {
      this.cap = capacity; this.len = 0; this.maxLen = 1800;
      this.pos = new Float32Array(capacity * 3);
      this.col = new Float32Array(capacity * 3);
      this.color = new THREE.Color(color);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.line = new THREE.Line(g, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.line.frustumCulled = false;
      this.geo = g;
      scene.add(this.line);
    }
    push(p) {
      if (this.len >= this.maxLen) {
        const drop = this.len - this.maxLen + 1;
        this.pos.copyWithin(0, drop * 3, this.len * 3);
        this.len -= drop;
      }
      this.pos[this.len * 3] = p.x; this.pos[this.len * 3 + 1] = p.y; this.pos[this.len * 3 + 2] = p.z;
      this.len++;
      this.dirty = true;
    }
    last() { return this.len ? { x: this.pos[this.len * 3 - 3], y: this.pos[this.len * 3 - 2], z: this.pos[this.len * 3 - 1] } : null; }
    refresh() {
      if (!this.dirty) return;
      const n = this.len, c = this.color;
      for (let i = 0; i < n; i++) {
        const t = Math.pow((i + 1) / n, 1.6) * 0.95;
        this.col[i * 3] = c.r * t; this.col[i * 3 + 1] = c.g * t; this.col[i * 3 + 2] = c.b * t;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.setDrawRange(0, n);
      this.dirty = false;
    }
    clear() { this.len = 0; this.geo.setDrawRange(0, 0); }
    setMax(n) { this.maxLen = Math.min(this.cap, n); }
  }

  /* ===================================================== gravity grid */
  class WellGrid {
    constructor(scene) {
      this.N = 64;           // lines per direction
      this.SEG = 128;        // segments per line
      const nv = 2 * (this.N + 1) * (this.SEG + 1);
      this.pos = new Float32Array(nv * 3);
      this.col = new Float32Array(nv * 3);
      const idx = [];
      for (let l = 0; l < 2 * (this.N + 1); l++) {
        const o = l * (this.SEG + 1);
        for (let s = 0; s < this.SEG; s++) idx.push(o + s, o + s + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(idx);
      this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1 });
      this.mesh = new THREE.LineSegments(g, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 1;
      this.geo = g;
      scene.add(this.mesh);
      this.ripples = [];
      this.c1 = new THREE.Color(C.cyan); this.c2 = new THREE.Color(C.amber);
      this.base = new THREE.Color(0x3a5a9a);
    }
    configure(S, y0) { this.S = S; this.size = S * 5; this.y0 = y0; this.cell = this.size / this.N; }
    addRipple(x, z, amp) { this.ripples.push({ x, z, t: 0, amp }); }

    /** wells: [{x,z,w,c}] ; origin: grid centre (snapped). */
    update(dt, wells, center, deform, fade) {
      const { N, SEG, size, y0, S } = this;
      const half = size / 2;
      const cx = Math.round(center.x / this.cell) * this.cell;
      const cz = Math.round(center.z / this.cell) * this.cell;
      this.ripples.forEach((r) => (r.t += dt));
      this.ripples = this.ripples.filter((r) => r.t < 3.2);
      const speed = S * 1.1, k = 2 * Math.PI / (S * 0.35);
      const A = 0.035 * S;
      let vi = 0;
      for (let dir = 0; dir < 2; dir++) {
        for (let l = 0; l <= N; l++) {
          const fixed = -half + (l / N) * size;
          for (let s = 0; s <= SEG; s++) {
            const run = -half + (s / SEG) * size;
            const x = cx + (dir === 0 ? run : fixed);
            const z = cz + (dir === 0 ? fixed : run);
            let y = 0, w1 = 0, w2 = 0;
            if (deform) {
              for (let i = 0; i < wells.length; i++) {
                const wv = wells[i];
                const dx = x - wv.x, dz = z - wv.z;
                const d = Math.sqrt(dx * dx + dz * dz + wv.c * wv.c);
                const v = wv.w * S / d;
                y -= A * v;
                if (i === 0) w1 = v; else w2 = v;
              }
            }
            for (const r of this.ripples) {
              const dx = x - r.x, dz = z - r.z;
              const d = Math.sqrt(dx * dx + dz * dz);
              const front = speed * r.t;
              const env = Math.exp(-Math.pow((d - front) / (S * 0.18), 2)) * Math.exp(-r.t * 1.3);
              y += r.amp * S * 0.05 * env * Math.sin(k * (d - front));
            }
            this.pos[vi * 3] = x; this.pos[vi * 3 + 1] = y0 + y; this.pos[vi * 3 + 2] = z;
            // colour: base, warmed/cooled by proximity to wells, faded at the rim
            const rr = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) / half;
            const edge = Math.max(0, 1 - rr * rr) * fade;
            const major = (l % 8 === 0) ? 1.6 : 1;
            const b = 0.24 * major;
            const h1 = Math.min(1, w1 * 0.12), h2 = Math.min(1, w2 * 0.12);
            this.col[vi * 3] = (this.base.r * b + this.c1.r * h1 + this.c2.r * h2) * edge;
            this.col[vi * 3 + 1] = (this.base.g * b + this.c1.g * h1 + this.c2.g * h2) * edge;
            this.col[vi * 3 + 2] = (this.base.b * b + this.c1.b * h1 + this.c2.b * h2) * edge;
            vi++;
          }
        }
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  /* ===================================================== main renderer */
  class SceneRenderer {
    constructor(container) {
      this.container = container;
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      r.setSize(window.innerWidth, window.innerHeight);
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.1;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(r.domElement);

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x03050b);
      this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 20000);
      this.rig = new TBS.CameraRig(this.camera, r.domElement);

      this.opts = { trails: true, conic: false, vel: true, force: false, com: true, line: false, well: true, labels: true, follow: true };
      this.camMode = 'orbit';
      this.gridFade = 1;
      this.clock = 0;

      this._buildEnvironment();
      this._buildBodies();
      this._buildOverlays();
      this.particles = new Particles(this.scene);

      window.addEventListener('resize', () => this.resize());
    }

    /* ----------------------------------------------------- environment */
    _buildEnvironment() {
      const s = this.scene;
      s.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a0f05, 0.35));
      const key = this.key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(30, 100, 40);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0005;
      key.shadow.radius = 4;
      s.add(key); s.add(key.target);

      // shadow-catcher
      this.shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }));
      this.shadowPlane.renderOrder = 2;   // drawn after the grid so shadows darken it
      this.shadowPlane.rotation.x = -Math.PI / 2;
      this.shadowPlane.receiveShadow = true;
      s.add(this.shadowPlane);

      // starfield (3 layers of colour)
      const starGeo = new THREE.BufferGeometry();
      const n = 5000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
      const tints = [[1, 1, 1], [0.7, 0.85, 1], [1, 0.85, 0.65], [0.6, 1, 1]];
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 6000 + Math.random() * 4000;
        const q = Math.sqrt(1 - u * u);
        p.set([rr * q * Math.cos(th), rr * u, rr * q * Math.sin(th)], i * 3);
        const t = tints[i % 4], b = 0.25 + Math.pow(Math.random(), 4) * 1.2;
        c.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      starGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 2.2, sizeAttenuation: false, vertexColors: true, map: TBS.Textures.dot(),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.add(this.stars);

      // nebula dome
      const dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec3 vP;
          void main(){
            float a = pow(max(0.0, dot(vP, normalize(vec3(-0.6,0.25,-0.7)))), 3.0);
            float b = pow(max(0.0, dot(vP, normalize(vec3(0.7,-0.1,0.6)))), 4.0);
            vec3 col = vec3(0.012,0.02,0.045) + vec3(0.0,0.10,0.14)*a + vec3(0.16,0.07,0.0)*b;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }));
      s.add(dome);

      this.grid = new WellGrid(s);
    }

    _buildBodies() {
      this.b1 = TBS.BodyFactory.create('cyan');
      this.b2 = TBS.BodyFactory.create('amber');
      this.scene.add(this.b1, this.b2);
      // each body faintly lights the other with its colour
      this.l1 = new THREE.PointLight(C.cyan, 0.9, 0, 2); this.b1.add(this.l1);
      this.l2 = new THREE.PointLight(C.amber, 0.9, 0, 2); this.b2.add(this.l2);
      this.trail1 = new Trail(this.scene, C.cyan);
      this.trail2 = new Trail(this.scene, C.amber);
    }

    _buildOverlays() {
      const s = this.scene;
      const mkArrow = (color) => { const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, 0.3, 0.15); a.line.material.transparent = true; s.add(a); return a; };
      this.vel1 = mkArrow(0x9ff6ff); this.vel2 = mkArrow(0xffe1a3);
      this.f1 = mkArrow(0xff5d73); this.f2 = mkArrow(0xff5d73);

      // COM crosshair
      const com = this.com = new THREE.Group();
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((d) => {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-d[0], -d[1], -d[2]), new THREE.Vector3(d[0], d[1], d[2])]);
        com.add(new THREE.Line(g, mat));
      });
      const comGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TBS.Textures.ring(), color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      comGlow.scale.set(2.4, 2.4, 1); com.add(comGlow); this.comGlow = comGlow;
      s.add(com);

      // connecting line
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
      this.link = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1, gapSize: 0.7, transparent: true, opacity: 0.35 }));
      s.add(this.link);

      // predicted conics
      const mkConic = (color) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(260 * 3), 3));
        const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.55 }));
        l.frustumCulled = false; s.add(l); return l;
      };
      this.conic1 = mkConic(C.cyan); this.conic2 = mkConic(C.amber);

      // ripple rings pool
      this.rings = [];
    }

    /* -------------------------------------------- (re)configure for system */
    configure(system) {
      const p = system.params;
      this.system = system;
      const D = system.diagnostics();
      // characteristic scene scale
      let S = p.separation;
      if (D.bound && isFinite(D.rApo)) S = Math.max(S, Math.min(D.rApo, 6 * p.separation));
      this.S = S;
      this.b1.scale.setScalar(p.R1);
      this.b2.scale.setScalar(p.R2);
      // keep glow visible even for tiny radii at large scale
      const glowFor = (R) => Math.max(5.5, (S * 0.06) / R);
      this.b1.userData.glow.scale.setScalar(glowFor(p.R1));
      this.b2.userData.glow.scale.setScalar(glowFor(p.R2));

      const inc = (p.inclination || 0) * Math.PI / 180;
      this.gridY = -S * (0.32 + 1.0 * Math.sin(inc)) - Math.max(p.R1, p.R2) * 1.2;
      this.grid.configure(S, this.gridY);
      this.shadowPlane.position.y = this.gridY + 0.01;
      this.shadowPlane.scale.set(S * 8, S * 8, 1);
      const sc = this.key.shadow.camera;
      sc.left = sc.bottom = -S * 2.2; sc.right = sc.top = S * 2.2; sc.near = 1; sc.far = S * 8 + 200;
      sc.updateProjectionMatrix();

      this.particles.mat.size = Math.max(0.35, S * 0.02);
      this.com.scale.setScalar(Math.max(0.6, S * 0.03));
      this.link.material.dashSize = S * 0.03; this.link.material.gapSize = S * 0.02;
      [this.conic1, this.conic2].forEach((c) => { c.material.dashSize = S * 0.025; c.material.gapSize = S * 0.02; });

      // vector scales (relative to initial values so they read well)
      const vRef = Math.max(D.speed1, D.speed2, 1e-6);
      this.velScale = (S * 0.28) / vRef;
      this.forceScale = (S * 0.22) / Math.max(D.force, 1e-12);

      this.rig.minRadius = Math.max(p.R1, p.R2) * 2;
      this.rig.maxRadius = S * 40;
      this.clearTrails();
      this.homeView = { radius: S * 2.6, theta: 0.55, phi: 1.02 };
    }

    clearTrails() { this.trail1.clear(); this.trail2.clear(); }
    setTrailLength(n) { this.trail1.setMax(n); this.trail2.setMax(n); }

    setCamera(mode) {
      this.camMode = mode;
      const S = this.S;
      this.rig.enabled = !(mode === 'b1' || mode === 'b2');
      if (mode === 'top') this.rig.set({ phi: 0.06, radius: S * 3 });
      if (mode === 'side') this.rig.set({ phi: Math.PI / 2 - 0.02, radius: S * 2.8 });
      if (mode === 'orbit') this.rig.set(this.homeView);
    }

    /* ----------------------------------------------- visual positioning */
    placeBodies(p1, p2) {
      this.b1.position.set(p1.x, p1.y, p1.z);
      this.b2.position.set(p2.x, p2.y, p2.z);
    }

    /** Called every frame from main with the CURRENT physics state. */
    sync(system, D, recordTrail) {
      const [a, b] = system.bodies;
      this.placeBodies(a.pos, b.pos);
      const S = this.S;
      if (recordTrail) {
        const th = S * 0.0025;
        const add = (trail, p) => {
          const l = trail.last();
          if (!l || Math.hypot(l.x - p.x, l.y - p.y, l.z - p.z) > th) trail.push(p);
        };
        add(this.trail1, a.pos); add(this.trail2, b.pos);
      }
      this.trail1.refresh(); this.trail2.refresh();
      this.trail1.line.visible = this.trail2.line.visible = this.opts.trails;

      // vectors — length ∝ magnitude, soft-capped so huge values stay on screen
      const cap = S * 0.55;
      const setArrow = (arr, origin, vec, scale, show, minR) => {
        arr.visible = show;
        if (!show) return;
        const v = new THREE.Vector3(vec.x, vec.y, vec.z);
        const raw = v.length() * scale;
        if (raw < 1e-6) { arr.visible = false; return; }
        const len = cap * (1 - Math.exp(-raw / cap));
        arr.position.set(origin.x, origin.y, origin.z);
        arr.setDirection(v.normalize());
        const L = len + minR;
        arr.setLength(L, Math.min(L * 0.3, S * 0.05), Math.min(L * 0.15, S * 0.025));
      };
      setArrow(this.vel1, a.pos, a.vel, this.velScale, this.opts.vel, a.R);
      setArrow(this.vel2, b.pos, b.vel, this.velScale, this.opts.vel, b.R);
      const F1 = { x: a.acc.x * a.m, y: a.acc.y * a.m, z: a.acc.z * a.m };
      const F2 = { x: b.acc.x * b.m, y: b.acc.y * b.m, z: b.acc.z * b.m };
      setArrow(this.f1, a.pos, F1, this.forceScale, this.opts.force, a.R);
      setArrow(this.f2, b.pos, F2, this.forceScale, this.opts.force, b.R);

      // COM
      this.com.visible = this.opts.com;
      this.com.position.set(D.com.x, D.com.y, D.com.z);

      // link
      this.link.visible = this.opts.line;
      if (this.opts.line) {
        const arr = this.link.geometry.attributes.position.array;
        arr.set([a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z]);
        this.link.geometry.attributes.position.needsUpdate = true;
        this.link.computeLineDistances();
      }

      // predicted Kepler conic for each body around the COM
      this.conic1.visible = this.conic2.visible = this.opts.conic;
      if (this.opts.conic) {
        const pts = system.conicPoints(256, D);
        const M = a.m + b.m, k1 = -b.m / M, k2 = a.m / M;
        const fill = (line, k) => {
          const arr = line.geometry.attributes.position.array;
          const n = Math.min(pts.length, 259);
          for (let i = 0; i < n; i++) {
            arr[i * 3] = D.com.x + pts[i].x * k; arr[i * 3 + 1] = D.com.y + pts[i].y * k; arr[i * 3 + 2] = D.com.z + pts[i].z * k;
          }
          if (D.e < 1 && n > 0) { arr[n * 3] = arr[0]; arr[n * 3 + 1] = arr[1]; arr[n * 3 + 2] = arr[2]; }
          line.geometry.setDrawRange(0, D.e < 1 ? n + 1 : n);
          line.geometry.attributes.position.needsUpdate = true;
          line.computeLineDistances();
        };
        fill(this.conic1, k1); fill(this.conic2, k2);
      }

      // camera follow
      if (this.opts.follow && this.rig.enabled) {
        this.rig.goal.target.set(D.com.x, D.com.y, D.com.z);
        // escaping bodies: widen the view so both stay in frame
        if (!D.bound) this.rig.goal.radius = Math.max(this.rig.goal.radius, D.separation * 1.7);
      }
      this._rideCam(a, b);
    }

    _rideCam(a, b) {
      if (this.camMode !== 'b1' && this.camMode !== 'b2') return;
      const me = this.camMode === 'b1' ? a : b, other = this.camMode === 'b1' ? b : a;
      const p = new THREE.Vector3(me.pos.x, me.pos.y, me.pos.z);
      const o = new THREE.Vector3(other.pos.x, other.pos.y, other.pos.z);
      const back = p.clone().sub(o).normalize();
      const want = p.clone().addScaledVector(back, me.R * 4 + this.S * 0.12).add(new THREE.Vector3(0, me.R * 2 + this.S * 0.06, 0));
      this.camera.position.lerp(want, 0.15);
      this.camera.lookAt(o);
    }

    ripple(pos, color, strength = 1) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: TBS.Textures.ring(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, pos.y, pos.z);
      this.scene.add(m);
      this.rings.push({ m, t: 0, max: this.S * 0.45 * strength });
      // second, softer ring on the grid
      const m2 = m.clone(); m2.material = m.material.clone(); m2.position.y = this.gridY + 0.05;
      this.scene.add(m2);
      this.rings.push({ m: m2, t: -0.08, max: this.S * 0.8 * strength });
      this.grid.addRipple(pos.x, pos.z, strength);
    }

    worldToScreen(v) {
      const p = new THREE.Vector3(v.x, v.y, v.z).project(this.camera);
      return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 && p.z > -1 };
    }

    resize() {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /** Per-frame visuals that don't depend on physics (spin, rings, grid, particles). */
    render(dt) {
      this.clock += dt;
      this.b1.userData.core.rotation.y += dt * 0.35;
      this.b2.userData.core.rotation.y += dt * 0.22;
      const pulse = 1 + Math.sin(this.clock * 2.4) * 0.03;
      this.b1.userData.glow.material.opacity = 0.55 * pulse;
      this.b2.userData.glow.material.opacity = 0.55 * (2 - pulse);
      this.comGlow.material.opacity = 0.35 + 0.25 * Math.sin(this.clock * 3);

      // rings
      for (const r of this.rings) {
        r.t += dt;
        const k = Math.max(0, r.t) / 1.6;
        const s = 0.01 + r.max * (1 - Math.pow(1 - Math.min(k, 1), 3));
        r.m.scale.set(s, s, 1);
        r.m.material.opacity = Math.max(0, 1 - k) * (r.t < 0 ? 0 : 1);
      }
      this.rings = this.rings.filter((r) => {
        if (r.t > 1.6) { this.scene.remove(r.m); r.m.material.dispose(); return false; }
        return true;
      });

      // grid
      this.grid.mesh.visible = this.gridFade > 0.001;
      if (this.grid.mesh.visible && this.S) {
        let wells = [];
        if (this.system && this.b1.visible) {
          const [a, b] = [this.b1.position, this.b2.position];
          const p = this.system.params, M = p.m1 + p.m2;
          wells = [
            { x: a.x, z: a.z, w: p.m1 / M, c: Math.max(p.R1 * 1.6, this.S * 0.05) },
            { x: b.x, z: b.z, w: p.m2 / M, c: Math.max(p.R2 * 1.6, this.S * 0.05) },
          ];
        }
        const center = this.opts.follow ? this.rig.cur.target : { x: 0, z: 0 };
        this.grid.update(dt, wells, center, this.opts.well && this.wellOn !== false, this.gridFade);
      }
      // keep shadow light over the action
      const t = this.rig.cur.target;
      this.key.position.set(t.x + this.S * 0.3, t.y + this.S * 3, t.z + this.S * 0.4);
      this.key.target.position.set(t.x, t.y, t.z);
      this.shadowPlane.position.x = t.x; this.shadowPlane.position.z = t.z;

      this.particles.update(dt);
      if (this.rig.enabled) this.rig.update(dt);
      this.renderer.render(this.scene, this.camera);
    }
  }

  TBS.SceneRenderer = SceneRenderer;
})(window.TBS = window.TBS || {});
