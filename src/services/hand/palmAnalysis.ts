/**
 * 掌纹健康分析 — 核心指标计算函数
 *
 * 从手部关键点数据提取健康相关指标：
 * - 手指长度分析（2D:4D 比值）
 * - 手掌颜色分析
 * - 手部震颤检测
 * - 指关节灵活性
 * - 掌纹线检测
 */

import type {
  HandKeypoint,
  FingerMetrics,
  DigitRatio,
  PalmColorMetrics,
  TremorMetrics,
  PalmLineInfo,
} from '@/types/hand'
import { HAND_FINGERS, HAND_KEYPOINT_INDEX } from '@/constants/handKeypoints'
import {
  DIGIT_RATIO_LOW_THRESHOLD,
  DIGIT_RATIO_HIGH_THRESHOLD,
  PALM_PALE_THRESHOLD,
  PALM_ABNORMAL_RED_THRESHOLD,
  TREMOR_PHYSIOLOGICAL_MIN_HZ,
  TREMOR_PHYSIOLOGICAL_MAX_HZ,
  TREMOR_AMPLITUDE_ABNORMAL,
  FINGER_FLEXION_NORMAL_MIN,
  FINGER_FLEXION_NORMAL_MAX,
  PALM_LINE_CLARITY_GOOD,
  PALM_LINE_CLARITY_FAIR,
  LIFE_LINE_ANGLE_MIN,
  LIFE_LINE_ANGLE_MAX,
  HEART_LINE_ANGLE_MIN,
  HEART_LINE_ANGLE_MAX,
  HEAD_LINE_ANGLE_MIN,
  HEAD_LINE_ANGLE_MAX,
} from '@/constants/palmHealthConfig'

// ============================================================
// 工具函数
// ============================================================

/** 两点间欧氏距离 */
function distance2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/** 三点间角度（使用关节 A-B-C，计算 ∠ABC） */
function computeAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const ba = distance2D(b, a)
  const bc = distance2D(b, c)
  const ac = distance2D(a, c)
  if (ba === 0 || bc === 0) return 0
  const cos = (ba ** 2 + bc ** 2 - ac ** 2) / (2 * ba * bc)
  return Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI)
}

/** 线角度（弧度，相对于水平线） */
function _lineAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/** 值钳位 */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ============================================================
// 1. 手指长度计算
// ============================================================

interface FingerKeypointSet {
  tip: number
  dip: number
  pip: number
  mcp: number
}

const FINGER_DEFS: Array<{ name: string; keys: FingerKeypointSet }> = [
  { name: 'thumb', keys: HAND_FINGERS.thumb as unknown as FingerKeypointSet },
  { name: 'index', keys: HAND_FINGERS.index as unknown as FingerKeypointSet },
  { name: 'middle', keys: HAND_FINGERS.middle as unknown as FingerKeypointSet },
  { name: 'ring', keys: HAND_FINGERS.ring as unknown as FingerKeypointSet },
  { name: 'pinky', keys: HAND_FINGERS.pinky as unknown as FingerKeypointSet },
]

/** 计算手指总长度（从掌指关节 MCP 到指尖 Tip 的累计距离） */
function computeFingerLength(landmarks: HandKeypoint[], finger: FingerKeypointSet): number {
  const mcp = landmarks[finger.mcp]
  const pip = landmarks[finger.pip]
  const dip = landmarks[finger.dip]
  const tip = landmarks[finger.tip]

  const seg1 = distance2D(mcp, pip)
  const seg2 = distance2D(pip, dip)
  const seg3 = distance2D(dip, tip)
  return seg1 + seg2 + seg3
}

/** 计算所有手指指标 */
export function computeAllFingerMetrics(landmarks: HandKeypoint[]): FingerMetrics[] {
  const wrist = landmarks[HAND_KEYPOINT_INDEX['wrist']]

  return FINGER_DEFS.map(({ name, keys }) => {
    const length = computeFingerLength(landmarks, keys)
    const tip = landmarks[keys.tip]
    const pip = landmarks[keys.pip]
    const mcp = landmarks[keys.mcp]

    // 近端指间关节弯曲角度（MCP-PIP-DIP）
    const dip = landmarks[keys.dip]
    const flexionAngle = computeAngle(mcp, pip, dip)

    // 指尖相对于手腕的位移（当前帧距离）
    const tipDisplacement = distance2D(tip, wrist)

    return {
      name,
      length,
      flexionAngle,
      tipDisplacement,
      tipConfidence: tip.visibility,
    }
  })
}

