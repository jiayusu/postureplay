# 体态游乐场 PosturePlay

> 🦊 你的体态，藏着一根看不见的尾巴。

PosturePlay 是一个基于浏览器的姿态感知应用。打开摄像头，AI 会实时分析你的身体姿势，在你背后画出一条"尾巴"——它会在你紧张时僵直，在你放松时轻摆。每天结束，尾巴还会告诉你今天的运势。

**所有数据均在本地处理，不采集、不上传任何隐私信息。**

---

## ✨ 功能

- **实时姿态检测** — 基于 MediaPipe Pose Landmarker（33 个关键点）
- **体态尾巴可视化** — Canvas 实时渲染，姿态映射尾巴形态
- **三种模式切换** — 工作 / 休闲 / 冥想，每个模式的敏感度和反馈不同
- **30 秒中立位校准** — 建立你的自然站姿基准
- **每日运势** — 基于体态数据生成趣味运势
- **三级性能降级** — 自动适配低性能设备（Canvas 缩放 → 帧率限制 → 功能降级）
- **PWA 离线支持** — 安装为桌面应用，离线可用
- **摄像头中断自动重连** — track 结束时自动重试，页面切换恢复
- **错误边界** — 全局异常捕获与友好降级

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

## 🧱 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 路由 | React Router v6 |
| 状态管理 | Zustand |
| PWA | vite-plugin-pwa + Workbox |
| 姿态检测 | @mediapipe/tasks-vision 0.10 |
| 样式 | Tailwind CSS + CSS 自定义属性 |

## 📂 项目结构

```
src/
├── app/                # 入口层（App、Router、Layout）
├── pages/              # 页面（5 个，React.lazy 代码分割）
├── components/         # 可复用组件（7 个）
├── hooks/              # 自定义 Hooks（5 个）
├── stores/             # Zustand 状态（5 个 store）
├── services/           # 业务服务层
│   ├── camera/         # 摄像头管理
│   ├── pose/           # MediaPipe 姿态检测
│   ├── posture/        # 姿态分析
│   ├── calibration/    # 校准服务
│   ├── session/        # 会话录制
│   ├── fortune/        # 运势计算
│   └── visualization/   # Canvas 渲染引擎
├── core/               # 核心工具（PWA、内存监控）
├── constants/          # 全局常量配置
└── types/              # TypeScript 类型定义
```

## 🏗 构建产物

```
dist/
├── index.html
├── manifest.json
├── sw.js              ← Service Worker（28 个 precache 条目）
├── icon-192.png / icon-512.png
└── assets/
    ├── index-CkLZ9_4V.js       ~171 kB (gzip ~57 kB)
    ├── index.css               ~17 kB (gzip ~4 kB)
    ├── postureStore-*.js        ~131 kB (MediaPipe)
    └── [lazy pages].js         ~1-19 kB each
```

**总构建大小：~729 kB**（含所有 lazy chunk）

## 📖 文档

- [开发进度](docs/progress.md)
- [架构文档](docs/architecture.md)

## 🔒 隐私

- 摄像头数据仅在浏览器内存中处理
- 姿势关键点本地推理，不经服务器
- IndexedDB / localStorage 本地存储，不上传
- 不依赖任何后端 API

## 🌐 浏览器兼容

| 浏览器 | 状态 |
|--------|------|
| Chrome 90+ | ✅ 完全支持 |
| Edge 90+ | ✅ 完全支持 |
| Firefox 88+ | ✅ 支持（部分性能特性受限） |
| Safari | ⚠️ 需 WebGL 支持 |
| IE | ❌ 不支持 |

> 需要 `navigator.mediaDevices.getUserMedia` 和 WebGL 2.0 支持。

## 📋 版本

- v0.1.0 — MVP（阶段一至十七完成）
