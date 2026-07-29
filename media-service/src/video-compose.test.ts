import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";

import { buildConcatArgs, buildNarrationMuxArgs, buildNormalizeArgs, buildTimelineNormalizeArgs, concatListContent, ffmpegOutputHasAudio, normalizeComposeOptions, parseFfmpegDurationMs, parseFfmpegSilences, VideoComposeService } from "./video-compose.js";

test("normalizes clips to the Windows first-release output profile", () => {
    const options = normalizeComposeOptions({});
    const args = buildNormalizeArgs("input.mp4", "output.mp4", options);

    assert.deepEqual(options, { width: 1080, height: 1920, fps: 30, videoBitrate: "8M", audioBitrate: "192k" });
    assert.ok(args.includes("libx264"));
    assert.ok(args.includes("yuv420p"));
    assert.ok(args.includes("8M"));
    assert.ok(args.includes("aac"));
    assert.ok(args.includes("48000"));
    assert.ok(args.includes("2"));
    assert.match(args.join(" "), /scale=1080:1920:force_original_aspect_ratio=decrease/);
    assert.match(args.join(" "), /fps=30/);
});

test("keeps uploaded clip order in the concat list", () => {
    const content = concatListContent(["C:/tmp/clip-02.mp4", "C:/tmp/clip-01.mp4"]);
    assert.equal(content, "file 'C:/tmp/clip-02.mp4'\nfile 'C:/tmp/clip-01.mp4'\n");
    assert.deepEqual(buildConcatArgs("list.txt", "final.mp4"), ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "final.mp4"]);
});

test("adds a finite silent audio track when the source has no audio", () => {
    const args = buildNormalizeArgs("silent.mp4", "output.mp4", normalizeComposeOptions({}), false);
    assert.deepEqual(args.slice(0, 8), ["-y", "-i", "silent.mp4", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map"]);
    assert.ok(args.includes("1:a:0"));
    assert.ok(args.includes("-shortest"));
});

test("detects audio streams with ffmpeg stream ids and language metadata", () => {
    const output = "Stream #0:1[0x2](und): Audio: aac (LC), 32000 Hz, stereo, fltp, 64 kb/s";
    assert.equal(ffmpegOutputHasAudio(output), true);
    assert.equal(ffmpegOutputHasAudio("Stream #0:0[0x1]: Video: h264"), false);
});

test("parses narration duration and silence ranges from ffmpeg output", () => {
    const output = [
        "Duration: 00:00:12.345, start: 0.000000, bitrate: 128 kb/s",
        "[silencedetect] silence_start: 3.8",
        "[silencedetect] silence_end: 4.2 | silence_duration: 0.4",
        "[silencedetect] silence_start: 7.75",
        "[silencedetect] silence_end: 8.1 | silence_duration: 0.35",
    ].join("\n");
    assert.equal(parseFfmpegDurationMs(output), 12_345);
    assert.deepEqual(parseFfmpegSilences(output), [{ startMs: 3800, endMs: 4200 }, { startMs: 7750, endMs: 8100 }]);
});

test("retimes narrated clips as video-only streams", () => {
    const args = buildTimelineNormalizeArgs("input.mp4", "output.mp4", normalizeComposeOptions({}), 4200);
    assert.ok(args.includes("-an"));
    assert.match(args.join(" "), /tpad=stop_mode=clone:stop_duration=4\.2/);
    assert.match(args.join(" "), /trim=duration=4\.2/);
    assert.match(args.join(" "), /setpts=PTS-STARTPTS/);
});

test("muxes one narration track over the joined visual timeline", () => {
    const args = buildNarrationMuxArgs("joined.mp4", "narration.mp3", "result.mp4", 12000, normalizeComposeOptions({}));
    assert.deepEqual(args.slice(0, 9), ["-y", "-i", "joined.mp4", "-i", "narration.mp3", "-map", "0:v:0", "-map", "1:a:0"]);
    assert.ok(args.includes("copy"));
    assert.ok(args.includes("aac"));
    assert.match(args.join(" "), /atrim=duration=12/);
});

test("removes expired job directories left by a previous process", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-media-"));
    const orphan = path.join(root, "orphan-job");
    await mkdir(orphan);
    const old = new Date(Date.now() - 10_000);
    await utimes(orphan, old, old);
    const service = new VideoComposeService(root, "ffmpeg");

    await service.cleanupExpired(1_000);

    await assert.rejects(stat(orphan));
});

test("composes three clips with one audible narration track", { timeout: 30_000 }, async () => {
    assert.ok(ffmpegPath);
    const root = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-media-e2e-"));
    const uploads = path.join(root, "uploads");
    const jobs = path.join(root, "jobs");
    await Promise.all([mkdir(uploads), mkdir(jobs)]);
    const clips = ["red", "green", "blue"].map((color, index) => path.join(uploads, `clip-${index + 1}-${color}.mp4`));
    const narration = path.join(uploads, "narration.wav");

    try {
        await Promise.all(clips.map((file, index) => runFfmpeg([
            "-y", "-f", "lavfi", "-i", `color=c=${["red", "green", "blue"][index]}:s=160x90:r=12:d=0.2`,
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", file,
        ])));
        await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=1.5", "-ac", "2", narration]);

        const service = new VideoComposeService(jobs, ffmpegPath);
        const created = await service.createJob(clips, { width: 160, height: 90, fps: 12, videoBitrate: "300k", audioBitrate: "96k" }, {
            path: narration,
            durationsMs: [400, 500, 600],
        });
        const completed = await waitForJob(service, created.id);

        assert.equal(completed.status, "completed", completed.error);
        assert.equal(completed.clipCount, 3);
        const result = service.getResultPath(created.id);
        assert.ok(result);
        const probe = await runFfmpeg(["-hide_banner", "-i", result, "-af", "volumedetect", "-f", "null", "-"]);
        assert.match(probe, /Duration:\s*00:00:01\.5/);
        assert.match(probe, /Video:\s*h264/);
        assert.match(probe, /Audio:\s*aac[^\n]*48000 Hz[^\n]*stereo/);
        const volume = probe.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
        assert.ok(volume && Number(volume[1]) > -60, `expected audible narration, got ${volume?.[1] ?? "no volume"}`);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function runFfmpeg(args: string[]) {
    return new Promise<string>((resolve, reject) => {
        assert.ok(ffmpegPath);
        const child = spawn(ffmpegPath, args, { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.once("error", reject);
        child.once("exit", (code) => code === 0 ? resolve(stderr) : reject(new Error(stderr || `FFmpeg exited with ${code}`)));
    });
}

async function waitForJob(service: VideoComposeService, id: string) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const job = service.getJob(id);
        if (job?.status === "completed" || job?.status === "failed" || job?.status === "cancelled") return job;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for video composition");
}
