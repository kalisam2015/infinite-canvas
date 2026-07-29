# Seed TTS 字词时间戳实施计划

**目标：** 生成豆包 Seed TTS 2.0 音频时请求字词时间戳，并将标准化时间轴保存到对应音频节点。

**架构：** 豆包原生调用脚本在 `audio_params` 中启用字幕服务，同时解析流式响应里的 `sentence.words`。音频 API 将结果统一为音频 Blob 加可选时间轴，画布生成流程上传音频后把时间轴写入节点 metadata；其他不支持时间戳的 TTS 接口继续只返回音频。

**技术栈：** TypeScript、React、浏览器 Fetch 流、现有模型调用脚本与画布 metadata。

---

### 任务一：定义时间轴数据和结果规范化

**文件：**

- 修改：`web/src/services/api/audio.ts`
- 修改：`web/src/types/canvas.ts`
- 测试：`web/tests/audio-timestamp.test.ts`

1. 先增加测试，覆盖秒转毫秒、无效字词过滤和无时间戳结果回退。
2. 定义字词时间戳、音频时间轴和音频生成结果类型。
3. 让音频结果解析同时接受旧 Blob 和包含音频、时间轴的结构化结果。

### 任务二：解析 Seed TTS 流式字幕

**文件：**

- 修改：`web/src/services/api/model-plugin.ts`
- 测试：`web/tests/audio-timestamp.test.ts`

1. 在豆包原生请求中加入 `enable_subtitle: true`。
2. 收集响应中的 `sentence.text`、`sentence.words` 和置信度。
3. 返回 `{ audio, timeline }`，保留原有错误处理和音频拼接行为。

### 任务三：保存到音频节点

**文件：**

- 修改：`web/src/pages/canvas/project.tsx`
- 修改：`web/src/lib/canvas/canvas-node-factory.ts`

1. 上传音频时使用结构化生成结果中的 Blob。
2. 将时间轴写入 `audioTimeline` metadata。
3. 每次重新生成都覆盖该字段；没有时间戳时清空旧值。

### 任务四：同步项目文档

**文件：**

- 修改：`docs/content/docs/progress/pending-test.mdx`
- 修改：`docs/content/docs/progress/todo.mdx`（仅当已有对应待办）
- 修改：`CHANGELOG.md`

1. 记录可测试行为：Seed TTS 音频节点保存字词时间戳。
2. 检查并移动对应待办，避免重复记录。
3. 在 `Unreleased` 中增加一条用户可感知的新增说明。

按照项目规则，本任务不执行测试、类型检查或构建，由用户自行验证。
