# Seedance 渠道协议 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在渠道协议中新增 Seedance，使视频生成明确走原生任务接口并可靠传递声音开关。

**Architecture:** 扩展渠道级 `ApiCallFormat` 为 `openai | gemini | seedance`，渠道编辑器提供 Seedance 选项。视频服务按渠道协议选择 OpenAI 兼容或 Seedance 原生任务链路，不再仅根据模型名称和 Base URL 自动判断；其他能力维持现状。

**Tech Stack:** TypeScript、React、Ant Design、Axios、Node test runner。

---

### Task 1: 渠道协议配置

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/components/layout/channel-editor-drawer.tsx`
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Test: `web/tests/seedance-channel-protocol.test.ts`

1. 编写失败测试，要求 `seedance` 能被规范化、获得火山 Ark 默认地址并显示中文协议名。
2. 运行测试确认失败。
3. 扩展 `ApiCallFormat`、默认地址、渠道选项和协议标签。
4. 运行测试确认通过。

### Task 2: 视频请求路由

**Files:**
- Modify: `web/src/services/api/video.ts`
- Modify: `web/tests/seedance-channel-protocol.test.ts`

1. 编写失败测试，要求 Seedance 渠道强制使用原生任务链路并发送 `generate_audio`。
2. 运行测试确认失败。
3. 按 `apiFormat === "seedance"` 路由到现有 `createSeedanceTask`，OpenAI 渠道保留 `/v1/videos`。
4. 运行相关视频测试确认通过。

### Task 3: 文档与验证

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `CHANGELOG.md`

1. 记录 Seedance 渠道配置、声音开关和反推静音分镜的人工测试步骤。
2. 检查 TODO；无对应事项时保持不变。
3. 运行视频协议、分镜和时间轴定向测试，不执行构建或 typecheck。

### Task 4: 按渠道协议补齐版本路径

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/services/api/video.ts`
- Test: `web/tests/seedance-channel-protocol.test.ts`

1. 编写失败测试，复现 Seedance 中转裸地址被错误补成 `/v1/contents/generations/tasks`。
2. 运行测试确认实际错误路径与截图一致。
3. 让通用地址函数接收渠道协议，OpenAI 补 `/v1`，Seedance 补 `/api/v3`，并让 Seedance 任务请求显式传入协议。
4. 运行 Seedance 渠道协议测试确认通过。

### Task 5: 统一视频任务查询间隔

**Files:**
- Modify: `web/src/services/api/video.ts`
- Test: `web/tests/seedance-relay-video.test.mjs`

1. 编写失败测试，要求所有异步视频生成任务使用固定 30 秒查询间隔。
2. 运行测试确认旧实现仍按 2.5 秒、5 秒和 10 秒区分渠道。
3. 使用单一 `VIDEO_TASK_POLL_INTERVAL_MS = 30000` 常量替换渠道分支。
4. 运行视频协议相关测试确认通过。
