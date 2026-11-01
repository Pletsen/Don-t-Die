// GLSL fragment shader for the backdrop. It runs once per pixel on the GPU,
// every frame, into a reduced-resolution texture that is then stretched over
// the camera view (see Backdrop.ts), so it stays cheap on 3x phones.
//
// Layers, back to front:
//   1. dark radial gradient (very dark in the middle, so the road separates)
//   2. drifting nebula (2-octave value noise) in the world's two colours
//   3. the world's own sky, cross-faded by uWorld (one weight per world):
//        BASICS  calm cyan nebula and stars
//        SAWS    synthwave sun sinking behind a glowing horizon
//        BOMBS   violet haze with a far-away minefield of blinking mines
//        CHAOS   red alert: searchlights sweeping through crimson smoke
//   4. twinkling stars and a faint neon grid
//   5. Universe 2: a psychedelic spiral whose hues stay between cyan and pink
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
uniform vec3 uAccent;     // world colour, 0..1
uniform vec3 uAccent2;    // the world's second sky colour
uniform vec4 uWorld;      // weight of each world's sky (sums to 1)
uniform vec4 uBeams;      // CHAOS searchlights: (cos, sin) of two beams
uniform vec2 uBeam3;      // ... and a third
uniform float uIntensity; // 0 slow .. 1 top speed
uniform float uPulse;     // flash on perfect turns
uniform float uWarp;      // 0 normal .. 1 bonus universe
uniform float uFlipY;     // 1 when the render target is upside down

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

// Two octaves are plenty for soft clouds (was three: a third fewer hashes).
float fbm(vec2 p) {
  return 0.58 * noise(p) + 0.3 * noise(p * 2.03 + vec2(17.1, 9.2));
}

float gridLine(vec2 p, float cell, float width) {
  vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell;
  float d = min(g.x, g.y);
  return 1.0 - smoothstep(0.0, width, d);
}

// One hash per cell: the star's offset and twinkle come from the same value.
float stars(vec2 p, float cell, float density, float seed) {
  vec2 sp = p / cell;
  vec2 id = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float h = hash(id + seed);
  vec2 off = fract(vec2(h * 17.31, h * 31.77)) - 0.5;
  float d = length(f - off * 0.7);
  float star = smoothstep(0.075, 0.0, d) * step(1.0 - density, h);
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
  return star * twinkle;
}

// A soft cone of light from o along unit direction dir.
float beam(vec2 p, vec2 o, vec2 dir) {
  vec2 v = p - o;
  float along = dot(v, dir);
  float across = abs(dot(v, vec2(-dir.y, dir.x)));
  float width = 0.02 + along * 0.2;
  float cone = smoothstep(width, width * 0.1, across);
  return cone * (0.6 + 0.4 * cone) * step(0.0, along) * exp(-along * 0.7);
}

float spike(vec2 v, float len) {
  return smoothstep(1.3, 0.3, abs(v.x)) * step(abs(v.y), len);
}

