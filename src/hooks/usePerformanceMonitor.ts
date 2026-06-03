// ============================================================
// 体态游乐场 PosturePlay — usePerformanceMonitor（向后兼容）
//
// 阶段十五重构：
//   原本的 rAF FPS 监控逻辑已迁移到 useDegradationController。
//   此 Hook 保留为向后兼容的 wrapper（仅在 MirrorPage 中替换为
//   useDegradationController 之前使用）。
//
// 新代码请直接使用 useDegradationController(mode)。
// ============================================================

import { useDegradationController } from './useDegradationController'

/**
 * @deprecated 请使用 useDegradationController(mode) 替代
 */
export function usePerformanceMonitor() {
  // 默认使用 'work' 模式（最严格的性能目标）
  useDegradationController('work')
}
