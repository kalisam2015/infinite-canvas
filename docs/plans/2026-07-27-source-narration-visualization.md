# 原片口播时间与旁白对齐可视化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让视频反推保存原片人声口播区间，并在视频配置和音频时间轴界面持续显示原片口播、新 TTS 对齐及失败状态。

**Architecture:** 扩展现有 `VideoStoryboardShot` 和画布 metadata，不新增节点类型。视频理解提示词负责返回原片口播时间，纯函数负责规范化和匹配状态，配置节点读取 metadata 展示摘要；Seed TTS 字词时间戳仍是新成片的唯一权威时间。

**Tech Stack:** TypeScript、React、Ant Design、现有画布节点 metadata、Node test runner。

---

### Task 1: 反推原片口播字段

**Files:**
- Modify: `web/src/services/api/video-analysis.ts`
- Modify: `web/src/lib/canvas/video-storyboard.ts`
- Test: `web/tests/video-storyboard.test.ts`

**Steps:**
1. 先增加失败测试：有效原片口播时间被保留；越界时间被限制在镜头范围；缺少口播文本时不保留伪造区间。
2. 运行定向测试并确认因字段未实现而失败。
3. 扩展反推提示词和 `VideoStoryboardShot`，规范化 `sourceNarrationStartMs` / `sourceNarrationEndMs`。
4. 在分镜文本中显示“原片口播”区间。
5. 运行定向测试确认通过。

### Task 2: 配置 metadata 与匹配状态

**Files:**
- Modify: `web/src/types/canvas.ts`
- Modify: `web/src/lib/canvas/video-storyboard.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Test: `web/tests/video-storyboard.test.ts`
- Test: `web/tests/video-narration-timeline.test.ts`

**Steps:**
1. 先增加失败测试，验证视频配置保存原片镜头/口播区间和初始 `pending` 状态。
2. 增加纯函数测试，验证 TTS 全部匹配时写入 `matched`，旁白文本缺失或整体匹配失败时写入 `failed` 和原因，且不覆盖原片字段。
3. 运行测试确认失败原因正确。
4. 扩展 metadata 字段并调整时间轴更新结果，使同组全部分镜都有持久状态。
5. 运行定向测试确认通过。

### Task 3: 视频配置与音频时间轴可视化

**Files:**
- Modify: `web/src/components/canvas/canvas-node.tsx`
- Modify: `web/src/components/canvas/canvas-config-node-panel.tsx`
- Modify: `web/src/components/canvas/canvas-node-prompt-panel.tsx`

**Steps:**
1. 在视频配置节点紧凑展示原片区间、原片口播、新旁白区间、实际剪辑时长、生成时长和状态。
2. 在音频“字词时间轴”弹窗按相同 `storyboardId` 统计 `已应用 N/M 个分镜`，列出未匹配分镜及原因。
3. 保持画布主题和扁平样式，不修改生成提示词正文。

### Task 4: 项目记录

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Inspect: `docs/content/docs/progress/todo.mdx`
- Modify: `CHANGELOG.md`

**Steps:**
1. 在待测试文档补充重新反推后应显示原片口播区间和 TTS 对齐状态。
2. 检查 todo 是否存在对应事项，需要时移入待测试文档。
3. 在 `CHANGELOG.md` 的 `Unreleased` 增加一条用户可感知的调整记录。

