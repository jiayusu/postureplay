/**
 * 能量流场 — 将体态检测数据转换为流体速度源
 *
 * 脊柱关键点 → 沿脊柱方向的速度源
 * 手掌中心   → 螺旋漩涡源
 * 骨相轮廓   → 边界法向速度
 */
import type { FluidSource } from './FluidSolver'

export interface SpineFlowInput {
  spinePoints: Array<{ x: number; y: number }>
  energyLevel: number     // 0~1
  energyState: 'flowing' | 'blocked' | 'diminished'
  lateralCurvature: number
}

export interface PalmFlowInput {
  palmCenter: { x: number; y: number }
  venusMount: number      // 金星丘饱满度 0~1
  lifeLineFullness: number
  weakRegions: Array<{
    sector: string
    organ: string
    x: number; y: number   // 归一化坐标
    energyScore: number
  }>
}

export interface BoneFlowInput {
  faceOutline: Array<{ x: number; y: number }>
  foreheadFullness: number
  cheekboneProminence: number
  jawAngle: number
}

/**
 * 将脊柱关键点转换为沿脊柱的速度源
 */
export function spineToFlowSources(input: SpineFlowInput): FluidSource[] {
  const sources: FluidSource[] = []
  const pts = input.spinePoints

  if (pts.length < 2) return sources

  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i]
    // 计算脊柱在该点的切线方向
    let dx = 0, dy = 1 // 默认向下
    if (i < pts.length - 1) {
      dx = pts[i + 1].x - pt.x
      dy = pts[i + 1].y - pt.y
    } else if (i > 0) {
      dx = pt.x - pts[i - 1].x
      dy = pt.y - pts[i - 1].y
    }
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= len
    dy /= len

    // 能量状态决定颜色
    let color: [number, number, number]
    let speedMul: number
    switch (input.energyState) {
      case 'flowing':
        color = [1.0, 0.85, 0.2]  // 金色
        speedMul = 1.5
        break
      case 'blocked':
        color = [0.4, 0.4, 0.4]   // 暗灰（淤堵）
        speedMul = 0.3
        break
      case 'diminished':
        color = [0.1, 0.3, 0.9]   // 蓝色（活力不足）
        speedMul = 0.5
        break
    }

    const speed = input.energyLevel * speedMul * 0.03

    sources.push({
      x: pt.x,
      y: pt.y,
      vx: dx * speed,
      vy: dy * speed,
      color,
      radius: 0.02 + input.energyLevel * 0.03,
    })
  }

  // 侧弯 > 0.15 → 在弯曲点额外注入侧向力（产生漩涡）
  if (input.lateralCurvature > 0.15 && pts.length >= 3) {
    const mid = pts[Math.floor(pts.length / 2)]
    const swirlStrength = input.lateralCurvature * 0.06
    sources.push({
      x: mid.x,
      y: mid.y,
      vx: swirlStrength,
      vy: 0,
      color: [0.1, 0.9, 0.5],  // 翠绿漩涡
      radius: 0.06,
    })
    sources.push({
      x: mid.x,
      y: mid.y,
      vx: -swirlStrength,
      vy: 0,
      color: [0.1, 0.5, 0.9],  // 蓝紫漩涡
      radius: 0.04,
    })
  }

  return sources
}

/**
 * 将手相数据转换为速度源（掌心漩涡 + 低能量区墨迹）
 */
export function palmToFlowSources(input: PalmFlowInput): FluidSource[] {
  const sources: FluidSource[] = []

  // 掌心漩涡源（金星丘饱满度决定漩涡强度）
  const swirlSpeed = input.venusMount * 0.04
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const radius = 0.03 + input.venusMount * 0.04
    sources.push({
      x: input.palmCenter.x + Math.cos(angle) * radius,
      y: input.palmCenter.y + Math.sin(angle) * radius,
      vx: -Math.sin(angle) * swirlSpeed,
      vy: Math.cos(angle) * swirlSpeed,
      color: [1.0, 0.84, 0.0], // 金色
      radius: 0.02,
    })
  }

  // 低能量脏腑区 → 注入"墨迹"密度
  for (const region of input.weakRegions) {
    if (region.energyScore < 45) {
      const dim = 1 - region.energyScore / 100
      sources.push({
        x: region.x,
        y: region.y,
        vx: 0,
        vy: 0,
        color: [0.8 * dim, 0.2 * dim, 0.6 * dim], // 暗紫色标记
        radius: 0.03 * dim,
      })
    }
  }

  // 生命线饱满 → 额外粒子流
  if (input.lifeLineFullness > 0.5) {
    const lf = input.lifeLineFullness
    for (let i = 0; i < 4; i++) {
      const t = i / 4
      sources.push({
        x: input.palmCenter.x + (t - 0.5) * 0.2,
        y: input.palmCenter.y + t * 0.15,
        vx: 0,
        vy: 0.01 * lf,
        color: [0.2, 0.9, 0.4], // 翠绿
        radius: 0.02,
      })
    }
  }

  return sources
}

/**
 * 将骨相数据转换为速度源（轮廓法向 + 特征点爆发）
 */
export function boneToFlowSources(input: BoneFlowInput): FluidSource[] {
  const sources: FluidSource[] = []

  if (input.faceOutline.length < 3) return sources

  // 沿面部轮廓生成法向速度（向内）
  for (let i = 0; i < input.faceOutline.length; i++) {
    const curr = input.faceOutline[i]
    const next = input.faceOutline[(i + 1) % input.faceOutline.length]
    const prev = input.faceOutline[(i - 1 + input.faceOutline.length) % input.faceOutline.length]

    // 切线方向
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const tLen = Math.sqrt(tx * tx + ty * ty) || 1

    // 法向（向内）
    const nx = -ty / tLen
    const ny = tx / tLen

    sources.push({
      x: curr.x,
      y: curr.y,
      vx: nx * 0.005,
      vy: ny * 0.005,
      color: [1.0, 0.6, 0.1], // 旭日橙金
      radius: 0.015,
    })
  }

  // 额头饱满 → 向上爆发
  if (input.foreheadFullness > 0.5 && input.faceOutline.length > 0) {
    const forehead = input.faceOutline[0]
    sources.push({
      x: forehead.x,
      y: forehead.y,
      vx: 0,
      vy: -input.foreheadFullness * 0.05,
      color: [1.0, 0.95, 0.7], // 明亮暖白
      radius: 0.06,
    })
  }

  // 颧骨高 → 侧向扩张
  if (input.cheekboneProminence > 0.5 && input.faceOutline.length > 5) {
    const mid = Math.floor(input.faceOutline.length / 2)
    const left = input.faceOutline[Math.floor(mid * 0.7)]
    const right = input.faceOutline[Math.floor(mid * 1.3)]
    const strength = input.cheekboneProminence * 0.03
    sources.push({
      x: left.x, y: left.y,
      vx: -strength, vy: 0,
      color: [0.9, 0.3, 0.1],
      radius: 0.04,
    })
    sources.push({
      x: right.x, y: right.y,
      vx: strength, vy: 0,
      color: [0.9, 0.3, 0.1],
      radius: 0.04,
    })
  }

  return sources
}
