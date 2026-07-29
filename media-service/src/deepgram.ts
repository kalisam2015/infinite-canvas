import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

export type DeepgramConfig = { apiKey: string; model: string; language: string };
export type TranscriptionWord = { text: string; startMs: number; endMs: number; confidence?: number };
export type TranscriptionResult = { text: string; words: TranscriptionWord[] };

export class DeepgramTranscriptionService {
    constructor(private readonly ffmpegPath: string, private readonly fetcher: typeof fetch = fetch) {}

    async transcribe(inputPath: string, config: DeepgramConfig) {
        const audioPath = `${inputPath}.deepgram.wav`;
        try {
            await runFfmpeg(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", audioPath]);
            return await requestDeepgramTranscription(await readFile(audioPath), config, this.fetcher);
        } finally {
            await rm(audioPath, { force: true });
        }
    }
}

export async function requestDeepgramTranscription(audio: Buffer, config: DeepgramConfig, fetcher: typeof fetch = fetch) {
    if (!config.apiKey.trim()) throw new Error("本地媒体服务尚未配置 Deepgram API Key");
    const url = new URL("https://api.deepgram.com/v1/listen");
    url.searchParams.set("model", config.model || "nova-3");
    url.searchParams.set("language", config.language || "zh");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    url.searchParams.set("utterances", "true");
    const response = await fetcher(url, { method: "POST", headers: { Authorization: `Token ${config.apiKey}`, "Content-Type": "audio/wav" }, body: audio });
    const body = await response.text();
    if (!response.ok) throw new Error(readDeepgramError(body, response.status));
    try {
        return normalizeDeepgramResponse(JSON.parse(body));
    } catch (error) {
        if (error instanceof Error && error.message !== "Deepgram 没有返回有效转写结果") throw new Error(`Deepgram 响应解析失败：${error.message}`);
        throw error;
    }
}

export function normalizeDeepgramResponse(value: unknown): TranscriptionResult {
    const alternative = (((value as { results?: { channels?: Array<{ alternatives?: unknown[] }> } })?.results?.channels?.[0]?.alternatives?.[0]) || null) as { transcript?: unknown; words?: unknown[] } | null;
    if (!alternative) throw new Error("Deepgram 没有返回有效转写结果");
    const words = (alternative.words || []).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const word = item as Record<string, unknown>;
        const text = String(word.punctuated_word || word.word || "").trim();
        const startMs = Math.round(Number(word.start) * 1000);
        const endMs = Math.round(Number(word.end) * 1000);
        if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
        const confidence = Number(word.confidence);
        return [{ text, startMs, endMs, ...(Number.isFinite(confidence) ? { confidence } : {}) }];
    });
    return { text: String(alternative.transcript || "").trim(), words };
}

function runFfmpeg(command: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.once("error", reject);
        child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `FFmpeg 退出码 ${code}`)));
    });
}

function readDeepgramError(body: string, status: number) {
    try {
        const value = JSON.parse(body) as { err_msg?: string; message?: string };
        return `Deepgram 转写失败（${status}）：${value.err_msg || value.message || body}`;
    } catch {
        return `Deepgram 转写失败（${status}）：${body || "未知错误"}`;
    }
}
