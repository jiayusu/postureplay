/**
 * Three.js GPU 自定义着色器集合
 * 包含：Bloom 发光、fBm 噪声能量场、Sobel 水墨描边、LUT 国潮调色、八卦光环
 */

// ──────────────────────────────────────────────
// 1. Bloom 发光 —— 亮度提取 + 双 Pass 高斯模糊
// ──────────────────────────────────────────────

/** 亮度提取：只保留超过阈值的亮部 */
export const LUMINANCE_EXTRACT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const LUMINANCE_EXTRACT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
varying vec2 vUv;

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float l = luminance(color.rgb);
  float contribution = smoothstep(uThreshold - 0.1, uThreshold + 0.1, l);
  gl_FragColor = vec4(color.rgb * contribution, 1.0);
}`

/** 高斯模糊（1D）：水平 + 垂直各一次 */
export const GAUSSIAN_BLUR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const GAUSSIAN_BLUR_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDirection;
uniform float uRadius;
varying vec2 vUv;

void main() {
  vec4 color = vec4(0.0);
  // 9-tap 高斯核
  float weights[5];
  weights[0] = 0.227027;
  weights[1] = 0.1945946;
  weights[2] = 0.1216216;
  weights[3] = 0.054054;
  weights[4] = 0.016216;

  vec2 offset = uDirection * uRadius;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    color += texture2D(tDiffuse, vUv + offset * fi) * weights[i];
    color += texture2D(tDiffuse, vUv - offset * fi) * weights[i];
  }

  gl_FragColor = color;
}`

/** 叠加合成：原图 + Bloom */
export const BLOOM_COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const BLOOM_COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloomStrength;
varying vec2 vUv;

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  vec4 bloom = texture2D(tBloom, vUv);
  gl_FragColor = vec4(original.rgb + bloom.rgb * uBloomStrength, original.a);
}`


// ──────────────────────────────────────────────
// 2. fBm 噪声 —— 能量场脉动
// ──────────────────────────────────────────────

export const ENERGY_NOISE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const ENERGY_NOISE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uEnergyLevel;  // 0.0 ~ 1.0，决定噪声强度和颜色
uniform vec2 uCenter;        // 能量中心（归一化坐标）
varying vec2 vUv;

// ── Simplex-like noise ──
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// fBm: 多层噪声叠加
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec4 original = texture2D(tDiffuse, vUv);

  // 从能量中心向外的距离衰减
  float dist = length(vUv - uCenter) * 1.5;

  // fBm 噪声（时间驱动动画）
  float noise = fbm(vec3(vUv * 3.0, uTime * 0.3));

  // 能量强度 = base * distance falloff
  float energy = uEnergyLevel * (1.0 - smoothstep(0.0, 1.0, dist)) * 0.4;

  // 噪声调制
  float ripple = noise * energy;

  // 能量颜色：低能 → 翠绿，高能 → 金橙
  vec3 lowColor = vec3(0.1, 0.8, 0.4);   // 翠绿色
  vec3 highColor = vec3(1.0, 0.7, 0.1);   // 金色
  vec3 energyColor = mix(lowColor, highColor, uEnergyLevel);

  // 合成
  vec3 overlay = original.rgb + energyColor * ripple;
  gl_FragColor = vec4(overlay, 1.0);
}`


// ──────────────────────────────────────────────
// 3. Sobel 水墨描边
// ──────────────────────────────────────────────

