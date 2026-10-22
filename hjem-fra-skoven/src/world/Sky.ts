import * as THREE from 'three';
import type { Lighting } from '../data/lighting';

const DOME_R = 500;

/**
 * Gradient dome with drifting clouds, a sun or a cratered moon, and stars at night. Follows the camera and is
 * scaled to sit just inside the far plane. Tone mapped and colour-space converted like any built-in material,
 * so it looks the same through the composer (linear target + OutputPass) and when rendered straight to the canvas.
 */
export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private dome: THREE.Mesh;

  constructor(light: Lighting, night: number) {
    const sun = Sky.direction(light.sunElevation, light.sunAzimuth);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(light.skyTop) },
        horizon: { value: new THREE.Color(light.skyHorizon) },
        fogCol: { value: new THREE.Color(light.fogColor) },
        sunDir: { value: sun },
        sunColor: { value: new THREE.Color(light.sunColor) },
        time: { value: 0 },
        night: { value: night },
        moon: { value: light.moon },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 fogCol; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float time; uniform float night; uniform float moon;
        varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vP);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float sd = max(dot(d, sunDir), 0.0);
          // glow: a wide warm haze around the sun, a tight cold halo around the moon
          float glow = mix(pow(sd, 6.0) * 0.3 + pow(sd, 48.0) * 0.6, pow(sd, 90.0) * 0.35 + pow(sd, 900.0) * 0.4, moon);
          col += sunColor * glow;
          // disc
          float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
          if (moon < 0.5) {
            float disc = smoothstep(0.03, 0.026, ang);
            col += sunColor * disc * 7.0;
          } else {
            float R = 0.034;
            float disc = smoothstep(R, R * 0.93, ang);
            if (disc > 0.0) {
              vec3 tx = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)));
              vec3 ty = cross(tx, sunDir);
              vec2 q = vec2(dot(d, tx), dot(d, ty)) / R; // -1..1 over the disc
              float maria = smoothstep(0.45, 0.75, fbm(q * 2.2 + 3.1));
              float craters = fbm(q * 7.0 - 1.7);
              float limb = sqrt(max(0.0, 1.0 - dot(q, q)));
              vec3 mc = vec3(0.92, 0.94, 1.0) * (0.75 - 0.3 * maria + 0.25 * (craters - 0.5)) * (0.55 + 0.45 * limb);
              col = mix(col, mc * 2.4, disc);
            }
          }
          // clouds
          vec2 uv = d.xz / (d.y + 0.22) * 0.55 + vec2(time * 0.006, time * 0.002);
          float c1 = fbm(uv * 1.3);
          float cover = smoothstep(0.46 - 0.12 * (1.0 - night), 0.82, c1) * smoothstep(0.0, 0.18, d.y);
          float lit = clamp(0.45 + 0.3 * dot(normalize(vec3(d.xz, 0.0)).xy, sunDir.xz) + 0.35 * (1.0 - fbm(uv * 1.3 + sunDir.xz * 0.12)), 0.0, 1.0);
          vec3 cloudShade = mix(top * 0.6, horizon * 0.8, 0.35);
          vec3 cloudLit = mix(horizon, sunColor, 0.55) * (1.0 - 0.7 * night) + vec3(0.03) * night;
          vec3 cloud = mix(cloudShade, cloudLit, lit);
          col = mix(col, cloud, cover * (0.9 - 0.3 * night));
          // melt into the fog at and below the horizon so the dome meets the fogged world without a seam
          col = mix(fogCol, col, smoothstep(-0.03, 0.2, d.y));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 32, 20), this.mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const n = 700;
    const pos = new Float32Array(n * 3);
    // fixed seed so the night sky is the same every time
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = rnd();
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r * DOME_R * 0.96;
      pos[i * 3 + 1] = u * DOME_R * 0.96 + 15;
      pos[i * 3 + 2] = Math.sin(a) * r * DOME_R * 0.96;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xdfe8ff,
        size: 1.6,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: Math.max(0, Math.min(1, (night - 0.3) * 1.6)),
        depthWrite: false,
      }),
    );
    this.stars.visible = night > 0.3;
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.group.add(this.stars);
  }

  /** Direction from the scene towards the sun or moon. */
  static direction(elevationDeg: number, azimuth = -0.55): THREE.Vector3 {
    const e = THREE.MathUtils.degToRad(elevationDeg);
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(e), Math.sin(e), -Math.cos(azimuth) * Math.cos(e)).normalize();
  }

  /** Kept for older call sites: the sun at the default (afternoon) azimuth. */
  sunDirection(elevationDeg: number): THREE.Vector3 {
    return Sky.direction(elevationDeg);
  }

  /** Fit the dome inside the camera's far plane. */
  setRadius(r: number) {
    this.group.scale.setScalar(r / DOME_R);
  }

  update(time: number) {
    this.mat.uniforms.time.value = time;
  }

  follow(p: THREE.Vector3) {
    this.group.position.copy(p);
  }

  dispose() {
    this.dome.geometry.dispose();
    this.mat.dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}

