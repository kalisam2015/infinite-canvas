import { rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readable, Transform } from "node:stream";
import type { RequestHandler } from "express";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";

import type { MediaServiceConfig } from "./config.js";
import type { DeepgramConfig, TranscriptionResult } from "./deepgram.js";
import type { VideoComposeJob, VideoComposeOptions } from "./video-compose.js";

const MAX_REMOTE_BYTES = 2 * 1024 * 1024 * 1024;

type ComposeService = {
    createJob: (paths: string[], options: Partial<VideoComposeOptions>, narration?: { path: string; durationsMs: number[] }) => Promise<VideoComposeJob>;
    getJob: (id: string) => VideoComposeJob | null;
    getResultPath: (id: string) => string | null;
    cancel: (id: string) => boolean;
    analyzeAudio: (filePath: string) => Promise<{ durationMs: number; silences: Array<{ startMs: number; endMs: number }> }>;
};

type CreateMediaAppOptions = {
    config: MediaServiceConfig;
    saveConfig: (config: MediaServiceConfig) => void;
    composeService: ComposeService;
    uploadDir: string;
    ffmpegAvailable: boolean;
    version?: string;
    remoteFetcher?: typeof fetch;
    transcriptionService?: { transcribe: (filePath: string, config: DeepgramConfig) => Promise<TranscriptionResult> };
};

export function createMediaApp(options: CreateMediaAppOptions) {
    const { config, composeService } = options;
    const upload = multer({ dest: options.uploadDir, limits: { files: 101, fileSize: 2 * 1024 * 1024 * 1024 } });
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "1mb" }));
    app.use((req, res, next) => {
        if (!setCors(req, res, config, options.saveConfig)) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        if (req.method === "OPTIONS") return void res.status(204).end();
        next();
    });
    app.get("/health", (_req, res) => res.json({ ok: true, service: "infinite-canvas-media", version: options.version || "0.0.0", ffmpegAvailable: options.ffmpegAvailable }));
    app.get("/config", (_req, res) => res.json({ ok: true, url: config.url, hasToken: true, deepgramConfigured: Boolean(config.deepgramApiKey), deepgramModel: config.deepgramModel, deepgramLanguage: config.deepgramLanguage }));
    app.use((req, res, next) => {
        if (validToken(req, config.token)) return next();
        res.status(401).json({ ok: false, error: "invalid token" });
    });
    app.post("/config/deepgram", route(async (req, res) => {
        const apiKey = String(req.body?.apiKey || "").trim();
        if (!apiKey) throw new RequestError("请输入 Deepgram API Key");
        config.deepgramApiKey = apiKey;
        config.deepgramModel = String(req.body?.model || "nova-3").trim() || "nova-3";
        config.deepgramLanguage = String(req.body?.language || "zh").trim() || "zh";
        options.saveConfig(config);
        res.json({ ok: true, deepgramConfigured: true, deepgramModel: config.deepgramModel, deepgramLanguage: config.deepgramLanguage });
    }));
    app.post("/video/fetch", route(async (req, res) => {
        const response = await fetchRemoteVideo(String(req.body?.url || ""), options.remoteFetcher || fetch, !options.remoteFetcher);
        if (!response.ok || !response.body) throw new Error(`远程视频下载失败（${response.status}）`);
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_BYTES) throw new RequestError("远程视频超过 2GB 限制", 413);
        res.status(200);
        res.setHeader("Content-Type", response.headers.get("content-type") || "video/mp4");
        const length = response.headers.get("content-length");
        if (length) res.setHeader("Content-Length", length);
        await new Promise<void>((resolve, reject) => {
            const stream = Readable.fromWeb(response.body as never);
            let received = 0;
            const limiter = new Transform({ transform(chunk, _encoding, callback) { received += chunk.length; callback(received > MAX_REMOTE_BYTES ? new Error("远程视频超过 2GB 限制") : null, chunk); } });
            stream.once("error", reject);
            limiter.once("error", reject);
            res.once("error", reject);
            res.once("finish", resolve);
            stream.pipe(limiter).pipe(res);
        });
    }));
    app.post("/audio/timeline", upload.single("audio"), route(async (req, res) => {
        const file = req.file;
        if (!file) return void res.status(400).json({ ok: false, error: "缺少旁白音频" });
        let analysis: { durationMs: number; silences: Array<{ startMs: number; endMs: number }> };
        try {
            analysis = await composeService.analyzeAudio(file.path);
        } finally {
            await rm(file.path, { force: true });
        }
        res.json({ ok: true, analysis });
    }));
    app.post("/audio/transcribe", upload.single("media"), route(async (req, res) => {
        const file = req.file;
        if (!file) return void res.status(400).json({ ok: false, error: "缺少需要转写的视频或音频" });
        if (!options.transcriptionService) throw new RequestError("本地媒体服务未启用语音转写", 503);
        let transcription: TranscriptionResult;
        try {
            transcription = await options.transcriptionService.transcribe(file.path, { apiKey: config.deepgramApiKey, model: config.deepgramModel, language: config.deepgramLanguage });
        } finally {
            await rm(file.path, { force: true });
        }
        res.json({ ok: true, transcription });
    }));
    app.post("/video/compose", upload.any(), route(async (req, res) => {
        const files = (req.files || []) as Express.Multer.File[];
        const clips = files.filter((file) => file.fieldname === "clips");
        const narration = files.find((file) => file.fieldname === "narration");
        try {
            const expectedClipCount = Number(req.body.expectedClipCount);
            if (Number.isInteger(expectedClipCount) && expectedClipCount > 0 && clips.length !== expectedClipCount) throw new RequestError(`期望收到 ${expectedClipCount} 个视频片段，实际收到 ${clips.length} 个`);
            const durationsMs = narration ? readClipDurations(req.body.clipDurationsMs, clips.length) : undefined;
            const job = await composeService.createJob(clips.map((file) => file.path), readComposeOptions(req.body), narration && durationsMs ? { path: narration.path, durationsMs } : undefined);
            res.json({ ok: true, job });
        } catch (error) {
            await Promise.all(files.map((file) => rm(file.path, { force: true })));
            throw error;
        }
    }));
    app.get("/video/compose/:jobId", (req, res) => {
        const job = composeService.getJob(routeParam(req.params.jobId));
        job ? res.json({ ok: true, job }) : res.status(404).json({ ok: false, error: "job not found" });
    });
    app.get("/video/compose/:jobId/result", route(async (req, res) => {
        const result = composeService.getResultPath(routeParam(req.params.jobId));
        if (!result) return void res.status(409).json({ ok: false, error: "result not ready" });
        await new Promise<void>((resolve, reject) => res.download(result, "infinite-canvas-composed.mp4", { dotfiles: "allow" }, (error) => error ? reject(error) : resolve()));
    }));
    app.post("/video/compose/:jobId/cancel", (req, res) => {
        const cancelled = composeService.cancel(routeParam(req.params.jobId));
        res.status(cancelled ? 200 : 409).json({ ok: cancelled });
    });
    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => res.status(error.status || 500).json({ ok: false, error: error.message }));
    return app;
}

