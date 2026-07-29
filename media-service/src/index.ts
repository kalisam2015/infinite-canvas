import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { createMediaApp } from "./http-server.js";
import { JOBS_DIR, loadConfig, packageVersion, resolveFfmpegPath, saveConfig, UPLOADS_DIR } from "./config.js";
import { DeepgramTranscriptionService } from "./deepgram.js";
import { VideoComposeService } from "./video-compose.js";

const config = loadConfig(true);
const port = Number(process.env.PORT) || Number(new URL(config.url).port) || 17372;
config.url = `http://127.0.0.1:${port}`;
saveConfig(config);
fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ffmpegPath = resolveFfmpegPath();
const ffmpegAvailable = spawnSync(ffmpegPath, ["-version"], { windowsHide: true }).status === 0;
const composeService = new VideoComposeService(JOBS_DIR, ffmpegPath);
const transcriptionService = new DeepgramTranscriptionService(ffmpegPath);
const app = createMediaApp({ config, saveConfig, composeService, transcriptionService, uploadDir: UPLOADS_DIR, ffmpegAvailable, version: packageVersion() });

app.listen(port, "127.0.0.1", () => {
    console.log("Infinite Canvas Local Media");
    console.log(`Local URL: ${config.url}`);
    console.log(`Connect token: ${config.token}`);
    console.log(`FFmpeg: ${ffmpegAvailable ? ffmpegPath : "not found"}`);
    if (!ffmpegAvailable) console.log("请把 ffmpeg.exe 放到本程序同目录，或设置 FFMPEG_PATH。");
});

setInterval(() => void composeService.cleanupExpired(), 30 * 60 * 1000).unref();
