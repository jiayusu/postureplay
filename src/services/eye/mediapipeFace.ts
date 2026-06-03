/**
 * MediaPipe Face Landmarker 封装
 *
 * 负责初始化 FaceLandmarker、执行面部关键点检测。
 * 与 Pose Landmarker 共享同一 @mediapipe/tasks-vision 库。
 */

import {
  FilesetResolver,
  FaceLandmarker,
  type FaceLandmarkerOptions,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { FaceKeypoint } from '@/types/eye'
import {
  FACE_WASM_BASE_PATH,
  FACE_MODEL_PATH,
} from '@/constants/eyeConfig'

// ---- 模块级状态 ----

let faceLandmarker: FaceLandmarker | null = null
let faceInitialized = false

// ---- 初始化 ----

/**
 * 初始化 Face Landmarker
 *
 * 复用 @mediapipe/tasks-vision 的 WASM 运行时（FilesetResolver 内部会缓存）。
 * 重复调用时会跳过初始化（幂等）。
 */
export async function initializeFaceDetector(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (faceInitialized && faceLandmarker) return

  try {
    onProgress?.(10)
    const vision = await FilesetResolver.forVisionTasks(FACE_WASM_BASE_PATH)
    onProgress?.(30)

    const options: FaceLandmarkerOptions = {
      baseOptions: {
        modelAssetPath: FACE_MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }

    onProgress?.(50)
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, options)
    onProgress?.(80)

    faceInitialized = true
    onProgress?.(100)
  } catch (error) {
    faceInitialized = false
    faceLandmarker = null
    throw error
  }
}

// ---- 面部检测 ----

/**
 * 对一帧视频进行面部关键点检测
 *
 * @param video - 正在播放的 HTMLVideoElement
 * @param timestamp - 当前帧时间戳（毫秒）
 * @returns 478 个面部关键点数组，无检测结果时返回空数组
 */
export function detectFace(
  video: HTMLVideoElement,
  timestamp: number,
): FaceKeypoint[] {
  if (!faceLandmarker) {
    console.warn('[EyeStateService] detectFace called before initialization')
    return []
  }

  let result: FaceLandmarkerResult

  try {
    result = faceLandmarker.detectForVideo(video, timestamp)
  } catch (error) {
    console.error('[EyeStateService] detectFace error:', error)
    return []
  }

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return []
  }

  const landmarks = result.faceLandmarks[0]

  // MediaPipe Face Landmarker 返回 478 个关键点
  if (landmarks.length < 468) {
    return []
  }

  return landmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility ?? 1.0,
  }))
}

// ---- 状态查询 ----

export function getFaceLandmarker(): FaceLandmarker | null {
  return faceLandmarker
}

export function isFaceInitialized(): boolean {
  return faceInitialized && faceLandmarker !== null
}

// ---- 资源清理 ----

export function disposeFaceDetector(): void {
  if (faceLandmarker) {
    faceLandmarker.close()
    faceLandmarker = null
  }
  faceInitialized = false
}