export const SOBEL_OUTLINE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const SOBEL_OUTLINE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexelSize;
uniform float uEdgeStrength;
uniform vec3 uInkColor;       // 墨色（默认深灰黑）
uniform float uNoiseAmount;   // 噪点量（水墨质感）
varying vec2 vUv;

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// 简单随机（用于水墨噪点）
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 original = texture2D(tDiffuse, vUv);

  // Sobel 3x3 采样
  float tl = luminance(texture2D(tDiffuse, vUv + vec2(-1, -1) * uTexelSize).rgb);
  float t  = luminance(texture2D(tDiffuse, vUv + vec2( 0, -1) * uTexelSize).rgb);
  float tr = luminance(texture2D(tDiffuse, vUv + vec2( 1, -1) * uTexelSize).rgb);
  float l  = luminance(texture2D(tDiffuse, vUv + vec2(-1,  0) * uTexelSize).rgb);
  float r  = luminance(texture2D(tDiffuse, vUv + vec2( 1,  0) * uTexelSize).rgb);
  float bl = luminance(texture2D(tDiffuse, vUv + vec2(-1,  1) * uTexelSize).rgb);
  float b  = luminance(texture2D(tDiffuse, vUv + vec2( 0,  1) * uTexelSize).rgb);
  float br = luminance(texture2D(tDiffuse, vUv + vec2( 1,  1) * uTexelSize).rgb);

  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy) * uEdgeStrength;

  // 水墨噪点叠加
  float noise = hash(vUv * 1000.0 + fract(edge * 10.0)) * uNoiseAmount;

  // 描边混合：原图上叠加深色边缘
  float alpha = smoothstep(0.1, 0.4, edge + noise);
  vec3 result = mix(original.rgb, uInkColor, alpha);

  gl_FragColor = vec4(result, 1.0);
}`


// ──────────────────────────────────────────────
// 4. LUT 国潮色调
// ──────────────────────────────────────────────

export const LUT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const LUT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tLUT;          // 32x32x32 的 3D LUT 纹理（展平为 1024x32）
uniform float uIntensity;        // LUT 混合强度
varying vec2 vUv;

vec4 sampleLUT(vec3 color) {
  // 将 RGB [0,1] 映射到 LUT 纹理坐标
  // LUT 纹理布局：32层 (B) × 32行 (G) = 1024px 宽 × 32px 高
  float blueIdx = color.b * 31.0;
  float x = mod(blueIdx, 32.0) + color.r * 31.0;
  float y = floor(blueIdx / 32.0) + color.g * 31.0;

  vec2 coord = vec2(x / 1024.0, y / 32.0);
  return texture2D(tLUT, coord);
}

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  vec4 graded = sampleLUT(original.rgb);
  gl_FragColor = vec4(mix(original.rgb, graded.rgb, uIntensity), original.a);
}`


// ──────────────────────────────────────────────
// 5. 八卦光环着色器
// ──────────────────────────────────────────────

export const BAGUA_HALO_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const BAGUA_HALO_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uInnerRadius;    // 内径 (0~1)
uniform float uOuterRadius;    // 外径 (0~1)
uniform vec3 uYangColor;       // 阳色（金色）
uniform vec3 uYinColor;        // 阴色（深色）
uniform float uGlowIntensity;  // 发光强度
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  // 计算到圆心的距离和角度
  float dist = length(vUv - 0.5) * 2.0; // 归一化到 0~1
  float angle = atan(vUv.y - 0.5, vUv.x - 0.5);

  // 旋转动画
  angle += uTime * 0.3;

  // 8 扇区判定
  float sectorSize = 3.14159265 / 4.0; // PI/4
  float sector = floor((angle + 3.14159265) / sectorSize);
  bool isYang = mod(sector, 2.0) < 1.0;

  // 光环形状：环形 mask
  float ringMask = smoothstep(uInnerRadius - 0.02, uInnerRadius, dist)
                 * (1.0 - smoothstep(uOuterRadius, uOuterRadius + 0.02, dist));

  // 发光衰减
  float glow = ringMask * uGlowIntensity;

  // 阴阳色
  vec3 color = isYang ? uYangColor : uYinColor;

  // 透明度：光环边缘更亮（Fresnel-like）
  float edgeGlow = 1.0 - abs(dist - (uInnerRadius + uOuterRadius) * 0.5) * 4.0;
  edgeGlow = clamp(edgeGlow, 0.0, 1.0);

  float alpha = glow * edgeGlow * uOpacity;
  gl_FragColor = vec4(color, alpha);
}`


// ──────────────────────────────────────────────
// 6. 光柱核心着色器
// ──────────────────────────────────────────────

export const GLOW_COLUMN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const GLOW_COLUMN_FRAG = /* glsl */ `
uniform vec3 uGlowColor;
uniform float uIntensity;
uniform float uTime;
uniform float uPulseSpeed;
varying vec2 vUv;

void main() {
  // 中心亮度最高，向两边衰减
  float centerDist = abs(vUv.x - 0.5) * 2.0;
  float falloff = exp(-centerDist * 3.0);

  // 脉冲动画
  float pulse = 1.0 + sin(uTime * uPulseSpeed) * 0.15;

  // 纵向渐变（底部更亮）
  float verticalGrad = 1.0 - vUv.y * 0.3;

  float alpha = falloff * pulse * verticalGrad * uIntensity;

  // 光柱核心白色，外围有色
  vec3 coreColor = mix(vec3(1.0), uGlowColor, centerDist);

  gl_FragColor = vec4(coreColor, alpha);
}`


// ──────────────────────────────────────────────
// 7. 粒子着色器（InstancedMesh 使用）
// ──────────────────────────────────────────────

export const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = aAlpha;
  vColor = aColor;
}`

