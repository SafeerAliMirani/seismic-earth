// shaders.js - WGSL for globe surface, graticule, coastlines, and quake SPIKES.
// All passes share one uniform block (bind group 0, binding 0). The globe pass
// also binds a land/ocean mask texture (binding 1 sampler, 2 texture).

const UNIFORMS = `
struct Uniforms {
  viewProj : mat4x4<f32>,
  params   : vec4<f32>,   // x: spikeWidthPx  y: currentT(0..1)  z: minMag  w: unused
  screen   : vec4<f32>,   // x: width  y: height  z: pulseWin  w: historyFloor
  light    : vec4<f32>,   // xyz: light direction
};
@group(0) @binding(0) var<uniform> U : Uniforms;
`;

// --- Globe surface: land/ocean fill from a mask texture, lambert shading ---- //
export const GLOBE_SHADER = UNIFORMS + `
@group(0) @binding(1) var landSamp : sampler;
@group(0) @binding(2) var landTex  : texture_2d<f32>;

struct VO { @builtin(position) pos : vec4<f32>, @location(0) n : vec3<f32> };

@vertex fn vs(@location(0) p : vec3<f32>) -> VO {
  var o : VO;
  o.pos = U.viewProj * vec4<f32>(p, 1.0);
  o.n = normalize(p);
  return o;
}

@fragment fn fs(i : VO) -> @location(0) vec4<f32> {
  let n = normalize(i.n);
  let L = normalize(U.light.xyz);
  let d = max(dot(n, L), 0.0);

  // sphere position -> lon/lat -> equirectangular UV (matches land.js raster)
  let PI = 3.14159265;
  let lon = atan2(n.z, n.x);
  let lat = asin(clamp(n.y, -1.0, 1.0));
  let uv = vec2<f32>(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  let raw = textureSampleLevel(landTex, landSamp, uv, 0.0).r;
  let land = smoothstep(0.4, 0.6, raw);

  let ocean   = vec3<f32>(0.03, 0.13, 0.28);
  let landCol = vec3<f32>(0.20, 0.30, 0.16);
  let base = mix(ocean, landCol, land);

  let lit = base * (0.40 + 0.9 * d);
  let rim = pow(1.0 - d, 3.0) * 0.08 * (1.0 - land);   // thin atmosphere over sea
  return vec4<f32>(lit + vec3<f32>(0.0, rim, rim * 1.4), 1.0);
}
`;

// --- Graticule: faint blue lat/long lines --------------------------------- //
export const LINE_SHADER = UNIFORMS + `
@vertex fn vs(@location(0) p : vec3<f32>) -> @builtin(position) vec4<f32> {
  return U.viewProj * vec4<f32>(p, 1.0);
}
@fragment fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.30, 0.42, 0.60, 0.20);
}
`;

// --- Coastlines / borders: brighter warm land outlines -------------------- //
export const COAST_SHADER = UNIFORMS + `
@vertex fn vs(@location(0) p : vec3<f32>) -> @builtin(position) vec4<f32> {
  return U.viewProj * vec4<f32>(p, 1.0);
}
@fragment fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.78, 0.82, 0.66, 0.75);
}
`;

// --- Earthquake SPIKES: a screen-space quad from the surface (base) out to a
//     tip whose height scales with magnitude; recent quakes pulse taller and
//     brighter. One instanced draw of 6 verts per event. ------------------- //
export const POINT_SHADER = UNIFORMS + `
@group(0) @binding(1) var<storage, read> data : array<vec4<f32>>; // 2 vec4/event

struct VO {
  @builtin(position) pos : vec4<f32>,
  @location(0) color : vec3<f32>,
  @location(1) alpha : f32,
  @location(2) t : f32,      // 0 = base, 1 = tip
};

fn depthColor(t : f32) -> vec3<f32> {
  let c0 = vec3<f32>(1.00, 0.35, 0.20);   // shallow  (0-70 km)
  let c1 = vec3<f32>(1.00, 0.85, 0.20);   // yellow
  let c2 = vec3<f32>(0.30, 0.90, 0.55);   // green
  let c3 = vec3<f32>(0.35, 0.62, 1.00);   // deep     (~700 km)
  if (t < 0.33) { return mix(c0, c1, t / 0.33); }
  if (t < 0.66) { return mix(c1, c2, (t - 0.33) / 0.33); }
  return mix(c2, c3, (t - 0.66) / 0.34);
}

@vertex fn vs(@builtin(instance_index) inst : u32,
              @builtin(vertex_index) vid : u32) -> VO {
  var o : VO;
  let p0 = data[inst * 2u];
  let p1 = data[inst * 2u + 1u];
  let mag = p0.w;
  let depthN = p1.x;
  let tN = p1.y;

  var ends  = array<f32, 6>(0.0, 0.0, 1.0, 0.0, 1.0, 1.0);
  var sides = array<f32, 6>(-1.0, 1.0, 1.0, -1.0, 1.0, -1.0);
  let end = ends[vid];
  let side = sides[vid];

  if (mag < U.params.z || tN > U.params.y) {   // magnitude / time filter
    o.pos = vec4<f32>(3.0, 3.0, 0.5, 1.0);
    o.color = vec3<f32>(0.0); o.alpha = 0.0; o.t = 0.0;
    return o;
  }

  let base = p0.xyz;
  let nrm = normalize(base);
  let recency = U.params.y - tN;
  var pulse = 0.0;
  if (recency < U.screen.z) { pulse = 1.0 - recency / U.screen.z; }
  var height = clamp(mag - 3.5, 0.2, 6.0) * 0.03;
  height = height * (1.0 + pulse * 1.3);
  let tip = base + nrm * height;

  let cb = U.viewProj * vec4<f32>(base, 1.0);
  let ct = U.viewProj * vec4<f32>(tip, 1.0);
  if (cb.w <= 0.0 || ct.w <= 0.0) {              // behind camera
    o.pos = vec4<f32>(3.0, 3.0, 0.5, 1.0);
    o.color = vec3<f32>(0.0); o.alpha = 0.0; o.t = 0.0;
    return o;
  }

  let sb = (cb.xy / cb.w * vec2<f32>(0.5, -0.5) + 0.5) * U.screen.xy;
  var st = (ct.xy / ct.w * vec2<f32>(0.5, -0.5) + 0.5) * U.screen.xy;
  var dir = st - sb;
  let len = length(dir);
  dir = select(vec2<f32>(0.0, -1.0), dir / len, len > 0.75);   // head-on fallback
  st = sb + dir * max(len, 3.0);                                // keep spikes visible
  let perp = vec2<f32>(-dir.y, dir.x);
  let halfW = U.params.x * (0.12 + mag * 0.05);

  let clip = select(cb, ct, end > 0.5);
  let sPix = select(sb, st, end > 0.5) + perp * side * halfW;
  let ndc = (sPix / U.screen.xy) * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0);
  o.pos = vec4<f32>(ndc * clip.w, clip.z, clip.w);
  o.color = depthColor(depthN);
  var a = mix(1.0, U.screen.w, clamp(recency / 0.12, 0.0, 1.0));
  if (pulse > 0.0) { a = 1.0; }
  o.alpha = a;
  o.t = end;
  return o;
}

@fragment fn fs(i : VO) -> @location(0) vec4<f32> {
  let glow = mix(1.5, 0.55, i.t);          // hot base, softer tip
  let a = i.alpha * mix(0.95, 0.35, i.t);
  if (a <= 0.004) { discard; }
  return vec4<f32>(i.color * glow, a);
}
`;
