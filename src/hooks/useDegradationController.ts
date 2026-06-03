// ============================================================
// 体态游乐场 PosturePlay — useDegradationController
//
// 三级性能降级控制器：
//   - 追踪渲染帧率（滑动窗口）+ 间隔采样内存
//   - 四级滞回状态机：none → level1 → level2 → level3
//   - 模式感知：每个模式有独立性能目标和最大降级等级
//   - 恢复策略：连续 15 秒恢复正常 → 逐级回升
//
// 用法：
//   useDegradationController(mode: AppMode)
// ============================================================

import { useEffect, useRef } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { MODE_CONFIGS } from '@/constants/config'
import {
  DEGRADE_LEVEL1_FPS,
  DEGRADE_LEVEL2_FPS,
  DEGRADE_LEVEL3_FPS,
  DEGRADE_LEVEL1_DURATION,
  DEGRADE_LEVEL2_DURATION,
  DEGRADE_LEVEL3_DURATION,
  RECOVERY_DURATION,
  MEMORY_CRITICAL_THRESHOLD,
  MEMORY_POLL_INTERVAL,
  FPS_WINDOW_SIZE as FPS_WIN,
} from '@/constants/config'
import { getMemoryStats } from '@/core/utils/memoryMonitor'
import type { AppMode, DegradationLevel } from '@/types'

// ---- 降级配置映射 ----
// LEVEL_DOWN_FPS reserved for future degradation mapping

const LEVEL_DOWN_DURATION: Record<string, number> = {
  level1: DEGRADE_LEVEL1_DURATION,
  level2: DEGRADE_LEVEL2_DURATION,
  level3: DEGRADE_LEVEL3_DURATION,
}

// 恢复时，当前等级需高于上一级的阈值（即不低于上一级的降级阈值）
const LEVEL_UP_FPS: Record<string, number> = {
  level3: DEGRADE_LEVEL2_FPS + 3,  // 18 + 3 = 21
  level2: DEGRADE_LEVEL1_FPS + 3,  // 25 + 3 = 28
  level1: DEGRADE_LEVEL1_FPS + 5,  // 30
}

const LEVELS: DegradationLevel[] = ['none', 'level1', 'level2', 'level3']

function clampLevel(
  level: DegradationLevel,
  maxLevel: DegradationLevel,
): DegradationLevel {
  const levelIdx = LEVELS.indexOf(level)
  const maxIdx = LEVELS.indexOf(maxLevel)
  return LEVELS[Math.min(levelIdx, maxIdx)] ?? 'none'
}

// 返回当前 renderFPS
function getCurrentFPS(timestamps: number[]): number {
  if (timestamps.length < 2) return 60
  const elapsed = timestamps[timestamps.length - 1] - timestamps[0]
  return elapsed > 0 ? ((timestamps.length - 1) / elapsed) * 1000 : 60
}

export function useDegradationController(mode: AppMode) {
  const setDegradationLevel = useUIStore((s) => s.setDegradationLevel)
  const degradationLevel = useUIStore((s) => s.degradationLevel)
  const modeConfig = MODE_CONFIGS[mode]

  // Refs
  const timestampsRef = useRef<number[]>([])
  const degradeCountRef = useRef(0)    // 连续低于降级阈值秒数
  const recoverCountRef = useRef(0)    // 连续高于恢复阈值秒数
  const rAFRef = useRef(0)
  const lastMemPollRef = useRef(0)
  const frameCountRef = useRef(0)
  const levelRef = useRef<DegradationLevel>('none')

  // 保持 ref 同步（用于 rAF 回调中读取最新 state）
  levelRef.current = degradationLevel

  useEffect(() => {
    let disposed = false
    const maxLevel = modeConfig.performanceTarget.maxDegradeLevel

    const loop = () => {
      if (disposed) return

      const now = performance.now()
      const stamps = timestampsRef.current
      stamps.push(now)
      if (stamps.length > FPS_WIN) stamps.shift()

      const fps = getCurrentFPS(stamps)
      const currentLevel = levelRef.current

      // ── 降级判定 ──
      let targetLevel: DegradationLevel | null = null

      // Level 3：渲染 FPS < 12 持续 3s 或内存危急
      if (currentLevel === 'level2' || currentLevel === 'level1' || currentLevel === 'none') {
        let triggerL3 = fps < DEGRADE_LEVEL3_FPS

        // 每 5s 检查内存
        if (now - lastMemPollRef.current > MEMORY_POLL_INTERVAL) {
          lastMemPollRef.current = now
          const mem = getMemoryStats()
          if (mem.heapUsagePercent !== null && mem.heapUsagePercent >= MEMORY_CRITICAL_THRESHOLD) {
            triggerL3 = true
          }
        }

        if (triggerL3) {
          degradeCountRef.current++
          if (
            degradeCountRef.current >=
            LEVEL_DOWN_DURATION.level3 * 30 // 30 帧 ≈ 1 秒（60fps）
          ) {
            targetLevel = clampLevel('level3', maxLevel)
            degradeCountRef.current = 0
          }
        } else if (fps < DEGRADE_LEVEL2_FPS) {
          // Level 2：FPS < 18 持续 5s
          degradeCountRef.current++
          if (
            degradeCountRef.current >=
            LEVEL_DOWN_DURATION.level2 * 30
          ) {
            targetLevel = clampLevel('level2', maxLevel)
            degradeCountRef.current = 0
          }
        } else if (fps < DEGRADE_LEVEL1_FPS) {
          // Level 1：FPS < 25 持续 5s
          degradeCountRef.current++
          if (
            degradeCountRef.current >=
            LEVEL_DOWN_DURATION.level1 * 30
          ) {
            targetLevel = clampLevel('level1', maxLevel)
            degradeCountRef.current = 0
          }
        } else {
          // FPS 正常 → reset 降级计数器
          degradeCountRef.current = 0
        }
      }

      // ── 恢复判定 ──
      if (currentLevel !== 'none') {
        const recoveryFPS = LEVEL_UP_FPS[currentLevel] ?? 30
        if (fps >= recoveryFPS) {
          recoverCountRef.current++
          if (recoverCountRef.current >= RECOVERY_DURATION * 30) {
            // 恢复一级
            const currentIdx = LEVELS.indexOf(currentLevel)
            targetLevel = LEVELS[Math.max(0, currentIdx - 1)] ?? 'none'
            recoverCountRef.current = 0
          }
        } else {
          recoverCountRef.current = 0
        }
      }

      // ── 应用切换 ──
      if (targetLevel !== null && targetLevel !== levelRef.current) {
        setDegradationLevel(targetLevel)
        levelRef.current = targetLevel
      }

      // ── 调试信息 ──
      frameCountRef.current++
      if (frameCountRef.current % 10 === 0) {
        document.title = `PosturePlay · ${fps.toFixed(0)}fps · ${levelRef.current}`
      }

      rAFRef.current = requestAnimationFrame(loop)
    }

    rAFRef.current = requestAnimationFrame(loop)

    return () => {
      disposed = true
      cancelAnimationFrame(rAFRef.current)
    }
  }, [mode, setDegradationLevel, modeConfig])
}
