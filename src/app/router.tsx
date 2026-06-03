// ============================================================
// 体态游乐场 PosturePlay — 路由配置
//
// 路由定义：
//   /              → HomeRedirect（首访判断）
//   /loading       → LoadingPage（模型加载）
//   /onboarding    → OnboardingPage（首次引导）
//   /calibration   → CalibrationPage（中立位校准）
//   /mirror        → MirrorPage（镜像主页）
//   /fortune       → FortunePage（每日运势）
//   /palm          → PalmReadingPage（手相健康）
//   *              → 重定向到 /
// ============================================================

import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import AppLayout from '@/app/layouts/AppLayout'

// ── 懒加载页面 ──

const LoadingPage = lazy(() => import('@/pages/LoadingPage'))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const CalibrationPage = lazy(() => import('@/pages/CalibrationPage'))
const MirrorPage = lazy(() => import('@/pages/MirrorPage'))
const FortunePage = lazy(() => import('@/pages/FortunePage'))
const PalmReadingPage = lazy(() => import('@/pages/PalmReadingPage'))
const PhysiognomyPage = lazy(() => import('@/pages/PhysiognomyPage'))

// ── 加载降级 ──

function PageFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0f0f1a]">
      <div className="w-8 h-8 border-2 border-[#f59e4b] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── 根路由重定向（首访判断）──

function HomeRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    // 默认跳转到加载页，由 LoadingPage 内部判断后续流程
    navigate('/loading', { replace: true })
  }, [navigate])

  return <PageFallback />
}

// ── 路由组件 ──

export default function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/loading" element={<LoadingPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/mirror" element={<MirrorPage />} />
          <Route path="/fortune" element={<FortunePage />} />
          <Route path="/palm" element={<PalmReadingPage />} />
          <Route path="/physiognomy" element={<PhysiognomyPage />} />
          <Route path="*" element={<HomeRedirect />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