function route(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
    return (req, res, next) => void handler(req, res).catch(next);
}

function setCors(req: Request, res: Response, config: MediaServiceConfig, save: (config: MediaServiceConfig) => void) {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type,x-infinite-canvas-media-token");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (!origin || req.method === "OPTIONS" || req.path === "/health" || req.path === "/config") return true;
    if (validToken(req, config.token) && !config.origins.includes(origin)) {
        config.origins.push(origin);
        save(config);
    }
    res.setHeader("Vary", "Origin");
    return config.origins.includes(origin);
}

function validToken(req: Request, token: string) {
    const header = req.headers["x-infinite-canvas-media-token"];
    return req.query.token === token || header === token || (Array.isArray(header) && header.includes(token));
}

function readComposeOptions(value: Record<string, unknown>): Partial<VideoComposeOptions> {
    return {
        width: Number(value.width),
        height: Number(value.height),
        fps: Number(value.fps),
        videoBitrate: String(value.videoBitrate || ""),
        audioBitrate: String(value.audioBitrate || ""),
    };
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

function readClipDurations(value: unknown, expectedCount: number) {
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(value || "[]"));
    } catch {
        throw new RequestError("旁白时间轴格式无效");
    }
    if (!Array.isArray(parsed) || parsed.length !== expectedCount) throw new RequestError(`旁白时间轴包含 ${Array.isArray(parsed) ? parsed.length : 0} 段，但收到 ${expectedCount} 个视频`);
    const durations = parsed.map((item) => Math.round(Number(item)));
    if (durations.some((item) => !Number.isFinite(item) || item <= 0)) throw new RequestError("旁白时间轴包含无效时长");
    return durations;
}

class RequestError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

async function fetchRemoteVideo(source: string, fetcher: typeof fetch, checkDns: boolean) {
    let current = source;
    for (let redirect = 0; redirect < 6; redirect += 1) {
        await validateRemoteVideoUrl(current, checkDns);
        const response = await fetcher(current, { redirect: "manual" });
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get("location");
        if (!location) return response;
        current = new URL(location, current).toString();
    }
    throw new RequestError("远程视频重定向次数过多");
}

async function validateRemoteVideoUrl(source: string, checkDns: boolean) {
    const url = new URL(source);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new RequestError("远程视频地址无效");
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".local") || isPrivateAddress(host)) throw new RequestError("不允许下载本机或内网地址");
    if (checkDns && !isIP(host)) {
        const addresses = await lookup(host, { all: true });
        if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new RequestError("远程视频地址解析到本机或内网");
    }
}

function isPrivateAddress(value: string) {
    const address = value.toLowerCase();
    if (isIP(address) === 4) {
        const parts = address.split(".").map(Number);
        return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
    }
    if (isIP(address) !== 6) return false;
    if (address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || /^fe[89ab]/.test(address)) return true;
    if (!address.startsWith("::ffff:")) return false;
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) return isPrivateAddress(mapped);
    const groups = mapped.split(":");
    if (groups.length !== 2) return false;
    const number = Number.parseInt(groups[0], 16) * 65536 + Number.parseInt(groups[1], 16);
    return isPrivateAddress([number >>> 24, (number >>> 16) & 255, (number >>> 8) & 255, number & 255].join("."));
}
