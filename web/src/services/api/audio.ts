import axios from "axios";

import { audioMimeType, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { buildApiUrl, resolveAudioCallMode, resolveModelRequestConfig, resolveModelScript, type AiConfig } from "@/stores/use-config-store";
import type { AudioTimeline, AudioWordTimestamp } from "@/types/canvas";
import { runModelPlugin } from "./model-plugin";

type RequestOptions = { signal?: AbortSignal };
export type GeneratedAudio = { blob: Blob; timeline?: AudioTimeline };

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<GeneratedAudio> {
    const selectedModel = config.model || config.audioModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const model = requestConfig.model.trim();
    const format = normalizeAudioFormatValue(config.audioFormat);
    const voice = normalizeAudioVoiceValue(config.audioVoice, model);
    if (resolveAudioCallMode(config, selectedModel) === "volcengine-v3") return requestVolcengineV3Audio(requestConfig, model, prompt, voice, format, options?.signal);
    const script = resolveModelScript(config, config.model || config.audioModel);
    if (script) {
        if (!model) throw new Error("请先配置音频模型");
        if (!requestConfig.baseUrl.trim()) throw new Error("请先配置 Base URL");
        if (!requestConfig.apiKey.trim()) throw new Error("请先配置 API Key");
        try {
            const result = await runModelPlugin({
                capability: "audio",
                script,
                config: requestConfig,
                prompt,
                params: { voice, format, speed: normalizeAudioSpeedValue(config.audioSpeed), instructions: config.audioInstructions.trim() },
                signal: options?.signal,
            });
            return await normalizeAudioPluginResult(result, format);
        } catch (error) {
            throw new Error(readAxiosError(error, "音频生成失败"));
        }
    }
    assertAudioConfig(requestConfig, model);
    const instructions = config.audioInstructions.trim();

    try {
        const response = await axios.post<Blob>(
            aiApiUrl(requestConfig, "/audio/speech"),
            {
                model,
                input: prompt,
                voice,
                response_format: format,
                speed: Number(normalizeAudioSpeedValue(config.audioSpeed)),
                ...(instructions ? { instructions } : {}),
            },
            { headers: aiHeaders(requestConfig), responseType: "blob", signal: options?.signal },
        );
        await assertAudioBlob(response.data);
        return { blob: response.data.type.startsWith("audio/") ? response.data : new Blob([response.data], { type: audioMimeType(format) }) };
    } catch (error) {
        throw new Error(readAxiosError(error, "音频生成失败"));
    }
}

async function normalizeAudioPluginResult(result: unknown, format: string): Promise<GeneratedAudio> {
    if (result instanceof Blob) return { blob: result.type.startsWith("audio/") ? result : new Blob([result], { type: audioMimeType(format) }) };
    let source = "";
    let blob: Blob | undefined;
    let timeline: AudioTimeline | undefined;
    if (typeof result === "string") source = result;
    else if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.audio instanceof Blob) blob = record.audio;
        timeline = normalizeAudioTimeline(record.timeline);
        source = typeof record.b64_json === "string" ? record.b64_json : typeof record.data === "string" ? record.data : typeof record.url === "string" ? record.url : "";
    }
    if (blob) return { blob: blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) }), ...(timeline ? { timeline } : {}) };
    if (!source) throw new Error("模型调用脚本没有返回音频");
    const url = source.startsWith("data:") || /^https?:/i.test(source) ? source : `data:${audioMimeType(format)};base64,${source}`;
    const fetchedBlob = await (await fetch(url)).blob();
    return { blob: fetchedBlob.type.startsWith("audio/") ? fetchedBlob : new Blob([fetchedBlob], { type: audioMimeType(format) }), ...(timeline ? { timeline } : {}) };
}

async function requestVolcengineV3Audio(config: AiConfig, model: string, prompt: string, voice: string, format: string, signal?: AbortSignal): Promise<GeneratedAudio> {
    if (!model) throw new Error("请先配置音频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    const response = await fetch(buildVolcengineV3AudioUrl(config.baseUrl), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Api-Key": config.apiKey,
            "X-Api-Resource-Id": model,
        },
        body: JSON.stringify({
            namespace: "UnidirectionalTTS",
            req_params: {
                text: prompt,
                speaker: voice,
                audio_params: { format, sample_rate: 24000, enable_subtitle: true },
            },
        }),
        signal,
    });
    if (!response.ok) throw new Error(`Seed TTS V3 请求失败（${response.status}）：${(await response.text()).slice(0, 1000) || response.statusText}`);
    return readVolcengineV3Audio(response, prompt, format);
}

