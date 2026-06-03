// ============================================================
// 体态游乐场 PosturePlay — 全局配置常量
// ============================================================

import type { CameraConfig, ModeConfig, NeutralThreshold, AppMode } from '@/types'

// ---- 摄像头默认配置 ----

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  facingMode: 'user',
  width: 640,
  height: 480,
}

// ---- 中立位默认阈值 ----

export const DEFAULT_NEUTRAL_THRESHOLD: NeutralThreshold = {
  spineAngleMax: 8,      // 脊柱垂直偏差容差（度）
  shoulderDiffMax: 15,    // 肩膀高度差容差（像素）
  headAngleMax: 12,       // 头前倾容差（度）
}

// ---- 模式配置（按 design-document §4.6） ----

export const MODE_CONFIGS: Record<AppMode, ModeConfig> = {
  work: {
    neutralThreshold: {
      spineAngleMax: 10,
      shoulderDiffMax: 15,
      headAngleMax: 12,
    },
    alertDelay: 60,               // 偏离后 60 秒提醒
    visualizationStyle: 'full',   // 尾巴 + 光晕 + 粒子
    showBubbles: false,
    showJudgment: true,           // 显示对错反馈
    performanceTarget: {
      minRenderFPS: 24,
      minPoseFPS: 15,
      degradeDelay: 3,            // 3 秒触发降级（最快）
      maxDegradeLevel: 'level2',
    },
  },
  casual: {
    neutralThreshold: {
      spineAngleMax: 25,
      shoulderDiffMax: 30,
      headAngleMax: 25,
    },
    alertDelay: 300,               // 偏离后 5 分钟轻提醒
    visualizationStyle: 'simple',  // 仅尾巴
    showBubbles: false,
    showJudgment: false,
    performanceTarget: {
      minRenderFPS: 20,
      minPoseFPS: 12,
      degradeDelay: 5,
      maxDegradeLevel: 'level2',
    },
  },
  meditation: {
    neutralThreshold: {
      spineAngleMax: 40,           // 冥想模式不做严格判断
      shoulderDiffMax: 40,
      headAngleMax: 40,
    },
    alertDelay: 0,                 // 不提醒
    visualizationStyle: 'minimal', // 仅情绪光晕
    showBubbles: false,
    showJudgment: false,           // 无对错判断
    performanceTarget: {
      minRenderFPS: 15,
      minPoseFPS: 10,
      degradeDelay: 8,
      maxDegradeLevel: 'level1',
    },
  },
}

// ---- 可视化参数 ----

export const TAIL_SEGMENT_COUNT = 8        // 尾巴段数量
export const TAIL_DEFAULT_LENGTH = 200     // 尾巴总长度（像素）

// ---- 校准参数 ----

export const CALIBRATION_DURATION = 30     // 校准持续秒数
export const CALIBRATION_SAMPLE_INTERVAL = 500  // 采样间隔（毫秒）

// ---- 姿态判定阈值 ----

export const PETRIFICATION_THRESHOLD = 180   // 静止超过此秒数开始石化
export const FLOATING_THRESHOLD = 600        // 静止超过此秒数触发失重漂浮
export const STILLNESS_MOVEMENT_EPSILON = 0.01  // 判定静止的位移阈值
export const LIGHTING_THRESHOLD = 80          // 光照判定阈值
export const CONFIDENCE_MIN_THRESHOLD = 0.5   // 整体置信度下限
export const VISIBILITY_MIN_THRESHOLD = 0.7   // 单点可见度下限

// ---- 帧处理参数 ----

export const FRAME_DOWNSAMPLE_RATE = 2       // 每 N 帧推理一次
export const METRICS_COMPUTE_INTERVAL = 10    // 每 N 帧计算完整 metrics

// ---- 数据持久化参数 ----

export const SNAPSHOT_FLUSH_INTERVAL = 30     // 内存 buffer 每 N 条批量写入 IndexedDB
export const SNAPSHOT_RETENTION_DAYS = 14     // 快照保留天数
export const FORTUNE_LOOKBACK_DAYS = 7        // 运势回顾天数

// ---- 性能监控参数（阶段十五） ----

export const FPS_WINDOW_SIZE = 30              // FPS 滑动窗口大小（帧数）
export const INFERENCE_TIME_WINDOW = 20        // 推理耗时采样窗口大小
export const MEMORY_POLL_INTERVAL = 5000       // 内存采样间隔（毫秒）

// ---- 三级降级阈值 ----

export const DEGRADE_LEVEL1_FPS = 25           // 进入 Level 1 的渲染 FPS 阈值
export const DEGRADE_LEVEL2_FPS = 18           // 进入 Level 2 的渲染 FPS 阈值
export const DEGRADE_LEVEL3_FPS = 12           // 进入 Level 3 的渲染 FPS 阈值
export const DEGRADE_LEVEL2_POSE_FPS = 12      // 进入 Level 2 的推理 FPS 阈值
export const DEGRADE_LEVEL1_DURATION = 5       // Level 1 需连续低于阈值的秒数
export const DEGRADE_LEVEL2_DURATION = 5       // Level 2 需连续低于阈值的秒数
export const DEGRADE_LEVEL3_DURATION = 3       // Level 3 需连续低于阈值的秒数
export const RECOVERY_DURATION = 15            // 恢复正常需连续高于阈值的秒数
export const MEMORY_CRITICAL_THRESHOLD = 0.8   // 内存使用率临界值（80%）

// ---- Level 级别 Canvas 降级参数 ----

export const CANVAS_SCALE_LEVEL1 = 0.5         // Level 1: 50% 分辨率
export const CANVAS_SCALE_LEVEL2 = 0.25        // Level 2: 25% 分辨率
export const CANVAS_SCALE_LEVEL3 = 0.125       // Level 3: 12.5% 分辨率
export const TAIL_SEGMENTS_LEVEL1 = 4          // Level 1 段数
export const TAIL_SEGMENTS_LEVEL2 = 2          // Level 2 段数
export const TAIL_SEGMENTS_LEVEL3 = 1          // Level 3（静态）段数
export const PARTICLES_PER_FRAME_LEVEL1 = 1    // Level 1 粒子数
export const PARTICLES_PER_FRAME_LEVEL2 = 0    // Level 2+ 关闭粒子

// ============================================================
// MIMO AI 运势解读
// ============================================================

export const MIMO_API_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
export const MIMO_API_KEY = 'tp-cpxy2ra57nqd1uubgls5pb4gy9f86q926z1o596436j7b5qo'
export const MIMO_MODEL = 'mimo-v2.5-pro'
export const MIMO_FORTUNE_TIMEOUT_MS = 30_000    // 运势生成超时（秒）