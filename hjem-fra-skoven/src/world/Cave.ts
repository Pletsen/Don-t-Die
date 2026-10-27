import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../game/rng';
import { displace } from './Vegetation';
import { antlerPairGeometry } from './props';
import { grainTexture, smokeTexture, softDot } from './textures';

/**
 * The hunter's cave: the goal of every level and the hub backdrop. A mossy rock heap with an overhanging lintel,
 * a dark tunnel mouth, drying rack with hides, a log pile, antlers over the entrance, a fire with flame cards,
 * embers, a flickering light and a smoke column that serves as a beacon above the trees.
 *
 * Built in local space: the mouth faces +z, the fire sits at (0, 0, 4).
 */
export class Cave {
  readonly group = new THREE.Group();
  /** The smoke column. Kept outside `group`: World moves it closer when the cave is beyond the view distance. */
  readonly beacon: THREE.Mesh;
  readonly fire: THREE.PointLight;
  private flameMat: THREE.ShaderMaterial;
  private smokeMat: THREE.ShaderMaterial;
  private emberMat: THREE.ShaderMaterial;
  private uTime = { value: 0 };

  constructor(night: number, fogColor: number, moss: number) {
    const rng = new Rng(77);
    const g = this.group;

    // ---------- rock heap: smooth displaced rocks merged into one mesh, moss on the upward faces ----------
    const rocks: THREE.BufferGeometry[] = [];
    const rockCol = new THREE.Color(0x6d6a62);
    const mossCol = new THREE.Color(0x4a5a2a).lerp(new THREE.Color(moss), 0.3);
    const tmp = new THREE.Color();
    const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, ry = 0) => {
      let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 3);
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      geo = mergeVertices(geo, 1e-3);
      displace(geo, 0.16, 1.3 + seed * 0.07, seed);
      geo.scale(sx, sy, sz);
      geo.rotateY(ry);
      geo.translate(x, y, z);
      geo.computeVertexNormals();
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const up = n.getY(i);
        const m = Math.max(0, Math.min(1, (up - 0.45) * 2.2)) * (0.75 + 0.25 * Math.sin(p.getX(i) * 1.7 + p.getZ(i) * 1.3));
        const dirt = Math.max(0, 1 - p.getY(i) / 1.2) * 0.35;
        tmp.copy(rockCol).multiplyScalar(0.85 + 0.25 * Math.sin(p.getX(i) * 0.9 + p.getY(i) * 1.4)).lerp(mossCol, m);
        tmp.multiplyScalar(1 - dirt);
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      rocks.push(geo.index ? geo.toNonIndexed() : geo);
    };
    rock(0, 5.2, -6.5, 8.5, 5.6, 4.6, 1); // main mass behind the mouth
    rock(0, 9.4, -7.5, 5.5, 3.4, 4, 2, 0.6); // top
    rock(-4.7, 2.6, -0.8, 2.3, 3.6, 3.1, 3, 0.3); // left pillar
    rock(4.8, 2.4, -0.6, 2.3, 3.4, 3.0, 4, -0.4); // right pillar
    rock(0, 3.5, -0.2, 4.8, 1.4, 2.4, 5, 0.05); // lintel over the mouth
    rock(-8.2, 1.8, -3.5, 4, 3, 4, 6, 1.1);
    rock(8.4, 1.7, -3.8, 4, 2.9, 4, 7, 2.0);
    rock(-6.3, 0.7, 1.8, 1.4, 1, 1.3, 8); // boulders in front
    rock(6.6, 0.6, 2.1, 1.2, 0.9, 1.1, 9);
    const rockGeo = mergeGeometries(rocks)!;
    rocks.forEach((r) => r.dispose());
    const rockTex = grainTexture(21, 0.45);
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: rockTex, bumpMap: rockTex, bumpScale: 2 });
    const heap = new THREE.Mesh(rockGeo, rockMat);
    heap.castShadow = heap.receiveShadow = true;
    g.add(heap);

    // ---------- the mouth: a short half-tunnel shaded from warm brown to black, closed by a black cap ----------
    const tunnel = new THREE.CylinderGeometry(2.3, 2.3, 3.6, 16, 6, true, -Math.PI / 2, Math.PI);
    tunnel.rotateX(-Math.PI / 2); // axis along z, arch upwards
    tunnel.translate(0, 0, -0.6);
    const tp = tunnel.attributes.position;
    const tc = new Float32Array(tp.count * 3);
    const warm = new THREE.Color(0x2a1a10);
    for (let i = 0; i < tp.count; i++) {
      const depth = Math.min(1, Math.max(0, (1.2 - tp.getZ(i)) / 3.6));
      tmp.copy(warm).multiplyScalar(Math.pow(1 - depth, 2.2));
      tc[i * 3] = tmp.r;
      tc[i * 3 + 1] = tmp.g;
      tc[i * 3 + 2] = tmp.b;
    }
    tunnel.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const cap = new THREE.CircleGeometry(2.3, 16, 0, Math.PI).translate(0, 0, -2.4);
    const capCol = new Float32Array(cap.attributes.position.count * 3); // black
    cap.setAttribute('color', new THREE.BufferAttribute(capCol, 3));
    const floor = new THREE.PlaneGeometry(4.6, 3.6).rotateX(-Math.PI / 2).translate(0, 0.02, -0.6);
    const fp = floor.attributes.position;
    const fc = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) {
      const depth = Math.min(1, Math.max(0, (1.2 - fp.getZ(i)) / 3.6));
      tmp.copy(warm).multiplyScalar(1.3 * (1 - depth));
      fc[i * 3] = tmp.r;
      fc[i * 3 + 1] = tmp.g;
      fc[i * 3 + 2] = tmp.b;
    }
    floor.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    const mouthGeo = mergeGeometries([tunnel, cap, floor].map((x) => stripTo(x, ['position', 'color'])))!;
    [tunnel, cap, floor].forEach((x) => x.dispose());
    const mouth = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
    g.add(mouth);

    // ---------- wood: log pile, drying rack poles, fire logs (one mesh) ----------
    const wood: THREE.BufferGeometry[] = [];
    const log = (x: number, y: number, z: number, len: number, r: number, ry: number, rz = 0, rx = 0) => {
      const c = new THREE.CylinderGeometry(r, r * 1.08, len, 8);
      c.rotateZ(Math.PI / 2 + rz);
      c.rotateX(rx);
      c.rotateY(ry);
      c.translate(x, y, z);
      wood.push(stripTo(c, ['position', 'normal']));
    };
    // log pile against the left pillar
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 4 - row; k++) log(-4.6 + (k - (3 - row) / 2) * 0.34, 0.17 + row * 0.29, 2.6, 1.6, 0.16, Math.PI / 2 + 0.2, 0);
    // drying rack: two posts and a crossbar to the right of the mouth
    const post = (x: number, z: number) => {
      const c = new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6).translate(x, 1.1, z);
      wood.push(stripTo(c, ['position', 'normal']));
    };
    post(3.6, 3.4);
    post(5.6, 3.0);
    log(4.6, 2.05, 3.2, 2.3, 0.05, 0.2);
    // fire logs in a tepee
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const c = new THREE.CylinderGeometry(0.05, 0.07, 1.0, 6);
      c.translate(0, 0.45, 0);
      c.rotateX(0.55);
      c.rotateY(a);
      c.translate(Math.sin(a) * 0.35, 0, 4 + Math.cos(a) * 0.35);
      wood.push(stripTo(c, ['position', 'normal']));
    }
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95, map: rockTex });
    const woodMesh = new THREE.Mesh(mergeGeometries(wood)!, woodMat);
    wood.forEach((w) => w.dispose());
    woodMesh.castShadow = woodMesh.receiveShadow = true;
    g.add(woodMesh);

    // ---------- hides on the rack and a pelt by the fire ----------
    const hides: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 2; k++) {
      const h = new THREE.PlaneGeometry(0.9, 1.15, 4, 5);
      const hp = h.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i);
        const y = hp.getY(i);
        // ragged edges and a slight sag
        hp.setXYZ(i, x * (1 - 0.15 * Math.abs(y)), y, 0.05 * Math.sin(x * 4 + k) + 0.06 * (y * y));
      }
      h.computeVertexNormals();
      h.translate(0, -0.55, 0);
      h.rotateY(0.2);
      h.translate(4.15 + k * 0.95, 2.05, 3.32 - k * 0.2);
      hides.push(stripTo(h, ['position', 'normal']));
    }
    const pelt = new THREE.CircleGeometry(0.75, 9).rotateX(-Math.PI / 2).scale(1, 1, 0.7).translate(-1.6, 0.04, 4.3);
    hides.push(stripTo(pelt, ['position', 'normal']));
    const hideMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1, side: THREE.DoubleSide, map: rockTex });
    const hideMesh = new THREE.Mesh(mergeGeometries(hides)!, hideMat);
    hides.forEach((h) => h.dispose());
    hideMesh.castShadow = true;
    hideMesh.receiveShadow = true;
    g.add(hideMesh);

    // ---------- antlers over the entrance and a stone ring round the fire ----------
    const antlers = antlerPairGeometry(1.6, 4);
    antlers.rotateX(-0.25);
    antlers.translate(0, 4.25, 1.95);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.75 });
    const antlerMesh = new THREE.Mesh(antlers, boneMat);
    antlerMesh.castShadow = true;
    g.add(antlerMesh);
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const s = new THREE.DodecahedronGeometry(rng.range(0.2, 0.3), 1);
      s.scale(1.1, 0.65, 1);
      s.translate(Math.cos(a) * 0.85, 0.1, 4 + Math.sin(a) * 0.85);
      stones.push(stripTo(s.index ? s.toNonIndexed() : s, ['position', 'normal']));
    }
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x55534d, roughness: 0.9, map: rockTex });
    const stoneMesh = new THREE.Mesh(mergeGeometries(stones)!, stoneMat);
    stones.forEach((s) => s.dispose());
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    g.add(stoneMesh);

    // ---------- fire: crossed flame cards with a scrolling noise shader ----------
    const cards: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const c = new THREE.PlaneGeometry(1.0, 1.5);
      c.translate(0, 0.72, 0);
      c.rotateY((k / 4) * Math.PI);
      c.translate(0, 0.05, 4);
      cards.push(c);
    }
    this.flameMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { uTime: this.uTime },
      vertexShader: `varying vec2 vUv; varying float vK; void main(){ vUv = uv; vK = position.x * 3.1 + position.z * 1.7;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vK;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 uv = vUv;
          float t = uTime;
          float flick = n(vec2(uv.x * 4.0 + vK, uv.y * 3.0 - t * 3.2)) * 0.6 + n(vec2(uv.x * 9.0 - vK, uv.y * 7.0 - t * 5.0)) * 0.4;
          // teardrop: wide at the bottom, licking up
          float w = mix(0.42, 0.04, pow(uv.y, 0.8));
          float x = abs(uv.x - 0.5 + (flick - 0.5) * 0.18 * uv.y);
          float shape = smoothstep(w, w * 0.35, x) * smoothstep(1.0, 0.25, uv.y + (flick - 0.5) * 0.45) * smoothstep(0.0, 0.08, uv.y);
          vec3 core = vec3(1.0, 0.85, 0.5);
          vec3 edge = vec3(1.0, 0.35, 0.06);
          vec3 col = mix(edge, core, smoothstep(0.2, 0.9, shape) * (1.0 - uv.y * 0.6));
          gl_FragColor = vec4(col * shape * 2.6, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const flames = new THREE.Mesh(mergeGeometries(cards)!, this.flameMat);
    cards.forEach((c) => c.dispose());
    flames.renderOrder = 2;
    g.add(flames);

    // warm glow sprite round the fire (bloom does the rest)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: softDot(), color: 0xff8a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }),
    );
    glow.position.set(0, 0.7, 4);
    glow.scale.setScalar(3.2);
    g.add(glow);

    // embers: points rising and fading, animated entirely in the shader
    const nE = 40;
    const ep = new Float32Array(nE * 3);
    const eSeed = new Float32Array(nE);
    for (let i = 0; i < nE; i++) {
      ep[i * 3] = rng.range(-0.35, 0.35);
      ep[i * 3 + 1] = 0.3;
      ep[i * 3 + 2] = 4 + rng.range(-0.35, 0.35);
      eSeed[i] = rng.next();
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    eg.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 1));
    this.emberMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: this.uTime, map: { value: softDot(0.2) } },
      vertexShader: `attribute float aSeed; uniform float uTime; varying float vA;
        void main(){
          float t = fract(uTime * (0.35 + aSeed * 0.3) + aSeed * 7.0);
          vec3 p = position + vec3(sin(t * 6.0 + aSeed * 30.0) * 0.3 * t, t * 3.2, cos(t * 5.0 + aSeed * 20.0) * 0.3 * t);
          vA = (1.0 - t) * smoothstep(0.0, 0.05, t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.05 + 0.04 * aSeed) * 600.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; varying float vA;
        void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 2.5 * c.a * vA, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const embers = new THREE.Points(eg, this.emberMat);
    embers.frustumCulled = false;
    g.add(embers);

    this.fire = new THREE.PointLight(0xff8a3a, 30, 30, 1.6);
    this.fire.position.set(0, 1.4, 4.4);
    this.fire.castShadow = false;
    g.add(this.fire);

    // ---------- smoke column: one instanced billboard batch, animated in the shader ----------
    const nS = 34;
    const quad = new THREE.PlaneGeometry(1, 1);
    const seeds = new Float32Array(nS);
    for (let i = 0; i < nS; i++) seeds[i] = i / nS + rng.range(0, 0.5 / nS);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = quad.index;
    ig.setAttribute('position', quad.attributes.position);
    ig.setAttribute('uv', quad.attributes.uv);
    ig.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    ig.instanceCount = nS;
    const smokeCol = new THREE.Color(0x4a4440).lerp(new THREE.Color(0x707884), night * 0.6);
    this.smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: this.uTime,
        map: { value: smokeTexture() },
        uCol: { value: smokeCol },
        uFire: { value: new THREE.Color(0xff8a3a) },
        uFog: { value: new THREE.Color(fogColor) },
        uFogAmt: { value: 0 },
        uNight: { value: night },
        uWind: { value: new THREE.Vector2(0.6, 0.2) },
      },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform vec2 uWind; varying vec2 vUv; varying float vT;
        void main(){
          float t = fract(uTime * 0.035 + aSeed);
          vT = t;
          float hgt = t * 26.0;
          vec3 c = vec3(0.0, 1.2 + hgt, 4.0);
          c.xz += uWind * pow(t, 1.5) * 9.0;
          c.x += sin(t * 9.0 + aSeed * 40.0) * (0.3 + t * 1.5);
          float size = 1.0 + t * 7.0;
          vec4 mv = modelViewMatrix * vec4(c, 1.0);
          // billboard; scale from the object matrix so a moved / shrunk beacon keeps its look
          float s = length(modelMatrix[0].xyz);
          float rot = aSeed * 6.28 + t * 1.5;
          vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * position.xy;
          mv.xy += q * size * s;
          vUv = uv;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uCol; uniform vec3 uFire; uniform vec3 uFog; uniform float uFogAmt; uniform float uNight;
        varying vec2 vUv; varying float vT;
        void main(){
          float a = texture2D(map, vUv).a * 2.6;
          a *= smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
          // lit orange from the fire below, more so at night
          vec3 col = mix(uCol, uFire * 0.55, (1.0 - smoothstep(0.0, 0.25, vT)) * (0.3 + 0.6 * uNight));
          col = mix(col, uFog, uFogAmt);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.85) * (1.0 - uFogAmt * 0.6));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.beacon = new THREE.Mesh(ig, this.smokeMat);
    this.beacon.frustumCulled = false;
    this.beacon.renderOrder = 3;
    quad.dispose();
  }

  setWind(dx: number, dz: number, strength: number) {
    (this.smokeMat.uniforms.uWind.value as THREE.Vector2).set(dx * strength * 0.8, dz * strength * 0.8);
  }

  /** How much fog lies over the beacon (0..1), computed from its true distance. */
  setBeaconFog(f: number) {
    this.smokeMat.uniforms.uFogAmt.value = f;
  }

  update(time: number) {
    this.uTime.value = time;
    const f = 0.85 + Math.sin(time * 17) * 0.06 + Math.sin(time * 7.3) * 0.08 + Math.sin(time * 31) * 0.03;
    this.fire.intensity = 30 * f;
  }
}

function stripTo(g: THREE.BufferGeometry, names: string[]): THREE.BufferGeometry {
  for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  return g.index ? g.toNonIndexed() : g;
}
