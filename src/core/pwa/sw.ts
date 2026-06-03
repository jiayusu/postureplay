// ============================================================
// 体态游乐场 PosturePlay — Service Worker 注册与更新
//
// 配合 vite-plugin-pwa，监控 SW 生命周期：
//   - 注册成功 → 上报
//   - 发现更新 → 通知 InstallPrompt 组件
//   - 安装完成 → 提示刷新
// ============================================================

import { registerSW } from 'virtual:pwa-register'

/** 新版本就绪回调类型 */
type UpdateCallback = () => void

/** 更新已安装回调类型 */
type InstalledCallback = () => void

/** 注册成功回调类型 */
type RegisteredCallback = () => void

let onUpdateAvailable: UpdateCallback | null = null
let onUpdateInstalled: InstalledCallback | null = null
let onRegistered: RegisteredCallback | null = null

/**
 * 注册 Service Worker。
 * 应在 main.tsx 中最早调用。
 */
export function initServiceWorker() {
  const updateSW = registerSW({
    // 有新版本可用时
    onNeedRefresh() {
      onUpdateAvailable?.()
    },
    // 新 SW 安装完成
    onOfflineReady() {
      // 首次离线就绪，静默处理（不需要用户刷新）
    },
    // SW 注册成功
    onRegisteredSW(swScriptUrl, registration) {
      onRegistered?.()
      console.log('[PWA] Service Worker 注册成功')
      if (registration) {
        // 每 60 分钟检查一次更新
        setInterval(() => {
          registration.update().catch(() => {
            // 静默处理检查失败
          })
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('[PWA] Service Worker 注册失败:', error)
    },
  })

  return updateSW
}

/**
 * 设置新版本可用回调（InstallPrompt 组件调用）。
 */
export function onUpdateReady(fn: UpdateCallback) {
  onUpdateAvailable = fn
}

/**
 * 设置更新安装完成回调。
 */
export function onInstallComplete(fn: InstalledCallback) {
  onUpdateInstalled = fn
}

/**
 * 设置注册成功回调。
 */
export function onServiceWorkerRegistered(fn: RegisteredCallback) {
  onRegistered = fn
}

/**
 * 检查 PWA 是否可安装（仅限支持 beforeinstallprompt 的浏览器）。
 */
export function isPWAInstallable(): boolean {
  return typeof window !== 'undefined' && 'beforeinstallprompt' in window
}
