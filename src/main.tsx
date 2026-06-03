// ============================================================
// 体态游乐场 PosturePlay — 应用入口
// ============================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initServiceWorker } from './core/pwa/sw'
import './index.css'

// ── 初始化 Service Worker ──
initServiceWorker()

// ── 挂载 React ──
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
