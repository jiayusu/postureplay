# PosturePlay 架构文档

> 最后更新：2026-06-02 — 阶段十五完成

## 1. 目录结构

```
src/
├── app/                        # 应用入口层
│   ├── App.tsx                 # 根组件（BrowserRouter + InstallPrompt）
│   ├── main.tsx                # 入口（StrictMode + initServiceWorker）
│   ├── router.tsx              # 路由配置（React.lazy 代码分割）
│   └── layouts/
│       └── AppLayout.tsx       # 全屏容器布局
│
├── pages/                      # 页面组件（全部 lazy loaded）
│   ├── LoadingPage.tsx         # 模型加载 + 自动跳转
│   ├── OnboardingPage.tsx      # 三步引导流程
│   ├── CalibrationPage.tsx     # 30 秒中立位校准
│   ├── MirrorPage.tsx          # 核心镜像页（Camera + Tail + UI Chrome）
│   └── FortunePage.tsx         # 每日运势展示
│
├── components/                 # 可复用 UI 组件
│   ├── ProgressBar.tsx         # 进度条
│   ├── CameraView.tsx          # 摄像头画面（视频元素封装）
│   ├── VisualizationOverlay.tsx # Canvas 可视化叠加层
│   ├── ModeSwitcher.tsx        # 模式切换器
│   ├── EmotionHUD.tsx          # 情绪指示器 HUD
│   ├── AlertBanner.tsx         # 姿态偏离提示横幅
│   └── ErrorBoundary.tsx       # 全局 React 错误边界
│
├── hooks/                      # 自定义 Hooks
│   ├── useCameraSetup.ts       # 摄像头初始化
│   ├── usePoseDetection.ts     # MediaPipe 推理 + 推理计时
│   ├── useVisualization.ts     # Canvas 渲染绑定
│   ├── useDegradationController.ts  # 三级性能降级控制器
│   ├── usePerformanceMonitor.ts     # 向后兼容封装（@deprecated）
│   └── index.ts                # barrel export
│
├── stores/                     # Zustand 状态管理
│   ├── cameraStore.ts          # 摄像头状态
│   ├── postureStore.ts         # 体态数据 + 性能指标
│   ├── sessionStore.ts         # 会话管理
│   ├── uiStore.ts              # UI 状态 + 降级等级
│   ├── settingsStore.ts        # 应用设置
│   └── index.ts                # barrel export
│
├── services/                   # 业务服务层
│   ├── camera/
│   │   └── CameraService.ts    # 摄像头获取与控制
│   ├── pose/
│   │   └── PoseDetector.ts     # MediaPipe 姿态检测封装
│   ├── posture/
│   │   └── PostureAnalyzer.ts  # 姿态分析（脊柱角/肩高差/头前倾等）
│   ├── calibration/
│   │   └── CalibrationService.ts  # 中立位校准
│   ├── session/
│   │   └── SessionRecorder.ts  # 会话录制与持久化
│   ├── fortune/
│   │   └── FortuneService.ts   # 运势计算与文案
│   └── visualization/
│       ├── VisualizationService.ts  # 可视化引擎封装（单例）
│       ├── types.ts                 # RendererInterface
│       └── renderers/
│           └── TailRenderer.ts      # 尾巴 Canvas 渲染器
│
├── core/                       # 核心工具
│   ├── utils/
│   │   └── memoryMonitor.ts    # 内存监控（performance.memory API）
│   └── pwa/
│       ├── sw.ts               # Service Worker 注册
│       ├── InstallPrompt.tsx   # PWA 安装提示组件
│       └── index.ts            # barrel export
│
├── constants/
│   └── config.ts               # 全局配置常量（阈值、模式配置、降级参数）
│
└── types/
    └── index.ts                # 全局类型定义
```

## 2. 数据流架构

