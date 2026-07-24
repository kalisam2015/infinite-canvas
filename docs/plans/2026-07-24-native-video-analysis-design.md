# GPT-5.6 原生视频反推设计

> 已废弃：OpenAI Responses `input_file` 的官方文件类型不包含 MP4。本项目改用豆包 Chat API 的 `video_url` Base64 视频输入；实现以 `web/src/services/api/model-plugin.ts` 中的豆包视频理解模板为准。

## 目标

让长视频反推功能通过 OpenAI Responses API 的标准文件输入，将完整 MP4 直接交给 GPT-5.6 Sol 进行多模态理解，不在浏览器内抽取关键帧或转写音频。

## 范围

首版包含：

- 使用 `POST /v1/responses` 调用视频理解模型。
- 将画布视频 Blob 转换为 Base64 Data URL。
- 使用 `input_file.file_data`、`filename` 和 `detail: "auto"` 提交完整视频。
- 同一请求通过 `input_text` 提交分镜分析要求。
- 从 Responses API 的 `output_text` 或输出内容块中提取结构化 JSON。
- 继续使用现有分镜规范化和画布节点创建流程。

首版不包含：

- 关键帧抽取。
- 音频转写或单独音频分析。
- `/v1/files` 文件上传。
- `/v1/chat/completions` 视频输入回退。
- 厂商私有 `video_url`、`input_video` 或轮询协议。

## 请求结构

```json
{
  "model": "gpt-5.6-sol",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_file",
          "filename": "source-video.mp4",
          "file_data": "data:video/mp4;base64,...",
          "detail": "auto"
        },
        {
          "type": "input_text",
          "text": "分析完整视频并返回分镜 JSON"
        }
      ]
    }
  ]
}
```

`input_file` 使用 OpenAI SDK 的标准 Responses 输入类型。视频文件直接作为文件输入提交，不使用非标准 `video_url`。

## 数据流

```text
画布视频节点
  -> 读取本地 Blob
  -> 转换为 Base64 Data URL
  -> POST /v1/responses
  -> GPT-5.6 Sol 原生多模态分析
  -> 提取 output_text
  -> 解析并规范化 shots JSON
  -> 创建分镜文本节点和视频生成配置节点
```

## 配置

- 文本模型继续使用原有调用脚本。
- 视频理解模型使用独立的“视频理解脚本”。
- 内置 GPT-5.6 Responses 模板负责完整文件输入，用户仍可编辑脚本适配兼容渠道。
- 视频理解模型选择器继续允许选择同时承担文本和视频理解的 GPT-5.6 模型。

## 错误处理

- `404`：渠道未实现 `/v1/responses`。
- `400`：渠道不支持 `input_file`、视频 MIME 类型或 GPT-5.6 文件输入。
- `413`：Base64 请求体超过渠道限制，提示改用支持文件上传或文件 URL 的渠道。
- 模型响应缺少文本输出：显示 Responses 原始响应摘要。
- 输出不是有效分镜 JSON：保留原始输出摘要并显示解析错误。

首版不进行关键帧、Chat Completions 或私有接口降级，避免用户误以为完整视频已由模型直接理解。

## 验收标准

- 视频理解请求只发送一次 `/v1/responses`。
- 请求体包含完整视频对应的 `input_file.file_data`。
- 请求体不包含 `video_url`，不调用 `/v1/files`。
- GPT-5.6 返回有效 `shots` 后，现有分镜画布流程正常创建节点。
- 渠道不支持原生文件输入时，界面显示明确的协议或文件大小错误。
