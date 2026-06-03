/**
 * MediaPipe Pose 关键点索引常量
 *
 * 按 MediaPipe Pose Landmarker 的 33 个关键点索引顺序定义，
 * 参考：https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */

export const KEYPOINT_NAMES: string[] = [
  'nose',                 // 0
  'left_eye_inner',       // 1
  'left_eye',             // 2
  'left_eye_outer',       // 3
  'right_eye_inner',      // 4
  'right_eye',            // 5
  'right_eye_outer',      // 6
  'left_ear',             // 7
  'right_ear',            // 8
  'mouth_left',           // 9
  'mouth_right',          // 10
  'left_shoulder',        // 11
  'right_shoulder',       // 12
  'left_elbow',           // 13
  'right_elbow',          // 14
  'left_wrist',           // 15
  'right_wrist',          // 16
  'left_pinky',           // 17
  'right_pinky',          // 18
  'left_index',           // 19
  'right_index',          // 20
  'left_thumb',           // 21
  'right_thumb',          // 22
  'left_hip',             // 23
  'right_hip',            // 24
  'left_knee',            // 25
  'right_knee',           // 26
  'left_ankle',           // 27
  'right_ankle',          // 28
  'left_heel',            // 29
  'right_heel',           // 30
  'left_foot_index',      // 31
  'right_foot_index',     // 32
]

/** 按名称查找索引的映射对象 */
export const KEYPOINT_INDEX: Record<string, number> = Object.fromEntries(
  KEYPOINT_NAMES.map((name, index) => [name, index])
)

/** 用于体态分析的关键关节分组 */
export const BODY_JOINTS = {
  shoulders: {
    left: KEYPOINT_INDEX['left_shoulder'],
    right: KEYPOINT_INDEX['right_shoulder'],
  },
  hips: {
    left: KEYPOINT_INDEX['left_hip'],
    right: KEYPOINT_INDEX['right_hip'],
  },
  ears: {
    left: KEYPOINT_INDEX['left_ear'],
    right: KEYPOINT_INDEX['right_ear'],
  },
  nose: KEYPOINT_INDEX['nose'],
} as const

/** 尾骨锚点：左右髋关节中点（使用 23/24 索引推导） */
export const TAILBONE_ANCHOR_INDICES = {
  leftHip: KEYPOINT_INDEX['left_hip'],
  rightHip: KEYPOINT_INDEX['right_hip'],
} as const
