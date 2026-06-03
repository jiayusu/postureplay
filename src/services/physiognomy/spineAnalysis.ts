/**
 * 脊柱分析服务 —— "生命之树" 能量图谱
 * 从 Pose Landmarker 33关键点计算脊柱健康指标
 */
import type { Keypoint } from '../../types'
import type { SpineMetrics, SpineSegment, SpineEnergy } from '../../types/physiognomy'
import {
  SPINE_KEYPOINT_INDICES,
  CERVICAL_TILT_THRESHOLD,
  THORACIC_SLOUCH_THRESHOLD,
  LUMBAR_TILT_THRESHOLD,
  SHOULDER_ASYMMETRY_THRESHOLD,
  LATERAL_CURVATURE_THRESHOLD,
  SPINE_SCORE_WEIGHTS,
} from '../../constants/physiognomyConfig'

/** 计算两点之间的角度（相对于垂直线的倾斜角） */
function verticalAngle(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dy === 0) return 90
  return Math.abs(Math.atan2(dx, dy) * (180 / Math.PI))
}

/** 计算两点中点 */
function midpoint(
  x1: number, y1: number,
  x2: number, y2: number,
): { x: number; y: number } {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}

/** 归一化偏差 0-1 */
function normalizeDeviation(angle: number, threshold: number): number {
  return Math.min(1, angle / (threshold * 2))
}

/**
 * 计算脊柱完整指标
 */
export function computeSpineMetrics(
  keypoints: Keypoint[],
  timestamp: number,
): SpineMetrics {
  const { nose, leftShoulder, rightShoulder, leftHip, rightHip, leftEar, rightEar } =
    SPINE_KEYPOINT_INDICES

  const kp = keypoints
  if (!kp[nose] || !kp[leftShoulder] || !kp[rightShoulder] || !kp[leftHip] || !kp[rightHip]) {
    return createDefaultSpineMetrics(timestamp)
  }

  const n = { x: kp[nose].x, y: kp[nose].y, z: kp[nose].z ?? 0 }
  const ears = kp[leftEar] && kp[rightEar]
    ? midpoint(kp[leftEar].x, kp[leftEar].y, kp[rightEar].x, kp[rightEar].y)
    : n
  const shoulders = midpoint(
    kp[leftShoulder].x, kp[leftShoulder].y,
    kp[rightShoulder].x, kp[rightShoulder].y,
  )
  const hips = midpoint(
    kp[leftHip].x, kp[leftHip].y,
    kp[rightHip].x, kp[rightHip].y,
  )

  // 颈椎段：耳-肩连线与垂直线的夹角
  const cervicalAngle = verticalAngle(ears.x, ears.y, shoulders.x, shoulders.y)
  const cervical: SpineSegment = {
    angle: cervicalAngle,
    deviation: normalizeDeviation(cervicalAngle, CERVICAL_TILT_THRESHOLD),
    label: 'cervical',
  }

  // 胸椎段：肩-髋连线与垂直线的夹角
  const thoracicAngle = verticalAngle(shoulders.x, shoulders.y, hips.x, hips.y)
  const thoracic: SpineSegment = {
    angle: thoracicAngle,
    deviation: normalizeDeviation(thoracicAngle, THORACIC_SLOUCH_THRESHOLD),
    label: 'thoracic',
  }

  // 腰椎段：通过骨盆倾斜估计
  const hipDX = kp[leftHip].y - kp[rightHip].y
  const lumbarAngle = Math.abs(hipDX) * 180
  const lumbar: SpineSegment = {
    angle: lumbarAngle,
    deviation: normalizeDeviation(lumbarAngle, LUMBAR_TILT_THRESHOLD),
    label: 'lumbar',
  }

  // 肩高不对称
  const shoulderAsymmetry = kp[leftShoulder].y - kp[rightShoulder].y

  // 侧弯程度：鼻-肩中点-髋中点 三点是否在一条垂线上
  const noseToHipsMidX = Math.abs(n.x - hips.x)
  const lateralCurvature = Math.min(1, noseToHipsMidX / LATERAL_CURVATURE_THRESHOLD)

  // 综合评分
  const overallScore = Math.round(
    100 * (
      1 -
      (cervical.deviation * SPINE_SCORE_WEIGHTS.cervical +
        thoracic.deviation * SPINE_SCORE_WEIGHTS.thoracic +
        lumbar.deviation * SPINE_SCORE_WEIGHTS.lumbar +
        Math.min(1, Math.abs(shoulderAsymmetry) / SHOULDER_ASYMMETRY_THRESHOLD) *
          SPINE_SCORE_WEIGHTS.asymmetry)
    ),
  )

  // 脊柱线节点（从上到下）
  const spineLine = [
    { x: n.x, y: n.y },
    { x: (n.x + shoulders.x) / 2, y: (n.y + shoulders.y) / 2 },
    { x: shoulders.x, y: shoulders.y },
    { x: (shoulders.x + hips.x) / 2, y: (shoulders.y + hips.y) / 2 },
    { x: hips.x, y: hips.y },
  ]

  return {
    timestamp,
    cervical,
    thoracic,
    lumbar,
    shoulderAsymmetry,
    lateralCurvature,
    overallScore,
    spineLine,
  }
}

/**
 * 计算脊柱能量状态
 */
export function computeSpineEnergy(metrics: SpineMetrics): SpineEnergy {
  const { cervical, thoracic, lumbar } = metrics

  // 找出最差段
  const segments = [cervical, thoracic, lumbar]
  const maxDeviation = Math.max(...segments.map(s => s.deviation))

  if (maxDeviation < 0.3) {
    return {
      level: 1 - maxDeviation * 0.5,
      state: 'flowing',
    }
  }

  const worstSegment = segments.reduce((worst, s) =>
    s.deviation > worst.deviation ? s : worst,
  )

  if (maxDeviation < 0.6) {
    return {
      level: 1 - maxDeviation * 0.8,
      state: 'diminished',
      blockedAt: worstSegment.label,
    }
  }

  return {
    level: Math.max(0, 1 - maxDeviation),
    state: 'blocked',
    blockedAt: worstSegment.label,
  }
}

function createDefaultSpineMetrics(timestamp: number): SpineMetrics {
  return {
    timestamp,
    cervical: { angle: 0, deviation: 0, label: 'cervical' },
    thoracic: { angle: 0, deviation: 0, label: 'thoracic' },
    lumbar: { angle: 0, deviation: 0, label: 'lumbar' },
    shoulderAsymmetry: 0,
    lateralCurvature: 0,
    overallScore: 100,
    spineLine: [],
  }
}
