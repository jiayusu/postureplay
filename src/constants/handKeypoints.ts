// ============================================================
// 体态游乐场 PosturePlay — 手部关键点索引常量
//
// 基于 MediaPipe Hand Landmarker 的 21 个手部关键点
// 参考：https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
// ============================================================

/** 手部 21 个关键点名称（按 MediaPipe 索引顺序） */
export const HAND_KEYPOINT_NAMES: string[] = [
  'wrist',                // 0  - 手腕
  'thumb_cmc',            // 1  - 拇指腕掌关节
  'thumb_mcp',            // 2  - 拇指掌指关节
  'thumb_ip',             // 3  - 拇指指间关节
  'thumb_tip',            // 4  - 拇指指尖
  'index_finger_mcp',     // 5  - 食指掌指关节
  'index_finger_pip',     // 6  - 食指近端指间关节
  'index_finger_dip',     // 7  - 食指远端指间关节
  'index_finger_tip',     // 8  - 食指指尖
  'middle_finger_mcp',    // 9  - 中指掌指关节
  'middle_finger_pip',    // 10 - 中指近端指间关节
  'middle_finger_dip',    // 11 - 中指远端指间关节
  'middle_finger_tip',    // 12 - 中指指尖
  'ring_finger_mcp',      // 13 - 无名指掌指关节
  'ring_finger_pip',      // 14 - 无名指近端指间关节
  'ring_finger_dip',      // 15 - 无名指远端指间关节
  'ring_finger_tip',      // 16 - 无名指指尖
  'pinky_mcp',            // 17 - 小指掌指关节
  'pinky_pip',            // 18 - 小指近端指间关节
  'pinky_dip',            // 19 - 小指远端指间关节
  'pinky_tip',            // 20 - 小指指尖
]

/** 按名称查找索引的映射对象 */
export const HAND_KEYPOINT_INDEX: Record<string, number> = Object.fromEntries(
  HAND_KEYPOINT_NAMES.map((name, index) => [name, index])
)

/** 手指分组（用于长度计算和关节分析） */
export const HAND_FINGERS = {
  thumb: {
    tip: HAND_KEYPOINT_INDEX['thumb_tip'],
    dip: HAND_KEYPOINT_INDEX['thumb_ip'],
    pip: HAND_KEYPOINT_INDEX['thumb_mcp'],
    mcp: HAND_KEYPOINT_INDEX['thumb_cmc'],
  },
  index: {
    tip: HAND_KEYPOINT_INDEX['index_finger_tip'],
    dip: HAND_KEYPOINT_INDEX['index_finger_dip'],
    pip: HAND_KEYPOINT_INDEX['index_finger_pip'],
    mcp: HAND_KEYPOINT_INDEX['index_finger_mcp'],
  },
  middle: {
    tip: HAND_KEYPOINT_INDEX['middle_finger_tip'],
    dip: HAND_KEYPOINT_INDEX['middle_finger_dip'],
    pip: HAND_KEYPOINT_INDEX['middle_finger_pip'],
    mcp: HAND_KEYPOINT_INDEX['middle_finger_mcp'],
  },
  ring: {
    tip: HAND_KEYPOINT_INDEX['ring_finger_tip'],
    dip: HAND_KEYPOINT_INDEX['ring_finger_dip'],
    pip: HAND_KEYPOINT_INDEX['ring_finger_pip'],
    mcp: HAND_KEYPOINT_INDEX['ring_finger_mcp'],
  },
  pinky: {
    tip: HAND_KEYPOINT_INDEX['pinky_tip'],
    dip: HAND_KEYPOINT_INDEX['pinky_dip'],
    pip: HAND_KEYPOINT_INDEX['pinky_pip'],
    mcp: HAND_KEYPOINT_INDEX['pinky_mcp'],
  },
} as const

/** 手掌中心区域关键点（用于掌纹分析 ROI） */
export const PALM_REGION_INDICES = {
  wrist: HAND_KEYPOINT_INDEX['wrist'],
  thumbBase: HAND_KEYPOINT_INDEX['thumb_cmc'],
  indexBase: HAND_KEYPOINT_INDEX['index_finger_mcp'],
  middleBase: HAND_KEYPOINT_INDEX['middle_finger_mcp'],
  ringBase: HAND_KEYPOINT_INDEX['ring_finger_mcp'],
  pinkyBase: HAND_KEYPOINT_INDEX['pinky_mcp'],
} as const

/** MediaPipe Hand Landmarker 的手部关键点连接线（骨架绘制用） */
export const HAND_CONNECTIONS: Array<[number, number]> = [
  // 拇指
  [0, 1], [1, 2], [2, 3], [3, 4],
  // 食指
  [0, 5], [5, 6], [6, 7], [7, 8],
  // 中指
  [0, 9], [9, 10], [10, 11], [11, 12],
  // 无名指
  [0, 13], [13, 14], [14, 15], [15, 16],
  // 小指
  [0, 17], [17, 18], [18, 19], [19, 20],
  // 掌横连接
  [5, 9], [9, 13], [13, 17],
]

/** 手性（左右手）判定：基于拇指相对于食指的位置 */
export const HANDEDNESS_LEFT = 'Left'
export const HANDEDNESS_RIGHT = 'Right'
