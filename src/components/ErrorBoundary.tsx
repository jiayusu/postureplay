// ============================================================
// 体态游乐场 PosturePlay — ErrorBoundary
//
// 全局 React 错误边界（Class Component，React 18 规范）。
// 包裹 AppLayout 内容区域，捕获渲染错误后显示降级 UI：
//   - 「出错了」文案 + 错误摘要
//   - 「刷新页面」按钮
//   - 「清除数据」按钮（重置 IndexedDB + localStorage，回到 onboarding）
// ============================================================

import { Component, type ErrorInfo, type ReactNode } from 'react'

// ---- Props / State ----

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

// ---- 工具函数 ----

/**
 * 清除所有 IndexedDB 数据库
 */
async function clearAllIndexedDB(): Promise<void> {
  if (!('indexedDB' in window) || !window.indexedDB.databases) return

  try {
    const dbs = await window.indexedDB.databases()
    await Promise.all(
      dbs.map((db) => {
        if (db.name) {
          return new Promise<void>((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name!)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve() // 静默失败
          })
        }
      }),
    )
  } catch {
    // indexedDB.databases() 可能在部分浏览器不可用
  }
}

/**
 * 清除所有 localStorage 数据
 */
function clearLocalStorage(): void {
  try {
    localStorage.clear()
  } catch {
    // 静默失败
  }
}

// ---- 组件 ----

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 渲染异常:', error, errorInfo)
    this.setState({ errorInfo })
  }

  // ---- 操作 ----

  handleRefresh = (): void => {
    window.location.reload()
  }

  handleClearAndReset = async (): void => {
    await clearAllIndexedDB()
    clearLocalStorage()

    // 重置状态后刷新
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  // ---- 渲染 ----

  render(): ReactNode {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) return this.props.fallback

      const errorMsg =
        this.state.error?.message || '发生了未知错误，请尝试刷新页面'

      return (
        <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center px-8 text-center">
          {/* 图标 */}
          <div className="text-[48px] mb-4 select-none">{'\u26A0\uFE0F'}</div>

          {/* 标题 */}
          <h2 className="text-[22px] font-semibold text-white mb-2">
            出错了
          </h2>

          {/* 错误摘要 */}
          <p className="text-[13px] text-[#6b6b8a] mb-10 max-w-[360px] leading-relaxed">
            {errorMsg}
          </p>

          {/* 按钮组 */}
          <div className="flex flex-col gap-3 w-full max-w-[240px]">
            <button
              onClick={this.handleRefresh}
              className="w-full bg-[#f59e4b] text-white rounded-[8px] py-2.5 text-[15px] font-medium
                         hover:brightness-110 transition-all duration-150"
            >
              刷新页面
            </button>

            <button
              onClick={this.handleClearAndReset}
              className="w-full bg-transparent border border-[#323258] text-[#6b6b8a] rounded-[8px] py-2.5 text-[13px]
                         hover:border-[#ef4444] hover:text-[#ef4444] transition-all duration-150"
            >
              清除数据并重新开始
            </button>
          </div>

          {/* 底部提示 */}
          <p className="text-[11px] text-[#323258] mt-auto pb-8 mt-16">
            如果问题持续出现，请尝试清除浏览器缓存
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
