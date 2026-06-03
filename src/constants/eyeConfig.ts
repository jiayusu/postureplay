// ============================================================
// 体态游乐场 PosturePlay — 人眼检测配置常量
// ============================================================

// ---- MediaPipe Face Landmarker 配置 ----

/** jsdelivr CDN 上的 WASM 文件路径（与 Pose 共享 @mediapipe/tasks-vision） */
export const FACE_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

/** Google Storage 上的 Face Landmarker 模型路径 */
export const FACE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

// ---- 帧处理参数 ----

/** 面部检测降采样率（每 N 帧推理一次，降低 GPU 负担） */
export const FACE_FRAME_DOWNSAMPLE_RATE = 4

/** 眼态指标计算间隔（每 N 次面部检测计算一次完整指标） */
export const FACE_METRICS_COMPUTE_INTERVAL = 5

// ---- EAR（Eye Aspect Ratio）参数 ----

/** 闭眼判定 EAR 阈值（低于此值判定为闭眼） */
export const EAR_BLINK_THRESHOLD = 0.2

/** 眨眼恢复 EAR 阈值（高于此值判定为睁眼恢复） */
export const EAR_OPEN_THRESHOLD = 0.28

/** 正常睁眼 EAR 均值 */
export const EAR_NORMAL_MEAN = 0.35

// ---- 眨眼分析参数 ----

/** 眨眼频率计算窗口（秒），滚动窗口 */
export const BLINK_RATE_WINDOW_SEC = 60

/** 正常眨眼频率下限（次/分钟），低于此值可能盯屏过度 */
export const BLINK_RATE_LOW_THRESHOLD = 12

/** 正常眨眼频率上限（次/分钟），过高可能眼干 */
export const BLINK_RATE_HIGH_THRESHOLD = 30

/** 长闭眼阈值（毫秒），超过此值可能瞌睡 */
export const LONG_BLINK_THRESHOLD_MS = 500

// ---- 注视方向参数 ----

/** 注视屏幕水平阈值（虹膜偏移量） */
export const GAZE_SCREEN_HORIZONTAL_THRESHOLD = 0.25

/** 注视屏幕垂直阈值（虹膜偏移量） */
export const GAZE_SCREEN_VERTICAL_THRESHOLD = 0.22

/** 注视固定判定帧数（连续多少帧注视方向不变） */
export const GAZE_FIXATION_FRAMES = 90  // ~3 秒 @30fps

// ---- 屏幕距离估计参数 ----

/** 参考人脸宽度（归一化坐标），用于距离估计基准 */
export const FACE_WIDTH_REFERENCE = 0.28

/** 屏幕距离过近阈值（相对值，< 1 表示比参考更近） */
export const SCREEN_TOO_CLOSE_THRESHOLD = 0.85

/** 人脸宽度滚动窗口大小（帧数），用于平滑距离估计 */
export const FACE_WIDTH_WINDOW = 15

// ---- 眼疲劳评分权重 ----

export const FATIGUE_WEIGHTS = {
  lowBlinkRate: 0.35,     // 眨眼频率低
  eyelidDroop: 0.30,      // 眼睑下垂
  gazeFixation: 0.20,     // 注视固定
  tooClose: 0.15,         // 距离过近
}

// ---- 面部特征点（用于人脸大小估计） ----

/** 面部边界关键点索引：左耳、右耳、下巴、额头 */
export const FACE_BOUNDARY_INDICES = {
  leftCheek: 234,    // 左脸外侧
  rightCheek: 454,   // 右脸外侧
} as const
