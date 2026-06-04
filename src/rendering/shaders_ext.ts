/**
 * 附加着色器 — C/D/E/F 新特效 GLSL
 *
 * 24. PARTICLE_SMOKE_ADVECT — 粒子烟雾平流（沿速度场漂移）
 * 25. PARTICLE_SMOKE_RENDER — 粒子软光晕渲染
 * 26. MERIDIAN_EM_FIELD    — 经络电磁力场（关键点电荷场）
 * 27. MERIDIAN_RENDER      — 力场线可视化
 * 28. BREATHING_WARP       — 呼吸驱动径向畸变 + 波纹
 * 29. CHAKRA_GLOW_ORB      — 脉轮球体辉光
 * 30. MULTI_LAYER_COMPOSITE — 多层合成（所有特效叠加）
 */

// ──────────────────────────────────────────────
// 24. 粒子烟雾平流 — 沿速度场漂移 GPU 粒子
// ──────────────────────────────────────────────

export const PARTICLE_SMOKE_ADVECT_FRAG = /* glsl */ `
uniform sampler2D tState;      // RG=pos.xy, BA=vel.xy
uniform sampler2D tVelocity;   // 流体速度场
uniform float uDt;
uniform float uDrag;           // 0.95~0.999
uniform float uLifetime;       // 粒子寿命（秒）
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec4 state = texture2D(tState, vUv);
  vec2 pos = state.xy;
  vec2 vel = state.zw;

  // 读取当前位置的速度场
  vec2 flow = texture2D(tVelocity, pos).xy;

  // 混合：速度场拉拽 + 惯性
  vel = mix(vel, flow, 0.05) * uDrag;

  // 漂移
  pos += vel * uDt;
  pos = clamp(pos, vec2(0.001), vec2(0.999));

  // 粒子寿命（用状态 BA 的低位隐含计数）
  // 超出边界或速度太慢 → 重生
  float age = state.b + uDt;
  vec2 seed = vUv * 1024.0 + age;

  if (pos.x <= 0.002 || pos.x >= 0.998 || pos.y <= 0.002 || pos.y >= 0.998 || age > uLifetime) {
    // 重生为随机位置
    float rx = hash(seed);
    float ry = hash(seed + 0.5);
    pos = vec2(rx, ry);
    vel = vec2(0.0);
    age = 0.0;
  }

  gl_FragColor = vec4(pos, vel, age);
}`

// ──────────────────────────────────────────────
// 25. 粒子软光晕渲染
// ──────────────────────────────────────────────

export const PARTICLE_SMOKE_RENDER_FRAG = /* glsl */ `
uniform sampler2D tParticles;  // RG=pos, B=age
uniform vec2 uTexelSize;
uniform float uPointSize;
uniform float uOpacity;
uniform vec3 uColor1;   // 新生粒子颜色（暖黄）
uniform vec3 uColor2;   // 老化粒子颜色（冷蓝）
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // 当前 UV 对应一个粒子位置在纹理中，需要遍历所有粒子
  // 简化：使用 scatter 采样 — 每个 texel 代表一个粒子
  vec4 particle = texture2D(tParticles, vUv);
  vec2 ppos = particle.xy;
  float age = particle.b;

  // 仅渲染有位置信息的粒子
  if (length(ppos) < 0.001) discard;

  // 生成光晕（简单圆形衰减）
  float d = length(vUv - ppos) * 100.0;
  float glow = exp(-d * d) * uPointSize;

  // 颜色随年龄变化
  float ageNorm = min(age / 5.0, 1.0);
  vec3 color = mix(uColor1, uColor2, ageNorm);

  // 闪烁效果
  float flicker = 0.7 + 0.3 * hash(ppos * uTime);

  gl_FragColor = vec4(color * glow * flicker * uOpacity, glow * uOpacity);
}`

// ──────────────────────────────────────────────
// 26. 经络电磁力场 — 关键点电荷场计算
// ──────────────────────────────────────────────

export const MERIDIAN_EM_FIELD_FRAG = /* glsl */ `
uniform vec4 uCharges[12];     // xy=position, z=charge(+/-), w=radius
uniform int uChargeCount;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  vec2 potential = vec2(0.0);

  for (int i = 0; i < 12; i++) {
    if (i >= uChargeCount) break;
    vec4 c = uCharges[i];
    vec2 dir = vUv - c.xy;
    float dist = length(dir) + 0.001;
    float strength = c.z / (dist * dist);

    // 力场方向：正电荷向外，负电荷向内
    potential += normalize(dir) * strength * c.w;
  }

  gl_FragColor = vec4(potential, 0.0, 1.0);
}`

// ──────────────────────────────────────────────
// 27. 力场线可视化 — 带电粒子轨迹风格
// ──────────────────────────────────────────────

