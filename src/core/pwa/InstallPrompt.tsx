// ============================================================
// 体态游乐场 PosturePlay — PWA 安装提示组件
//
// 策略：
//   1. 监听 beforeinstallprompt 事件 → 累积 visit count
//   2. visit count ≥ 3 且 SW 已注册 → 显示安装提示
//   3. 用户关闭 → 7 天后重新提示
//   4. 发现新版本 → 显示更新横幅
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  onUpdateReady,
  onServiceWorkerRegistered,
  isPWAInstallable,
} from './sw'

// ── 常量 ──

const STORAGE_KEY_VISIT = 'pwa_visit_count'
const STORAGE_KEY_DISMISS = 'pwa_install_dismissed_at'
const STORAGE_KEY_INSTALLED = 'pwa_installed'
const MIN_VISITS = 3
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 天

// ── 类型 ──

type PromptPhase = 'idle' | 'install' | 'update'

// ── 组件 ──

const InstallPrompt: React.FC = () => {
  const [phase, setPhase] = useState<PromptPhase>('idle')
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // ── 检查安装状态 ──

  const isInstalled = useCallback(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      localStorage.getItem(STORAGE_KEY_INSTALLED) === 'true'
    )
  }, [])

  // ── 检查是否应该显示安装提示 ──

  const shouldShowInstall = useCallback(() => {
    if (!isPWAInstallable()) return false
    if (isInstalled()) return false

    const visitCount = parseInt(
      localStorage.getItem(STORAGE_KEY_VISIT) || '0',
      10
    )
    if (visitCount < MIN_VISITS) return false

    const dismissedAt = localStorage.getItem(STORAGE_KEY_DISMISS)
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10)
      if (elapsed < DISMISS_DURATION) return false
    }

    return true
  }, [isInstalled])

  // ── beforeinstallprompt 监听 ──

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)

      // 递增访问计数
      const count = parseInt(
        localStorage.getItem(STORAGE_KEY_VISIT) || '0',
        10
      )
      const newCount = count + 1
      localStorage.setItem(STORAGE_KEY_VISIT, String(newCount))

      // 达到阈值且未被关闭 → 显示
      if (shouldShowInstall()) {
        setPhase('install')
        setVisible(true)
      }
    }

    // 应用已安装
    const handleAppInstalled = () => {
      localStorage.setItem(STORAGE_KEY_INSTALLED, 'true')
      setDeferredPrompt(null)
      setVisible(false)
      setPhase('idle')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      )
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [shouldShowInstall])

  // ── SW 回调注册 ──

  useEffect(() => {
    // 新版本可用 → 更新提示
    onUpdateReady(() => {
      if (isInstalled()) return
      setPhase('update')
      setVisible(true)
    })

    // SW 注册成功
    onServiceWorkerRegistered(() => {
      // 注册成功后再次检查是否应该显示安装提示
      if (shouldShowInstall()) {
        setPhase('install')
        setVisible(true)
      }
    })
  }, [isInstalled, shouldShowInstall])

  // ── 操作处理 ──

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        localStorage.setItem(STORAGE_KEY_INSTALLED, 'true')
        setVisible(false)
        setPhase('idle')
      } else {
        // 用户拒绝 → 7 天后再提示
        handleDismiss()
      }
    } catch {
      // 安装失败，静默处理
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleUpdateClick = useCallback(() => {
    // 刷新页面以应用新版本
    window.location.reload()
  }, [])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_DISMISS, String(Date.now()))
    setDismissed(true)
    setVisible(false)
  }, [])

  // ── 已安装 → 不渲染 ──

  if (isInstalled() && phase !== 'update') return null
  if (dismissed && phase !== 'update') return null
  if (!visible && !isInstalled()) {
    // 即使不显示，也静默累积 visit count（SW 注册后延迟检查）
    return null
  }

  // ── 渲染 ──

  const isUpdate = phase === 'update'

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-[slideUp_300ms_ease-out]"
      style={{
        background: 'rgba(26,26,46,0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(245,158,75,0.15)',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="flex items-center gap-4 max-w-[420px] mx-auto">
        {/* 图标 */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#f59e4b]/10 flex items-center justify-center">
          <span className="text-xl">
            {isUpdate ? '🔄' : '🏠'}
          </span>
        </div>

        {/* 文案 */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-white font-medium leading-tight">
            {isUpdate
              ? '发现新版本'
              : '添加到主屏幕'}
          </p>
          <p className="text-[11px] text-[#6b7280] leading-tight mt-0.5">
            {isUpdate
              ? '点击刷新即可使用最新功能'
              : '离线也能用，随时看见你的尾巴'}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={isUpdate ? handleUpdateClick : handleInstallClick}
            className="px-4 py-2 rounded-[8px] bg-[#f59e4b] text-white text-[13px] font-medium
                       hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            {isUpdate ? '刷新' : '安装'}
          </button>
          <button
            onClick={handleDismiss}
            className="px-2 py-2 text-[#6b7280] text-[13px] hover:text-white transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BeforeInstallPromptEvent 类型 ──

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default InstallPrompt