// ============================================================
// 2. 2D:4D 比值分析
// ============================================================

/** 计算食指/无名指长度比 (2D:4D) */
export function computeDigitRatio(fingers: FingerMetrics[]): DigitRatio {
  const indexFinger = fingers.find((f) => f.name === 'index')
  const ringFinger = fingers.find((f) => f.name === 'ring')

  const indexLen = indexFinger?.length ?? 0
  const ringLen = ringFinger?.length ?? 0
  const ratio = ringLen > 0 ? indexLen / ringLen : 1.0

  let category: DigitRatio['category'] = 'normal'
  let interpretation = ''

  if (ratio < DIGIT_RATIO_LOW_THRESHOLD) {
    category = 'low'
    interpretation = '食指相对较短（低 2D:4D），部分研究认为可能与较高的产前睾酮暴露有关，常见于运动能力突出者'
  } else if (ratio > DIGIT_RATIO_HIGH_THRESHOLD) {
    category = 'high'
    interpretation = '食指相对较长（高 2D:4D），部分研究认为可能与较高的产前雌激素暴露有关'
  } else {
    interpretation = '食指与无名指比例处于正常范围'
  }

  return {
    indexLength: indexLen,
    ringLength: ringLen,
    ratio,
    category,
    healthInterpretation: interpretation,
  }
}

// ============================================================
// 3. 手掌颜色分析（从 Canvas 像素数据采样）
// ============================================================

/** 从 Canvas 截图中分析手掌颜色 */
export function computePalmColor(
  landmarks: HandKeypoint[],
  canvas: HTMLCanvasElement,
): PalmColorMetrics {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return createDefaultColorMetrics()
  }

  // 使用手掌区域关键点来定义采样区域
  const palmKeys = [
    HAND_KEYPOINT_INDEX['wrist'],
    HAND_KEYPOINT_INDEX['thumb_cmc'],
    HAND_KEYPOINT_INDEX['index_finger_mcp'],
    HAND_KEYPOINT_INDEX['middle_finger_mcp'],
    HAND_KEYPOINT_INDEX['ring_finger_mcp'],
    HAND_KEYPOINT_INDEX['pinky_mcp'],
  ]

  // 计算手掌区域边界框
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of palmKeys) {
    const lm = landmarks[idx]
    if (lm.visibility < 0.5) continue
    minX = Math.min(minX, lm.x)
    minY = Math.min(minY, lm.y)
    maxX = Math.max(maxX, lm.x)
    maxY = Math.max(maxY, lm.y)
  }

  if (!isFinite(minX)) return createDefaultColorMetrics()

  // 扩展 ROI
  const w = maxX - minX
  const h = maxY - minY
  const expand = 0.1
  minX = Math.max(0, minX - w * expand)
  minY = Math.max(0, minY - h * expand)
  maxX = Math.min(1, maxX + w * expand)
  maxY = Math.min(1, maxY + h * expand)

  // 在 ROI 中采样
  const sx = Math.round(minX * canvas.width)
  const sy = Math.round(minY * canvas.height)
  const sw = Math.round((maxX - minX) * canvas.width)
  const sh = Math.round((maxY - minY) * canvas.height)

  if (sw <= 0 || sh <= 0) return createDefaultColorMetrics()

  const imageData = ctx.getImageData(sx, sy, sw, sh)
  const pixels = imageData.data

  // 在 ROI 中网格采样
  const gridSize = 8
  let totalR = 0, totalG = 0, totalB = 0, count = 0

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const px = Math.round((gx / (gridSize - 1)) * (sw - 1))
      const py = Math.round((gy / (gridSize - 1)) * (sh - 1))
      const idx = (py * sw + px) * 4

      totalR += pixels[idx]
      totalG += pixels[idx + 1]
      totalB += pixels[idx + 2]
      count++
    }
  }

  const meanR = count > 0 ? totalR / count / 255 : 0.5
  const meanG = count > 0 ? totalG / count / 255 : 0.5
  const meanB = count > 0 ? totalB / count / 255 : 0.5

  // 红润度：红色通道与绿色通道的相对比例
  const redness = clamp((meanR - meanG) * 1.5 + 0.25, 0, 1)

  // 颜色分类
  let colorCategory: PalmColorMetrics['colorCategory'] = 'normal'
  if (redness < PALM_PALE_THRESHOLD) {
    colorCategory = 'pale'
  } else if (redness > PALM_ABNORMAL_RED_THRESHOLD) {
    colorCategory = 'flushed'
  } else if (meanB > meanR * 1.2) {
    colorCategory = 'cyanotic'
  }

  return {
    meanRed: meanR,
    meanGreen: meanG,
    meanBlue: meanB,
    redness,
    colorCategory,
    confidence: 0.7, // Canvas 采样置信度中等
  }
}

