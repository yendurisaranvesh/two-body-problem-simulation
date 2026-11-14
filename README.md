[README.md](https://github.com/user-attachments/files/34858284/README.md)
# Two-Body Problem Lab — Interactive 3D Gravitational Simulator

A university-level interactive simulator of two bodies moving under mutual Newtonian gravity.
It is built with HTML5, CSS3, JavaScript and Three.js (r128), and integrated with **Velocity Verlet**.

## Running it

Open `index.html` in Chrome, Edge or Firefox. A build step and a server are optional.
Three.js and the fonts load from a CDN, so you need an internet connection the first time.

> The scripts are classic (non-module) scripts sharing a single `window.TBS` namespace.
> Because of this, the project also runs from `file://`, where ES-module imports would be blocked.

## Architecture

```
index.html                 layout of both screens + script load order
css/style.css              all styling (glass UI, cyan/amber theme)
js/physics/                ── PHYSICS (no Three.js, no DOM) ──
  vec3.js                  double-precision vector maths
  TwoBodySystem.js         initial conditions, forces, Velocity Verlet,
                           energy / momentum / angular momentum, Kepler elements
js/render/                 ── RENDERING (reads physics state, never writes it) ──
  textures.js              procedural planet surfaces, glow/ring sprites
  CameraRig.js             damped orbit camera (mouse + touch)
  SceneRenderer.js         bodies, gravity-well grid, trails, vectors, COM, conics,
                           particles, ripples, shadows
  IntroAnimation.js        cinematic drop (purely visual)
  BodyPreview.js           3D previews on the configuration screen
js/ui/                     ── UI ──
  ConfigScreen.js          sliders + inputs, presets, pre-launch prediction
  SimulationUI.js          controls, telemetry, narration, keyboard shortcuts
  Charts.js                live energy / separation / error plots
js/main.js                 orchestration + the single animation loop
```

## Physics

* Force: `F = G m1 m2 / r²`, applied equally and oppositely (Newton's 3rd law).
* Integrator, Velocity Verlet (2nd order, symplectic):
  `x += v·dt + ½a·dt²` → `a' = F(x)/m` → `v += ½(a + a')·dt`
* Initial conditions are set in the centre-of-mass frame:
  `r1 = −(m2/M)d`, `r2 = +(m1/M)d`. The relative velocity is `v_rel = k·v_circ` with
  `v_circ = √(GM/d)`, split as `v1 = v_com − (m2/M)v_rel` and `v2 = v_com + (m1/M)v_rel`.
* Mass and radius are independent. Radius affects only how the body looks and the collision test `r ≤ R1 + R2`.
* The drop animation moves only meshes. Integration starts at t = 0 from untouched initial conditions.

### Verified accuracy (headless tests, Δt = 10⁻⁴ T)

| Check | Result |
|---|---|
| Circular orbit, energy error over 10 orbits | ~4 × 10⁻¹⁰ |
| Angular momentum drift | ~10⁻¹⁵ (round-off) |
| Measured vs Kepler III period (e = 0.48) | 80.4601 vs 80.4605 |
| Periapsis / apoapsis vs theory | match to 3 decimals |
| COM drift after t = 100 at v = 0.45 | x = 45.000 (exact) |

## Controls

| Key | Action |
|---|---|
| Space | play / pause |
| R | reset to t = 0 |
| . | single Verlet step |
| T / K / V / F | trails / Kepler orbit / velocity / force vectors |
| 1–5 | cameras: free, top, side, ride Body 1, ride Body 2 |
| H | hide panels (presentation mode) |
| ? | plain-language guide |

Mouse: drag to rotate, right-drag (or Shift-drag) to pan, scroll to zoom. Touch is also supported.
