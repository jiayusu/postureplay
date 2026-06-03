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