function createDefaultColorMetrics(): PalmColorMetrics {
  return {
    meanRed: 0.5,
    meanGreen: 0.5,
    meanBlue: 0.5,
    redness: 0.2,
    colorCategory: 'normal',
    confidence: 0,
  }
}

// ============================================================
// 4. 手部震颤检测
// ============================================================

/** 震颤检测内部状态 */
interface TremorState {
  positionHistory: Array<{ x: number; y: number; t: number }>
  maxHistory: number
}

let tremorState: TremorState = {
  positionHistory: [],
  maxHistory: 90, // 3 秒 @ 30fps
}

/** 重置震颤检测状态 */
export function resetTremorState(): void {
  tremorState.positionHistory = []
}

/** 从指尖位置历史分析震颤 */
export function computeTremor(
  landmarks: HandKeypoint[],
  timestamp: number,
): TremorMetrics {
  // 使用食指指尖作为震颤检测锚点
  const indexTip = landmarks[HAND_KEYPOINT_INDEX['index_finger_tip']]
  if (!indexTip || indexTip.visibility < 0.5) {
    return {
      amplitude: 0,
      dominantFrequency: 0,
      category: 'none',
      isAbnormal: false,
      confidence: 0,
    }
  }

  // 添加到历史
  tremorState.positionHistory.push({
    x: indexTip.x,
    y: indexTip.y,
    t: timestamp,
  })

  // 清理过期历史（保留最后 3 秒）
  const cutoff = timestamp - 3000
  tremorState.positionHistory = tremorState.positionHistory.filter(
    (p) => p.t >= cutoff,
  )

  // 修剪到最大长度
  if (tremorState.positionHistory.length > tremorState.maxHistory) {
    tremorState.positionHistory = tremorState.positionHistory.slice(
      -tremorState.maxHistory,
    )
  }

  const history = tremorState.positionHistory
  if (history.length < 10) {
    return { amplitude: 0, dominantFrequency: 0, category: 'none', isAbnormal: false, confidence: 0 }
  }

  // 计算路径幅度（移动的总路径长度 / 时间）
  let totalDisplacement = 0
  for (let i = 1; i < history.length; i++) {
    totalDisplacement += distance2D(history[i - 1], history[i])
  }

  const timeSpan = (history[history.length - 1].t - history[0].t) / 1000 // 秒
  const amplitude = timeSpan > 0 ? totalDisplacement / timeSpan : 0

  // 简易频率估计：通过零交叉或极值计数
  const xs = history.map((p) => p.x)
  let zeroCrossings = 0
  for (let i = 1; i < xs.length; i++) {
    const meanX = xs.reduce((s, v) => s + v, 0) / xs.length
    if ((xs[i - 1] - meanX) * (xs[i] - meanX) < 0) {
      zeroCrossings++
    }
  }
  const dominantFrequency = timeSpan > 0 ? zeroCrossings / (2 * timeSpan) : 0

  // 分类
  let category: TremorMetrics['category'] = 'none'
  let isAbnormal = false

  if (amplitude < 0.002) {
    category = 'none'
  } else if (amplitude < TREMOR_AMPLITUDE_ABNORMAL) {
    if (
      dominantFrequency >= TREMOR_PHYSIOLOGICAL_MIN_HZ &&
      dominantFrequency <= TREMOR_PHYSIOLOGICAL_MAX_HZ
    ) {
      category = 'physiological'
    } else {
      category = 'enhanced_physiological'
    }
  } else {
    category = 'abnormal'
    isAbnormal = true
  }

  return {
    amplitude: clamp(amplitude, 0, 0.1),
    dominantFrequency: clamp(dominantFrequency, 0, 30),
    category,
    isAbnormal,
    confidence: clamp(history.length / 60, 0, 1),
  }
}

// ============================================================
// 5. 关节灵活性评估
// ============================================================

