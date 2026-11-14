/* ==========================================================================
   BodyPreview.js — small rotating 3D preview of a body on the config screen.
   Visual size follows RADIUS only (mass is shown numerically).
   ========================================================================== */
(function (TBS) {
  'use strict';

  class BodyPreview {
    constructor(container, kind) {
      this.el = container;
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      container.appendChild(r.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      this.camera.position.set(0, 1.2, 9);
      this.camera.lookAt(0, 0, 0);
      this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x140a04, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(-4, 3, 5); this.scene.add(key);
      const rim = new THREE.PointLight(kind === 'cyan' ? TBS.COLORS.amber : TBS.COLORS.cyan, 1.2, 0, 2);
      rim.position.set(5, 1, -3); this.scene.add(rim);

      this.body = TBS.BodyFactory.create(kind);
      this.scene.add(this.body);

      // faint orbit ring for scale reference
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.95, 3.0, 128), new THREE.MeshBasicMaterial({
        color: kind === 'cyan' ? TBS.COLORS.cyan : TBS.COLORS.amber, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
      }));
      ring.rotation.x = Math.PI / 2 - 0.25;
      this.scene.add(ring);

      this.target = 1; this.cur = 1;
      this.resize();
      new ResizeObserver(() => this.resize()).observe(container);
    }

    /** radius in sim units; preview maps [0.1, 8] to a readable visual range */
    setRadius(R) { this.target = 0.35 + 2.2 * Math.sqrt((R - 0.1) / 7.9); }

    resize() {
      const w = this.el.clientWidth || 300, h = this.el.clientHeight || 200;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }

    render(dt) {
      this.cur += (this.target - this.cur) * (1 - Math.exp(-10 * dt));
      this.body.scale.setScalar(this.cur);
      this.body.userData.glow.scale.setScalar(4.5);
      this.body.userData.core.rotation.y += dt * 0.5;
      this.renderer.render(this.scene, this.camera);
    }
  }

  TBS.BodyPreview = BodyPreview;
})(window.TBS = window.TBS || {});
