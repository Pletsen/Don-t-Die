// GLSL fragment shader for the backdrop. It runs once per pixel on the GPU,
// every frame, on a quad that always covers the camera view.
// Layers, back to front:
//   1. dark radial gradient
//   2. drifting nebula (fractal noise) tinted with the current sector colour
//   3. twinkling stars
//   4. a faint neon grid
// Each layer scrolls at a different fraction of the camera's movement
// (parallax), which is what makes the world feel deep.

export const backgroundFrag = /* glsl */ `
#pragma phaserTemplate(shaderName)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform vec2 uSize;       // size of the quad in world units
uniform vec2 uView;       // visible area in world units
uniform vec2 uCam;        // world position at the centre of the screen
uniform float uTime;      // seconds
uniform vec3 uAccent;     // sector colour, 0..1
uniform float uIntensity; // 0 slow .. 1 top speed
uniform float uPulse;     // flash on perfect turns
uniform float uWarp;      // 0 normal .. 1 bonus universe

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}

float gridLine(vec2 p, float cell, float width) {
  vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell;
  float d = min(g.x, g.y);
  return 1.0 - smoothstep(0.0, width, d);
}

float stars(vec2 p, float cell, float density, float seed) {
  vec2 sp = p / cell;
  vec2 id = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float h = hash(id + seed);
  vec2 off = vec2(hash(id + seed + 3.1), hash(id + seed + 7.7)) - 0.5;
  float d = length(f - off * 0.7);
  float star = smoothstep(0.07, 0.0, d) * step(1.0 - density, h);
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
  return star * twinkle;
}

void main() {
  // Position relative to the screen centre, in world units.
  vec2 screen = (vec2(outTexCoord.x, 1.0 - outTexCoord.y) - 0.5) * uSize;
  vec2 q = screen / uView;
  float aspect = uView.x / uView.y;

  // 1. Base gradient.
  float r = length((q + vec2(0.0, 0.08)) * vec2(aspect, 1.0));
  vec3 col = mix(vec3(0.045, 0.07, 0.10), vec3(0.012, 0.018, 0.028), smoothstep(0.0, 1.1, r));

  // 2. Nebula.
  vec2 np = (screen + uCam * 0.06) * 0.0021;
  float n1 = fbm(np + vec2(uTime * 0.012, -uTime * 0.007));
  float n2 = fbm(np * 1.8 - vec2(uTime * 0.015, 0.0) + n1 * 1.3);
  vec3 magenta = vec3(1.0, 0.18, 0.62);
  vec3 nebColor = mix(uAccent, magenta, smoothstep(0.35, 0.8, n2));
  float neb = pow(smoothstep(0.3, 1.0, n1 * 0.7 + n2 * 0.6), 2.2);
  col += nebColor * neb * (0.16 + 0.12 * uIntensity);

  // 3. Stars, two depths.
  col += vec3(0.7, 0.88, 1.0) * stars(screen + uCam * 0.12, 64.0, 0.28, 0.0) * 0.55;
  col += vec3(0.9, 0.95, 1.0) * stars(screen + uCam * 0.25, 110.0, 0.2, 11.0) * 0.8;

  // 4. Neon grid.
  vec2 gp = screen + uCam * 0.4;
  float minor = gridLine(gp, 80.0, 1.1);
  float major = gridLine(gp, 320.0, 1.8);
  float gridFade = 1.0 - smoothstep(0.25, 0.9, r);
  col += uAccent * (minor * 0.03 + major * 0.06) * (0.6 + 0.6 * uIntensity) * gridFade;

  // Energy pulse from PERFECT turns.
  col += uAccent * uPulse * 0.1 * (1.0 - smoothstep(0.0, 0.9, r));

  // 5. Bonus universe: a slowly turning rainbow spiral, ripples and
  // hyperspace streaks rushing out from the centre. Kept dim so the track
  // stays readable.
  if (uWarp > 0.001) {
    float rad = length(q * vec2(aspect, 1.0));
    float ang = atan(q.y, q.x);
    float spiral = sin(ang * 5.0 + log(rad + 0.02) * 9.0 - uTime * 2.5);
    float ripples = sin(rad * 28.0 - uTime * 5.0);
    vec3 rainbow = hsv2rgb(vec3(fract(ang / 6.2831 + uTime * 0.07 + rad * 0.5), 0.8, 1.0));
    vec3 psy = rainbow * (0.07 + 0.13 * smoothstep(0.1, 1.0, spiral) + 0.03 * ripples);
    float streak = pow(abs(sin(ang * 23.0)), 80.0) * fract(rad * 1.5 - uTime * 1.2) * smoothstep(0.15, 0.9, rad);
    psy += vec3(1.0) * streak * 0.25;
    col = mix(col, col * 0.5 + psy, uWarp);
  }

  // Tiny dither kills gradient banding on 8-bit screens.
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;
