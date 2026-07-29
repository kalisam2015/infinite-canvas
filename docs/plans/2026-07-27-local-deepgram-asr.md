# 本地 Deepgram 原片语音校准 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 通过现有 Windows 本地媒体服务接收原视频、调用 Deepgram 获取字词时间戳，并用真实口播边界校准反推分镜。

**Architecture:** `media-service` 新增受 Token 保护的 Deepgram 配置和 `/audio/transcribe` multipart 接口，使用 FFmpeg 提取音轨后调用 Deepgram `/v1/listen`。Web 端在视频反推时并行执行视频理解和本地 ASR，将标准化字词按镜头时间区间映射；ASR 失败时保留模型估算并提示，不阻断分镜创建。

**Tech Stack:** TypeScript、Express、Multer、FFmpeg、Deepgram REST API、React、Node test runner。

---

### Task 1: Deepgram 客户端与本地接口

**Files:**
- Create: `media-service/src/deepgram.ts`
- Modify: `media-service/src/config.ts`
- Modify: `media-service/src/http-server.ts`
- Modify: `media-service/src/index.ts`
- Test: `media-service/src/deepgram.test.ts`
- Test: `media-service/src/http-server.test.ts`

1. 为 Deepgram 响应标准化、鉴权请求和错误返回编写失败测试。
2. 运行媒体服务测试，确认因功能缺失失败。
3. 实现 FFmpeg 音轨提取、Deepgram 原生请求和 `{ text, words[] }` 标准化。
4. 新增本地配置写入和 `/audio/transcribe` multipart 路由，确保临时文件清理。
5. 运行媒体服务测试，确认通过。

### Task 2: Web 端转写调用与分镜校准

**Files:**
- Modify: `web/src/services/local-video-compose.ts`
- Modify: `web/src/lib/canvas/video-storyboard.ts`
- Modify: `web/src/types/canvas.ts`
- Test: `web/tests/local-video-compose.test.ts`
- Test: `web/tests/video-storyboard.test.ts`

1. 为本地转写请求、字词区间映射和时间来源标记编写失败测试。
2. 运行定向测试，确认因功能缺失失败。
3. 实现 multipart 转写客户端和按镜头重叠区间校准函数。
4. 将 `sourceNarrationTimingSource` 写入分镜文本和视频配置 metadata。
5. 运行定向测试，确认通过。

### Task 3: 反推流程与配置界面

**Files:**
- Modify: `web/src/components/canvas/canvas-video-storyboard-dialog.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

1. 在反推弹窗复用本地服务 URL/Token，并提供 Deepgram API Key 配置和启用开关。
2. 视频理解与 Deepgram 转写并行执行；成功时校准，失败时显示非阻断警告。
3. 保存本地服务连接配置，不把 Deepgram API Key写入画布项目。

### Task 4: 文档和验证

**Files:**
- Modify: `media-service/README.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `CHANGELOG.md`

1. 记录 Deepgram Key 配置、本地转写调用和失败回退测试步骤。
2. 检查 TODO 是否需要移动；无对应事项时保持不变。
3. 在 `CHANGELOG.md` 的 `Unreleased` 增加一条用户可感知变更。
4. 运行媒体服务测试和相关 Web 定向测试，不执行构建或 typecheck。
