import assert from "node:assert/strict";
import test from "node:test";

import { applySourceAsrTimeline, buildVideoStoryboardGraph, normalizeVideoStoryboard, type VideoStoryboard } from "../src/lib/canvas/video-storyboard.js";

test("uses overlapping Deepgram words to replace model-estimated narration timing", () => {
    const storyboard = normalizeVideoStoryboard({ shots: [
        { startMs: 0, endMs: 5000, narration: "第一段", sourceNarrationStartMs: 2000, sourceNarrationEndMs: 4500 },
        { startMs: 5000, endMs: 10_000, narration: "第二段", sourceNarrationStartMs: 5200, sourceNarrationEndMs: 9000 },
    ] });

    const calibrated = applySourceAsrTimeline(storyboard, [
        { text: "第一", startMs: 0, endMs: 400, confidence: 0.99 },
        { text: "段", startMs: 450, endMs: 800, confidence: 0.98 },
        { text: "第二段", startMs: 5200, endMs: 5700, confidence: 0.97 },
    ]);

    assert.deepEqual(calibrated.shots.map((shot) => [shot.sourceNarrationStartMs, shot.sourceNarrationEndMs, shot.sourceNarrationTimingSource]), [
        [0, 800, "deepgram"],
        [5200, 5700, "deepgram"],
    ]);
});

test("normalizes source narration timing inside its storyboard shot", () => {
    const storyboard = normalizeVideoStoryboard({
        shots: [
            { startMs: 1000, endMs: 6000, dialogue: "开场口播", sourceNarrationStartMs: 500, sourceNarrationEndMs: 7000 },
            { startMs: 6000, endMs: 11_000, sourceNarrationStartMs: 6200, sourceNarrationEndMs: 8000 },
            { startMs: 11_000, endMs: 16_000, narration: "字段不完整", sourceNarrationEndMs: 15_000 },
        ],
    });

    assert.deepEqual([storyboard.shots[0].sourceNarrationStartMs, storyboard.shots[0].sourceNarrationEndMs], [1000, 6000]);
    assert.equal(storyboard.shots[1].sourceNarrationStartMs, undefined);
    assert.equal(storyboard.shots[1].sourceNarrationEndMs, undefined);
    assert.equal(storyboard.shots[2].sourceNarrationStartMs, undefined);
    assert.equal(storyboard.shots[2].sourceNarrationEndMs, undefined);
});

test("keeps the full source narration range when a short opening shot is merged", () => {
    const storyboard = normalizeVideoStoryboard({
        shots: [
            { startMs: 0, endMs: 3400, narration: "开场口播", sourceNarrationStartMs: 200, sourceNarrationEndMs: 3200 },
            { startMs: 3400, endMs: 8000, narration: "第二段口播", sourceNarrationStartMs: 3500, sourceNarrationEndMs: 7000 },
        ],
    });

    assert.equal(storyboard.shots.length, 1);
    assert.deepEqual([storyboard.shots[0].sourceNarrationStartMs, storyboard.shots[0].sourceNarrationEndMs], [200, 7000]);
});

test("clips source narration timing when a long shot is split", () => {
    const storyboard = normalizeVideoStoryboard({
        shots: [{ startMs: 0, endMs: 30_000, narration: "持续口播", sourceNarrationStartMs: 1000, sourceNarrationEndMs: 29_000 }],
    });

    assert.deepEqual(storyboard.shots.map((shot) => [shot.startMs, shot.endMs, shot.sourceNarrationStartMs, shot.sourceNarrationEndMs]), [
        [0, 15_000, 1000, 15_000],
        [15_000, 30_000, 15_000, 29_000],
    ]);
});

test("builds silent storyboard video configs with structured narration metadata", () => {
    const storyboard: VideoStoryboard = {
        summary: "summary",
        style: "style",
        originalCopy: "copy",
        rewrittenCopy: "rewrite",
        titles: [],
        hashtags: [],
        shots: [{ startMs: 0, endMs: 3000, visual: "visual", camera: "fixed", action: "action", dialogue: "dialogue", narration: "narration", sourceNarrationStartMs: 200, sourceNarrationEndMs: 2800, subtitle: "subtitle", soundEffect: "sfx", transition: "cut", generationPrompt: "prompt", videoParams: {} }],
    };
    const graph = buildVideoStoryboardGraph({
        source: { id: "source", type: "video", title: "source", position: { x: 0, y: 0 }, width: 320, height: 180 },
        storyboard,
        config: { videoModel: "seedance", audioModel: "tts", size: "9:16", vquality: "1080p", videoGenerateAudio: "true", videoWatermark: "false", audioVoice: "onyx", audioFormat: "mp3", audioSpeed: "1", audioInstructions: "沉稳" } as never,
    });
    const videoConfig = graph.nodes.find((node) => node.title === "视频配置 01");
    const audioConfig = graph.nodes.find((node) => node.title === "音频生成配置");
    assert.equal(videoConfig?.metadata?.generateAudio, "false");
    assert.equal(videoConfig?.metadata?.seconds, "4");
    assert.equal(videoConfig?.metadata?.narrationText, "dialogue\nnarration");
    assert.equal(videoConfig?.metadata?.sourceStartMs, 0);
    assert.equal(videoConfig?.metadata?.sourceEndMs, 3000);
    assert.equal(videoConfig?.metadata?.sourceNarrationStartMs, 200);
    assert.equal(videoConfig?.metadata?.sourceNarrationEndMs, 2800);
    assert.equal(videoConfig?.metadata?.sourceNarrationTimingSource, "model");
    assert.equal(videoConfig?.metadata?.narrationAlignmentStatus, "pending");
    assert.equal(videoConfig?.metadata?.subtitleText, "subtitle");
    assert.equal(videoConfig?.metadata?.storyboardShotIndex, 0);
    assert.ok(videoConfig?.metadata?.storyboardId);
    assert.equal(videoConfig?.metadata?.storyboardId, audioConfig?.metadata?.storyboardId);
    assert.equal(audioConfig?.metadata?.audioVoice, "onyx");
    assert.equal(audioConfig?.metadata?.audioSpeed, "1");
});