export const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  // 圆形 soft particle
  float dist = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = 1.0 - smoothstep(0.3, 1.0, dist);
  gl_FragColor = vec4(vColor, alpha * vAlpha);
}`


// ──────────────────────────────────────────────
// 8. 全屏复制（Copy）
// ──────────────────────────────────────────────

export const COPY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const COPY_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}`

// ──────────────────────────────────────────────
// 9. 2D 流体模拟器 — Jos Stam 方法 (6 个着色器)
// ──────────────────────────────────────────────

/** 速度场平流 */
export const FLUID_ADVECT_VELOCITY_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform sampler2D tSource;
uniform vec2 uTexelSize;
uniform float uTimeStep;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  vec2 velocity = texture2D(tVelocity, vUv).xy;
  vec2 pos = vUv - velocity * uTimeStep * uTexelSize * 20.0;
  pos = clamp(pos, vec2(0.0), vec2(1.0));
  gl_FragColor = vec4(texture2D(tSource, pos).xy * uDissipation, 0.0, 1.0);
}`

/** 速度场粘性扩散 */
export const FLUID_DIFFUSE_VELOCITY_FRAG = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexelSize;
uniform float uAlpha; // alpha = dx²/(nu*dt)
uniform float uBeta;  // beta  = 1/(4+alpha)
varying vec2 vUv;

void main() {
  vec4 x = texture2D(tSource, vUv);
  vec4 n = texture2D(tSource, vUv + vec2(0.0, uTexelSize.y));
  vec4 s = texture2D(tSource, vUv + vec2(0.0, -uTexelSize.y));
  vec4 e = texture2D(tSource, vUv + vec2(uTexelSize.x, 0.0));
  vec4 w = texture2D(tSource, vUv + vec2(-uTexelSize.x, 0.0));
  gl_FragColor = (x + uAlpha * (n + s + e + w)) * uBeta;
}`

/** 密度场平流 */
export const FLUID_ADVECT_DENSITY_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform sampler2D tDensity;
uniform vec2 uTexelSize;
uniform float uTimeStep;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  vec2 velocity = texture2D(tVelocity, vUv).xy;
  vec2 pos = vUv - velocity * uTimeStep * uTexelSize * 20.0;
  pos = clamp(pos, vec2(0.0), vec2(1.0));
  vec4 density = texture2D(tDensity, pos);
  gl_FragColor = vec4(density.rgb * uDissipation, 1.0);
}`

/** 散度计算 */
export const FLUID_DIVERGENCE_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float L = texture2D(tVelocity, vUv + vec2(-uTexelSize.x, 0.0)).x;
  float R = texture2D(tVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(tVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  float B = texture2D(tVelocity, vUv + vec2(0.0, -uTexelSize.y)).y;
  float divergence = 0.5 * ((R - L) + (T - B));
  gl_FragColor = vec4(divergence, 0.0, 0.0, 1.0);
}`

/** Jacobi 迭代（压力 Poisson 求解） */
export const FLUID_JACOBI_FRAG = /* glsl */ `
uniform sampler2D tPressure;
uniform sampler2D tDivergence;
uniform vec2 uTexelSize;
uniform float uAlpha; // = -dx²
uniform float uBeta;  // = 1/4
varying vec2 vUv;

void main() {
  vec4 n = texture2D(tPressure, vUv + vec2(0.0, uTexelSize.y));
  vec4 s = texture2D(tPressure, vUv + vec2(0.0, -uTexelSize.y));
  vec4 e = texture2D(tPressure, vUv + vec2(uTexelSize.x, 0.0));
  vec4 w = texture2D(tPressure, vUv + vec2(-uTexelSize.x, 0.0));
  float divergence = texture2D(tDivergence, vUv).x;
  float pressure = (n.x + s.x + e.x + w.x + uAlpha * divergence) * uBeta;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`

