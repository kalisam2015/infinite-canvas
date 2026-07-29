import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type VideoComposeOptions = {
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
    audioBitrate: string;
};

export type VideoComposeJob = {
    id: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    progress: number;
    clipCount: number;
    createdAt: number;
    completedAt?: number;
    error?: string;
};

type InternalJob = VideoComposeJob & {
    directory: string;
    inputs: string[];
    output: string;
    options: VideoComposeOptions;
    narration?: string;
    durationsMs?: number[];
    process?: ChildProcess;
};

export function normalizeComposeOptions(value: Partial<VideoComposeOptions>): VideoComposeOptions {
    return {
        width: clampInt(value.width, 1080, 320, 3840),
        height: clampInt(value.height, 1920, 320, 3840),
        fps: clampInt(value.fps, 30, 12, 60),
        videoBitrate: normalizeBitrate(value.videoBitrate, "8M"),
        audioBitrate: normalizeBitrate(value.audioBitrate, "192k"),
    };
}

export function buildNormalizeArgs(input: string, output: string, options: VideoComposeOptions, hasAudio = true) {
    const filter = `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${options.fps}`;
    return [
        "-y",
        "-i",
        input,
        ...(!hasAudio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : []),
        "-map",
        "0:v:0",
        "-map",
        hasAudio ? "0:a:0" : "1:a:0",
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-b:v",
        options.videoBitrate,
        "-maxrate",
        options.videoBitrate,
        "-bufsize",
        doubleBitrate(options.videoBitrate),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        options.audioBitrate,
        "-ar",
        "48000",
        "-ac",
        "2",
        ...(!hasAudio ? ["-shortest"] : []),
        "-movflags",
        "+faststart",
        output,
    ];
}

