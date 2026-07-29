# Infinite Canvas Local Media

Windows 本地视频合成服务，不依赖 Codex。网页将多个视频片段上传到本机，服务使用 FFmpeg 统一编码并按上传顺序拼接。

服务同时支持将本地原视频音轨发送给 Deepgram 识别。视频只在网页和本机服务之间上传，本机服务提取 WAV 音轨后直接调用 Deepgram，不要求原视频具有公网 URL。

## 开发运行

```powershell
npm install
npm run dev
```

启动后复制控制台中的 `Local URL` 和 `Connect token` 到 Infinite Canvas 的视频合并窗口。

首次在“反推视频分镜”中启用 Deepgram 校准时，同时填写 Deepgram API Key。Key 会保存到 `~/.infinite-canvas/media-service.json`，不会写入画布项目；后续反推可以留空复用。也可以在启动服务前设置 `DEEPGRAM_API_KEY` 环境变量。

## Windows 发布目录

```powershell
npm run package:win
```

输出位于 `release/windows-x64/`，必须同时分发：

- `InfiniteCanvasMedia.exe`
- `ffmpeg.exe`
- `使用说明.txt`

## 默认输出

- 1080×1920
- 30fps
- H.264 / yuv420p / 8Mbps
- AAC / 48kHz / 双声道 / 192kbps

## 统一旁白时间轴

- `POST /audio/timeline`：上传一条旁白音频，返回真实时长和 FFmpeg 静音区间。
- `POST /video/compose`：除 `clips` 外可附带一个 `narration` 文件和 `clipDurationsMs`。
- 旁白模式会移除片段原声，按目标时长裁剪或末帧补齐画面，再覆盖统一 AAC 旁白。

## 原片语音识别

- `POST /config/deepgram`：保存 Deepgram API Key、模型和语言配置。
- `POST /audio/transcribe`：上传本地视频或音频，FFmpeg 提取 16kHz 单声道 WAV 后调用 Deepgram `/v1/listen`。
- 返回统一的 `{ text, words: [{ text, startMs, endMs, confidence }] }`，供反推分镜校准原片口播时间。
