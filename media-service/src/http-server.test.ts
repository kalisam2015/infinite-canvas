import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createMediaApp } from "./http-server.js";

test("protects compose routes and preserves multipart clip order", async (t) => {
    const uploadDir = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-media-test-"));
    const hiddenDir = path.join(uploadDir, ".infinite-canvas");
    await mkdir(hiddenDir);
    const resultPath = path.join(hiddenDir, "result.mp4");
    await writeFile(resultPath, "video-result");
    const submitted: Array<{ paths: string[]; narration?: { path: string; durationsMs: number[] } }> = [];
    let analyzedAudioPath = "";
    const config = { url: "http://127.0.0.1:17372", token: "test-token", origins: [] as string[], deepgramApiKey: "", deepgramModel: "nova-3", deepgramLanguage: "zh" };
    let transcribedPath = "";
    const composeService = {
        async createJob(paths: string[], _options: unknown, narration?: { path: string; durationsMs: number[] }) {
            submitted.push({ paths, narration });
            return { id: "job-1", status: "queued", progress: 0, clipCount: paths.length, createdAt: 1 };
        },
        getJob(id: string) {
            return id === "job-1" ? { id, status: "running", progress: 40, clipCount: 2, createdAt: 1 } : null;
        },
        getResultPath(id: string) {
            return id === "job-1" ? resultPath : null;
        },
        cancel() {
            return true;
        },
        async analyzeAudio(filePath: string) {
            analyzedAudioPath = filePath;
            return { durationMs: 6000, silences: [{ startMs: 2800, endMs: 3200 }] };
        },
    };
    const app = createMediaApp({
        config,
        saveConfig: () => undefined,
        composeService,
        uploadDir,
        ffmpegAvailable: true,
        transcriptionService: {
            async transcribe(filePath: string) {
                transcribedPath = filePath;
                return { text: "开场口播", words: [{ text: "开场", startMs: 0, endMs: 300, confidence: 0.99 }] };
            },
        },
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(uploadDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not start");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ffmpegAvailable: boolean }).ffmpegAvailable, true);

    const audioForm = new FormData();
    audioForm.append("audio", new Blob(["narration"], { type: "audio/mpeg" }), "narration.mp3");
    const audioTimeline = await fetch(`${baseUrl}/audio/timeline`, { method: "POST", headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" }, body: audioForm });
    assert.equal(audioTimeline.status, 200);
    assert.deepEqual((await audioTimeline.json() as { analysis: unknown }).analysis, { durationMs: 6000, silences: [{ startMs: 2800, endMs: 3200 }] });
    assert.ok(analyzedAudioPath);
    await assert.rejects(stat(analyzedAudioPath));

    const configured = await fetch(`${baseUrl}/config/deepgram`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" },
        body: JSON.stringify({ apiKey: "deepgram-key", model: "nova-3", language: "zh" }),
    });
    assert.equal(configured.status, 200);
    assert.equal(config.deepgramApiKey, "deepgram-key");

    const transcribeForm = new FormData();
    transcribeForm.append("media", new Blob(["source-video"], { type: "video/mp4" }), "source.mp4");
    const transcription = await fetch(`${baseUrl}/audio/transcribe`, { method: "POST", headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" }, body: transcribeForm });
    assert.equal(transcription.status, 200);
    assert.deepEqual((await transcription.json() as { transcription: unknown }).transcription, { text: "开场口播", words: [{ text: "开场", startMs: 0, endMs: 300, confidence: 0.99 }] });
    assert.ok(transcribedPath);
    await assert.rejects(stat(transcribedPath));

    const unauthorized = await fetch(`${baseUrl}/video/compose`, { method: "POST" });
    assert.equal(unauthorized.status, 401);

    const form = new FormData();
    form.append("clips", new Blob(["first"], { type: "video/mp4" }), "01.mp4");
    form.append("clips", new Blob(["second"], { type: "video/mp4" }), "02.mp4");
    form.set("expectedClipCount", "2");
    const created = await fetch(`${baseUrl}/video/compose`, {
        method: "POST",
        headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" },
        body: form,
    });
    assert.equal(created.status, 200);
    assert.equal((await created.json() as { job: { id: string } }).job.id, "job-1");
    assert.equal(submitted[0].paths.length, 2);
    assert.deepEqual(config.origins, ["http://localhost:3000"]);

    const incomplete = new FormData();
    incomplete.append("clips", new Blob(["first"], { type: "video/mp4" }), "01.mp4");
    incomplete.append("clips", new Blob(["second"], { type: "video/mp4" }), "02.mp4");
    incomplete.set("expectedClipCount", "3");
    const incompleteResponse = await fetch(`${baseUrl}/video/compose`, {
        method: "POST",
        headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" },
        body: incomplete,
    });
    assert.equal(incompleteResponse.status, 400);
    assert.match(await incompleteResponse.text(), /3.*2/);

    const narrated = new FormData();
    narrated.append("clips", new Blob(["first"], { type: "video/mp4" }), "01.mp4");
    narrated.append("clips", new Blob(["second"], { type: "video/mp4" }), "02.mp4");
    narrated.append("narration", new Blob(["voice"], { type: "audio/mpeg" }), "narration.mp3");
    narrated.set("expectedClipCount", "2");
    narrated.set("clipDurationsMs", JSON.stringify([2800, 3200]));
    const narratedResponse = await fetch(`${baseUrl}/video/compose`, { method: "POST", headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" }, body: narrated });
    assert.equal(narratedResponse.status, 200);
    assert.deepEqual(submitted[1].narration?.durationsMs, [2800, 3200]);
    assert.ok(submitted[1].narration?.path);

    const status = await fetch(`${baseUrl}/video/compose/job-1`, { headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" } });
    assert.equal((await status.json() as { job: { progress: number } }).job.progress, 40);

    const result = await fetch(`${baseUrl}/video/compose/job-1/result`, { headers: { "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" } });
    assert.equal(result.status, 200);
    assert.equal(await result.text(), "video-result");
});

test("downloads a remote video through the authenticated local service", async (t) => {
    const uploadDir = await mkdtemp(path.join(os.tmpdir(), "infinite-canvas-media-fetch-"));
    const config = { url: "http://127.0.0.1:17372", token: "test-token", origins: [] as string[] };
    const requested: string[] = [];
    const composeService = { createJob: async () => ({ id: "job", status: "queued" as const, progress: 0, clipCount: 2, createdAt: 1 }), getJob: () => null, getResultPath: () => null, cancel: () => false };
    const app = createMediaApp({
        config,
        saveConfig: () => undefined,
        composeService,
        uploadDir,
        ffmpegAvailable: true,
        remoteFetcher: async (input) => {
            requested.push(String(input));
            return new Response("remote-video", { headers: { "content-type": "video/mp4", ...(String(input).includes("large") ? { "content-length": String(2 * 1024 * 1024 * 1024 + 1) } : {}) } });
        },
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(uploadDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not start");
    const response = await fetch(`http://127.0.0.1:${address.port}/video/fetch`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-infinite-canvas-media-token": "test-token", Origin: "http://localhost:3000" },
        body: JSON.stringify({ url: "https://cdn.example.com/video.mp4" }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(await response.text(), "remote-video");
    assert.deepEqual(requested, ["https://cdn.example.com/video.mp4"]);

    const privateResponse = await fetch(`http://127.0.0.1:${address.port}/video/fetch`, { method: "POST", headers: { "content-type": "application/json", "x-infinite-canvas-media-token": "test-token" }, body: JSON.stringify({ url: "http://[::ffff:127.0.0.1]/video.mp4" }) });
    assert.equal(privateResponse.status, 400);

    const largeResponse = await fetch(`http://127.0.0.1:${address.port}/video/fetch`, { method: "POST", headers: { "content-type": "application/json", "x-infinite-canvas-media-token": "test-token" }, body: JSON.stringify({ url: "https://cdn.example.com/large.mp4" }) });
    assert.equal(largeResponse.status, 413);
});
