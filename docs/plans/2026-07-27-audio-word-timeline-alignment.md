# Audio Word Timeline Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 展示 Seed TTS V3 字词时间戳，并在成片合成时优先用它确定每个分镜的旁白区间。

**Architecture:** 音频节点直接读取 `metadata.audioTimeline` 并通过轻量弹窗展示。纯函数负责把分镜 `narrationText` 按顺序匹配到字词序列并生成完整覆盖音频的镜头时间轴；成片入口优先调用该函数，任何分镜匹配失败时整次回退现有停顿分析。

**Tech Stack:** React、TypeScript、Ant Design、Tailwind、Node test、现有本地媒体合成服务。

---

### Task 1: 字词时间轴匹配器

**Files:**
- Modify: `web/src/lib/canvas/video-narration-timeline.ts`
- Test: `web/tests/video-narration-timeline.test.ts`

1. 增加测试，覆盖中文标点忽略、一个 token 包含多个字、按分镜顺序消费、首尾静音覆盖和匹配失败返回空结果。
2. 实现 `compileWordNarrationTimeline`：将字词展开成规范化字符流，保留字符到原始 word 的索引映射。
3. 依次匹配每个分镜的 `narrationText`，生成精确语音 `startMs/endMs`。
4. 使用相邻语音区间中点生成 `shotStartMs/shotEndMs`，首镜头从 0 开始，末镜头结束于音频时长。
5. 不执行测试命令；按项目规则仅静态核对测试与实现签名。

### Task 2: 音频节点时间轴查看入口

**Files:**
- Modify: `web/src/components/canvas/canvas-node.tsx`

1. 为存在有效 `audioTimeline.words` 的音频节点增加扁平“字词时间轴”按钮。
2. 点击后打开 Ant Design `Modal`，展示完整旁白、字词数量以及每条字词的开始时间、结束时间和可选置信度。
3. 使用当前画布主题 token 和透明按钮样式，不扩大节点默认尺寸，不重新请求或分析音频。

### Task 3: 成片合成优先使用原生时间轴

**Files:**
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-video-compose-dialog.tsx`

1. 从已选视频节点读取按顺序排列的 `metadata.narrationText`。
2. 为同一次反推创建的音频配置和视频配置保存共同 `storyboardId`；TTS 成功后只回写该组视频配置的 `narrationStartMs`、`narrationEndMs` 和生成秒数。
3. 音频节点存在有效字词时间轴时先调用 `compileWordNarrationTimeline`。
4. 原生时间轴不存在或任一分镜匹配失败时，才调用 `analyzeNarrationTimeline` 和现有 `compileNarrationTimeline`。
5. 两条路径统一生成 `NarrationTimeline`，继续复用现有片段裁剪、补齐、合成和时间轴文本节点逻辑。
6. 更新合成弹窗说明，明确原生时间戳优先和停顿分析回退。

### Task 4: 文档与变更记录

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Inspect/Modify if applicable: `docs/content/docs/progress/todo.mdx`
- Modify: `CHANGELOG.md`

1. 在待测试文档记录时间轴查看、确定性匹配和合成回退行为。
2. 检查 todo 中是否存在对应事项；存在则移动或改写，避免重复。
3. 在 `CHANGELOG.md` 的 `Unreleased` 增加一条用户可感知的调整记录。
4. 检查最终 diff，只保留本功能相关修改，不运行构建或测试。

### Task 5: 视频生成时长下限与应用反馈

**Files:**
- Modify: `web/src/lib/canvas/video-storyboard.ts`
- Modify: `web/src/lib/canvas/video-narration-timeline.ts`
- Modify: `web/src/services/api/video.ts`
- Modify: `web/src/services/api/video-analysis.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Test: `web/tests/video-storyboard.test.ts`
- Test: `web/tests/video-narration-timeline.test.ts`
- Test: `web/tests/seedance-relay-video.test.mjs`

1. 先把自动分镜和 TTS 时长换算测试改为最短 4 秒，并增加中转 Seedance 请求不得发送 3 秒的测试。
2. 运行定向测试，确认旧实现因返回或发送 3 秒而失败。
3. 将反推提示词和短镜头归一化下限改为 4 秒，优先合并不足 4 秒的相邻镜头。
4. 将 TTS 回写的视频生成秒数限制为 4-15 秒；实际旁白不足 4 秒时保留精确毫秒区间供最终裁剪。
5. 中转 Seedance 请求使用同一 4-15 秒规范化函数，形成接口边界兜底。
6. TTS 匹配成功后提示应用数量，匹配失败时提示检查分镜旁白文本。
7. 更新待测试文档和 `CHANGELOG.md`，运行本任务定向测试并执行 `git diff --check`。
