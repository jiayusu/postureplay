// ============================================================
// 体态游乐场 PosturePlay — IndexedDB 数据库初始化
// 使用 idb 库封装，提供单例 getDB()
// ============================================================

import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'posture_play_db'
const DB_VERSION = 3

let dbInstance: IDBPDatabase | null = null

/**
 * 获取数据库单例。
 * 首次调用时会打开/创建数据库并执行 upgrade 回调建立 5 个 object store。
 */
export async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, _transaction) {
      // ---- calibration ----
      if (!db.objectStoreNames.contains('calibration')) {
        const calibrationStore = db.createObjectStore('calibration', { keyPath: 'id' })
        calibrationStore.createIndex('createdAt', 'createdAt')
      }

      // ---- sessions ----
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' })
        sessionsStore.createIndex('date', 'date')
        sessionsStore.createIndex('mode', 'mode')
      }

      // ---- posture_snapshots ----
      if (!db.objectStoreNames.contains('posture_snapshots')) {
        const snapshotsStore = db.createObjectStore('posture_snapshots', {
          autoIncrement: true,
        })
        snapshotsStore.createIndex('sessionId', 'sessionId')
        snapshotsStore.createIndex('timestamp', 'timestamp')
      }

      // ---- settings ----
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // ---- fortunes ----
      if (!db.objectStoreNames.contains('fortunes')) {
        db.createObjectStore('fortunes', { keyPath: 'date' })
      }

      // ---- hand_health (v3) ----
      if (!db.objectStoreNames.contains('hand_health')) {
        const handStore = db.createObjectStore('hand_health', { keyPath: 'id' })
        handStore.createIndex('date', 'date')
        handStore.createIndex('handedness', 'handedness')
      }
    },
  })

  return dbInstance
}

/**
 * 关闭数据库连接并清空内部缓存（用于测试或清理场景）。
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