void main() {
  // Position relative to the screen centre, in world units (y down).
  float ty = mix(1.0 - outTexCoord.y, outTexCoord.y, uFlipY);
  vec2 screen = (vec2(outTexCoord.x, ty) - 0.5) * uSize;
  vec2 q = screen / uView;
  float aspect = uView.x / uView.y;
  vec2 sq = q * vec2(aspect, 1.0); // screen-height units, round circles
  float w0 = uWorld.x;
  float w1 = uWorld.y;
  float w2 = uWorld.z;
  float w3 = uWorld.w;

  // 1. Base gradient: #070B10 in the middle, near black at the edges.
  float r = length((q + vec2(0.0, 0.08)) * vec2(aspect, 1.0));
  vec3 col = mix(vec3(0.027, 0.043, 0.063), vec3(0.007, 0.010, 0.016), smoothstep(0.0, 1.1, r));

  // 2. Nebula in the world's two colours.
  vec2 np = (screen + uCam * 0.06) * 0.0021;
  float n1 = fbm(np + vec2(uTime * 0.012, -uTime * 0.007));
  float n2 = fbm(np * 1.8 - vec2(uTime * 0.015, 0.0) + n1 * 1.3);
  vec3 nebColor = mix(uAccent, uAccent2, smoothstep(0.32, 0.75, n2));
  float neb = pow(smoothstep(0.28, 0.95, n1 * 0.72 + n2 * 0.62), 2.2);
  float nebStrength = (0.15 + 0.1 * uIntensity) * (w0 + 0.45 * w1 + 0.75 * w2 + 0.7 * w3);
  col += nebColor * neb * nebStrength;

  // 3a. SAWS: synthwave sun with cut-out stripes, horizon glow and a
  // perspective floor grid rolling toward you.
  if (w1 > 0.001) {
    vec2 sc = vec2(0.0, -0.19) - uCam * 0.02 / uView.y;
    float R = 0.15;
    float d = length(sq - sc);
    float y01 = (sq.y - sc.y) / R; // -1 top .. 1 bottom
    float disc = smoothstep(R, R - 0.004, d);
    float stripeK = fract(y01 * 4.5 - uTime * 0.35);
    float gap = clamp(y01 * 0.6, 0.0, 0.6);
    float stripes = mix(1.0, smoothstep(gap - 0.06, gap, stripeK), step(0.0, y01));
    vec3 sunTop = mix(uAccent, vec3(1.0, 0.86, 0.45), 0.4);
    vec3 sunCol = mix(sunTop, uAccent2, smoothstep(-0.9, 0.9, y01));
    float halo = exp(-max(d - R, 0.0) * 9.0);
    vec3 sky = sunCol * disc * stripes * 0.24 + mix(uAccent, uAccent2, 0.5) * halo * 0.09;
    float hy = sc.y + R * 0.62;
    float below = step(hy, sq.y);
    sky *= 1.0 - below * 0.85; // the horizon hides the bottom of the sun
    sky += mix(uAccent2, uAccent, 0.35) * exp(-abs(sq.y - hy) * 38.0) * 0.16;
    // Floor grid below the horizon.
    float dz = max(sq.y - hy, 0.0);
    float z = 1.0 / (dz + 0.025);
    float gx = abs(fract(sq.x * z * 4.0) - 0.5);
    float gz = abs(fract(z * 0.5 + uTime * 0.6) - 0.5);
    float lines = max(smoothstep(0.42, 0.5, gx), smoothstep(0.4, 0.5, gz));
    float floorFade = below * smoothstep(0.0, 0.05, dz) * (1.0 - smoothstep(0.15, 0.7, dz));
    sky += uAccent2 * lines * floorFade * 0.06;
    col += sky * w1;
  }

  // 3b. BOMBS: violet haze and a far-away minefield (small, dim and slow
  // with parallax, so it never reads as a real bomb on the track).
  if (w2 > 0.001) {
    float haze = smoothstep(0.1, 0.85, n1 * 0.85 + n2 * 0.35);
    vec3 m = mix(uAccent, uAccent2, 0.15) * haze * 0.085;
    vec2 mp = screen + uCam * 0.16;
    float cell = 140.0;
    vec2 id = floor(mp / cell);
    float h = hash(id + 3.7);
    vec2 off = (fract(vec2(h * 13.1, h * 27.3)) - 0.5) * 0.55;
    vec2 v = (fract(mp / cell) - 0.5 - off) * cell; // world units from the mine
    float d = length(v);
    float has = step(0.5, h);
    float rad = 5.0 + h * 4.0;
    float body = smoothstep(rad, rad - 1.2, d);
    vec2 vd = vec2(v.x + v.y, v.x - v.y) * 0.7071;
    float spikes = max(max(spike(v, rad + 3.0), spike(v.yx, rad + 3.0)), max(spike(vd, rad + 2.0), spike(vd.yx, rad + 2.0)));
    float shape = max(body, spikes * step(rad - 0.5, d));
    float rim = smoothstep(rad - 2.0, rad, d) * body;
    float blink = pow(0.5 + 0.5 * sin(uTime * (1.5 + h * 2.5) + h * 30.0), 6.0);
    float light = exp(-d * d / 4.0) * blink;
    float glow = exp(-d / 16.0) * (0.3 + 0.7 * blink);
    m = mix(m, m * 0.3 - col * 0.5, shape * 0.7 * has);
    m += (uAccent * rim * 0.38 + uAccent2 * (light * 0.6 + glow * 0.08)) * has;
    col += m * w2;
  }

  // 3c. CHAOS: red alert. Searchlights sweep up from below the screen, and
  // the edges breathe red very slowly.
  if (w3 > 0.001) {
    float hw = 0.5 * aspect;
    float b = beam(sq, vec2(-0.7 * hw, 0.6), uBeams.xy)
            + beam(sq, vec2(0.7 * hw, 0.6), uBeams.zw)
            + 0.6 * beam(sq, vec2(0.0, -0.62), uBeam3);
    vec3 lightCol = mix(uAccent, vec3(1.0, 0.82, 0.74), 0.3);
    // Smoke catches the light: the beams are brighter where the nebula is.
    vec3 a = lightCol * b * (0.12 + 0.18 * smoothstep(0.2, 0.8, n1));
    float alert = 0.5 + 0.5 * sin(uTime * 2.2);
    a += uAccent * alert * alert * 0.06 * smoothstep(0.35, 1.0, r);
    a += uAccent2 * neb * 0.03;
    col += a * w3;
  }

  // 4. Stars, two depths (fewer behind the synthwave sun's horizon).
  float starDim = 1.0 - 0.35 * w1;
  col += vec3(0.7, 0.88, 1.0) * stars(screen + uCam * 0.12, 64.0, 0.28, 0.0) * 0.55 * starDim;
  col += vec3(0.9, 0.95, 1.0) * stars(screen + uCam * 0.25, 110.0, 0.2, 11.0) * 0.8 * starDim;

  // Neon grid.
  vec2 gp = screen + uCam * 0.4;
  float minor = gridLine(gp, 80.0, 1.1);
  float major = gridLine(gp, 320.0, 1.8);
  float gridFade = 1.0 - smoothstep(0.25, 0.9, r);
  col += uAccent * (minor * 0.03 + major * 0.06) * (0.6 + 0.6 * uIntensity) * gridFade * (1.0 - 0.5 * w1);

  // Energy pulse from PERFECT turns.
  col += uAccent * uPulse * 0.09 * (1.0 - smoothstep(0.0, 0.9, r));

  // 5. Bonus universe: a slowly turning spiral, ripples and hyperspace
  // streaks rushing out from the centre. The hue sweeps only through
  // cyan, blue, violet and pink (160..330 degrees), never yellow, so the
  // yellow ducks always stand out. Kept dim so the track stays readable.
  if (uWarp > 0.001) {
    float rad = length(sq);
    float ang = atan(q.y, q.x);
    float spiral = sin(ang * 5.0 + log(rad + 0.02) * 9.0 - uTime * 2.5);
    float ripples = sin(rad * 28.0 - uTime * 5.0);
    float phase = ang / 6.2831 + uTime * 0.07 + rad * 0.5;
    float hue = (160.0 + 170.0 * (0.5 - 0.5 * cos(6.2831 * phase))) / 360.0;
    vec3 rainbow = hsv2rgb(vec3(hue, 0.8, 1.0));
    vec3 psy = rainbow * (0.07 + 0.13 * smoothstep(0.1, 1.0, spiral) + 0.03 * ripples);
    float streak = pow(abs(sin(ang * 23.0)), 80.0) * fract(rad * 1.5 - uTime * 1.2) * smoothstep(0.15, 0.9, rad);
    psy += vec3(1.0) * streak * 0.22;
    col = mix(col, col * 0.5 + psy, uWarp);
  }

  // Tiny dither kills gradient banding on 8-bit screens (no hash needed).
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  col += (dither - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;
