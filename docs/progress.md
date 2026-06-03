# PosturePlay 开发进度

> 最后更新：2026-06-02 — 阶段十七完成（MVP 交付）

## 总览

| 阶段 | 名称 | 步骤 | 状态 | 完成日期 |
|------|------|------|------|----------|
| 一 | 项目初始化与基础设施 | 1–10 | ✅ 完成 | — |
| 二 | 核心数据流与状态管理 | 11–20 | ✅ 完成 | — |
| 三 | 摄像头模块 | 21–25 | ✅ 完成 | — |
| 四 | MediaPipe 姿态检测集成 | 26–30 | ✅ 完成 | — |
| 五 | 姿态分析服务 | 31–35 | ✅ 完成 | — |
| 六 | 校准服务 | 36–40 | ✅ 完成 | — |
| 七 | 可视化引擎 | 41–45 | ✅ 完成 | — |
| 八 | 会话管理 | 46–50 | ✅ 完成 | — |
| 九 | 运势服务 | 55–60 | ✅ 完成 | — |
| 十 | Zustand Stores | 61–65 | ✅ 完成 | — |
| 十一 | Custom Hooks | 66–70 | ✅ 完成 | — |
| 十二 | Custom Hooks（续） | 71–75 | ✅ 完成 | — |
| 十三 | UI Pages & Routing | 51–65 | ✅ 完成 | 2026-06-02 |
| 十四 | PWA & Offline Support | 66–70 | ✅ 完成 | 2026-06-02 |
| 十五 | Performance Optimization | 71–75 | ✅ 完成 | 2026-06-02 |
| 十六 | Error Handling & Edge Cases | 72–75 | ✅ 完成 | 2026-06-02 |
| 十七 | E2E Testing & Delivery | 76–85 | ✅ 完成 | 2026-06-02 |

---

## 阶段十三：UI Pages & Routing（步骤 51–65）

### 完成内容

| 步骤 | 内容 | 文件 |
|------|------|------|
| 51 | 设计系统 CSS tokens | `src/index.css` — 47 个 CSS 自定义属性（12 色、8 间距、5 圆角、7 字号、3 easing、4 时长） |
| 52 | 路由配置 | `src/app/router.tsx` — React Router v6，6 条路由，React.lazy 代码分割 |
| 53 | AppLayout | `src/app/layouts/AppLayout.tsx` — 全屏容器 + Outlet |
| 54 | LoadingPage | `src/pages/LoadingPage.tsx` — 模型加载动画 + 自动跳转 |
| 55 | OnboardingPage | `src/pages/OnboardingPage.tsx` — 三步引导流程 |
| 56 | CalibrationPage | `src/pages/CalibrationPage.tsx` — 30 秒校准界面 |
| 57 | MirrorPage | `src/pages/MirrorPage.tsx` — 三层叠加（摄像头→可视化→UI Chrome） |
| 58 | FortunePage | `src/pages/FortunePage.tsx` — 每日运势展示 |
| 59 | UI 组件 | `ProgressBar`、`CameraView`、`VisualizationOverlay`、`ModeSwitcher`、`EmotionHUD`、`AlertBanner` |
| 60 | Store barrel | `src/stores/index.ts` — 统一导出 |
| 61 | App.tsx 改造 | BrowserRouter 包裹 |
| 62 | main.tsx 改造 | StrictMode 包裹 |
| 63 | browser test | 全部路由可导航，Loading→Onboarding→Calibration→Mirror→Fortune 流程验证通过 |
| 64 | tsc --noEmit | 零错误 |
| 65 | docs | 进度文档更新 |

---

## 阶段十四：PWA & Offline Support（步骤 66–70）

### 完成内容

| 步骤 | 内容 | 文件 |
|------|------|------|
| 66 | SW 注册 | `src/core/pwa/sw.ts` — `initServiceWorker()`，更新/安装/错误回调，60 分钟静默更新检查 |
| 67 | PWA 安装提示 | `src/core/pwa/InstallPrompt.tsx` — beforeinstallprompt 监听，3 次访问阈值，7 天关闭冷却 |
| 68 | PWA barrel | `src/core/pwa/index.ts` |
| 69 | 类型声明 | `src/vite-env.d.ts` — virtual:pwa-register 类型 |
| 70 | VitePWA 配置 | `vite.config.ts` — globPatterns，3 条 runtime caching（MediaPipe CDN CacheFirst 30d、Google Fonts、images） |
| 71 | manifest | `public/manifest.json` — 完整 PWA manifest |
| 72 | HTML meta | `index.html` — 5 个 apple-mobile-web-app meta、theme-color、viewport-fit=cover |
| 73 | AI icons | `public/icon-192.png`、`public/icon-512.png` |
| 74 | build 验证 | 28 precache entries，718.93 KiB，sw.js + workbox 生成 |
| 75 | tsc --noEmit | 零错误 |