/** 评估手指关节灵活性 */
export function computeJointFlexibilityScore(fingers: FingerMetrics[]): {
  score: number
  description: string
} {
  let totalScore = 0
  let count = 0

  for (const finger of fingers) {
    if (finger.name === 'thumb') continue // 拇指弯曲机制不同，单独评估
    if (finger.tipConfidence < 0.5) continue

    // 评分：在正常范围内的得分高
    const angle = finger.flexionAngle
    if (angle >= FINGER_FLEXION_NORMAL_MIN && angle <= FINGER_FLEXION_NORMAL_MAX) {
      totalScore += 1.0
    } else if (angle >= FINGER_FLEXION_NORMAL_MIN * 0.7 && angle <= FINGER_FLEXION_NORMAL_MAX * 1.3) {
      totalScore += 0.7
    } else {
      totalScore += 0.3
    }
    count++
  }

  const score = count > 0 ? totalScore / count : 0.5

  let description: string
  if (score >= 0.8) {
    description = '手指关节活动度良好，灵活性正常'
  } else if (score >= 0.6) {
    description = '手指关节活动度一般，可适当进行手指拉伸'
  } else {
    description = '手指关节活动度偏低，建议进行手部康复训练'
  }

  return { score, description }
}

// ============================================================
// 6. 掌纹线检测（基于 Canvas 图像处理）
//   使用 Canny 边缘检测 + Hough 直线检测
//   ⚠ 浏览器端实现，精度有限，仅供娱乐参考
// ============================================================

/** 从 Canvas 掌部区域检测掌纹线 */
export function detectPalmLines(
  landmarks: HandKeypoint[],
  canvas: HTMLCanvasElement,
): PalmLineInfo[] {
  const lines: PalmLineInfo[] = []

  try {
    // 提取手掌 ROI 区域
    const palmKeys = [
      HAND_KEYPOINT_INDEX['wrist'],
      HAND_KEYPOINT_INDEX['index_finger_mcp'],
      HAND_KEYPOINT_INDEX['pinky_mcp'],
    ]
    const wrist = landmarks[palmKeys[0]]
    const indexMCP = landmarks[palmKeys[1]]
    const pinkyMCP = landmarks[palmKeys[2]]

    if (wrist.visibility < 0.5 || indexMCP.visibility < 0.5 || pinkyMCP.visibility < 0.5) {
      return createDefaultPalmLines()
    }

    // 裁剪掌部区域
    const padding = 0.05
    const cx = (wrist.x + indexMCP.x + pinkyMCP.x) / 3
    const cy = (wrist.y + indexMCP.y + pinkyMCP.y) / 3
    const roiW = Math.max(Math.abs(indexMCP.x - pinkyMCP.x), 0.15) + padding * 2
    const roiH = Math.max(Math.abs(wrist.y - Math.max(indexMCP.y, pinkyMCP.y)), 0.2) + padding * 2

    const sx = Math.round(Math.max(0, cx - roiW / 2) * canvas.width)
    const sy = Math.round(Math.max(0, cy - roiH / 2) * canvas.height)
    const sw = Math.round(Math.min(roiW, 1) * canvas.width)
    const sh = Math.round(Math.min(roiH, 1) * canvas.height)

    if (sw <= 10 || sh <= 10) return createDefaultPalmLines()

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return createDefaultPalmLines()

    const imageData = ctx.getImageData(sx, sy, sw, sh)

    // 简化的边缘检测（Sobel 近似）
    const gray = toGrayscale(imageData.data, sw, sh)
    const edges = sobelEdge(gray, sw, sh)

    // 简化的 Hough 线检测（基于聚类）
    const detectedLines = simplifiedHoughLines(edges, sw, sh)

    // 将检测到的线分类为掌纹线
    lines.push(...classifyPalmLines(detectedLines, sw, sh))
  } catch {
    return createDefaultPalmLines()
  }

  return lines.length > 0 ? lines : createDefaultPalmLines()
}

// ---- 掌纹线检测辅助函数 ----

function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / (3 * 255)
  }
  return gray
}

function sobelEdge(gray: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h)

  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * w + (x + kx)
          const kidx = (ky + 1) * 3 + (kx + 1)
          gx += gray[idx] * sobelX[kidx]
          gy += gray[idx] * sobelY[kidx]
        }
      }
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  // 阈值化
  const threshold = 0.15
  for (let i = 0; i < edges.length; i++) {
    edges[i] = edges[i] > threshold ? 1 : 0
  }

  return edges
}

interface DetectedLine {
  x1: number; y1: number
  x2: number; y2: number
  angle: number
  length: number
  strength: number
}

