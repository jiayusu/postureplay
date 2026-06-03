/**
 * 人眼指标计算 —— 纯函数集合
 *
 * 基于 MediaPipe Face Landmarker 478 个关键点，
 * 计算 EAR、眨眼检测、注视方向、眼疲劳评分。
 */

import type { FaceKeypoint, GazeDirection, FatigueFactors } from '@/types/eye'
import { EYE_LANDMARK_INDICES } from '@/types/eye'
import {
  EAR_BLINK_THRESHOLD,
  EAR_OPEN_THRESHOLD,
  BLINK_RATE_LOW_THRESHOLD,
  GAZE_SCREEN_HORIZONTAL_THRESHOLD,
  GAZE_SCREEN_VERTICAL_THRESHOLD,
  FACE_WIDTH_REFERENCE,
  FATIGUE_WEIGHTS,
  FACE_BOUNDARY_INDICES,
} from '@/constants/eyeConfig'

// ---- EAR 计算 ----

/**
 * 计算单只眼睛的 Eye Aspect Ratio (EAR)
 *
 * EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
 *
 * 6 个点的排列：
 *    p2  p3
 * p1         p4
 *    p6  p5
 */
function computeSingleEAR(
  landmarks: FaceKeypoint[],
  p1: number, p2: number, p3: number,
  p4: number, p5: number, p6: number,
): number {
  const getPt = (i: number) => landmarks[i]
  if (!getPt(p1) || !getPt(p4)) return 0

  const vertical1 = euclideanDist(getPt(p2), getPt(p6))
  const vertical2 = euclideanDist(getPt(p3), getPt(p5))
  const horizontal = euclideanDist(getPt(p1), getPt(p4))

  if (horizontal < 1e-6) return 0
  return (vertical1 + vertical2) / (2.0 * horizontal)
}

export function computeLeftEAR(landmarks: FaceKeypoint[]): number {
  const { inner, outer, upper1, lower1, upper2, lower2 } = EYE_LANDMARK_INDICES.leftEye
  return computeSingleEAR(
    landmarks,
    inner, upper1, upper2,
    outer, lower2, lower1,
  )
}

export function computeRightEAR(landmarks: FaceKeypoint[]): number {
  const { inner, outer, upper1, lower1, upper2, lower2 } = EYE_LANDMARK_INDICES.rightEye
  return computeSingleEAR(
    landmarks,
    inner, upper1, upper2,
    outer, lower2, lower1,
  )
}

// ---- 眨眼检测 ----

export interface BlinkState {
  ear: number
  isBlinking: boolean
  blinkDuration: number  // 当前闭眼持续帧数
  blinkJustCompleted: boolean  // 本帧刚完成一次眨眼（上升沿）
}

/**
 * 单眼眨眼状态机
 */
export function updateBlinkState(
  currentEAR: number,
  prevState: BlinkState | null,
): BlinkState {
  const ear = currentEAR

  if (!prevState) {
    return {
      ear,
      isBlinking: ear < EAR_BLINK_THRESHOLD,
      blinkDuration: ear < EAR_BLINK_THRESHOLD ? 1 : 0,
      blinkJustCompleted: false,
    }
  }

  const wasBlinking = prevState.isBlinking
  const isBlinking = ear < EAR_BLINK_THRESHOLD

  let blinkDuration = prevState.blinkDuration
  let blinkJustCompleted = false

  if (isBlinking) {
    blinkDuration = wasBlinking ? blinkDuration + 1 : 1
  } else {
    // 从闭眼恢复到睁眼 — 完成一次眨眼
    if (wasBlinking && ear >= EAR_OPEN_THRESHOLD && blinkDuration > 0) {
      blinkJustCompleted = true
    }
    blinkDuration = 0
  }

  return { ear, isBlinking, blinkDuration, blinkJustCompleted }
}

// ---- 注视方向估算 ----

/**
 * 基于虹膜位置估算注视方向
 *
 * 原理：比较虹膜中心相对眼裂中心的位置偏移。
 * 虹膜居中 = 正视；虹膜偏左/右/上/下 = 注视相应方向。
 */
