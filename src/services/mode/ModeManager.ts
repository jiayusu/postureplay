import type { AppMode, ModeConfig } from '@/types'
import { MODE_CONFIGS } from '@/constants/config'
import type { ModeManagerInterface, ModeSwitchCallback } from './types'

/**
 * ModeManager — 应用模式管理服务
 *
 * 管理三种模式（work/casual/meditation）的切换、配置查询、
 * 以及模式切换时的回调通知。
 *
 * 使用模块级单例（getModeManager）访问。
 */
export class ModeManager implements ModeManagerInterface {
  private currentMode: AppMode
  private callbacks: Set<ModeSwitchCallback> = new Set()

  constructor(initialMode: AppMode = 'work') {
    this.currentMode = initialMode
  }

  /** 获取当前活跃模式 */
  getCurrent(): AppMode {
    return this.currentMode
  }

  /**
   * 切换到指定模式
   * - 若目标模式与当前相同，跳过（不触发回调）
   * - 否则记录切换前→后，更新状态，触发所有已注册回调
   * @returns 切换后的模式
   */
  switchTo(mode: AppMode): AppMode {
    if (mode === this.currentMode) return this.currentMode

    const from = this.currentMode
    this.currentMode = mode

    for (const cb of this.callbacks) {
      try {
        cb(from, mode)
      } catch (err) {
        console.error('[ModeManager] 回调执行异常:', err)
      }
    }

    return this.currentMode
  }

  /** 根据当前模式从 MODE_CONFIGS 获取配置 */
  getConfig(): ModeConfig {
    return MODE_CONFIGS[this.currentMode]
  }

  /** 注册模式切换回调（重复注册自动去重） */
  onModeSwitch(callback: ModeSwitchCallback): void {
    this.callbacks.add(callback)
  }

  /** 移除已注册的回调 */
  removeCallback(callback: ModeSwitchCallback): void {
    this.callbacks.delete(callback)
  }
}

// ── 模块级单例 ──

let instance: ModeManager | null = null

/** 获取 ModeManager 单例（延迟创建，默认 work 模式） */
export function getModeManager(): ModeManager {
  if (!instance) {
    instance = new ModeManager()
  }
  return instance
}

/** 仅供测试使用：重置单例 */
export function resetModeManager(): void {
  instance = null
}
