import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ffmpegStatic from "ffmpeg-static";

export const DEFAULT_PORT = 17372;
export const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "media-service.json");
export const JOBS_DIR = path.join(CONFIG_DIR, "media-jobs");
export const UPLOADS_DIR = path.join(CONFIG_DIR, "media-uploads");

export type MediaServiceConfig = { url: string; token: string; origins: string[]; deepgramApiKey: string; deepgramModel: string; deepgramLanguage: string };

export function loadConfig(create = false): MediaServiceConfig {
    try {
        const value = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<MediaServiceConfig>;
        return {
            url: value.url || `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`,
            token: value.token || crypto.randomBytes(18).toString("hex"),
            origins: Array.isArray(value.origins) ? value.origins : [],
            deepgramApiKey: process.env.DEEPGRAM_API_KEY?.trim() || value.deepgramApiKey || "",
            deepgramModel: value.deepgramModel || "nova-3",
            deepgramLanguage: value.deepgramLanguage || "zh",
        };
    } catch {
        const config = { url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex"), origins: [], deepgramApiKey: process.env.DEEPGRAM_API_KEY?.trim() || "", deepgramModel: "nova-3", deepgramLanguage: "zh" };
        if (create) saveConfig(config);
        return config;
    }
}

export function saveConfig(config: MediaServiceConfig) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function resolveFfmpegPath() {
    const configured = process.env.FFMPEG_PATH?.trim();
    if (configured) return configured;
    const besideExe = path.join(path.dirname(process.execPath), "ffmpeg.exe");
    if (process.platform === "win32" && fs.existsSync(besideExe)) return besideExe;
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
    return "ffmpeg";
}

export function packageVersion() {
    try {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        return (JSON.parse(fs.readFileSync(path.resolve(currentDir, "../package.json"), "utf8")) as { version?: string }).version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
