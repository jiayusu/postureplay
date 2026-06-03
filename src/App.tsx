// ============================================================
// App.tsx — PosturePlay 应用入口
// 使用 react-router-dom BrowserRouter 包裹路由
// ErrorBoundary 包裹全局以捕获渲染错误
// ============================================================

import { BrowserRouter } from 'react-router-dom'
import AppRouter from '@/app/router'
import { InstallPrompt } from '@/core/pwa'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppRouter />
        <InstallPrompt />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