```
  CameraService ───► cameraStore
        │
        ▼
  PoseDetector ───► postureStore (keypoints + metrics + performanceMetrics)
        │
        ▼
  PostureAnalyzer ───► postureStore (PostureMetrics)
        │
        ├──► CalibrationService ───► postureStore (calibration)
        ├──► SessionRecorder ───► sessionStore
        ├──► useVisualization ───► VisualizationService ───► TailRenderer (Canvas)
        └──► useDegradationController ───► uiStore (degradationLevel)
```

## 3. 三级性能降级系统（Phase 15）

### 3.1 降级状态机

```
  正常 (none)
    │  FPS < 25 持续 5s
    ▼
  Level 1 — 质量降级
    │  Canvas 缩放 50% · 尾巴段数 8→4 · 粒子减半
    │  FPS < 18 持续 5s
    ▼
  Level 2 — 帧率降级
    │  Canvas 缩放 25% · 尾巴段数 2 · 关闭粒子 · rAF 15fps
    │  FPS < 12 持续 3s 或 内存 > 80%
    ▼
  Level 3 — 功能降级
       Canvas 缩放 12.5% · 静态尾巴 · 暂停 IndexedDB
```

### 3.2 滞回恢复策略

| 当前等级 | 恢复阈值 | 持续时间 |
|----------|----------|----------|
| Level 3 → Level 2 | FPS ≥ 21 | 15s |
| Level 2 → Level 1 | FPS ≥ 28 | 15s |
| Level 1 → none | FPS ≥ 30 | 15s |

### 3.3 模式感知

每个应用模式有独立的性能目标：

| 模式 | minRenderFPS | minPoseFPS | degradeDelay | maxDegradeLevel |
|------|-------------|-----------|-------------|-----------------|
| work | 24 | 15 | 3s | level2 |
| casual | 20 | 12 | 5s | level2 |
| meditation | 15 | 10 | 8s | level1 |

### 3.4 关键文件

| 文件 | 职责 |
|------|------|
| `hooks/useDegradationController.ts` | rAF 循环 + FPS 滑动窗口 + 滞回状态机 + 内存轮询 |
| `core/utils/memoryMonitor.ts` | `performance.memory` API 封装，Canvas 内存估算 |
| `constants/config.ts` | 17 个降级常量 + MODE_CONFIGS.performanceTarget |
| `types/index.ts` | `DegradationLevel` + 扩展 `PerformanceMetrics` |
| `stores/uiStore.ts` | `degradationLevel` 状态 + `setDegradationLevel` 动作 |
| `hooks/useVisualization.ts` | 读取 degradationLevel → Canvas 缩放映射 |
| `services/visualization/VisualizationService.ts` | `setResolutionScale(scale)` 代理 |
| `services/visualization/renderers/TailRenderer.ts` | `setQuality(scale)` + resize 缩放 |
| `hooks/usePoseDetection.ts` | 推理耗时环形缓冲 + 周期性同步 postureStore |
| `pages/MirrorPage.tsx` | 三级降级 UI 指示器（黄/橙/红） |

## 4. PWA 架构（Phase 14）

### 4.1 Service Worker 策略

- **框架**：vite-plugin-pwa + workbox
- **Precache**：28 条目（应用核心资源，构建时注入）
- **Runtime Caching**：
  - MediaPipe CDN：CacheFirst，30 天过期
  - Google Fonts：StaleWhileRevalidate，30 天
  - Images：StaleWhileRevalidate，30 天
- **更新策略**：registerType: 'prompt'（用户手动接受更新）
- **静默检查**：每 60 分钟自动检查 SW 更新

### 4.2 安装提示

- `beforeinstallprompt` 事件监听
- 3 次访问阈值（首次提示可能打扰用户）
- 7 天关闭冷却（关闭后不重复提示）
- 更新可用状态管理

## 5. 路由架构（Phase 13）

```
/           → HomeRedirect（自动跳转 /loading）
/loading    → LoadingPage（模型加载 → 判断是否首次 → /onboarding 或 /mirror）
/onboarding → OnboardingPage（三步引导 → /calibration）
/calibration → CalibrationPage（30s 校准 → /mirror）
/mirror     → MirrorPage（核心页，摄像头 + 尾巴 + UI Chrome）
/fortune    → FortunePage（运势展示）
*           → HomeRedirect
```

