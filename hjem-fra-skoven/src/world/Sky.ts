import * as THREE from 'three';
import type { Lighting } from '../data/lighting';

/** Gradient dome with drifting clouds, a sun/moon with glow, and stars at night. Follows the camera. */
export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private stars: THREE.Points;

  constructor(light: Lighting, night: number) {
    const sun = this.sunDirection(light.sunElevation);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(light.skyTop) },
        horizon: { value: new THREE.Color(light.skyHorizon) },
        sunDir: { value: sun },
        sunColor: { value: new THREE.Color(light.sunColor) },
        time: { value: 0 },
        night: { value: night },
        elev: { value: light.sunElevation },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float time; uniform float night; uniform float elev;
        varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vP);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.5));
          float sd = max(dot(d, sunDir), 0.0);
          // glow around the sun (or moon)
          float glow = pow(sd, 6.0) * 0.28 + pow(sd, 40.0) * 0.5;
          col += sunColor * glow * (1.0 - 0.5 * night);
          // sun disc, bright enough to bloom
          float disc = smoothstep(0.9993 - 0.0004 * night, 0.9997, sd);
          col += sunColor * disc * (night > 0.5 ? 2.2 : 6.0);
          // clouds
          vec2 uv = d.xz / (d.y + 0.22) * 0.55 + vec2(time * 0.006, time * 0.002);
          float c1 = fbm(uv * 1.3);
          float cover = smoothstep(0.46 - 0.12 * (1.0 - night), 0.82, c1) * smoothstep(0.0, 0.18, d.y);
          float lit = clamp(0.45 + 0.6 * dot(normalize(vec3(d.xz, 0.0)).xy, sunDir.xz) * 0.5 + 0.35 * (1.0 - fbm(uv * 1.3 + sunDir.xz * 0.12) ), 0.0, 1.0);
          vec3 cloudShade = mix(top * 0.6, horizon * 0.8, 0.35);
          vec3 cloudLit = mix(horizon, sunColor, 0.55) * (1.0 - 0.7 * night) + vec3(0.04) * night;
          vec3 cloud = mix(cloudShade, cloudLit, lit);
          col = mix(col, cloud, cover * (0.9 - 0.25 * night));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), this.mat);
    dome.renderOrder = -10;
    this.group.add(dome);

    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r * 480;
      pos[i * 3 + 1] = Math.abs(u) * 480 * 0.9 + 20;
      pos[i * 3 + 2] = Math.sin(a) * r * 480;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: Math.max(0, (night - 0.35) * 1.5), depthWrite: false }),
    );
    this.group.add(this.stars);
  }

  /** Direction from the scene towards the sun. Fixed azimuth: ahead and to the left. */
  sunDirection(elevationDeg: number): THREE.Vector3 {
    const e = THREE.MathUtils.degToRad(elevationDeg);
    const az = -0.55;
    return new THREE.Vector3(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize();
  }

  update(time: number) {
    this.mat.uniforms.time.value = time;
  }

  follow(p: THREE.Vector3) {
    this.group.position.copy(p);
  }
}
