import type { AppMode, ModeConfig } from '@/types'

/**
 * ModeManager 服务接口
 *
 * 职责：管理应用模式切换（工作/休闲/冥想），
 * 提供模式配置查询，支持模式切换回调注册。
 */
export interface ModeManagerInterface {
  /** 获取当前活跃模式 */
  getCurrent(): AppMode

  /** 切换到指定模式，触发所有已注册回调，返回切换后的模式 */
  switchTo(mode: AppMode): AppMode

  /** 根据当前模式返回对应的 ModeConfig（派生自 MODE_CONFIGS） */
  getConfig(): ModeConfig

  /** 注册模式切换回调，每次 switchTo 时调用 */
  onModeSwitch(callback: ModeSwitchCallback): void

  /** 移除已注册的回调 */
  removeCallback(callback: ModeSwitchCallback): void
}

/** 模式切换回调签名：from=切换前模式, to=切换后模式 */
export type ModeSwitchCallback = (from: AppMode, to: AppMode) => void
