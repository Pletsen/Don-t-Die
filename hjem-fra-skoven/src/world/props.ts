import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small procedural props shared by the cave set piece and the loot. */

function only(g: THREE.BufferGeometry, keep = ['position', 'normal']): THREE.BufferGeometry {
  for (const n of Object.keys(g.attributes)) if (!keep.includes(n)) g.deleteAttribute(n);
  return g.index ? g.toNonIndexed() : g;
}

/**
 * One antler beam: a curved tube (out, back, up, inward) with `tines` branches. Base at the origin, growing up and
 * out to +x. Mirror with scale(-1,1,1) for the other side.
 */
export function antlerGeometry(scale = 1, tines = 3, radius = 0.045): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18, 0.12, -0.08),
    new THREE.Vector3(0.32, 0.38, -0.12),
    new THREE.Vector3(0.3, 0.68, 0.0),
    new THREE.Vector3(0.18, 0.86, 0.1),
  ].map((p) => p.multiplyScalar(scale));
  const curve = new THREE.CatmullRomCurve3(pts);
  const parts: THREE.BufferGeometry[] = [];
  const beam = new THREE.TubeGeometry(curve, 12, radius * scale, 6, false);
  // taper the beam towards the tip
  const p = beam.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / 7);
    const t = ring / 12;
    const c = curve.getPointAt(Math.min(1, t));
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - 0.6 * t).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  beam.computeVertexNormals();
  parts.push(only(beam));
  for (let k = 0; k < tines; k++) {
    const t = 0.3 + (k / Math.max(1, tines)) * 0.6;
    const base = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const dir = new THREE.Vector3(-0.2, 1, 0.55 - k * 0.15).normalize().addScaledVector(tan, 0.3).normalize();
    const len = (0.22 - k * 0.03) * scale;
    const tine = new THREE.ConeGeometry(radius * scale * (0.7 - k * 0.1), len, 5);
    tine.translate(0, len / 2, 0);
    tine.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    tine.translate(base.x, base.y, base.z);
    parts.push(only(tine));
  }
  return mergeGeometries(parts)!;
}

/** A pair of antlers on a small skull plate, centred at the origin, facing +z. */
export function antlerPairGeometry(scale = 1, tines = 3): THREE.BufferGeometry {
  const l = antlerGeometry(scale, tines).translate(0.06 * scale, 0, 0);
  const r = antlerGeometry(scale, tines).scale(-1, 1, 1).translate(-0.06 * scale, 0, 0);
  // mirroring flips the triangle winding: swap two corners of every triangle back
  const rp = r.attributes.position;
  const rn = r.attributes.normal;
  for (let i = 0; i < rp.count; i += 3) {
    for (const a of [rp, rn]) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  const skull = only(new THREE.SphereGeometry(0.09 * scale, 8, 6).scale(1.2, 0.7, 1.4).translate(0, -0.02 * scale, 0.04 * scale));
  return mergeGeometries([l, r, skull])!;
}

/** Knapped flint flake: a flattened, jittered octahedron. Facets are right here: conchoidal fractures. */
export function flintGeometry(seed: number): THREE.BufferGeometry {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new THREE.OctahedronGeometry(0.12, 0); // polyhedra are already non-indexed
  g.scale(1, 0.3, 0.65);
  const p = g.attributes.position;
  // jitter shared corners consistently so the flake stays closed
  const off = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = off.get(key);
    if (!o) off.set(key, (o = new THREE.Vector3((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.015, (rnd() - 0.5) * 0.04)));
    p.setXYZ(i, p.getX(i) + o.x, p.getY(i) + o.y, p.getZ(i) + o.z);
  }
  g.computeVertexNormals();
  return only(g);
}

/** A short bone piece: a shaft with knobbed ends. */
export function boneGeometry(len = 0.26): THREE.BufferGeometry {
  const shaft = only(new THREE.CylinderGeometry(0.022, 0.026, len, 7).rotateZ(Math.PI / 2));
  const k1 = only(new THREE.SphereGeometry(0.04, 7, 5).scale(1, 0.8, 1.2).translate(len / 2, 0, 0.012));
  const k2 = only(new THREE.SphereGeometry(0.04, 7, 5).scale(1, 0.8, 1.2).translate(len / 2, 0, -0.03));
  const k3 = only(new THREE.SphereGeometry(0.045, 7, 5).translate(-len / 2, 0, 0));
  return mergeGeometries([shaft, k1, k2, k3])!;
}

/** Meat haunch: a tapered ellipsoid with the bone sticking out of the narrow end (meat and bone as two groups). */
export function haunchGeometry(): { meat: THREE.BufferGeometry; bone: THREE.BufferGeometry } {
  const meat = new THREE.SphereGeometry(1, 12, 9);
  const p = meat.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    // taper towards +x (the shank end)
    const k = 1 - 0.45 * Math.max(0, x);
    p.setXYZ(i, x * 0.26, p.getY(i) * 0.12 * k, p.getZ(i) * 0.18 * k);
  }
  meat.computeVertexNormals();
  const bone = only(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 7).rotateZ(Math.PI / 2).translate(0.3, 0, 0));
  const knob = only(new THREE.SphereGeometry(0.04, 7, 5).translate(0.38, 0, 0));
  return { meat, bone: mergeGeometries([bone, knob])! };
}