export const MERIDIAN_RENDER_FRAG = /* glsl */ `
uniform sampler2D tField;      // 电磁力场（RG=force.xy）
uniform sampler2D tNoise;      // 白噪声
uniform float uStepSize;
uniform float uNumSteps;
uniform float uIntensity;
uniform vec3 uLineColor;      // 经络线主色
uniform vec3 uNodeColor;      // 节点色（关键点位置）
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 pos = vUv;
  float acc = hash(pos * 2048.0);
  float weight = 1.0;
  float lineMask = 0.0;

  // 正向追踪
  vec2 p = pos;
  for (float i = 1.0; i <= uNumSteps; i++) {
    vec2 f = texture2D(tField, p).xy;
    float flen = length(f);
    p += normalize(f + 0.001) * uStepSize * (0.5 + flen);
    p = clamp(p, vec2(0.001), vec2(0.999));

    if (flen < 0.0005) break;

    float w = 1.0 - i / uNumSteps;
    acc += hash(p * 2048.0) * w;
    weight += w;
    lineMask += w * flen;
  }

  // 反向追踪
  p = pos;
  for (float i = 1.0; i <= uNumSteps; i++) {
    vec2 f = texture2D(tField, p).xy;
    float flen = length(f);
    p -= normalize(f + 0.001) * uStepSize * (0.5 + flen);
    p = clamp(p, vec2(0.001), vec2(0.999));

    if (flen < 0.0005) break;

    float w = 1.0 - i / uNumSteps;
    acc += hash(p * 2048.0 + 0.5) * w;
    weight += w;
    lineMask += w * flen;
  }

  float val = acc / weight;
  float line = smoothstep(0.3, 0.6, lineMask / max(weight, 1.0));

  vec3 color = mix(
    vec3(0.02, 0.03, 0.08),     // 背景（极暗蓝）
    uLineColor,                  // 力场线色
    val * uIntensity
  );

  // 在力场线交叉处加亮
  color += uNodeColor * line * 0.3;

  gl_FragColor = vec4(color, val * uIntensity);
}`

// ──────────────────────────────────────────────
// 28. 呼吸扭曲空间 — 径向畸变 + 波纹
// ──────────────────────────────────────────────

export const BREATHING_WARP_FRAG = /* glsl */ `
uniform sampler2D tScene;      // 被扭曲的场景纹理
uniform float uBreathPhase;    // 0~1 (吸=0→1=呼)
uniform float uBreathAmplitude;// 0~0.05
uniform float uRippleCount;    // 波纹圈数
uniform float uCenterX;        // 扭曲中心 X
uniform float uCenterY;        // 扭曲中心 Y
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 center = vec2(uCenterX, uCenterY);
  vec2 offset = vUv - center;
  float dist = length(offset);

  // 呼吸径向畸变：吸(phase 0→0.5) = 膨胀, 呼(phase 0.5→1) = 收缩
  float phase = uBreathPhase; // 0~1 渐变
  float expand = sin(phase * 3.14159) * uBreathAmplitude;

  // 波纹效应
  float ripple = sin(dist * uRippleCount * 20.0 - uTime * 2.0) * 0.003 * expand;

  // 扭曲 UV
  float scale = 1.0 + expand * (1.0 - dist) + ripple;
  vec2 warpedUv = center + offset * scale;

  // 边界 clamp
  warpedUv = clamp(warpedUv, vec2(0.0), vec2(1.0));

  vec4 color = texture2D(tScene, warpedUv);

  // 边缘暗角（增强呼吸感）
  float vignette = 1.0 - dist * 0.3 * (1.0 + expand * 2.0);
  color.rgb *= vignette;

  gl_FragColor = color;
}`

// ──────────────────────────────────────────────
// 29. 脉轮球体辉光 — 七彩光晕球
// ──────────────────────────────────────────────

export const CHAKRA_GLOW_ORB_FRAG = /* glsl */ `
uniform vec3 uGlowColor;
uniform float uIntensity;
uniform float uTime;
uniform float uPulseRate;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  // 菲涅尔效果：边缘更亮
  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0)); // 正交投影，视线平行 Z
  float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);

  // 脉冲呼吸
  float pulse = 0.7 + 0.3 * sin(uTime * uPulseRate + vWorldPos.y * 5.0);

  // 多层光晕
  float core = exp(-fresnel * 4.0);
  float mid = exp(-fresnel * 2.0) * 0.5;
  float outer = fresnel * 0.6;

  float alpha = (core + mid + outer) * uIntensity * pulse;

  gl_FragColor = vec4(uGlowColor * (1.0 + core * 0.5), alpha);
}`

// ──────────────────────────────────────────────
// 30. 多层合成 — 所有特效叠加
// ──────────────────────────────────────────────

export const MULTI_LAYER_COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;       // 原始场景（被扭曲后的）
uniform sampler2D tRD;          // Reaction-Diffusion
uniform sampler2D tNBody;       // N-Body 星云
uniform sampler2D tLIC;         // LIC 流线
uniform sampler2D tParticles;   // 粒子烟雾
uniform sampler2D tMeridian;    // 经络力场线
uniform sampler2D tChakra;      // 脉轮辉光
uniform float uRDStrength;
uniform float uNBodyStrength;
uniform float uLICStrength;
uniform float uParticleStrength;
uniform float uMeridianStrength;
uniform float uChakraStrength;
varying vec2 vUv;

void main() {
  vec3 result = texture2D(tScene, vUv).rgb;

  // Additive 叠加所有特效层
  vec4 rd = texture2D(tRD, vUv);
  result += rd.rgb * rd.a * uRDStrength;

  vec4 nbody = texture2D(tNBody, vUv);
  result += nbody.rgb * nbody.a * uNBodyStrength;

  vec4 lic = texture2D(tLIC, vUv);
  result += lic.rgb * uLICStrength;

  vec4 particles = texture2D(tParticles, vUv);
  result += particles.rgb * uParticleStrength;

  vec4 meridian = texture2D(tMeridian, vUv);
  result += meridian.rgb * meridian.a * uMeridianStrength;

  vec4 chakra = texture2D(tChakra, vUv);
  result += chakra.rgb * chakra.a * uChakraStrength;

  gl_FragColor = vec4(result, 1.0);
}`
