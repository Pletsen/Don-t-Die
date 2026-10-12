import * as THREE from 'three';
import type { Lighting } from '../data/lighting';

/** Gradient dome, a sun/moon disc and stars at night. Follows the camera. */
export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private disc: THREE.Mesh;
  private stars: THREE.Points;

  constructor(light: Lighting, night: number) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(light.skyTop) },
        horizon: { value: new THREE.Color(light.skyHorizon) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
        void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), this.mat);
    dome.renderOrder = -10;
    this.group.add(dome);

    const dir = this.sunDirection(light.sunElevation);
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(night > 0.5 ? 16 : 24, 24),
      new THREE.MeshBasicMaterial({ color: night > 0.5 ? 0xdfe8ff : 0xfff0c8, fog: false, depthWrite: false }),
    );
    this.disc.position.copy(dir).multiplyScalar(450);
    this.disc.lookAt(0, 0, 0);
    this.group.add(this.disc);

    const n = 500;
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
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: Math.max(0, (night - 0.35) * 1.4), depthWrite: false }),
    );
    this.group.add(this.stars);
  }

  /** Direction from the scene towards the sun. Fixed azimuth: ahead and to the left. */
  sunDirection(elevationDeg: number): THREE.Vector3 {
    const e = THREE.MathUtils.degToRad(elevationDeg);
    const az = -0.55;
    return new THREE.Vector3(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize();
  }

  follow(p: THREE.Vector3) {
    this.group.position.copy(p);
  }
}