export function concatListContent(files: string[]) {
    return files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

export function buildConcatArgs(listFile: string, output: string) {
    return ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", output];
}

export function buildTimelineNormalizeArgs(input: string, output: string, options: VideoComposeOptions, durationMs: number) {
    const duration = secondsValue(durationMs);
    const filter = `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${options.fps},tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS`;
    return ["-y", "-i", input, "-map", "0:v:0", "-vf", filter, "-an", "-c:v", "libx264", "-preset", "medium", "-b:v", options.videoBitrate, "-maxrate", options.videoBitrate, "-bufsize", doubleBitrate(options.videoBitrate), "-pix_fmt", "yuv420p", "-movflags", "+faststart", output];
}

export function buildNarrationMuxArgs(video: string, narration: string, output: string, durationMs: number, options: VideoComposeOptions) {
    const duration = secondsValue(durationMs);
    return ["-y", "-i", video, "-i", narration, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", options.audioBitrate, "-ar", "48000", "-ac", "2", "-af", `apad,atrim=duration=${duration}`, "-t", duration, "-movflags", "+faststart", output];
}

export function ffmpegOutputHasAudio(output: string) {
    return output.split(/\r?\n/).some((line) => /Stream #\S+.*\bAudio:/.test(line));
}

export function parseFfmpegDurationMs(output: string) {
    const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

export function parseFfmpegSilences(output: string) {
    const silences: Array<{ startMs: number; endMs: number }> = [];
    let startMs: number | null = null;
    output.split(/\r?\n/).forEach((line) => {
        const start = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
        if (start) startMs = Math.max(0, Math.round(Number(start[1]) * 1000));
        const end = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
        if (end && startMs !== null) {
            const endMs = Math.max(startMs, Math.round(Number(end[1]) * 1000));
            silences.push({ startMs, endMs });
            startMs = null;
        }
    });
    return silences;
}

export class VideoComposeService {
    private readonly jobs = new Map<string, InternalJob>();

    constructor(
        private readonly rootDir: string,
        private readonly ffmpegPath: string,
    ) {}

    async createJob(uploadedPaths: string[], value: Partial<VideoComposeOptions>, narration?: { path: string; durationsMs: number[] }) {
        if (narration && narration.durationsMs.length !== uploadedPaths.length) throw new Error(`旁白时间轴包含 ${narration.durationsMs.length} 段，但收到 ${uploadedPaths.length} 个视频`);
        if (uploadedPaths.length < 2) throw new Error("至少需要两个视频片段");
        const id = crypto.randomUUID();
        const directory = path.join(this.rootDir, id);
        await mkdir(directory, { recursive: true });
        const inputs: string[] = [];
        for (let index = 0; index < uploadedPaths.length; index += 1) {
            const target = path.join(directory, `input-${String(index + 1).padStart(3, "0")}.mp4`);
            await rename(uploadedPaths[index], target);
            inputs.push(target);
        }
        let narrationPath: string | undefined;
        if (narration) {
            narrationPath = path.join(directory, `narration${path.extname(narration.path) || ".audio"}`);
            await rename(narration.path, narrationPath);
        }
        const job: InternalJob = {
            id,
            status: "queued",
            progress: 0,
            clipCount: inputs.length,
            createdAt: Date.now(),
            directory,
            inputs,
            output: path.join(directory, "result.mp4"),
            options: normalizeComposeOptions(value),
            narration: narrationPath,
            durationsMs: narration?.durationsMs,
        };
        this.jobs.set(id, job);
        void this.run(job);
        return publicJob(job);
    }

    getJob(id: string) {
        const job = this.jobs.get(id);
        return job ? publicJob(job) : null;
    }

    getResultPath(id: string) {
        const job = this.jobs.get(id);
        return job?.status === "completed" && fs.existsSync(job.output) ? job.output : null;
    }

    async analyzeAudio(filePath: string) {
        const output = await this.captureFfmpeg(["-hide_banner", "-i", filePath, "-af", "silencedetect=noise=-35dB:d=0.12", "-f", "null", "-"]);
        const durationMs = parseFfmpegDurationMs(output);
        if (!durationMs) throw new Error("无法读取旁白音频时长");
        return { durationMs, silences: parseFfmpegSilences(output) };
    }

    cancel(id: string) {
        const job = this.jobs.get(id);
        if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") return false;
        job.status = "cancelled";
        job.completedAt = Date.now();
        job.process?.kill();
        return true;
    }

    async cleanupExpired(maxAgeMs = 6 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAgeMs;
        const expired = [...this.jobs.values()].filter((job) => (job.completedAt || job.createdAt) < cutoff && job.status !== "running" && job.status !== "queued");
        await Promise.all(expired.map(async (job) => {
            this.jobs.delete(job.id);
            await rm(job.directory, { recursive: true, force: true });
        }));
        const activeDirectories = new Set([...this.jobs.values()].map((job) => path.resolve(job.directory)));
        const entries = await readdir(this.rootDir, { withFileTypes: true }).catch(() => []);
        await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
            const directory = path.join(this.rootDir, entry.name);
            if (activeDirectories.has(path.resolve(directory))) return;
            const info = await stat(directory).catch(() => null);
            if (info && info.mtimeMs < cutoff) await rm(directory, { recursive: true, force: true });
        }));
    }

    private async run(job: InternalJob) {
        job.status = "running";
        try {
            const normalized: string[] = [];
            for (let index = 0; index < job.inputs.length; index += 1) {
                if (job.status === "cancelled") return;
                const output = path.join(job.directory, `clip-${String(index + 1).padStart(3, "0")}.mp4`);
                if (job.narration && job.durationsMs) {
                    await this.runFfmpeg(job, buildTimelineNormalizeArgs(job.inputs[index], output, job.options, job.durationsMs[index]));
                } else {
                    const hasAudio = await this.probeHasAudio(job.inputs[index]);
                    if (job.status === "cancelled") return;
                    await this.runFfmpeg(job, buildNormalizeArgs(job.inputs[index], output, job.options, hasAudio));
                }
                normalized.push(output);
                job.progress = Math.round(((index + 1) / job.inputs.length) * (job.narration ? 80 : 90));
            }
            const listFile = path.join(job.directory, "concat.txt");
            await writeFile(listFile, concatListContent(normalized), "utf8");
            const joined = job.narration ? path.join(job.directory, "joined.mp4") : job.output;
            job.progress = job.narration ? 85 : 95;
            await this.runFfmpeg(job, buildConcatArgs(listFile, joined));
            if (job.narration && job.durationsMs) {
                job.progress = 92;
                await this.runFfmpeg(job, buildNarrationMuxArgs(joined, job.narration, job.output, job.durationsMs.reduce((sum, value) => sum + value, 0), job.options));
            }
            if (job.status === "cancelled") return;
            job.status = "completed";
            job.progress = 100;
            job.completedAt = Date.now();
        } catch (error) {
            if (job.status === "cancelled") return;
            job.status = "failed";
            job.completedAt = Date.now();
            job.error = error instanceof Error ? error.message : "视频合成失败";
        }
    }

    private runFfmpeg(job: InternalJob, args: string[]) {
        return new Promise<void>((resolve, reject) => {
            const child = spawn(this.ffmpegPath, args, { windowsHide: true });
            job.process = child;
            let stderr = "";
            child.stderr?.on("data", (chunk) => {
                stderr = `${stderr}${String(chunk)}`.slice(-4000);
            });
            child.once("error", reject);
            child.once("exit", (code) => {
                job.process = undefined;
                if (job.status === "cancelled") return resolve();
                code === 0 ? resolve() : reject(new Error(stderr.trim() || `FFmpeg 退出码 ${code}`));
            });
        });
    }

    private probeHasAudio(input: string) {
        return new Promise<boolean>((resolve, reject) => {
            const child = spawn(this.ffmpegPath, ["-hide_banner", "-i", input], { windowsHide: true });
            let stderr = "";
            child.stderr?.on("data", (chunk) => {
                stderr = `${stderr}${String(chunk)}`.slice(-12000);
            });
            child.once("error", reject);
            child.once("exit", () => resolve(ffmpegOutputHasAudio(stderr)));
        });
    }

    private captureFfmpeg(args: string[]) {
        return new Promise<string>((resolve, reject) => {
            const child = spawn(this.ffmpegPath, args, { windowsHide: true });
            let stderr = "";
            child.stderr?.on("data", (chunk) => {
                stderr = `${stderr}${String(chunk)}`.slice(-20000);
            });
            child.once("error", reject);
            child.once("exit", (code) => code === 0 ? resolve(stderr) : reject(new Error(stderr.trim() || `FFmpeg 退出码 ${code}`)));
        });
    }
}

function publicJob(job: InternalJob): VideoComposeJob {
    return { id: job.id, status: job.status, progress: job.progress, clipCount: job.clipCount, createdAt: job.createdAt, completedAt: job.completedAt, error: job.error };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeBitrate(value: unknown, fallback: string) {
    const text = String(value || "").trim();
    return /^\d+(?:\.\d+)?[kKmM]$/.test(text) ? text : fallback;
}

function doubleBitrate(value: string) {
    const match = value.match(/^(\d+(?:\.\d+)?)([kKmM])$/);
    return match ? `${Number(match[1]) * 2}${match[2]}` : value;
}

function secondsValue(durationMs: number) {
    return String(Math.max(0.001, Math.round(durationMs) / 1000));
}
