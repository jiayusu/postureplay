/**
 * 骨相分析服务 —— "面相透射" 骨骼光影
 * 从 Face Landmarker 478关键点计算骨相指标
 */
import type { BonePhysiognomyMetrics, BoneRegion } from '../../types/physiognomy'
import { BONE_KEYPOINT_INDICES } from '../../constants/physiognomyConfig'

/** 归一化面部关键点 */
interface FacePoint {
  x: number
  y: number
  z?: number
}

/** 478个关键点数组 */
type FaceKeypoints = Array<{ x: number; y: number; z?: number; visibility?: number }>

/**
 * 计算点集的包围盒宽度和深度
 */
function computeBoundingBox(points: FacePoint[]): {
  cx: number; cy: number; minX: number; maxX: number; minY: number; maxY: number; avgZ: number
} {
  if (points.length === 0) return { cx: 0, cy: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, avgZ: 0 }
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const zs = points.map(p => p.z ?? 0)
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    avgZ: zs.reduce((a, b) => a + b, 0) / zs.length,
  }
}

/**
 * 获取面部区域的关键点
 */
function getFaceRegionPoints(
  keypoints: FaceKeypoints,
  indices: number[],
): FacePoint[] {
  return indices
    .map(i => {
      const kp = keypoints[i]
      if (!kp) return null
      return { x: kp.x, y: kp.y, z: kp.z ?? undefined } as FacePoint
    })
    .filter((p): p is FacePoint => p !== null)
}

/**
 * 计算额骨饱满度
 * 使用额头区域在Z方向的突出量和X-Y范围的比值
 */
function computeForeheadFullness(keypoints: FaceKeypoints): number {
  const points = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.forehead)

  if (points.length < 3) return 0.5

  const bbox = computeBoundingBox(points)

  // 额头宽度相对于面部比例
  const faceWidth = Math.max(
    keypoints[454]?.x ?? 0.5 - (keypoints[234]?.x ?? 0.5),
    0.3,
  )
  const foreheadWidth = bbox.maxX - bbox.minX
  const widthRatio = foreheadWidth / Math.max(faceWidth, 0.01)

  // Z方向突出
  const zRange = Math.abs(bbox.avgZ)

  // 综合评定：宽且突出 = 饱满
  const fullness = (widthRatio * 0.5 + Math.min(1, zRange * 5) * 0.5)
  return Math.min(1, Math.max(0, fullness))
}

/**
 * 计算颧骨突出度
 */
function computeCheekboneProminence(keypoints: FaceKeypoints): number {
  const leftPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.cheekboneLeft)
  const rightPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.cheekboneRight)

  if (leftPts.length < 2 || rightPts.length < 2) return 0.5

  const leftBbox = computeBoundingBox(leftPts)
  const rightBbox = computeBoundingBox(rightPts)

  // 颧骨宽度相对于面部
  const cheekWidth = rightBbox.cx - leftBbox.cx
  const faceWidth = Math.max(
    (keypoints[454]?.x ?? 0.7) - (keypoints[234]?.x ?? 0.3),
    0.01,
  )
  const widthRatio = cheekWidth / faceWidth

  // Z突出量
  const avgZ = Math.abs(leftBbox.avgZ) + Math.abs(rightBbox.avgZ) / 2

  return Math.min(1, widthRatio * 0.6 + avgZ * 3 * 0.4)
}

/**
 * 计算下颌角度
 */
function computeJawAngle(keypoints: FaceKeypoints): number {
  const jawLeftPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.jawLeft)
  const jawRightPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.jawRight)

  if (jawLeftPts.length < 2 || jawRightPts.length < 2) return 110

  const leftBbox = computeBoundingBox(jawLeftPts)
  const rightBbox = computeBoundingBox(jawRightPts)

  // 下颌角度估算：越方、越宽则角度越大
  const jawWidth = rightBbox.cx - leftBbox.cx
  const jawHeight = Math.abs(
    (jawLeftPts[0]?.y ?? 0) - (jawLeftPts[jawLeftPts.length - 1]?.y ?? 0),
  )

  if (jawHeight <= 0) return 110
  const angle = 90 + (jawWidth / jawHeight) * 40
  return Math.min(150, Math.max(80, angle))
}

/**
 * 计算鼻骨直挺度
 */
function computeNoseStraightness(keypoints: FaceKeypoints): number {
  const nosePts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.noseBridge)
  const noseTip = keypoints[BONE_KEYPOINT_INDICES.noseTip]

  if (nosePts.length < 2 || !noseTip) return 0.5

  // 鼻梁是否在一条直线上
  const xs = nosePts.map(p => p.x)
  const xDeviation = Math.max(...xs) - Math.min(...xs)

  // Z方向突出
  const zs = nosePts.map(p => Math.abs(p.z ?? 0))
  const avgZ = zs.reduce((a, b) => a + b, 0) / zs.length

  const straightness = 1 - Math.min(1, xDeviation * 8)
  const prominence = Math.min(1, avgZ * 4)

  return (straightness * 0.6 + prominence * 0.4)
}

/**
 * 判定面型
 */
