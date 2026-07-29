export type LocalMediaServiceConfig = { url: string; token: string };
export type LocalVideoComposeClip = { name: string; blob: Blob };
export type LocalTranscriptionWord = { text: string; startMs: number; endMs: number; confidence?: number };
export type LocalTranscription = { text: string; words: LocalTranscriptionWord[] };
export type LocalNarrationCompose = { name: string; blob: Blob; clipDurationsMs: number[] };
export type LocalVideoComposeOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    pollIntervalMs?: number;
    fetcher?: typeof fetch;
    narration?: LocalNarrationCompose;
};

const URL_KEY = "infinite-canvas-media-url";
const TOKEN_KEY = "infinite-canvas-media-token";

export function loadLocalMediaServiceConfig(): LocalMediaServiceConfig {
    return {
        url: typeof window === "undefined" ? "http://127.0.0.1:17372" : localStorage.getItem(URL_KEY) || "http://127.0.0.1:17372",
        token: typeof window === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) || "",
    };
}

export function saveLocalMediaServiceConfig(config: LocalMediaServiceConfig) {
    if (typeof window === "undefined") return;
    localStorage.setItem(URL_KEY, normalizeUrl(config.url));
    localStorage.setItem(TOKEN_KEY, config.token.trim());
}

export function sortVideoComposeNodes<T extends { position: { x: number; y: number }; metadata?: { storyboardShotIndex?: number } }>(nodes: T[]) {
    const hasStoryboardOrder = nodes.length > 0 && nodes.every((node) => Number.isInteger(node.metadata?.storyboardShotIndex));
    return [...nodes].sort((a, b) => hasStoryboardOrder ? (a.metadata!.storyboardShotIndex! - b.metadata!.storyboardShotIndex!) : a.position.y - b.position.y || a.position.x - b.position.x);
}

export function isVideoComposeRunActive(signal: AbortSignal, startedProjectId: string, activeProjectId: string) {
    return !signal.aborted && startedProjectId === activeProjectId;
}

export async function fetchVideoThroughLocalService(config: LocalMediaServiceConfig, sourceUrl: string, options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}) {
    const response = await (options.fetcher || fetch)(`${normalizeUrl(config.url)}/video/fetch`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-infinite-canvas-media-token": config.token.trim() },
        body: JSON.stringify({ url: sourceUrl }),
        signal: options.signal,
    });
    if (!response.ok) throw new Error(await readError(response, "远程视频读取失败"));
    return await response.blob();
}

export async function analyzeNarrationTimeline(config: LocalMediaServiceConfig, audio: LocalVideoComposeClip, options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}) {
    const body = new FormData();
    body.append("audio", audio.blob, audio.name);
    const response = await (options.fetcher || fetch)(`${normalizeUrl(config.url)}/audio/timeline`, {
        method: "POST",
        headers: { "x-infinite-canvas-media-token": config.token.trim() },
        body,
        signal: options.signal,
    });
    const data = await readJson<{ analysis?: { durationMs?: number; silences?: Array<{ startMs: number; endMs: number }> } }>(response, "旁白时间轴分析失败");
    if (!data.analysis?.durationMs) throw new Error("本地媒体服务没有返回旁白时长");
    return { durationMs: data.analysis.durationMs, silences: data.analysis.silences || [] };
}

export async function configureLocalDeepgram(config: LocalMediaServiceConfig, deepgram: { apiKey: string; model: string; language: string }, fetcher: typeof fetch = fetch) {
    const response = await fetcher(`${normalizeUrl(config.url)}/config/deepgram`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-infinite-canvas-media-token": config.token.trim() },
        body: JSON.stringify(deepgram),
    });
    return await readJson<{ deepgramConfigured: boolean; deepgramModel?: string; deepgramLanguage?: string }>(response, "Deepgram 配置失败");
}

