/**
 * 会话管理模块统一导出
 */

export { SessionService, getSessionService } from './SessionService'
export type { SessionServiceInterface } from './types'
export { SNAPSHOT_FLUSH_INTERVAL, SNAPSHOT_RETENTION_DAYS } from './types'
export type { SessionSummary } from './types'
