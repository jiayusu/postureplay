/**
 * 自定义 Hooks 模块 — 连接 Store ↔ Service 的 React 胶水层
 *
 * 对外提供：
 *   - useCameraSetup          摄像头流 → video 元素绑定 + 自动播放
 *   - usePoseDetection        姿态检测主循环（rAF + 帧降采样 + 推理耗时）
 *   - useVisualization        Canvas 渲染（骨架 + 尾巴可视化 + 降级缩放）
 *   - usePerformanceMonitor   @deprecated 请使用 useDegradationController
 *   - useDegradationController 三级降级控制器
 */

export { useCameraSetup } from './useCameraSetup'
export { usePoseDetection } from './usePoseDetection'
export { useEyeDetection } from './useEyeDetection'
export { useVisualization } from './useVisualization'
export { usePerformanceMonitor } from './usePerformanceMonitor'
export { useDegradationController } from './useDegradationController'
