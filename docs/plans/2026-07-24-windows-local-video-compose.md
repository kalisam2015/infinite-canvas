# Windows Local Video Compose Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为没有 Codex 的 Windows 用户提供可下载运行的本地视频合成服务，并让 Infinite Canvas 将多个视频片段统一规格后拼接为一个画布视频节点。

**Architecture:** 新增独立 `media-service` Node/Express 程序，仅监听 `127.0.0.1:17372`，使用 Token 和 Origin 白名单保护 multipart 任务接口，调用原生 FFmpeg 逐段转码并 concat。Web 端在现有画布元素批量选择底栏增加“合并视频”，上传选中视频、轮询任务、下载成片 Blob 并写回 localforage。

**Tech Stack:** TypeScript、Express、Multer、FFmpeg、React、Ant Design、localforage。

---

### Task 1: Define and test the local compose core

**Files:**
- Create: `media-service/src/video-compose.ts`
- Create: `media-service/src/video-compose.test.ts`

1. 测试统一输出参数会生成 1080×1920、30fps、H.264、8Mbps、AAC 48kHz 双声道命令。
2. 测试 concat 清单保持上传顺序。
3. 测试任务状态从 queued → running → completed/failed。
4. 实现最少量命令构建和任务管理代码。

### Task 2: Add the standalone Windows HTTP service

**Files:**
- Create: `media-service/package.json`
- Create: `media-service/tsconfig.json`
- Create: `media-service/src/config.ts`
- Create: `media-service/src/index.ts`
- Create: `media-service/scripts/package-win.mjs`
- Create: `media-service/README.md`

1. 实现 `/health`、`POST /video/compose`、状态、结果和取消接口。
2. 使用 Multer 临时磁盘上传，避免 Base64 和内存聚合。
3. 仅监听 loopback，验证 Token 和 Origin，返回 PNA CORS 头。
4. Windows 发布目录生成服务 EXE，并把 `ffmpeg.exe` 放在同目录。

### Task 3: Add the browser client and compose dialog

**Files:**
- Create: `web/src/services/local-video-compose.ts`
- Create: `web/src/components/canvas/canvas-video-compose-dialog.tsx`
- Modify: `web/src/components/canvas/canvas-side-panel.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

1. 在画布元素多选底栏为两个及以上有效视频显示“合并视频”。
2. 弹窗配置本地 URL 和 Token，展示排序、固定输出规格、进度和错误。
3. 从 localforage 读取视频 Blob，以 multipart 顺序上传并轮询。
4. 下载结果后创建视频节点，并连接所有源视频节点。

### Task 4: Document and verify

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/todo.mdx` if applicable

1. 记录 Windows 本地服务、FFmpeg 要求、连接和合并流程。
2. 运行定向单元测试和 `git diff --check`；不执行项目构建或全量类型检查。

