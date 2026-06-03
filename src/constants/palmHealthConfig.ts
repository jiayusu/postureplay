// ============================================================
// 体态游乐场 PosturePlay — 掌纹健康分析配置常量
// ============================================================

// ---- MediaPipe Hand Landmarker 配置 ----

/** jsdelivr CDN 上的 WASM 文件路径（与 Pose/Face 共享 @mediapipe/tasks-vision） */
export const HAND_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

/** Google Storage 上的 Hand Landmarker 模型路径 */
export const HAND_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

// ---- 帧处理参数 ----

/** 手部检测降采样率（每 N 帧推理一次） */
export const HAND_FRAME_DOWNSAMPLE_RATE = 3

/** 手部指标计算间隔（每 N 次检测计算一次完整指标） */
export const HAND_METRICS_COMPUTE_INTERVAL = 5

// ---- 手指长度分析 ----

/** 2D:4D 比值正常范围（食指/无名指长度比） */
export const DIGIT_RATIO_NORMAL_MIN = 0.92
export const DIGIT_RATIO_NORMAL_MAX = 1.02

/** 2D:4D 低比值阈值（可能关联高睾酮暴露） */
export const DIGIT_RATIO_LOW_THRESHOLD = 0.92

/** 2D:4D 高比值阈值（可能关联高雌激素暴露） */
export const DIGIT_RATIO_HIGH_THRESHOLD = 1.00

// ---- 手部颜色分析 ----

/** 手掌ROI区域拓展比例（在关键点包围盒基础上拓展） */
export const PALM_ROI_EXPAND_RATIO = 0.15

/** 手掌颜色采样网格密度 */
export const PALM_COLOR_SAMPLE_GRID = 8

/** 正常手掌红润度范围（a* 通道 Lab 色彩空间归一化） */
export const PALM_REDNESS_NORMAL_MIN = 0.12
export const PALM_REDNESS_NORMAL_MAX = 0.35

/** 苍白阈值 */
export const PALM_PALE_THRESHOLD = 0.10

/** 异常发红阈值 */
export const PALM_ABNORMAL_RED_THRESHOLD = 0.40

// ---- 手部震颤检测 ----

/** 震颤检测窗口大小（帧数） */
export const TREMOR_WINDOW_FRAMES = 60

/** 微震颤位移阈值（归一化坐标），低于此值认为是静止 */
export const TREMOR_MICRO_THRESHOLD = 0.003

/** 震颤频率分析窗口（秒） */
export const TREMOR_FREQ_WINDOW_SEC = 3

/** 生理性震颤频率范围（Hz），病理性震颤超出此范围 */
export const TREMOR_PHYSIOLOGICAL_MIN_HZ = 4
export const TREMOR_PHYSIOLOGICAL_MAX_HZ = 12

/** 振幅异常阈值（归一化坐标），超过此值提示病理性震颤 */
export const TREMOR_AMPLITUDE_ABNORMAL = 0.015

// ---- 手指关节灵活性 ----

/** 手指弯曲角度正常范围（度） */
export const FINGER_FLEXION_NORMAL_MIN = 60
export const FINGER_FLEXION_NORMAL_MAX = 120

/** 关节对称性差值阈值（左右手指对应关节角度差） */
export const JOINT_SYMMETRY_THRESHOLD = 15

// ---- 掌纹线检测 ----

/** 掌纹线检测 Canny 低阈值 */
export const PALM_CANNY_LOW = 30

/** 掌纹线检测 Canny 高阈值 */
export const PALM_CANNY_HIGH = 100

/** Hough 变换检测线的最小线长 */
export const PALM_HOUGH_MIN_LINE_LENGTH = 20

/** Hough 变换检测线的最大间隙 */
export const PALM_HOUGH_MAX_LINE_GAP = 8

/** 生命线预期角度范围（弧度）*/
export const LIFE_LINE_ANGLE_MIN = Math.PI * 0.6
export const LIFE_LINE_ANGLE_MAX = Math.PI * 1.4

/** 感情线预期角度范围（弧度，接近水平） */
export const HEART_LINE_ANGLE_MIN = -Math.PI * 0.15
export const HEART_LINE_ANGLE_MAX = Math.PI * 0.15

/** 智慧线预期角度范围（弧度，略斜向下） */
export const HEAD_LINE_ANGLE_MIN = Math.PI * 0.15
export const HEAD_LINE_ANGLE_MAX = Math.PI * 0.55

/** 掌纹线清晰度评分阈值 */
export const PALM_LINE_CLARITY_GOOD = 0.6
export const PALM_LINE_CLARITY_FAIR = 0.35

// ---- 健康评分权重 ----

export const HAND_HEALTH_WEIGHTS = {
  fingerLengthRatio: 0.20,    // 手指长度比（2D:4D）
  palmColor: 0.15,            // 手掌颜色
  tremor: 0.25,               // 手部震颤
  jointFlexibility: 0.15,     // 关节灵活性
  palmLines: 0.10,            // 掌纹特征
  nailBed: 0.05,              // 甲床颜色
  symmetry: 0.10,             // 双手对称性
}

// ---- 检测手数配置 ----

/** 最大检测手数 */
export const MAX_NUM_HANDS = 2