/** 投影（减去压力梯度，使速度无散度） */
export const FLUID_PROJECT_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform sampler2D tPressure;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float L = texture2D(tPressure, vUv + vec2(-uTexelSize.x, 0.0)).x;
  float R = texture2D(tPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture2D(tPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture2D(tPressure, vUv + vec2(0.0, -uTexelSize.y)).x;
  vec2 velocity = texture2D(tVelocity, vUv).xy;
  vec2 gradient = vec2(R - L, T - B) * 0.5;
  gl_FragColor = vec4(velocity - gradient, 0.0, 1.0);
}`


// ──────────────────────────────────────────────
// 10. GPU Rutt/Etra 线框浮雕（替换 CPU Sobel）
// ──────────────────────────────────────────────

/** Sobel 边缘检测 + 深度位移 */
export const RELIEF_WIREFRAME_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexelSize;
uniform float uEdgeStrength;
uniform float uWireSpacing;   // 线间距（0.003 ~ 0.01）
uniform float uDisplacement;  // 垂直位移幅度
uniform float uTime;
uniform vec3 uLineColor;
uniform vec3 uGlowColor;
varying vec2 vUv;

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  float l = luminance(original.rgb);

  // Sobel 边缘强度
  float tl = luminance(texture2D(tDiffuse, vUv + vec2(-1, -1) * uTexelSize).rgb);
  float t  = luminance(texture2D(tDiffuse, vUv + vec2( 0, -1) * uTexelSize).rgb);
  float tr = luminance(texture2D(tDiffuse, vUv + vec2( 1, -1) * uTexelSize).rgb);
  float l2 = luminance(texture2D(tDiffuse, vUv + vec2(-1,  0) * uTexelSize).rgb);
  float r2 = luminance(texture2D(tDiffuse, vUv + vec2( 1,  0) * uTexelSize).rgb);
  float bl = luminance(texture2D(tDiffuse, vUv + vec2(-1,  1) * uTexelSize).rgb);
  float b  = luminance(texture2D(tDiffuse, vUv + vec2( 0,  1) * uTexelSize).rgb);
  float br = luminance(texture2D(tDiffuse, vUv + vec2( 1,  1) * uTexelSize).rgb);

  float gx = -tl - 2.0 * l2 - bl + tr + 2.0 * r2 + br;
  float gy = -tl - 2.0 * t  - tr + bl + 2.0 * b  + br;
  float edge = sqrt(gx * gx + gy * gy);

  // 亮度驱动的垂直位移
  float disp = l * uDisplacement;

  // 水平线框遮罩（Rutt/Etra 风格）
  float wireY = fract(vUv.y / uWireSpacing + disp * 0.1);
  float wireMask = smoothstep(0.0, 0.02, wireY) * (1.0 - smoothstep(0.04, 0.06, wireY));

  // 垂直线（用 Sobel 水平方向梯度做遮罩）
  float wireX = fract(vUv.x / uWireSpacing);
  float vertWire = gx * gx * uEdgeStrength * 3.0;
  float vertMask = smoothstep(0.0, 0.02, wireX) * (1.0 - smoothstep(0.04, 0.06, wireX));

  // 噪声纹理
  float noise = hash(vUv * 1000.0 + uTime * 0.1) * 0.15;

  // 合成：边缘 + 水平线 + 噪声
  float wireIntensity = edge * uEdgeStrength * 0.5
    + wireMask * 0.3
    + vertWire * vertMask * 0.4
    + noise * 0.1;

  // 发光颜色混合
  vec3 wireColor = mix(uLineColor, uGlowColor, edge * 0.5 + noise);

  gl_FragColor = vec4(mix(original.rgb * 0.3, wireColor, clamp(wireIntensity, 0.0, 1.0)), 1.0);
}`


// ──────────────────────────────────────────────
// 11. 墨迹扩散 — 密度场注入 + 扩散
// ──────────────────────────────────────────────

export const INK_SPREAD_FRAG = /* glsl */ `
uniform sampler2D tDensity;
uniform sampler2D tVelocity;
uniform vec2 uTexelSize;
uniform float uTimeStep;
uniform float uDissipation;
varying vec2 vUv;

void main() {
  vec2 velocity = texture2D(tVelocity, vUv).xy;
  vec2 pos = vUv - velocity * uTimeStep * uTexelSize * 15.0;
  pos = clamp(pos, vec2(0.0), vec2(1.0));
  vec4 density = texture2D(tDensity, pos);

  // 扩散：对墨水做轻微拉普拉斯扩散
  vec4 n = texture2D(tDensity, vUv + vec2(0.0, uTexelSize.y));
  vec4 s = texture2D(tDensity, vUv + vec2(0.0, -uTexelSize.y));
  vec4 e = texture2D(tDensity, vUv + vec2(uTexelSize.x, 0.0));
  vec4 w = texture2D(tDensity, vUv + vec2(-uTexelSize.x, 0.0));
  vec4 laplacian = n + s + e + w - 4.0 * density;

  gl_FragColor = vec4((density.rgb + laplacian.rgb * 0.1) * uDissipation, 1.0);
}`


// ──────────────────────────────────────────────
// 12. 漩涡爆发 — 径向螺旋粒子场
// ──────────────────────────────────────────────

export const VORTEX_BURST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform float uIntensity;
uniform float uRadius;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  float dist = length(vUv - uCenter);
  float angle = atan(vUv.y - uCenter.y, vUv.x - uCenter.x);

  // 螺旋角度偏移（时间驱动旋转）
  float spiral = angle + dist * 8.0 + uTime * 2.0;

  // 径向衰减
  float radialFalloff = exp(-dist / uRadius) * uIntensity;

  // 螺旋纹带
  float band = abs(sin(spiral * 3.0)) * 0.5 + 0.5;
  band = smoothstep(0.2, 0.8, band) * radialFalloff;

  // 外层光环
  float halo = smoothstep(uRadius * 0.8, uRadius, dist) * (1.0 - smoothstep(uRadius, uRadius * 1.1, dist));

  // 颜色：翠绿核心 → 金色边缘
  vec3 innerColor = vec3(0.1, 0.9, 0.5);
  vec3 outerColor = vec3(1.0, 0.75, 0.2);
  vec3 burstColor = mix(innerColor, outerColor, dist / uRadius);

  float alpha = band + halo * 0.6;
  gl_FragColor = vec4(mix(original.rgb, original.rgb + burstColor * alpha, alpha), 1.0);
}`


// ──────────────────────────────────────────────
// 13. 光带拖尾 — 粒子位置渲染
// ──────────────────────────────────────────────

export const LIGHT_TRAIL_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tTrail;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  vec4 trail = texture2D(tTrail, vUv);

  // 光带叠加（Additive 混合）
  vec3 glow = trail.rgb * uIntensity * 0.6;
  gl_FragColor = vec4(original.rgb + glow, 1.0);
}`