export function computeGazeDirection(landmarks: FaceKeypoint[]): GazeDirection {
  const { iris, leftEye, rightEye } = EYE_LANDMARK_INDICES

  const leftIris = landmarks[iris.left]
  const rightIris = landmarks[iris.right]

  if (!leftIris || !rightIris) {
    return { horizontal: 0, vertical: 0, isLookingAtScreen: false }
  }

  // 左眼裂中心
  const lInner = landmarks[leftEye.inner], lOuter = landmarks[leftEye.outer]
  const lTop = landmarks[leftEye.top], lBottom = landmarks[leftEye.bottom]
  const leftEyeCenter = {
    x: (lInner.x + lOuter.x) / 2,
    y: (lTop.y + lBottom.y) / 2,
  }
  // 右眼裂中心
  const rInner = landmarks[rightEye.inner], rOuter = landmarks[rightEye.outer]
  const rTop = landmarks[rightEye.top], rBottom = landmarks[rightEye.bottom]
  const rightEyeCenter = {
    x: (rInner.x + rOuter.x) / 2,
    y: (rTop.y + rBottom.y) / 2,
  }

  // 虹膜偏移（归一化到 [-1, 1]）
  const leftH = (leftIris.x - leftEyeCenter.x) / (Math.abs(landmarks[leftEye.outer]?.x - landmarks[leftEye.inner]?.x) * 0.5 + 1e-6)
  const rightH = (rightIris.x - rightEyeCenter.x) / (Math.abs(landmarks[rightEye.outer]?.x - landmarks[rightEye.inner]?.x) * 0.5 + 1e-6)
  const leftV = (leftIris.y - leftEyeCenter.y) / (Math.abs(landmarks[leftEye.top]?.y - landmarks[leftEye.bottom]?.y) * 0.5 + 1e-6)
  const rightV = (rightIris.y - rightEyeCenter.y) / (Math.abs(landmarks[rightEye.top]?.y - landmarks[rightEye.bottom]?.y) * 0.5 + 1e-6)

  const horizontal = clamp((leftH + rightH) / 2, -1, 1)
  const vertical = clamp((leftV + rightV) / 2, -1, 1)

  const isLookingAtScreen =
    Math.abs(horizontal) < GAZE_SCREEN_HORIZONTAL_THRESHOLD &&
    Math.abs(vertical) < GAZE_SCREEN_VERTICAL_THRESHOLD

  return { horizontal, vertical, isLookingAtScreen }
}

// ---- 屏幕距离估计 ----

/**
 * 基于面部宽度估计屏幕距离
 *
 * 人脸越大 → 越近。返回相对值（1.0 = 参考距离）。
 */
export function computeScreenDistance(landmarks: FaceKeypoint[]): number {
  const left = landmarks[FACE_BOUNDARY_INDICES.leftCheek]
  const right = landmarks[FACE_BOUNDARY_INDICES.rightCheek]

  if (!left || !right) return 1.0

  const faceWidth = Math.abs(right.x - left.x)
  if (faceWidth < 1e-6) return 1.0

  // 相对距离：参考宽度 / 当前宽度
  const relative = FACE_WIDTH_REFERENCE / faceWidth
  return clamp(relative, 0.5, 2.0)
}

// ---- 眼疲劳评分 ----

/**
 * 计算眼疲劳综合评分 [0, 100]
 */
export function computeFatigueScore(factors: FatigueFactors): number {
  const weighted =
    factors.lowBlinkRate * FATIGUE_WEIGHTS.lowBlinkRate +
    factors.eyelidDroop * FATIGUE_WEIGHTS.eyelidDroop +
    factors.gazeFixation * FATIGUE_WEIGHTS.gazeFixation +
    factors.tooClose * FATIGUE_WEIGHTS.tooClose

  return clamp(weighted * 100, 0, 100)
}

/**
 * 计算眨眼频率过低的严重程度
 */
export function lowBlinkRateSeverity(blinkRate: number): number {
  if (blinkRate >= BLINK_RATE_LOW_THRESHOLD) return 0
  // 线性映射：12 → 0, 0 → 1
  return clamp(1 - blinkRate / BLINK_RATE_LOW_THRESHOLD, 0, 1)
}

/**
 * 计算眼睑下垂严重程度（基于平均 EAR 低于正常值的程度）
 */
export function eyelidDroopSeverity(avgEAR: number): number {
  const normalEAR = 0.35
  if (avgEAR >= normalEAR) return 0
  return clamp(1 - avgEAR / normalEAR, 0, 1)
}

// ---- 工具函数 ----

function euclideanDist(a: FaceKeypoint, b: FaceKeypoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