function simplifiedHoughLines(edges: Float32Array, w: number, h: number): DetectedLine[] {
  const points: Array<{ x: number; y: number }> = []

  // 收集边缘点
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (edges[y * w + x] > 0.5) {
        points.push({ x, y })
      }
    }
  }

  if (points.length < 5) return []

  // 使用简化的聚类方法检测线段
  // 对边缘点进行方向聚类
  const lines: DetectedLine[] = []
  const angleBins = 36 // 5 度精度
  const angleBinCounts = new Array(angleBins).fill(0)
  const angleBinPoints: Array<Array<{ x: number; y: number }>> = Array.from(
    { length: angleBins },
    () => [],
  )

  // 随机采样点对来估计线段
  const sampleCount = Math.min(points.length * 3, 200)
  for (let s = 0; s < sampleCount; s++) {
    const i = Math.floor(Math.random() * points.length)
    const j = Math.floor(Math.random() * points.length)
    if (i === j) continue

    const p1 = points[i]
    const p2 = points[j]
    const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
    if (dist < 8 || dist > w * 0.8) continue

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * angleBins) % angleBins
    angleBinCounts[bin]++
    angleBinPoints[bin].push(p1, p2)
  }

  // 取前 4 个最多的角度 bin
  const topBins = angleBinCounts
    .map((count, bin) => ({ bin, count }))
    .filter((b) => b.count > 10)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)

  for (const { bin } of topBins) {
    const pts = angleBinPoints[bin]
    if (pts.length < 2) continue

    // 计算主方向上的线
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }

    const length = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2)
    if (length < 15) continue

    lines.push({
      x1: minX, y1: minY,
      x2: maxX, y2: maxY,
      angle: Math.atan2(maxY - minY, maxX - minX),
      length,
      strength: angleBinCounts[bin] / sampleCount,
    })
  }

  return lines
}

/** 将检测到的线段分类为传统的掌纹线 */
function classifyPalmLines(lines: DetectedLine[], w: number, h: number): PalmLineInfo[] {
  const result: PalmLineInfo[] = []

  // 为每条线计算其在手掌中的相对位置（归一化到 [0, 1]）
  const normLines = lines.map((l) => ({
    ...l,
    nx1: l.x1 / w, ny1: l.y1 / h,
    nx2: l.x2 / w, ny2: l.y2 / h,
    normLength: l.length / Math.max(w, h),
  }))

  // 按角度范围分类
  for (const l of normLines) {
    let name: PalmLineInfo['name'] | null = null

    if (l.angle >= HEART_LINE_ANGLE_MIN && l.angle <= HEART_LINE_ANGLE_MAX) {
      name = 'heart_line'
    } else if (l.angle >= HEAD_LINE_ANGLE_MIN && l.angle <= HEAD_LINE_ANGLE_MAX) {
      name = 'head_line'
    } else if (l.angle >= LIFE_LINE_ANGLE_MIN && l.angle <= LIFE_LINE_ANGLE_MAX) {
      name = 'life_line'
    } else if (Math.abs(l.angle) > Math.PI * 0.4 && Math.abs(l.angle) < Math.PI * 0.6) {
      name = 'fate_line'
    }

    if (!name) continue

    const clarity = clamp(l.strength * 2, 0, 1)
    const continuity = clamp(l.normLength * 2, 0, 1)

    result.push({
      name,
      startPoint: { x: l.nx1, y: l.ny1 },
      endPoint: { x: l.nx2, y: l.ny2 },
      length: l.normLength,
      clarity,
      continuity,
      depth: clarity, // 简易近似
      detected: clarity > 0.2,
    })
  }

  // 确保四种线都存在（未检测到的用默认值）
  const foundNames = new Set(result.map((l) => l.name))
  const allNames: PalmLineInfo['name'][] = ['life_line', 'heart_line', 'head_line', 'fate_line']

  for (const name of allNames) {
    if (!foundNames.has(name)) {
      result.push({
        name,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 0 },
        length: 0,
        clarity: 0.3,
        continuity: 0.2,
        depth: 0.2,
        detected: false,
      })
    }
  }

  return result
}

