/**
 * FortuneService 模块 — 每日运势服务
 *
 * 对外提供：
 *   - FortuneService 类（运势生成 + 缓存读写）
 *   - getFortuneService() 单例工厂
 *   - FortuneServiceInterface 类型
 *   - calcTrendSlope / calcPostureScore 辅助函数（供测试用）
 */

export { FortuneService, getFortuneService, resetFortuneService } from './FortuneService'
export { calcTrendSlope, calcPostureScore } from './FortuneService'
export { todayDateString } from './types'
export type { FortuneServiceInterface, FortuneTemplate } from './types'