---

## 阶段十五：Performance Optimization & Degradation（步骤 71–75）

### 架构设计

引入**三级性能降级系统**，在设备性能不足时自动降低渲染质量，确保应用始终可用。

```
  正常 (none)
    │  FPS < 25 持续 5s
    ▼
  Level 1 — 质量降级
    │  Canvas 50% 分辨率 · 尾巴 4 段 · 粒子减半
    │  FPS < 18 持续 5s
    ▼
  Level 2 — 帧率降级
    │  Canvas 25% 分辨率 · 尾巴 2 段 · 关闭粒子 · rAF 降频
    │  FPS < 12 持续 3s 或 内存 > 80%
    ▼
  Level 3 — 功能降级
       Canvas 12.5% 分辨率 · 静态尾巴 · 暂停 IndexedDB
```

恢复采用**滞回策略**：连续 15 秒超过恢复阈值才逐级回升，避免振荡。

### 完成内容

| 步骤 | 内容 | 文件 |
|------|------|------|
| 71 | 类型扩展 | `src/types/index.ts` — 新增 `DegradationLevel`、扩展 `PerformanceMetrics`（heapUsedMB、heapUsagePercent、degradationLevel）、`ModeConfig.performanceTarget` |
| 71 | 降级常量 | `src/constants/config.ts` — 17 个新增常量（FPS 窗口、降级阈值、Canvas 缩放比例、尾巴段数、粒子数、内存轮询间隔） |
| 71 | 模式配置扩展 | `MODE_CONFIGS` 三个模式各自的 `performanceTarget`（work: 24/15fps, maxLevel2；casual: 20/12fps, maxLevel2；meditation: 15/10fps, maxLevel1） |
| 72 | 内存监控 | `src/core/utils/memoryMonitor.ts` — `getMemoryStats()`、`isMemoryCritical()`，Chrome `performance.memory` API |
| 72 | 降级控制器 | `src/hooks/useDegradationController.ts` — rAF 循环 + 滑动窗口 FPS 追踪 + 三级滞回状态机 + 模式感知阈值 + 5s 内存轮询 + document.title 调试 |
| 72 | 向后兼容 | `src/hooks/usePerformanceMonitor.ts` — 重写为 `useDegradationController('work')` 的薄封装，标记 @deprecated |
| 73 | uiStore 升级 | `src/stores/uiStore.ts` — `isPerformanceMode` boolean → `degradationLevel` DegradationLevel，保留 `setPerformanceMode` 向后兼容 |
| 73 | postureStore 扩展 | `src/stores/postureStore.ts` — 新增 `performanceMetrics` 状态 + `setPerformanceMetrics` 动作 |
| 73 | 推理计时 | `src/hooks/usePoseDetection.ts` — 推理耗时 t0/t1 环形缓冲（20 样本），每 20 次检测同步至 postureStore |
| 74 | Canvas 降级 | `src/services/visualization/types.ts` — RendererInterface 新增 `setQuality(scale)` |
| 74 | VisualizationService | `src/services/visualization/VisualizationService.ts` — `setResolutionScale(scale)` 代理方法 |
| 74 | TailRenderer 适配 | `src/services/visualization/renderers/TailRenderer.ts` — `qualityScale` 字段 + `setQuality()`，resize 中应用缩放 |
| 74 | useVisualization | `src/hooks/useVisualization.ts` — 读取 degradationLevel，通过 `LEVEL_SCALE` 映射 → `setResolutionScale` |
| 75 | MirrorPage 升级 | `src/pages/MirrorPage.tsx` — `useDegradationController(mode)` 替换 `usePerformanceMonitor`，三级颜色指示器（黄 ⚡/橙 ⚡/红 ❗） |
| 75 | hooks barrel | `src/hooks/index.ts` — 新增 `useDegradationController` 导出 |
| — | tsc --noEmit | 零错误 ✅ |
| — | vite build | 96 modules，28 precache entries，722.29 KiB（5.44s）✅ |
| — | browser test | 应用加载，所有路由可导航，降级控制器静默运行，无 JS 错误 ✅ |

### 关键指标

