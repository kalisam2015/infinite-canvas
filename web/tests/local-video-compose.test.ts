import assert from "node:assert/strict";
import test from "node:test";

import { composeVideosLocally, sortVideoComposeNodes } from "../src/services/local-video-compose.js";

test("sorts selected videos from top to bottom and then left to right", () => {
    const nodes = [
        { id: "b", position: { x: 500, y: 100 } },
        { id: "c", position: { x: 100, y: 300 } },
        { id: "a", position: { x: 100, y: 100 } },
    ];
    assert.deepEqual(sortVideoComposeNodes(nodes).map((node) => node.id), ["a", "b", "c"]);
});

test("keeps storyboard order even after clips move on the canvas", () => {
    const nodes = [
        { id: "third", position: { x: 0, y: 0 }, metadata: { storyboardShotIndex: 2 } },
        { id: "first", position: { x: 0, y: 900 }, metadata: { storyboardShotIndex: 0 } },
        { id: "second", position: { x: 0, y: 450 }, metadata: { storyboardShotIndex: 1 } },
    ];
    assert.deepEqual(sortVideoComposeNodes(nodes).map((node) => node.id), ["first", "second", "third"]);
});

test("submits clips, polls progress, and downloads the completed video", async () => {
    const calls: string[] = [];
    const progress: number[] = [];
    const fetcher: typeof fetch = async (input, init) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/video/compose") && init?.method === "POST") {
            const body = init.body as FormData;
            assert.equal(body.get("expectedClipCount"), "2");
            assert.equal(body.getAll("clips").length, 2);
            return Response.json({ job: { id: "job-1", clipCount: 2 } });
        }
        if (url.endsWith("/video/compose/job-1/result")) return new Response(new Blob(["video"], { type: "video/mp4" }));
        return Response.json({ job: { id: "job-1", status: calls.length < 3 ? "running" : "completed", progress: calls.length < 3 ? 50 : 100 } });
    };

    const result = await composeVideosLocally(
        { url: "http://127.0.0.1:17372", token: "token" },
        [
            { name: "01.mp4", blob: new Blob(["one"], { type: "video/mp4" }) },
            { name: "02.mp4", blob: new Blob(["two"], { type: "video/mp4" }) },
        ],
        { fetcher, pollIntervalMs: 0, onProgress: (value) => progress.push(value) },
    );

    assert.equal(result.type, "video/mp4");
    assert.deepEqual(progress, [50, 100]);
    assert.deepEqual(calls, [
        "http://127.0.0.1:17372/video/compose",
        "http://127.0.0.1:17372/video/compose/job-1",
        "http://127.0.0.1:17372/video/compose/job-1",
        "http://127.0.0.1:17372/video/compose/job-1/result",
    ]);
});

test("rejects a compose result after cancellation or project navigation", async () => {
    const module = await import("../src/services/local-video-compose.js") as Record<string, unknown>;
    assert.equal(typeof module.isVideoComposeRunActive, "function");
    const isActive = module.isVideoComposeRunActive as (signal: AbortSignal, startedProjectId: string, activeProjectId: string) => boolean;
    const controller = new AbortController();
    assert.equal(isActive(controller.signal, "project-a", "project-b"), false);
    controller.abort();
    assert.equal(isActive(controller.signal, "project-a", "project-a"), false);
});

test("loads cross-origin source videos through the local media service", async () => {
    const module = await import("../src/services/local-video-compose.js") as Record<string, unknown>;
    assert.equal(typeof module.fetchVideoThroughLocalService, "function");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchVideo = module.fetchVideoThroughLocalService as (config: { url: string; token: string }, sourceUrl: string, options?: { fetcher?: typeof fetch }) => Promise<Blob>;
    const blob = await fetchVideo({ url: "http://127.0.0.1:17372", token: "token" }, "https://cdn.example.com/video.mp4", {
        fetcher: async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(new Blob(["video"], { type: "video/mp4" }));
        },
    });

    assert.equal(blob.type, "video/mp4");
    assert.equal(calls[0].url, "http://127.0.0.1:17372/video/fetch");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.headers && (calls[0].init.headers as Record<string, string>)["x-infinite-canvas-media-token"], "token");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { url: "https://cdn.example.com/video.mp4" });
});