function createDefaultPalmLines(): PalmLineInfo[] {
  return [
    { name: 'life_line', startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
    { name: 'heart_line', startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
    { name: 'head_line', startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
    { name: 'fate_line', startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, length: 0, clarity: 0.3, continuity: 0.2, depth: 0.2, detected: false },
  ]
}

// ============================================================
// 7. 综合健康评分
// ============================================================

/** 计算综合手部健康评分 (0-100) */
export function computeOverallHealthScore(metrics: {
  digitRatio: DigitRatio
  palmColor: PalmColorMetrics
  tremor: TremorMetrics
  jointFlex: { score: number }
  palmLines: PalmLineInfo[]
}): { score: number; summary: string; recommendations: string[] } {
  const recommendations: string[] = []
  let totalWeight = 0
  let weightedScore = 0

  // 2D:4D (20%) - 极端比值可能关联健康风险
  const ratioScore =
    metrics.digitRatio.category === 'normal' ? 0.8
      : metrics.digitRatio.category === 'low' ? 0.6
        : 0.6
  weightedScore += ratioScore * 0.20
  totalWeight += 0.20

  // 手掌颜色 (15%)
  let colorScore: number
  switch (metrics.palmColor.colorCategory) {
    case 'normal': colorScore = 0.9; break
    case 'pale': colorScore = 0.4; recommendations.push('手掌颜色偏白，注意铁质摄入，保持均衡饮食'); break
    case 'flushed': colorScore = 0.5; recommendations.push('手掌异常发红，注意血压监测，避免过度饮酒'); break
    case 'cyanotic': colorScore = 0.3; recommendations.push('手掌发紫可能提示循环问题，建议关注心肺健康'); break
    case 'jaundiced': colorScore = 0.3; recommendations.push('手掌发黄，建议关注肝功能'); break
    default: colorScore = 0.7
  }
  weightedScore += colorScore * 0.15
  totalWeight += 0.15

  // 震颤 (25%)
  let tremorScore: number
  switch (metrics.tremor.category) {
    case 'none': tremorScore = 1.0; break
    case 'physiological': tremorScore = 0.85; break
    case 'enhanced_physiological':
      tremorScore = 0.6
      recommendations.push('手部微颤较明显，可能与疲劳、咖啡因或压力有关，建议适当休息')
      break
    case 'abnormal':
      tremorScore = 0.3
      recommendations.push('检测到异常手部震颤，建议咨询医生进行神经系统评估')
      break
    default: tremorScore = 0.7
  }
  weightedScore += tremorScore * 0.25
  totalWeight += 0.25

  // 关节灵活性 (15%)
  weightedScore += metrics.jointFlex.score * 0.15
  totalWeight += 0.15

  // 掌纹线 (10%)
  const avgClarity = metrics.palmLines.reduce((s, l) => s + l.clarity, 0) / 4
  const palmLineScore = avgClarity > PALM_LINE_CLARITY_GOOD ? 0.9
    : avgClarity > PALM_LINE_CLARITY_FAIR ? 0.65 : 0.45
  weightedScore += palmLineScore * 0.10
  totalWeight += 0.10

  // 甲床颜色 (5%) - 基于手掌颜色近似
  weightedScore += colorScore * 0.05
  totalWeight += 0.05

  // 对称性 (10%) - 在 Combined 层面计算，此处用默认值
  weightedScore += 0.7 * 0.10
  totalWeight += 0.10

  const finalScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 70

  // 生成总结
  let summary: string
  if (finalScore >= 85) {
    summary = '手部健康表现良好，各项指标正常'
  } else if (finalScore >= 70) {
    summary = '手部健康整体正常，有轻微可改善空间'
  } else if (finalScore >= 50) {
    summary = '手部健康需要注意，建议关注上述建议'
  } else {
    summary = '手部健康指标偏低，建议咨询医疗专业人士'
  }

  return { score: finalScore, summary, recommendations }
}

/** 计算双手对称性评分 */
export function _computeSymmetryScore(
  leftHand: Record<string, any> | null,
  rightHand: Record<string, any> | null,
): number {
  if (!leftHand || !rightHand) return 0.5

  let totalDiff = 0
  let count = 0

  // 比较手指长度对称性
  if (leftHand.fingers.length === 5 && rightHand.fingers.length === 5) {
    for (let i = 0; i < 5; i++) {
      const lf = leftHand.fingers[i]
      const rf = rightHand.fingers[i]
      if (lf.length > 0 && rf.length > 0) {
        const ratio = Math.min(lf.length, rf.length) / Math.max(lf.length, rf.length)
        totalDiff += 1 - ratio
        count++
      }
    }
  }

  // 比较颜色对称性
  const colorDiff = Math.abs(leftHand.palmColor.redness - rightHand.palmColor.redness)
  totalDiff += colorDiff
  count++

  // 比较震颤对称性
  const tremorDiff = Math.abs(leftHand.tremor.amplitude - rightHand.tremor.amplitude)
  totalDiff += tremorDiff * 10
  count++

  const avgDiff = count > 0 ? totalDiff / count : 0.3
  return clamp(1 - avgDiff, 0, 1)
}
