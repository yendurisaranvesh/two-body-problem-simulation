/* ==========================================================================
   main.js — application orchestration.

   Owns the single animation loop and the hand-off between the three layers:
     physics  (TBS.TwoBodySystem)  -> state
     renderer (TBS.SceneRenderer)  -> reads state, draws
     UI       (ConfigScreen / SimulationUI / Charts)
   ========================================================================== */
(function (TBS) {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function fatal(msg) { const f = $('fatal'); f.innerHTML = msg; f.hidden = false; }
  if (typeof THREE === 'undefined') {
    fatal('Three.js could not be loaded.<br/>This page loads it from <code>cdnjs.cloudflare.com</code>, so an internet connection is needed the first time.');
    return;
  }

  let renderer;
  try { renderer = new TBS.SceneRenderer($('stage')); }
  catch (e) { fatal('WebGL is not available in this browser, so the 3D simulator cannot start.'); console.error(e); return; }

  const state = {
    screen: 'config',
    system: null,
    intro: null,
    running: false,
    speed: 1,            // UI multiplier
    dtFraction: 1e-4,    // Δt as a fraction of the circular period
    chartMode: 'energy',
  };

  const charts = new TBS.Charts($('chart'));

  /* ------------------------------------------------------------ app API */
  const app = {
    togglePlay() { if (state.intro) return; setRunning(!state.running); },
    stepOnce() {
      if (!state.system || state.intro) return;
      setRunning(false);
      const s = state.system;
      s.step(dtSim());
      afterPhysics(true);
    },
    reset() {
      if (!state.system) return;
      if (state.intro) app.skipIntro();
      state.system.collided = false;
      state.system.reset();
      renderer.clearTrails(); charts.clear();
      ui.collision(false);
      afterPhysics(false);
      setRunning(true);
    },
    reconfigure() {
      setRunning(false);
      if (state.intro) { state.intro.onDone = null; state.intro.finish(); state.intro = null; }
      ui.setIntro(false); ui.collision(false);
      show('config');
    },
    skipIntro() { if (state.intro) state.intro.finish(); },
    ignoreCollision() {
      const s = state.system;
      s.collisions = false;
      // soften the singularity so the integrator survives a pass-through
      s.softening = 0.5 * Math.min(s.params.R1, s.params.R2);
      s.collided = false;
      s.initial = s.diagnostics();   // energy reference for the softened potential
      setRunning(true);
    },
    setSpeed(m) { state.speed = m; },
    setDtFraction(f) { state.dtFraction = f; },
    setAdaptive(on) { if (state.system) state.system.adaptive = on; state.adaptive = on; },
    setTrailLength(n) { renderer.setTrailLength(n); },
    setOption(k, v) { renderer.opts[k] = v; if (k === 'follow' && !v) {} },
    setCamera(m) { renderer.setCamera(m); },
    setChart(m) { charts.mode = m; charts.draw(); },
  };

  const ui = new TBS.SimulationUI(app);
  const config = new TBS.ConfigScreen((params, playIntro) => launch(params, playIntro));

  function dtSim() { return state.dtFraction * state.system.circularPeriod; }

  function setRunning(r) { state.running = r; ui.setPlaying(r); }

  function show(name) {
    state.screen = name;
    $('config').classList.toggle('active', name === 'config');
    $('sim').classList.toggle('active', name === 'sim');
    if (name === 'config') {
      renderer.b1.visible = renderer.b2.visible = false;
      ['vel1', 'vel2', 'f1', 'f2', 'com', 'link', 'conic1', 'conic2'].forEach((k) => (renderer[k].visible = false));
      renderer.trail1.line.visible = renderer.trail2.line.visible = false;
      ['lab1', 'lab2', 'labCom'].forEach((id) => $(id).classList.add('hidden'));
    }
  }

  /* -------------------------------------------------------------- launch */
  function launch(params, playIntro) {
    const sys = new TBS.TwoBodySystem(params);
    sys.adaptive = !!state.adaptive;
    state.system = sys;
    renderer.configure(sys);
    renderer.setCamera('orbit');
    document.querySelectorAll('#camSeg button').forEach((x) => x.classList.toggle('on', x.dataset.cam === 'orbit'));
    charts.clear();
    renderer.particles.clear();
    show('sim');
    setRunning(false);

    if (playIntro) {
      ui.setIntro(true);
      const intro = new TBS.IntroAnimation(renderer, sys, ui);
      intro.onDone = () => {
        state.intro = null;
        ui.setIntro(false);
        // Physics starts from the untouched initial conditions at t = 0.
        afterPhysics(false);
        setRunning(true);
      };
      state.intro = intro;
    } else {
      renderer.b1.visible = renderer.b2.visible = true;
      renderer.gridFade = 1; renderer.wellOn = true;
      renderer.rig.set(Object.assign({ target: new THREE.Vector3() }, renderer.homeView), true);
      afterPhysics(false);
      setRunning(true);
    }
  }

  /** Push current physics state to renderer, charts and telemetry. */
  function afterPhysics(record) {
    const s = state.system;
    const D = s.diagnostics();
    renderer.sync(s, D, record);
    charts.push(D, s.initial.E, s.circularPeriod / 300);
    state.lastD = D;
    return D;
  }

  /* ---------------------------------------------------------- main loop */
  let last = performance.now(), chartTimer = 0, idleAngle = 0;
  function frame(now) {
    const rawDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, rawDt);
    last = now;

    if (state.screen === 'config') {
      config.render(dt);
      // idle backdrop: slow drift over an empty grid
      idleAngle += dt * 0.05;
      if (!renderer.S) { renderer.S = 40; renderer.grid.configure(40, -14); renderer.system = null; }
      renderer.gridFade = 0.5;
      renderer.rig.set({ target: new THREE.Vector3(0, 0, 0), radius: renderer.S * 3, theta: idleAngle, phi: 1.15 });
      renderer.render(dt);
      requestAnimationFrame(frame);
      return;
    }

    const s = state.system;
    if (state.intro) {
      state.intro.update(Math.min(0.25, rawDt));   // wall-clock timed, even on slow GPUs
    } else if (s) {
      if (state.running && !s.collided) {
        // 1× ≈ one circular period every 12 real seconds
        const simTime = state.speed * dt * s.circularPeriod / 12;
        s.advance(simTime, dtSim());
        afterPhysics(true);
        if (s.collided) { setRunning(false); ui.collision(true); }
      } else {
        // keep vectors/camera updated while paused
        renderer.sync(s, state.lastD || s.diagnostics(), false);
      }
      const D = state.lastD || s.diagnostics();
      ui.telemetry(D, s, now);
      chartTimer += dt;
      if (chartTimer > 0.066) { chartTimer = 0; charts.draw(); }
    }

    renderer.render(dt);

    // labels after rendering so they use this frame's camera matrices
    if (state.intro && s) ui.labels(renderer, { bodies: [{ pos: renderer.b1.position, R: s.params.R1 }, { pos: renderer.b2.position, R: s.params.R2 }] }, s.initial, state.intro.t > state.intro.T.d2 + state.intro.T.dur);
    else if (s) ui.labels(renderer, s, state.lastD || s.diagnostics(), renderer.opts.labels);
    requestAnimationFrame(frame);
  }

  show('config');
  requestAnimationFrame(frame);

  // expose for debugging / demonstrations in the console
  TBS.app = app; TBS.state = state; TBS.renderer = renderer;
})(window.TBS = window.TBS || {});
