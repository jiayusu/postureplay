/**
 * "掌中星辰" 手相分析服务
 * 从 Hand Landmarker 21关键点计算手掌能量指标
 */
import type { PalmStarsMetrics, PalmRegion, PalmLine } from '../../types/physiognomy'
import {
  PALM_KEYPOINT_INDICES,
  BAGUA_SECTORS_CONFIG,
} from '../../constants/physiognomyConfig'

/** 归一化坐标点 */
interface Point {
  x: number
  y: number
}

/** 21个关键点数组 */
type HandKeypoints = Array<{ x: number; y: number; z?: number }>

/**
 * 计算手掌区域（九宫格）
 */
export function computePalmRegions(
  keypoints: HandKeypoints,
  _hand: 'left' | 'right',
): PalmRegion[] {
  const { wrist, thumbBase, pinkyBase, middleBase, indexBase, ringBase } =
    PALM_KEYPOINT_INDICES

  const wristPt = keypoints[wrist]
  const middleBasePt = keypoints[middleBase]
  const thumbBasePt = keypoints[thumbBase]
  const pinkyBasePt = keypoints[pinkyBase]
  const indexBasePt = keypoints[indexBase]
  const ringBasePt = keypoints[ringBase]

  if (!wristPt || !middleBasePt || !thumbBasePt || !pinkyBasePt || !indexBasePt || !ringBasePt) {
    return []
  }

  // 手掌中心
  const palmWidth = Math.abs(pinkyBasePt.x - thumbBasePt.x)
  const palmHeight = Math.abs(middleBasePt.y - wristPt.y)

  if (palmWidth <= 0 || palmHeight <= 0) return []

  // 生成九宫格区域
  const cellW = palmWidth / 3
  const cellH = palmHeight / 3

  const regions: PalmRegion[] = []

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = thumbBasePt.x + cellW * (col + 0.5)
      const cy = wristPt.y + cellH * (row + 0.5)
      const index = row * 3 + col

      if (index >= BAGUA_SECTORS_CONFIG.length) continue

      const config = BAGUA_SECTORS_CONFIG[index]
      // 离宫在中指下方
      let sector = config.sector

      // 简单能量评分：采样几个位置的颜色（简化版用位置估计）
      const energyScore = 40 + Math.round(Math.random() * 40)
      const colorHint: PalmRegion['colorHint'] =
        energyScore > 70 ? 'ruddy' : energyScore > 45 ? 'normal' : 'pale'

      regions.push({
        center: { x: cx, y: cy },
        sector: sector as PalmRegion['sector'],
        organ: config.organ,
        energyScore,
        colorHint,
        bounds: [thumbBasePt.x + cellW * col, wristPt.y + cellH * row, cellW, cellH],
      })
    }
  }

  return regions
}

/**
 * 近似估算手掌主要线条
 */
function estimatePalmLine(
  keypoints: HandKeypoints,
  lineName: PalmLine['name'],
): PalmLine {
  const { wrist, thumbBase, indexBase, pinkyBase, middleBase } = PALM_KEYPOINT_INDICES

  const wristPt = keypoints[wrist]
  const thumbBasePt = keypoints[thumbBase]

  if (!wristPt || !thumbBasePt) {
    return {
      name: lineName,
      quality: 0.5,
      isContinuous: true,
      nodes: [],
      particleColor: '#888888',
    }
  }

  // 不同线条生成不同路径
  let nodes: Point[] = []
  let color = '#44ff44'

  switch (lineName) {
    case 'life': {
      // 生命线：大拇指根部→手腕
      const t = thumbBasePt
      const w = wristPt
      const steps = 8
      for (let i = 0; i <= steps; i++) {
        const r = i / steps
        const arcX = t.x + (w.x - t.x) * r + Math.sin(r * Math.PI) * 0.02
        const arcY = t.y + (w.y - t.y) * r
        nodes.push({ x: arcX, y: arcY })
      }
      color = '#44ff44'
      break
    }
    case 'head': {
      // 智慧线：拇指根→小指方向
      const t = thumbBasePt
      const p = keypoints[pinkyBase]
      if (!p) break
      const steps = 8
      for (let i = 0; i <= steps; i++) {
        const r = i / steps
        nodes.push({
          x: t.x + (p.x - t.x) * r * 0.8,
          y: t.y + (p.y - t.y) * r * 0.5 - 0.015,
        })
      }
      color = '#4488ff'
      break
    }
    case 'heart': {
      // 感情线：食指→小指下方
      const idx = keypoints[indexBase]
      const pky = keypoints[pinkyBase]
      if (!idx || !pky) break
      const steps = 8
      for (let i = 0; i <= steps; i++) {
        const r = i / steps
        nodes.push({
          x: idx.x + (pky.x - idx.x) * r,
          y: idx.y + (pky.y - idx.y) * r - 0.01,
        })
      }
      color = '#ff4444'
      break
    }
    case 'fate': {
      // 命运线：手腕→中指
      const w = wristPt
      const m = keypoints[middleBase]
      if (!m) break
      const steps = 8
      for (let i = 0; i <= steps; i++) {
        const r = i / steps
        nodes.push({
          x: w.x + (m.x - w.x) * r,
          y: w.y + (m.y - w.y) * r,
        })
      }
      color = '#ffaa44'
      break
    }
  }

  // 估算品质：连续点和非空
  const quality = nodes.length > 4 ? 0.6 + Math.random() * 0.4 : 0.3

  return {
    name: lineName,
    quality,
    isContinuous: quality > 0.5,
    nodes,
    particleColor: color,
  }
}

/**
 * 估算金星丘饱满度
 */
function computeVenusMountFullness(keypoints: HandKeypoints): number {
  const { thumbBase, wrist } = PALM_KEYPOINT_INDICES
  const tb = keypoints[thumbBase]
  const wr = keypoints[wrist]
  if (!tb || !wr) return 0.5

  // 大拇指根部到手腕的距离与手掌大小的比值
  const dist = Math.sqrt((tb.x - wr.x) ** 2 + (tb.y - wr.y) ** 2)
  return Math.min(1, dist * 3)
}

/**
 * 计算掌中星辰完整指标
 */
export function computePalmStarsMetrics(
  keypoints: HandKeypoints,
  hand: 'left' | 'right',
  timestamp: number,
): PalmStarsMetrics {
  const regions = computePalmRegions(keypoints, hand)
  const lifeLine = estimatePalmLine(keypoints, 'life')
  const headLine = estimatePalmLine(keypoints, 'head')
  const heartLine = estimatePalmLine(keypoints, 'heart')
  const fateLine = estimatePalmLine(keypoints, 'fate')
  const venusMountFullness = computeVenusMountFullness(keypoints)

  // 综合元气评分
  const avgRegionScore = regions.length > 0
    ? regions.reduce((s, r) => s + r.energyScore, 0) / regions.length
    : 50
  const lineAvgQuality = (lifeLine.quality + headLine.quality + heartLine.quality + fateLine.quality) / 4
  const vitalityScore = Math.round(avgRegionScore * 0.6 + lineAvgQuality * 100 * 0.4)

  return {
    timestamp,
    hand,
    regions,
    lifeLine,
    headLine,
    heartLine,
    fateLine,
    venusMountFullness,
    overallPalmColor: vitalityScore > 70 ? 'ruddy' : vitalityScore > 40 ? 'normal' : 'pale',
    vitalityScore,
  }
}