// ──────────────────────────────────────────────
// 14. 脉冲光环 — 同心环扩散
// ──────────────────────────────────────────────

export const PULSE_RING_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform float uPulsePhase;   // 0~1 脉冲相位
uniform float uPulseSpeed;
uniform float uInnerRadius;
uniform vec3 uPulseColor;
varying vec2 vUv;

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  float dist = length(vUv - uCenter);

  // 多脉冲环
  float ring1 = abs(sin(dist * 20.0 - uPulsePhase * 6.28318)) * exp(-dist * 1.5);
  float ring2 = abs(sin(dist * 35.0 - uPulsePhase * 6.28318 + 1.5)) * exp(-dist * 2.0) * 0.5;

  float alpha = (ring1 + ring2) * smoothstep(uInnerRadius, uInnerRadius + 0.1, dist);

  gl_FragColor = vec4(original.rgb + uPulseColor * alpha * 0.8, 1.0);
}`


// ──────────────────────────────────────────────
// 15. 流体速度场可视化 — 染色纹理
// ──────────────────────────────────────────────

export const FLOW_VISUALIZE_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform float uMagnification;
varying vec2 vUv;

void main() {
  vec2 velocity = texture2D(tVelocity, vUv).xy;
  float speed = length(velocity);

  // 颜色映射：低速蓝 → 中速绿 → 高速金
  vec3 color = mix(
    vec3(0.1, 0.3, 0.8),
    vec3(0.1, 0.8, 0.5),
    smoothstep(0.0, 0.3, speed)
  );
  color = mix(color, vec3(1.0, 0.7, 0.1), smoothstep(0.3, 0.7, speed));

  float alpha = speed * uMagnification;
  gl_FragColor = vec4(color, alpha);
}`


// ──────────────────────────────────────────────
// 16. 全屏流体叠加合成
// ──────────────────────────────────────────────