全部页面使用 `React.lazy` + `<Suspense>` 实现代码分割。

## 6. 错误处理架构（Phase 16）

### 6.1 错误边界

```
App.tsx
  └── ErrorBoundary（最外层）
        └── BrowserRouter
              └── AppRouter（React.lazy + Suspense）
```

ErrorBoundary 是 React Class Component，捕获所有子组件树的渲染错误：
- **降级 UI**：错误图标 + 标题 + 错误摘要 + 两个操作按钮
- **刷新页面**：`window.location.reload()`
- **清除数据**：删除所有 IndexedDB 数据库 + 清空 localStorage → 跳转 `/`
- **日志**：`console.error` 记录完整 error + errorInfo

### 6.2 摄像头重连

| 事件 | 触发条件 | 处理 |
|------|---------|------|
| `track.ended` | MediaStream 视频 track 终止 | 解绑 srcObject → `setReconnecting()` |
| `visibilitychange` | 页面切回前台 + track readyState='ended' | 同上 |
| 定时重试 | `setReconnecting()` 触发 | 2s 后重试，最多 3 次，失败 → error |

cameraStore 新增状态：
- `status: 'reconnecting'` — 正在重连
- `reconnectAttempt: number` — 当前重试次数（0-3）
- `setReconnecting()` / `setReconnected()` / `setReconnectFailed()` 动作

MirrorPage 在 `reconnecting` 状态下显示半透明覆盖层 + spinner + 提示文案。

### 6.3 浏览器兼容检查

LoadingPage 初始化时检查 `navigator.mediaDevices?.getUserMedia`：
- 不支持 → 显示「浏览器不支持」页面 + Chrome/Edge/Firefox 推荐
- 支持 → 正常加载流程

### 6.4 模型加载超时

- LoadingPage 内部 30 秒 `setTimeout`
- 加载成功（`modelStatus === 'ready'`）或失败（`'error'`）时清除计时器
- 超时 → 显示「AI 眼镜装配超时」UI（橙色警告色）+ 重试按钮

## 7. MVP 交付物（Phase 17）

### 生产构建

```
dist/
├── index.html              # 入口 HTML（含 apple-mobile-web-app meta）
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker（28 precache 条目）
├── icon-192.png / icon-512.png
└── assets/
    ├── index-CkLZ9_4V.js             170 kB (gzip 57 kB)  ← 主入口
    ├── index.css                      17 kB (gzip 4 kB)   ← 全局样式
    ├── postureStore-BanbxZVg.js       131 kB (gzip 41 kB) ← MediaPipe
    ├── MirrorPage-*.js                19 kB (lazy)
    ├── LoadingPage-*.js               6 kB (lazy)
    ├── OnboardingPage-*.js            5 kB (lazy)
    ├── CalibrationPage-*.js           1 kB (lazy)
    └── FortunePage-*.js               1 kB (lazy)
```

总构建大小 **729.38 kB**（含所有 lazy chunk）。

### 交付质量指标

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| tsc --noEmit | 0 errors | 0 errors | ✅ |
| Main JS gzip | < 200 kB | 57 kB | ✅ |
| CSS gzip | < 30 kB | 4 kB | ✅ |
| SW precache | 存在 | 28 条目 | ✅ |
| PWA installable | 满足 | manifest + SW + icons | ✅ |
| 代码分割 | lazy loaded | 5 页面 React.lazy | ✅ |
| 错误处理 | 全覆盖 | ErrorBoundary + 重连 + 兼容 + 超时 | ✅ |
| 性能降级 | 3 级 | none→l1→l2→l3 + 滞回恢复 | ✅ |
| 浏览器兼容 | Chrome 90+ | getUserMedia + WebGL 检查 | ✅ |

## 8. 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite |
| 路由 | React Router v6 |
| 状态 | Zustand |
| PWA | vite-plugin-pwa + Workbox |
| 姿态检测 | @mediapipe/pose（CDN） |
| 样式 | Tailwind CSS + CSS 自定义属性 |