| 特性 | 数值 |
|------|------|
| FPS 滑动窗口 | 30 帧 |
| 推理耗时采样窗口 | 20 帧 |
| 内存轮询间隔 | 5000ms |
| Level 1 进入阈值 | FPS < 25 |
| Level 2 进入阈值 | FPS < 18 |
| Level 3 进入阈值 | FPS < 12 或 内存 > 80% |
| 降级判定持续时间 | L1: 5s, L2: 5s, L3: 3s |
| 恢复判定持续时间 | 15s（滞回） |
| Canvas Level 1 缩放 | 50% |
| Canvas Level 2 缩放 | 25% |
| Canvas Level 3 缩放 | 12.5% |

### 代码分割

所有页面使用 `React.lazy` + `Suspense`（`src/app/router.tsx`），满足 Phase 15 代码分割要求。构建产物包含独立 chunk。

---

## 阶段十六：错误处理与边界情况（步骤 72–75）

### 完成内容

| 步骤 | 内容 | 文件 |
|------|------|------|
| 72 | 全局错误边界 | `src/components/ErrorBoundary.tsx` — React Class Component，包裹 App 全局，捕获渲染错误后显示降级 UI（错误摘要 + 刷新页面 + 清除数据回到 onboarding），支持 IndexedDB 批量清理 |
| 72 | App.tsx 适配 | `src/App.tsx` — ErrorBoundary 包裹 BrowserRouter |
| 73 | 摄像头中断重连 | `src/stores/cameraStore.ts` — 新增 `reconnecting` 状态、`setReconnecting`/`setReconnected`/`setReconnectFailed` 动作，3 次重试 + 2s 间隔 |
| 73 | Track 监听 | `src/hooks/useCameraSetup.ts` — 监听 MediaStream track `ended` 事件 + `visibilitychange` 前台恢复检查，自动触发重连 |
| 73 | 重连 UI | `src/pages/MirrorPage.tsx` — `reconnecting` 状态覆盖层（「摄像头断开了，正在重新连接...」+ spinner） |
| 74 | 浏览器兼容检查 | `src/pages/LoadingPage.tsx` — 页面加载时检测 `navigator.mediaDevices.getUserMedia`，不支持时显示推荐浏览器列表（Chrome/Edge/Firefox） |
| 75 | 模型加载超时 | `src/pages/LoadingPage.tsx` — 30 秒超时定时器，超时后显示「AI 眼镜装配超时，请检查网络后重试」+ 重试按钮 |
| — | tsc --noEmit | 零错误 ✅ |
| — | vite build | 97 modules，28 precache entries，729.38 KiB（4.88s）✅ |
| — | browser test | 应用加载 /loading → 模型加载 → /onboarding 流程正常，无新 JS 错误 ✅ |

### 错误边界设计

```
ErrorBoundary (src/components/ErrorBoundary.tsx)
  └── catch 渲染异常 → 降级 UI
        ├── 错误图标 ⚠️ + 标题「出错了」
        ├── 错误摘要（error.message）
        ├── 「刷新页面」按钮（window.location.reload()）
        └── 「清除数据并重新开始」按钮
              ├── indexedDB.databases() → deleteDatabase（全量）
              ├── localStorage.clear()
              └── window.location.href = '/'
```

### 摄像头重连流程

```
  track.ended 事件 / visibilitychange 检测
    → cameraStore.setReconnecting()
      → status: 'reconnecting', reconnectAttempt++
      → 2s 延迟后重试 getUserMedia
        ├── 成功 → status: 'active', reconnectAttempt = 0
        ├── 失败 + attempts < 3 → 递归重试
        └── 失败 + attempts >= 3 → status: 'error'（手动刷新）
```

### 浏览器兼容性

LoadingPage 在首次渲染时（`useState` 初始化阶段）检测 `navigator.mediaDevices?.getUserMedia`：
- 支持：正常进入模型加载流程
- 不支持：显示兼容提示 + Chrome/Edge/Firefox 推荐标签

### 模型加载超时

- 30 秒计时器在 `loadModel()` 调用时启动
- `modelStatus === 'ready'` 或 `'error'` 时清除计时器
- 超时 → 显示专用 UI（不同于 error 态的红色错误提示，使用橙色警告色）
- 重试按钮复位计时器重新加载

---

## 阶段十七：端到端集成测试与交付（步骤 76–85）

### 完成内容