test("analyzes one narration audio file through the local service", async () => {
    const module = await import("../src/services/local-video-compose.js") as Record<string, unknown>;
    assert.equal(typeof module.analyzeNarrationTimeline, "function");
    const analyze = module.analyzeNarrationTimeline as (config: { url: string; token: string }, audio: { name: string; blob: Blob }, options?: { fetcher?: typeof fetch }) => Promise<{ durationMs: number; silences: Array<{ startMs: number; endMs: number }> }>;
    const analysis = await analyze({ url: "http://127.0.0.1:17372", token: "token" }, { name: "voice.mp3", blob: new Blob(["voice"], { type: "audio/mpeg" }) }, {
        fetcher: async (input, init) => {
            assert.equal(String(input), "http://127.0.0.1:17372/audio/timeline");
            assert.equal((init?.body as FormData).getAll("audio").length, 1);
            return Response.json({ analysis: { durationMs: 6000, silences: [{ startMs: 2800, endMs: 3200 }] } });
        },
    });
    assert.deepEqual(analysis, { durationMs: 6000, silences: [{ startMs: 2800, endMs: 3200 }] });
});

test("configures Deepgram and uploads local media for transcription", async () => {
    const module = await import("../src/services/local-video-compose.js");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        if (String(input).endsWith("/config/deepgram")) return new Response(JSON.stringify({ ok: true, deepgramConfigured: true }), { status: 200 });
        return new Response(JSON.stringify({ ok: true, transcription: { text: "开场", words: [{ text: "开场", startMs: 0, endMs: 320, confidence: 0.99 }] } }), { status: 200 });
    };

    await module.configureLocalDeepgram({ url: "http://127.0.0.1:17372", token: "token" }, { apiKey: "dg-key", model: "nova-3", language: "zh" }, fetcher as typeof fetch);
    const result = await module.transcribeMediaLocally({ url: "http://127.0.0.1:17372", token: "token" }, { name: "source.mp4", blob: new Blob(["video"], { type: "video/mp4" }) }, { fetcher: fetcher as typeof fetch });

    assert.equal(calls[0].url, "http://127.0.0.1:17372/config/deepgram");
    assert.equal(calls[1].url, "http://127.0.0.1:17372/audio/transcribe");
    assert.equal(new Headers(calls[0].init?.headers).get("x-infinite-canvas-media-token"), "token");
    assert.equal(result.words[0].endMs, 320);
});

test("submits narration and exact clip durations for narrated composition", async () => {
    const fetcher: typeof fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/video/compose") && init?.method === "POST") {
            const body = init.body as FormData;
            assert.equal(body.getAll("narration").length, 1);
            assert.equal(body.get("clipDurationsMs"), "[2800,3200]");
            return Response.json({ job: { id: "job-narrated", clipCount: 2 } });
        }
        if (url.endsWith("/result")) return new Response(new Blob(["video"], { type: "video/mp4" }));
        return Response.json({ job: { id: "job-narrated", status: "completed", progress: 100 } });
    };
    const result = await composeVideosLocally(
        { url: "http://127.0.0.1:17372", token: "token" },
        [{ name: "01.mp4", blob: new Blob(["one"], { type: "video/mp4" }) }, { name: "02.mp4", blob: new Blob(["two"], { type: "video/mp4" }) }],
        { fetcher, pollIntervalMs: 0, narration: { name: "voice.mp3", blob: new Blob(["voice"], { type: "audio/mpeg" }), clipDurationsMs: [2800, 3200] } } as never,
    );
    assert.equal(result.type, "video/mp4");
});
