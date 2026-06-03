/**
 * 相术体态分析配置常量
 */

// ─── 脊柱分析配置 ───

/** 脊柱关键点索引 (MediaPipe Pose 33点) */
export const SPINE_KEYPOINT_INDICES = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftEar: 7,
  rightEar: 8,
} as const

/** 颈椎前倾角度阈值（度） */
export const CERVICAL_TILT_THRESHOLD = 15

/** 胸椎驼背角度阈值（度） */
export const THORACIC_SLOUCH_THRESHOLD = 20

/** 腰椎前倾角度阈值（度） */
export const LUMBAR_TILT_THRESHOLD = 12

/** 肩高不对称阈值（归一化坐标） */
export const SHOULDER_ASYMMETRY_THRESHOLD = 0.03

/** 脊柱侧弯阈值 */
export const LATERAL_CURVATURE_THRESHOLD = 0.1

/** 脊柱评分权重 */
export const SPINE_SCORE_WEIGHTS = {
  cervical: 0.35,
  thoracic: 0.35,
  lumbar: 0.2,
  asymmetry: 0.1,
}

// ─── 手相分析配置 ───

/** 手掌关键点索引 (MediaPipe Hand 21点) */
export const PALM_KEYPOINT_INDICES = {
  wrist: 0,
  thumbBase: 1,
  thumbKnuckle: 2,
  thumbTip: 4,
  indexBase: 5,
  indexTip: 8,
  middleBase: 9,
  middleTip: 12,
  ringBase: 13,
  ringTip: 16,
  pinkyBase: 17,
  pinkyTip: 20,
} as const

/** 大鱼际（金星丘）区域关键点 */
export const VENUS_MOUNT_INDICES = [0, 1, 2, 5]

/** 九宫格区域配置 */
export const BAGUA_SECTORS_CONFIG: Array<{
  sector: string
  organ: string
  element: string
  colorHealthy: string
  colorDepleted: string
}> = [
  { sector: 'qian', organ: '大肠/肺', element: '金', colorHealthy: '#ffd700', colorDepleted: '#4a4a4a' },
  { sector: 'kan', organ: '肾脏/膀胱', element: '水', colorHealthy: '#4488ff', colorDepleted: '#1a3355' },
  { sector: 'gen', organ: '脾胃', element: '土', colorHealthy: '#ffaa33', colorDepleted: '#553311' },
  { sector: 'zhen', organ: '肝脏', element: '木', colorHealthy: '#44dd44', colorDepleted: '#1a4411' },
  { sector: 'xun', organ: '胆腑', element: '木', colorHealthy: '#66ff66', colorDepleted: '#225522' },
  { sector: 'li', organ: '心脏/小肠', element: '火', colorHealthy: '#ff4444', colorDepleted: '#441111' },
  { sector: 'kun', organ: '脾脏', element: '土', colorHealthy: '#ffcc44', colorDepleted: '#443311' },
  { sector: 'dui', organ: '肺脏', element: '金', colorHealthy: '#ffd700', colorDepleted: '#443300' },
]

/** 掌色判定阈值 */
export const PALM_COLOR_RUDDY_THRESHOLD = 160
export const PALM_COLOR_DARK_THRESHOLD = 80
export const PALM_COLOR_PALE_THRESHOLD = 100

// ─── 骨相分析配置 ───

/** 面部骨相关键点 (MediaPipe Face Landmarker 478点) */
export const BONE_KEYPOINT_INDICES = {
  forehead: [9, 107, 66, 69, 108, 67, 103, 104, 68, 71],  // 额骨轮廓
  foreheadCenter: 10,  // 额头中心
  noseBridge: [6, 197, 195, 5, 4],  // 鼻梁
  noseTip: 1,  // 鼻尖
  cheekboneLeft: [50, 117, 118, 101, 36],  // 左颧骨
  cheekboneRight: [280, 346, 347, 330, 266],  // 右颧骨
  jawLeft: [172, 136, 135, 138, 215],  // 左下颌
  jawRight: [397, 365, 364, 367, 435],  // 右下颌
  chin: [152, 175, 199],  // 下巴
  templeLeft: [54, 103, 67],  // 左太阳穴(天庭)
  templeRight: [284, 332, 297],  // 右太阳穴
}

/** 额骨饱满判定阈值 */
export const FOREHEAD_FULLNESS_THRESHOLD = 0.55

/** 颧骨突出判定阈值 */
export const CHEEKBONE_PROMINENCE_THRESHOLD = 0.6

/** 下颌角判定阈值（度） */
export const JAW_ANGLE_SQUARE_THRESHOLD = 120
export const JAW_ANGLE_NARROW_THRESHOLD = 100

// ─── 可视化特效配置 ───

/** 八卦光环旋转速度（弧度/秒） */
export const BAGUA_ROTATION_SPEED = 0.3

/** 脉动频率（Hz） */
export const PULSE_FREQUENCY = 2.0

/** 粒子生成速率（个/秒） */
export const PARTICLE_SPAWN_RATE_HEALTHY = 18
export const PARTICLE_SPAWN_RATE_DIMINISHED = 3

/** 粒子生命周期（秒） */
export const PARTICLE_MAX_LIFE = 2.5

/** 生命之树颜色配置 */
export const TREE_COLORS = {
  flowing: {
    trunk: '#ffd700',
    glow: '#ffee77',
    leaves: '#44ff44',
    flowers: '#ff66aa',
    particles: ['#ffd700', '#ffaa00', '#44ff44', '#ff66aa', '#88ffff'],
  },
  blocked: {
    trunk: '#666666',
    glow: '#444444',
    leaves: '#335533',
    flowers: '#664455',
    particles: ['#666666', '#555555'],
  },
  diminished: {
    trunk: '#887744',
    glow: '#665522',
    leaves: '#448844',
    flowers: '#997766',
    particles: ['#887744', '#997766'],
  },
}

/** 骨相光效颜色 */
export const BONE_GLOW_COLORS = {
  forehead: {
    auspicious: { inner: '#ffd700', outer: '#ff8c00', particle: '#fff3b0' },
    neutral: { inner: '#cccccc', outer: '#889988', particle: '#dddddd' },
  },
  cheekbone: {
    controversial: { inner: '#ff6347', outer: '#8b0000', particle: '#ff8c69' },
    neutral: { inner: '#d2691e', outer: '#8b4513', particle: '#deb887' },
  },
  jaw: {
    square: { inner: '#c0a060', outer: '#806040', particle: '#d4b886' },
    neutral: { inner: '#a0a0a0', outer: '#707070', particle: '#c0c0c0' },
  },
  noseBridge: {
    auspicious: { inner: '#ffe4b5', outer: '#daa520', particle: '#fff8dc' },
    neutral: { inner: '#c0c0c0', outer: '#808080', particle: '#d3d3d3' },
  },
}