export async function transcribeMediaLocally(config: LocalMediaServiceConfig, media: LocalVideoComposeClip, options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}) {
    const body = new FormData();
    body.append("media", media.blob, media.name);
    const response = await (options.fetcher || fetch)(`${normalizeUrl(config.url)}/audio/transcribe`, {
        method: "POST",
        headers: { "x-infinite-canvas-media-token": config.token.trim() },
        body,
        signal: options.signal,
    });
    const data = await readJson<{ transcription?: LocalTranscription }>(response, "原片语音识别失败");
    if (!data.transcription) throw new Error("本地媒体服务没有返回转写结果");
    return data.transcription;
}

export async function checkLocalMediaService(config: LocalMediaServiceConfig, fetcher: typeof fetch = fetch) {
    const response = await fetcher(`${normalizeUrl(config.url)}/health`);
    if (!response.ok) throw new Error("本地媒体服务不可用");
    return await response.json() as { ok: boolean; ffmpegAvailable: boolean; version?: string };
}

export async function composeVideosLocally(config: LocalMediaServiceConfig, clips: LocalVideoComposeClip[], options: LocalVideoComposeOptions = {}) {
    if (clips.length < 2) throw new Error("至少选择两个视频");
    const fetcher = options.fetcher || fetch;
    const baseUrl = normalizeUrl(config.url);
    const headers = { "x-infinite-canvas-media-token": config.token.trim() };
    const body = new FormData();
    clips.forEach((clip) => body.append("clips", clip.blob, clip.name));
    body.set("width", "1080");
    body.set("height", "1920");
    body.set("fps", "30");
    body.set("videoBitrate", "8M");
    body.set("audioBitrate", "192k");
    body.set("expectedClipCount", String(clips.length));
    if (options.narration) {
        if (options.narration.clipDurationsMs.length !== clips.length) throw new Error(`旁白时间轴包含 ${options.narration.clipDurationsMs.length} 段，但选择了 ${clips.length} 个视频`);
        body.append("narration", options.narration.blob, options.narration.name);
        body.set("clipDurationsMs", JSON.stringify(options.narration.clipDurationsMs.map((value) => Math.round(value))));
    }
    let jobId = "";
    try {
        const created = await fetcher(`${baseUrl}/video/compose`, { method: "POST", headers, body, signal: options.signal });
        const createdData = await readJson<{ job?: { id?: string; clipCount?: number } }>(created, "本地视频合成任务创建失败");
        jobId = createdData.job?.id || "";
        if (!jobId) throw new Error("本地媒体服务没有返回任务 ID");
        if (createdData.job?.clipCount !== clips.length) throw new Error(`本地媒体服务收到 ${createdData.job?.clipCount || 0} 个片段，预期 ${clips.length} 个`);
        for (;;) {
            await wait(options.pollIntervalMs ?? 2000, options.signal);
            const response = await fetcher(`${baseUrl}/video/compose/${encodeURIComponent(jobId)}`, { headers, signal: options.signal });
            const data = await readJson<{ job?: { status?: string; progress?: number; error?: string } }>(response, "本地视频合成状态查询失败");
            const job = data.job;
            options.onProgress?.(Number(job?.progress) || 0);
            if (job?.status === "completed") break;
            if (job?.status === "failed" || job?.status === "cancelled") throw new Error(job.error || (job.status === "cancelled" ? "视频合成已取消" : "视频合成失败"));
        }
        const result = await fetcher(`${baseUrl}/video/compose/${encodeURIComponent(jobId)}/result`, { headers, signal: options.signal });
        if (!result.ok) throw new Error(await readError(result, "合成视频下载失败"));
        return await result.blob();
    } catch (error) {
        if (jobId && options.signal?.aborted) void fetcher(`${baseUrl}/video/compose/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers }).catch(() => undefined);
        throw error;
    }
}

async function readJson<T>(response: Response, fallback: string) {
    if (!response.ok) throw new Error(await readError(response, fallback));
    return await response.json() as T;
}

async function readError(response: Response, fallback: string) {
    try {
        const data = await response.json() as { error?: string };
        return data.error || `${fallback}（${response.status}）`;
    } catch {
        return `${fallback}（${response.status}）`;
    }
}

function normalizeUrl(value: string) {
    return value.trim().replace(/\/+$/, "") || "http://127.0.0.1:17372";
}

function wait(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
        const timer = globalThis.setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            globalThis.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}