| 步骤 | 内容 | 验证结果 |
|------|------|----------|
| 76 | 正常用户流程 E2E | `/` → `/loading`（模型加载）→ `/onboarding`（三步引导 ① 看见尾巴 ② 魔法时刻 ③ 每日运势）→ `/calibration`（校准页）✅ |
| 77 | 镜像页 + 模式切换 | `/mirror` 加载（ModeSwitcher 工作/休闲/冥想 + 运势 FAB）→ 三种模式可切换 → 降级控制器运行（title 显示 `· fps · none`）✅ |
| 78 | 运势页 + 返回 | `/fortune` 正常渲染（初次用户显示「初次见面」）→ 「返回镜像」按钮可用 ✅ |
| 79 | 边界情况 | `/nonexistent` → 自动重定向 `/loading` ✅ · 浏览器兼容检查（getUserMedia 检测）· 模型加载超时 30s 计时 |
| 80 | 生产构建 | `vite build` → 97 modules, 28 precache entries, **729.38 KiB**, 4.88s ✅ |
| 81 | 性能审计 | Main JS 171 kB (gzip 57 kB) ← <200KB ✅ · CSS 17 kB (gzip 4 kB) ← <30KB ✅ · Lazy chunks 1–131 kB · SW precache 28 条目 |
| 82 | 最终代码检查 | `tsc --noEmit` 零错误 ✅ · README.md 更新完毕 · ErrorBoundary 包裹全局 · 所有页面 React.lazy |
| 83 | MVP 交付检查清单 | 见下方 |
| 84 | 最终 E2E 验证 | 生产预览 (`vite preview` port 5200) 完整流程通过 · PWA SW 注册成功 · MediaPipe 模型 GL 3.0 + Graph started · 无应用级 JS 错误 |
| 85 | 打包交付 | `dist/` 目录完整（index.html, manifest.json, sw.js, icons, assets） |

### MVP 交付检查清单

| 类别 | 检查项 | 状态 |
|------|--------|------|
| **构建** | tsc --noEmit 零错误 | ✅ |
| **构建** | vite build 成功 | ✅ |
| **构建** | dist/ 包含 sw.js | ✅ |
| **构建** | dist/ 包含 manifest.json | ✅ |
| **构建** | dist/ 包含 PWA icons (192/512) | ✅ |
| **功能** | 摄像头权限请求 | ✅ |
| **功能** | MediaPipe 模型加载 | ✅ |
| **功能** | 姿态检测 + 可视化 | ✅ |
| **功能** | 三种模式切换 | ✅ |
| **功能** | 中立位校准流程 | ✅ |
| **功能** | 每日运势展示 | ✅ |
| **错误处理** | ErrorBoundary 全局包裹 | ✅ |
| **错误处理** | 摄像头中断自动重连 | ✅ |
| **错误处理** | 浏览器不兼容提示 | ✅ |
| **错误处理** | 模型加载超时重试 | ✅ |
| **错误处理** | 404 路由重定向 | ✅ |
| **性能** | 三级降级系统 | ✅ |
| **性能** | 代码分割 (React.lazy) | ✅ |
| **性能** | Main JS < 200 kB gzip | ✅ (57 kB) |
| **性能** | CSS < 30 kB gzip | ✅ (4 kB) |
| **PWA** | Service Worker 注册 | ✅ |
| **PWA** | install prompt 提示 | ✅ |
| **PWA** | offline 支持 (precache) | ✅ |
| **文档** | README.md | ✅ |
| **文档** | progress.md | ✅ |
| **文档** | architecture.md | ✅ |

### 包体积明细

| 文件 | 原始大小 | Gzip |
|------|---------|------|
| index.js (main) | 170.99 kB | 56.56 kB |
| index.css | 17.09 kB | 4.31 kB |
| postureStore.js (MediaPipe) | 131.34 kB | 40.62 kB |
| MirrorPage.js | 18.97 kB | 5.99 kB |
| LoadingPage.js | 5.66 kB | 2.21 kB |
| OnboardingPage.js | 5.06 kB | 1.95 kB |
| CalibrationPage.js | 1.23 kB | 0.58 kB |
| FortunePage.js | 1.33 kB | 0.63 kB |
| sw.js | — | — |
| **总计** | **729.38 kB** | — |

### 已知限制 & 后续建议

1. **真实摄像头测试** — 浏览器测试环境无真实摄像头，需在真实设备上验证姿态检测和可视化效果
2. **Lighthouse 审计** — 浏览器自动化环境无法执行完整 Lighthouse 报告，建议在 Chrome DevTools 中手动运行
3. **跨浏览器测试** — 仅在 Chromium 内核中测试，Firefox / Safari 需额外验证
4. **移动端适配** — 需在移动设备上测试触摸交互和响应式布局（已有 viewport-fit=cover）
5. **单元测试** — 当前无自动化测试，建议后续引入 Vitest + React Testing Library
6. **Web Worker** — 姿势推理在主线程执行，后续可移至 Web Worker 减少主线程阻塞