export const FLUID_COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tFluid;
uniform float uFluidIntensity;
uniform float uFluidMode; // 0=overlay, 1=additive, 2=screen
varying vec2 vUv;

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  vec4 fluid = texture2D(tFluid, vUv);

  vec3 result;
  if (uFluidMode < 0.5) {
    // Overlay
    result = mix(original.rgb, original.rgb * 2.0 * fluid.rgb, fluid.a * uFluidIntensity);
  } else if (uFluidMode < 1.5) {
    // Additive
    result = original.rgb + fluid.rgb * fluid.a * uFluidIntensity;
  } else {
    // Screen
    result = 1.0 - (1.0 - original.rgb) * (1.0 - fluid.rgb * uFluidIntensity);
  }

  gl_FragColor = vec4(result, 1.0);
}`


// ──────────────────────────────────────────────
// 17. 能量粒子追踪器 — 沿速度场移动
// ──────────────────────────────────────────────

export const TRACER_UPDATE_FRAG = /* glsl */ `
uniform sampler2D tPositions;  // RG = position.xy, B = life
uniform sampler2D tVelocity;
uniform float uTimeStep;
uniform float uLifeDecay;
varying vec2 vUv;

void main() {
  vec4 posData = texture2D(tPositions, vUv);
  vec2 pos = posData.xy;
  float life = posData.z;

  if (life <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // 采样速度场
  vec2 velocity = texture2D(tVelocity, pos).xy;

  // 更新位置
  vec2 newPos = pos + velocity * uTimeStep;
  newPos = clamp(newPos, vec2(0.001), vec2(0.999));

  // 衰减生命
  float newLife = life - uLifeDecay;

  gl_FragColor = vec4(newPos, newLife, 0.0);
}`


// ──────────────────────────────────────────────
// 18. 火焰/能量湍流 — Voronoi + 噪声混合
// ──────────────────────────────────────────────

export const ENERGY_TURBULENCE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;

float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float res = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 b = vec2(float(x), float(y));
      vec2 point = vec2(hash2D(i + b), hash2D(i + b + vec2(0.5)));
      vec2 diff = b + point - f;
      float d = dot(diff, diff);
      res = min(res, d);
    }
  }
  return sqrt(res);
}

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  float dist = length(vUv - uCenter) * 2.5;

  // 时间驱动的湍流
  vec2 turbCoord = vUv * 4.0 + vec2(uTime * 0.2, uTime * 0.15);
  float turb = voronoi(turbCoord);
  float turb2 = voronoi(turbCoord * 1.7 + 0.5);

  // 多层湍流
  float energy = mix(turb, turb2, 0.4) * exp(-dist * 1.2);
  energy = pow(energy, 1.5) * uIntensity * 0.6;

  // 颜色：低能翠绿 → 高能橙金 → 极热白
  vec3 lowColor = vec3(0.05, 0.7, 0.3);
  vec3 midColor = vec3(1.0, 0.5, 0.1);
  vec3 highColor = vec3(1.0, 0.9, 0.8);
  vec3 turbColor = mix(lowColor, midColor, smoothstep(0.1, 0.4, energy));
  turbColor = mix(turbColor, highColor, smoothstep(0.4, 0.7, energy));

  gl_FragColor = vec4(original.rgb + turbColor * energy, 1.0);
}`


// ──────────────────────────────────────────────
// 19. Curl Noise — 速度场漩涡扰动 (Taichi 风格)
// ──────────────────────────────────────────────

/** 计算 2D 旋度 curl(velocity) */
export const CURL_CALC_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  float vx_top = texture2D(tVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  float vx_bot = texture2D(tVelocity, vUv + vec2(0.0, -uTexelSize.y)).x;
  float vy_right = texture2D(tVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float vy_left = texture2D(tVelocity, vUv + vec2(-uTexelSize.x, 0.0)).y;
  float curl = (vy_right - vy_left) - (vx_top - vx_bot);
  gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
}`

/** Vorticity Confinement — 增强漩涡保持 */
export const VORTICITY_CONFINEMENT_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform sampler2D tCurl;
uniform vec2 uTexelSize;
uniform float uStrength; // 0.0 ~ 2.0
varying vec2 vUv;

void main() {
  vec2 velocity = texture2D(tVelocity, vUv).xy;

  float curl_center = texture2D(tCurl, vUv).x;
  float curl_left   = texture2D(tCurl, vUv + vec2(-uTexelSize.x, 0.0)).x;
  float curl_right  = texture2D(tCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float curl_top    = texture2D(tCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  float curl_bottom = texture2D(tCurl, vUv + vec2(0.0, -uTexelSize.y)).x;

  float curl_grad_x = (abs(curl_right) - abs(curl_left)) * 0.5;
  float curl_grad_y = (abs(curl_top) - abs(curl_bottom)) * 0.5;
  float curl_grad_len = length(vec2(curl_grad_x, curl_grad_y)) + 1e-5;

  vec2 curl_force = uStrength * vec2(curl_grad_y, -curl_grad_x) / curl_grad_len * abs(curl_center);

  gl_FragColor = vec4(velocity + curl_force, 0.0, 1.0);
}`

/** 3D Curl Noise — 用于生成无散度速度场 */
export const CURL_NOISE_FRAG = /* glsl */ `
uniform vec2 uOffset;
uniform float uScale;
uniform float uStrength;
varying vec2 vUv;

// Simplex-like 3D noise (简化版)
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + 113.0 * p.z;
  return mix(mix(mix(hash(n), hash(n+1.0), f.x),
                 mix(hash(n+57.0), hash(n+58.0), f.x), f.y),
             mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                 mix(hash(n+170.0), hash(n+171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
  float f = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) {
    f += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return f;
}

void main() {
  vec3 pos = vec3(vUv * uScale + uOffset, 0.0);

  // 数值微分求 curl of noise
  float eps = 0.01;
  float nx = fbm(pos + vec3(eps, 0.0, 0.3));
  float px = fbm(pos - vec3(eps, 0.0, 0.3));
  float ny = fbm(pos + vec3(0.0, eps, 0.6));
  float py = fbm(pos - vec3(0.0, eps, 0.6));

  vec2 curl = vec2((ny - py), -(nx - px)) / (2.0 * eps) * uStrength;
  gl_FragColor = vec4(curl, 0.0, 1.0);
}`


// ──────────────────────────────────────────────
// 20. Reaction-Diffusion — Gray-Scott 图灵斑纹
// ──────────────────────────────────────────────

export const REACTION_DIFFUSION_FRAG = /* glsl */ `
uniform sampler2D tChemicals;  // RG = U, B = V
uniform vec2 uTexelSize;
uniform float uFeed;      // feed rate (0.02~0.06)
uniform float uKill;      // kill rate (0.04~0.07)
uniform float uDu;        // diffusion rate U
uniform float uDv;        // diffusion rate V
varying vec2 vUv;

void main() {
  vec4 center = texture2D(tChemicals, vUv);
  float u = center.r;
  float v = center.g;

  // 5-point Laplacian
  vec4 n = texture2D(tChemicals, vUv + vec2(0.0, uTexelSize.y));
  vec4 s = texture2D(tChemicals, vUv + vec2(0.0, -uTexelSize.y));
  vec4 e = texture2D(tChemicals, vUv + vec2(uTexelSize.x, 0.0));
  vec4 w = texture2D(tChemicals, vUv + vec2(-uTexelSize.x, 0.0));

  float lu = n.r + s.r + e.r + w.r - 4.0 * u;
  float lv = n.g + s.g + e.g + w.g - 4.0 * v;

  float reaction = u * v * v;
  float du = uDu * lu - reaction + uFeed * (1.0 - u);
  float dv = uDv * lv + reaction - (uFeed + uKill) * v;

  gl_FragColor = vec4(clamp(du, 0.0, 1.0), clamp(dv, 0.0, 1.0), 0.0, 1.0);
}`

/** Reaction-Diffusion 可视化 — 将化学浓度映射为颜色 */
export const REACTION_DIFFUSION_VIZ_FRAG = /* glsl */ `
uniform sampler2D tChemicals;
uniform vec3 uColor1;  // 高 U 色
uniform vec3 uColor2;  // 高 V 色
uniform vec3 uBgColor; // 背景色
varying vec2 vUv;

void main() {
  vec4 chem = texture2D(tChemicals, vUv);
  float brightness = chem.r * 0.6 + chem.g * 0.4;

  vec3 color = mix(uBgColor, uColor1, chem.r);
  color = mix(color, uColor2, chem.g * 0.7);

  gl_FragColor = vec4(color * (0.5 + brightness * 0.5), brightness);
}`


// ──────────────────────────────────────────────
// 21. N-Body 灵气星云 — 引力粒子系统
// ──────────────────────────────────────────────

/** 引力场更新 — 每个引力源对全场产生力 */
export const NBODY_FIELD_FRAG = /* glsl */ `
uniform vec3 uSources[5];   // x,y = 位置, z = 质量
uniform int uSourceCount;
uniform float uGravity;     // 万有引力常数
uniform float uSoftening;   // 软化半径
varying vec2 vUv;

void main() {
  vec2 force = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    if (i >= uSourceCount) break;
    vec2 diff = uSources[i].xy - vUv;
    float dist2 = dot(diff, diff) + uSoftening;
    float dist = sqrt(dist2);

    // 引力: F = G * M / r², 方向指向源
    float strength = uGravity * uSources[i].z / dist2;

    // 加切向力（轨道效应）：垂直于径向
    vec2 radial = diff / dist;
    vec2 tangent = vec2(-radial.y, radial.x);
    float orbital = uSources[i].z * 0.3 / (dist2 + 0.01);

    force += radial * strength + tangent * orbital;
  }

  gl_FragColor = vec4(force, 0.0, 1.0);
}`

/** 粒子绘制 — 将粒子纹理渲染为发光点晕 */
export const NBODY_RENDER_FRAG = /* glsl */ `
uniform sampler2D tParticles; // RG = pos, B = brightness
uniform vec2 uTexelSize;
uniform float uPointSize;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // 每个粒子在纹理中是一个像素。我们查找周围 1 像素半径内的粒子
  vec3 acc = vec3(0.0);
  float weight = 0.0;

  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      vec2 sampleUv = vUv + vec2(float(dx), float(dy)) * uTexelSize;
      vec4 p = texture2D(tParticles, sampleUv);
      // 用粒子位置有效性判断，而非速度大小（初始速度太小会误判）
      if (length(p.xy) > 0.001) {
        float dist = length(vUv - p.xy);
        float w = exp(-dist * dist * uPointSize);
        float bright = 0.6;
        vec3 color = vec3(
          1.0 - dist * 2.0,
          0.85 - dist * 1.5,
          0.2 + bright * 0.5
        );
        acc += color * w * bright;
        weight += w;
      }
    }
  }

  if (weight > 0.001) {
    acc /= weight;
  }

  gl_FragColor = vec4(acc, clamp(weight * 0.5, 0.0, 1.0));
}`


// ──────────────────────────────────────────────
// 22. LIC 流速线 — Line Integral Convolution
// ──────────────────────────────────────────────

export const LIC_FLOW_FRAG = /* glsl */ `
uniform sampler2D tVelocity;
uniform sampler2D tNoise;    // 白噪声纹理
uniform float uStepSize;     // 积分步长
uniform float uNumSteps;     // 步数
uniform float uIntensity;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 pos = vUv;
  float noiseVal = hash(vUv * 1024.0);
  float acc = noiseVal;
  float weight = 1.0;

  // 正向流线
  for (float i = 1.0; i <= uNumSteps; i++) {
    vec2 vel = texture2D(tVelocity, pos).xy;
    pos += vel * uStepSize;
    pos = clamp(pos, vec2(0.001), vec2(0.999));

    if (length(vel) < 0.001) break;

    float w = 1.0 - i / uNumSteps;
    acc += hash(pos * 2048.0) * w;
    weight += w;
  }

  // 反向流线
  pos = vUv;
  for (float i = 1.0; i <= uNumSteps; i++) {
    vec2 vel = texture2D(tVelocity, pos).xy;
    pos -= vel * uStepSize;
    pos = clamp(pos, vec2(0.001), vec2(0.999));

    if (length(vel) < 0.001) break;

    float w = 1.0 - i / uNumSteps;
    acc += hash(pos * 2048.0 + 0.5) * w;
    weight += w;
  }

  float val = acc / weight;
  vec3 color = mix(
    vec3(0.05, 0.15, 0.3),   // 低速暗蓝
    vec3(1.0, 0.8, 0.2),     // 高速金
    val
  );
  gl_FragColor = vec4(color * uIntensity, 1.0);
}`


// ──────────────────────────────────────────────
// 23. 复合叠加 — RD + NBody + LIC 三合一渲染
// ──────────────────────────────────────────────

export const TRIPLE_EFFECT_COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;      // 原始场景
uniform sampler2D tRD;         // Reaction-Diffusion
uniform sampler2D tNBody;      // N-Body 星云
uniform sampler2D tLIC;        // LIC 流线
uniform float uRDStrength;
uniform float uNBodyStrength;
uniform float uLICStrength;
varying vec2 vUv;

void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec4 rd = texture2D(tRD, vUv);
  vec4 nbody = texture2D(tNBody, vUv);
  vec4 lic = texture2D(tLIC, vUv);

  // Additive 叠加
  vec3 result = scene.rgb;
  result += rd.rgb * rd.a * uRDStrength;
  result += nbody.rgb * nbody.a * uNBodyStrength;
  result += lic.rgb * uLICStrength;

  gl_FragColor = vec4(result, 1.0);
}`