export function buildVolcengineV3AudioUrl(baseUrl: string) {
    const normalized = baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
    const apiBase = /\/api\/v3$/i.test(normalized) ? normalized : `${normalized}/api/v3`;
    return `${apiBase}/tts/unidirectional`;
}

async function readVolcengineV3Audio(response: Response, prompt: string, format: string): Promise<GeneratedAudio> {
    if (!response.body) throw new Error("Seed TTS V3 响应缺少可读取内容");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    const sentences: unknown[] = [];
    let buffer = "";
    let completed = false;
    let errorMessage = "";
    const consume = (line: string) => {
        const value = line.trim();
        if (!value) return;
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(value) as Record<string, unknown>;
        } catch {
            throw new Error("Seed TTS V3 返回了无法解析的流数据");
        }
        if (event.sentence && typeof event.sentence === "object") sentences.push(event.sentence);
        if (event.code === 20000000) {
            completed = true;
            return;
        }
        if (typeof event.code === "number" && event.code !== 0) {
            errorMessage = typeof event.message === "string" ? event.message : `Seed TTS V3 返回错误码 ${event.code}`;
            return;
        }
        if (typeof event.data === "string" && event.data) chunks.push(event.data);
    };
    for (;;) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.forEach(consume);
        if (chunk.done) break;
    }
    if (buffer) consume(buffer);
    if (errorMessage) throw new Error(`Seed TTS V3 生成失败：${errorMessage}`);
    if (!completed) throw new Error("Seed TTS V3 响应被中断，未收到完成标记");
    if (!chunks.length) throw new Error("Seed TTS V3 未返回音频数据");
    const audioParts = chunks.map((chunk) => {
        let binary: string;
        try {
            binary = atob(chunk);
        } catch {
            throw new Error("Seed TTS V3 音频数据不是有效的 Base64");
        }
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    });
    return {
        blob: new Blob(audioParts, { type: audioMimeType(format) }),
        timeline: normalizeAudioTimeline({ text: prompt, sentences }),
    };
}

export function normalizeAudioTimeline(value: unknown): AudioTimeline | undefined {
    if (!value || typeof value !== "object") return undefined;
    const timeline = value as { text?: unknown; sentences?: unknown };
    const sentences = Array.isArray(timeline.sentences) ? timeline.sentences : [];
    const words: AudioWordTimestamp[] = [];
    const texts: string[] = [];
    sentences.forEach((sentence) => {
        if (!sentence || typeof sentence !== "object") return;
        const record = sentence as Record<string, unknown>;
        if (typeof record.text === "string" && record.text.trim()) texts.push(record.text.trim());
        if (!Array.isArray(record.words)) return;
        record.words.forEach((word) => {
            if (!word || typeof word !== "object") return;
            const item = word as Record<string, unknown>;
            const text = typeof item.word === "string" ? item.word : typeof item.text === "string" ? item.text : "";
            const startTime = Number(item.startTime ?? item.start_time);
            const endTime = Number(item.endTime ?? item.end_time);
            if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return;
            const confidence = Number(item.confidence);
            words.push({
                text,
                startMs: Math.round(startTime * 1000),
                endMs: Math.round(endTime * 1000),
                ...(Number.isFinite(confidence) ? { confidence } : {}),
            });
        });
    });
    if (!words.length) return undefined;
    words.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    return { text: typeof timeline.text === "string" && timeline.text.trim() ? timeline.text : texts.join(""), words };
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
}

function assertAudioConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置音频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持音频生成，请使用 OpenAI 格式渠道");
}

async function assertAudioBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "音频生成失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return `服务返回了 HTML 错误页面（${value.slice(0, 80)}...）`;
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        const apiMsg = readApiErrorMessage(responseData);
        if (apiMsg) return apiMsg;
        const statusMsg = statusMessage(error.response?.status, fallback);
        if (statusMsg) return statusMsg;
        return error.message || fallback;
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    if (status === 404) return "接口地址不存在（404），请检查 Base URL 和模型选择";
    if (status === 502) return "网关错误（502），接口服务暂时不可用，请稍后重试";
    if (status === 503) return "服务繁忙（503），请稍后重试";
    return status ? `请求失败（HTTP ${status}），请检查 Base URL 和 API Key 是否正确` : fallback;
}
