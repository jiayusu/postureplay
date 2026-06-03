// ============================================================
// 体态游乐场 PosturePlay — AppLayout
//
// 全屏深色容器，包裹所有页面路由。
// 使用 react-router-dom <Outlet /> 渲染子路由内容。
// ============================================================

import { Outlet } from 'react-router-dom'

export default function AppLayout() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0f0f1a] relative">
      <Outlet />
    </div>
  )
}
