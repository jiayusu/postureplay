// ============================================================
// 体态游乐场 PosturePlay — 内存监控工具
//
// 提供内存使用情况采集：
//   - JS 堆大小（Chrome/Edge 专属 API，非标准）
//   - Canvas 缓冲区估算
//   - 告警等级判定
//
// 用法：
//   import { getMemoryStats } from '@/core/utils/memoryMonitor'
//
//   const stats = getMemoryStats(canvas)
//   if (stats.warningLevel === 'critical') { ... }
// ============================================================

// ---- 扩展 performance.memory 类型 ----

interface ExtendedPerformance extends Performance {
  memory?: {
    usedJSHeapSize: number
    jsHeapSizeLimit: number
    totalJSHeapSize: number
  }
}

// ---- 类型 ----

export interface MemoryStats {
  /** JS 堆已用（MB） */
  heapUsedMB: number | null
  /** JS 堆上限（MB） */
  heapLimitMB: number | null
  /** 堆使用率 [0, 1] */
  heapUsagePercent: number | null
  /** Canvas 缓冲区估算（MB） */
  canvasMemoryMB: number
  /** 告警等级 */
  warningLevel: 'normal' | 'warning' | 'critical'
  /** 是否 API 可用 */
  available: boolean
}

// ---- 阈值 ----

const MEMORY_CRITICAL = 0.8
const MEMORY_WARNING = 0.6

/**
 * 获取当前内存统计。
 *
 * @param canvas - 可选，用于估算 Canvas 内存的 canvas 元素
 */
export function getMemoryStats(
  canvas?: HTMLCanvasElement | null,
): MemoryStats {
  const perf = performance as ExtendedPerformance
  const hasMemoryAPI = !!(perf.memory)

  let heapUsedMB: number | null = null
  let heapLimitMB: number | null = null
  let heapUsagePercent: number | null = null

  if (hasMemoryAPI && perf.memory) {
    heapUsedMB = perf.memory.usedJSHeapSize / (1024 * 1024)
    heapLimitMB = perf.memory.jsHeapSizeLimit / (1024 * 1024)
    heapUsagePercent =
      perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit
  }

  // Canvas 缓冲区估算（RGBA = 4 bytes/pixel）
  let canvasMemoryMB = 0
  if (canvas) {
    canvasMemoryMB = (canvas.width * canvas.height * 4) / (1024 * 1024)
  }

  // 告警等级
  let warningLevel: MemoryStats['warningLevel'] = 'normal'
  if (heapUsagePercent !== null) {
    if (heapUsagePercent >= MEMORY_CRITICAL) {
      warningLevel = 'critical'
    } else if (heapUsagePercent >= MEMORY_WARNING) {
      warningLevel = 'warning'
    }
  }

  return {
    heapUsedMB,
    heapLimitMB,
    heapUsagePercent,
    canvasMemoryMB,
    warningLevel,
    available: hasMemoryAPI,
  }
}

/**
 * 内存是否处于危险状态（阈值 > 80%）。
 */
export function isMemoryCritical(heapUsagePercent?: number | null): boolean {
  if (heapUsagePercent == null) return false
  return heapUsagePercent >= MEMORY_CRITICAL
}