/**
 * A ring of distant forest and hill silhouettes in two layers just inside the view distance. It hides the edge of
 * the terrain and the far-plane cut, and gives the fog something to swallow. One draw call; follows the camera in xz.
 */
export class Horizon {
  readonly mesh: THREE.Mesh;
  private tex: THREE.CanvasTexture;

  constructor(radius: number, light: Lighting, night: number) {
    this.tex = silhouetteTexture();
    const parts: THREE.BufferGeometry[] = [];
    const layers = [
      { r: radius * 0.93, h: 34, rep: 3, off: 0.37, fog: 0.82 },
      { r: radius * 0.86, h: 26, rep: 4, off: 0, fog: 0.62 },
    ];
    for (const l of layers) {
      const g = new THREE.CylinderGeometry(l.r, l.r, l.h + 30, 64, 1, true);
      g.translate(0, (l.h + 30) / 2 - 30, 0);
      const uv = g.attributes.uv;
      const fog = new Float32Array(uv.count);
      for (let i = 0; i < uv.count; i++) {
        // v: 0 at 30 m below the ground, 1 at the top of the silhouette
        uv.setXY(i, uv.getX(i) * l.rep + l.off, uv.getY(i));
        fog[i] = l.fog;
      }
      g.setAttribute('aFog', new THREE.BufferAttribute(fog, 1));
      g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(uv.count).fill(30 / (l.h + 30)), 1));
      parts.push(g);
    }
    const geo = mergeSimple(parts);
    parts.forEach((p) => p.dispose());
    const dark = new THREE.Color(0x24301f).lerp(new THREE.Color(light.hemiGround), 0.3);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        map: { value: this.tex },
        fogCol: { value: new THREE.Color(light.fogColor) },
        sil: { value: dark.multiplyScalar(1 - night * 0.6) },
      },
      vertexShader: `attribute float aFog; attribute float aH; varying vec2 vUv; varying float vFog; varying float vH;
        void main(){ vUv = uv; vFog = aFog; vH = aH; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogCol; uniform vec3 sil; varying vec2 vUv; varying float vFog; varying float vH;
        void main(){
          // below the ground line the ring is solid; above it the canvas holds tree tops and hills
          float v = (vUv.y - vH) / (1.0 - vH);
          float a = v < 0.0 ? 1.0 : texture2D(map, vec2(vUv.x, v)).a;
          if (a < 0.5) discard;
          float haze = mix(vFog, 1.0, smoothstep(0.0, 1.0, v) * 0.35);
          gl_FragColor = vec4(mix(sil, fogCol, haze), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5;
  }

  follow(p: THREE.Vector3) {
    this.mesh.position.set(p.x, 0, p.z);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const names = Object.keys(parts[0].attributes);
  let vtx = 0;
  const idx: number[] = [];
  for (const p of parts) {
    const ix = p.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vtx);
    vtx += p.attributes.position.count;
  }
  for (const n of names) {
    const size = parts[0].attributes[n].itemSize;
    const arr = new Float32Array(vtx * size);
    let o = 0;
    for (const p of parts) {
      const a = p.attributes[n].array as Float32Array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.setIndex(idx);
  return out;
}

/** Alpha canvas with a band of tree tops (pines and broadleaf) over gentle hills. Tiles horizontally. */
function silhouetteTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#fff';
  // hills: y measured from the bottom
  const hill = (x: number) => 26 + 12 * Math.sin((x / W) * Math.PI * 2 * 2 + 0.6) + 7 * Math.sin((x / W) * Math.PI * 2 * 5 + 2.1);
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) g.lineTo(x, H - hill(x));
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const base = H - hill(x) + 6;
    const h = 22 + rnd() * 60;
    for (const dx of [0, -W, W]) {
      if (rnd() < 0.62) {
        // pine: a narrow ragged spire
        const w = h * (0.22 + rnd() * 0.08);
        g.beginPath();
        g.moveTo(x + dx - w, base);
        const steps = 6;
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const y = base - h * t;
          const ww = w * (1 - t) * (k % 2 ? 1.15 : 0.8);
          g.lineTo(x + dx - ww, y);
        }
        g.lineTo(x + dx, base - h - 4);
        for (let k = steps; k >= 1; k--) {
          const t = k / steps;
          const y = base - h * t;
          const ww = w * (1 - t) * (k % 2 ? 1.15 : 0.8);
          g.lineTo(x + dx + ww, y);
        }
        g.lineTo(x + dx + w, base);
        g.closePath();
        g.fill();
      } else {
        // broadleaf: a cluster of round masses
        const r = h * 0.28;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + dx + (rnd() - 0.5) * r * 1.6, base - h * 0.55 - rnd() * h * 0.35, r * (0.6 + rnd() * 0.5), 0, Math.PI * 2);
          g.fill();
        }
        g.fillRect(x + dx - r * 0.8, base - h * 0.55, r * 1.6, h * 0.55);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