function determineFaceShape(
  keypoints: FaceKeypoints,
): BonePhysiognomyMetrics['faceShape'] {
  const foreheadPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.forehead)
  const cheekL = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.cheekboneLeft)
  const cheekR = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.cheekboneRight)
  const jawL = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.jawLeft)
  const jawR = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.jawRight)

  if (foreheadPts.length < 2 || cheekL.length < 2 || jawL.length < 2) {
    return 'oval'
  }

  const fBbox = computeBoundingBox(foreheadPts)
  const cL = computeBoundingBox(cheekL)
  const cR = computeBoundingBox(cheekR)
  const jL = computeBoundingBox(jawL)
  const jR = computeBoundingBox(jawR)

  const fWidth = fBbox.maxX - fBbox.minX
  const cheekWidth = cR.cx - cL.cx
  const jawWidth = jR.cx - jL.cx

  const fToJawRatio = fWidth / Math.max(jawWidth, 0.01)
  const cheekToJawRatio = cheekWidth / Math.max(jawWidth, 0.01)

  if (fToJawRatio < 0.85 && cheekToJawRatio < 0.9) return 'triangle'
  if (jawWidth > cheekWidth * 1.15) return 'square'
  if (cheekWidth > fWidth * 1.1) return 'diamond'
  if (Math.abs(fWidth - jawWidth) < 0.03 && Math.abs(fWidth - cheekWidth) < 0.02) return 'round'
  return 'oval'
}

/**
 * 生成骨相区域信息
 */
function buildBoneRegions(
  keypoints: FaceKeypoints,
): BoneRegion[] {
  const foreheadFullness = computeForeheadFullness(keypoints)
  const cheekboneProminence = computeCheekboneProminence(keypoints)
  const jawAngle = computeJawAngle(keypoints)
  const noseStraightness = computeNoseStraightness(keypoints)

  const regions: BoneRegion[] = []

  // 额头
  const foreheadPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.forehead)
  regions.push({
    name: 'forehead',
    prominence: foreheadFullness,
    contour: foreheadPts,
    judgment: foreheadFullness > 0.55 ? 'auspicious' : 'neutral',
    judgmentLabel: foreheadFullness > 0.55 ? '天庭饱满' : '额头平正',
  })

  // 左颧骨
  const cheekLPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.cheekboneLeft)
  regions.push({
    name: 'cheekboneLeft',
    prominence: cheekboneProminence,
    contour: cheekLPts,
    judgment: cheekboneProminence > 0.65 ? 'controversial' : 'neutral',
    judgmentLabel: cheekboneProminence > 0.65 ? '颧骨高耸' : '颧骨适中',
  })

  // 右颧骨
  const cheekRPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.cheekboneRight)
  regions.push({
    name: 'cheekboneRight',
    prominence: cheekboneProminence,
    contour: cheekRPts,
    judgment: cheekboneProminence > 0.65 ? 'controversial' : 'neutral',
    judgmentLabel: cheekboneProminence > 0.65 ? '颧骨高耸' : '颧骨适中',
  })

  // 下颌
  const jawPts = [
    ...getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.jawLeft),
    ...getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.jawRight),
  ]
  regions.push({
    name: 'jaw',
    prominence: Math.min(1, jawAngle / 150),
    contour: jawPts,
    judgment: jawAngle > 120 ? 'controversial' : jawAngle < 100 ? 'warning' : 'neutral',
    judgmentLabel: jawAngle > 120 ? '腮骨宽大' : jawAngle < 100 ? '下颚尖窄' : '下颌端正',
  })

  // 鼻梁
  const nosePts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.noseBridge)
  const noseTip = keypoints[BONE_KEYPOINT_INDICES.noseTip]
  if (noseTip) nosePts.push({ x: noseTip.x, y: noseTip.y, z: noseTip.z ?? 0 })
  regions.push({
    name: 'noseBridge',
    prominence: noseStraightness,
    contour: nosePts,
    judgment: noseStraightness > 0.6 ? 'auspicious' : 'neutral',
    judgmentLabel: noseStraightness > 0.6 ? '鼻骨直挺' : '鼻梁平正',
  })

  // 下巴
  const chinPts = getFaceRegionPoints(keypoints, BONE_KEYPOINT_INDICES.chin)
  regions.push({
    name: 'chin',
    prominence: 0.5,
    contour: chinPts,
    judgment: 'neutral',
    judgmentLabel: '下巴端正',
  })

  return regions
}

/**
 * 计算骨相完整指标
 */
export function computeBonePhysiognomyMetrics(
  keypoints: FaceKeypoints,
  timestamp: number,
): BonePhysiognomyMetrics {
  if (keypoints.length < 100) {
    return createDefaultBoneMetrics(timestamp)
  }

  const foreheadFullness = computeForeheadFullness(keypoints)
  const cheekboneProminence = computeCheekboneProminence(keypoints)
  const jawAngle = computeJawAngle(keypoints)
  const noseBridgeStraightness = computeNoseStraightness(keypoints)
  const faceShape = determineFaceShape(keypoints)
  const regions = buildBoneRegions(keypoints)

  // 综合评分
  const foreheadScore = foreheadFullness * 30
  const nosScore = noseBridgeStraightness * 25
  const jawScore = (1 - Math.abs(jawAngle - 110) / 60) * 25
  const cheekScore = (1 - Math.abs(cheekboneProminence - 0.45) / 0.5) * 20
  const overallScore = Math.round(
    Math.min(100, Math.max(0, foreheadScore + nosScore + jawScore + cheekScore)),
  )

  return {
    timestamp,
    regions,
    foreheadFullness,
    cheekboneProminence,
    jawAngle,
    noseBridgeStraightness,
    overallScore,
    faceShape,
  }
}

function createDefaultBoneMetrics(timestamp: number): BonePhysiognomyMetrics {
  return {
    timestamp,
    regions: [],
    foreheadFullness: 0.5,
    cheekboneProminence: 0.45,
    jawAngle: 110,
    noseBridgeStraightness: 0.5,
    overallScore: 50,
    faceShape: 'oval',
  }
}
