// ============================================================
// 体态游乐场 PosturePlay — cameraStore
//
// 管理摄像头状态：MediaStream 生命周期、权限错误、光照检测、
// 中断重连支持。
// 通过模块级 CameraService 单例与硬件层交互。
// ============================================================

import { create } from 'zustand'
import { getCameraService } from '@/services/camera'
import type { LightingInfo } from '@/services/camera'
import { DEFAULT_CAMERA_CONFIG } from '@/constants/config'

// ---- State & Actions ----

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'reconnecting' | 'error'

interface CameraState {
  stream: MediaStream | null
  status: CameraStatus
  facingMode: 'user' | 'environment'
  errorMessage: string
  lighting: LightingInfo
  /** 重连尝试次数 */
  reconnectAttempt: number

  startCamera(): Promise<void>
  stopCamera(): void
  switchFacing(): Promise<void>
  updateLighting(info: LightingInfo): void
  /** 标记摄像头为断连中，触发重连 */
  setReconnecting(): void
  /** 重连成功 */
  setReconnected(stream: MediaStream): void
  /** 重连失败（超过最大尝试次数） */
  setReconnectFailed(): void
}

// ---- 常量 ----

const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 2000

// ---- Store ----

export const useCameraStore = create<CameraState>((set, get) => ({
  // ── State ──
  stream: null,
  status: 'idle',
  facingMode: 'user',
  errorMessage: '',
  lighting: { sufficient: true, level: 'normal' },
  reconnectAttempt: 0,

  // ── Actions ──

  startCamera: async () => {
    const svc = getCameraService()

    set({ status: 'requesting', errorMessage: '' })

    try {
      const stream = await svc.start({
        ...DEFAULT_CAMERA_CONFIG,
        facingMode: get().facingMode,
      })
      set({ stream, status: 'active', reconnectAttempt: 0 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '摄像头启动失败'
      set({ status: 'error', errorMessage: msg })
    }
  },

  stopCamera: () => {
    const svc = getCameraService()
    svc.stop()
    set({ stream: null, status: 'idle', reconnectAttempt: 0 })
  },

  switchFacing: async () => {
    const svc = getCameraService()
    const newMode = get().facingMode === 'user' ? 'environment' : 'user'

    try {
      const stream = await svc.switchFacing()
      set({ stream, facingMode: newMode, status: 'active', errorMessage: '' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '摄像头切换失败'
      set({ errorMessage: msg })
    }
  },

  updateLighting: (info: LightingInfo) => {
    set({ lighting: info })
  },

  /**
   * 标记摄像头断连，启动自动重连
   */
  setReconnecting: () => {
    const { reconnectAttempt, status } = get()
    // 仅在 active 状态下处理断连
    if (status !== 'active') return

    const svc = getCameraService()
    svc.stop() // 释放残留资源

    const attempts = reconnectAttempt

    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      set({
        status: 'error',
        errorMessage: '摄像头连接失败，请检查设备后刷新页面',
        stream: null,
      })
      return
    }

    set({ status: 'reconnecting', reconnectAttempt: attempts + 1 })

    // 延迟重试
    setTimeout(async () => {
      const { status: currentStatus } = get()
      if (currentStatus !== 'reconnecting') return

      try {
        const svc = getCameraService()
        const stream = await svc.start({
          ...DEFAULT_CAMERA_CONFIG,
          facingMode: get().facingMode,
        })
        set({ stream, status: 'active', reconnectAttempt: 0 })
      } catch {
        // 重试失败，累加计数后继续
        const { reconnectAttempt: retryCount } = get()
        if (retryCount < MAX_RECONNECT_ATTEMPTS) {
          get().setReconnecting()
        } else {
          set({
            status: 'error',
            errorMessage: '摄像头连接失败，请检查设备后刷新页面',
            stream: null,
          })
        }
      }
    }, RECONNECT_DELAY_MS)
  },

  setReconnected: (stream: MediaStream) => {
    set({ stream, status: 'active', reconnectAttempt: 0 })
  },

  setReconnectFailed: () => {
    set({
      status: 'error',
      errorMessage: '摄像头连接失败，请检查设备后刷新页面',
      stream: null,
    })
  },
}))
