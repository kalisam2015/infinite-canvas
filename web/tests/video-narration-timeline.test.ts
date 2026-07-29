import assert from "node:assert/strict";
import test from "node:test";

import { alignStoryboardNarration, compileNarrationTimeline, compileWordNarrationTimeline, formatNarrationTimeline, narrationTimelineVideoSeconds, splitNarrationSentences } from "../src/lib/canvas/video-narration-timeline.ts";

test("keeps blank-line narration blocks as storyboard sentences", () => {
    assert.deepEqual(splitNarrationSentences("第一段旁白。\n\n第二段旁白！\n\n第三段旁白？"), ["第一段旁白。", "第二段旁白！", "第三段旁白？"]);
});

test("uses narration silence midpoints as exact shot cuts", () => {
    const timeline = compileNarrationTimeline({
        text: "第一段旁白。\n\n第二段旁白。\n\n第三段旁白。",
        durationMs: 12_000,
        silences: [{ startMs: 3800, endMs: 4200 }, { startMs: 7800, endMs: 8200 }],
        expectedShotCount: 3,
    });

    assert.deepEqual(timeline.items.map((item) => [item.shotStartMs, item.shotEndMs]), [[0, 4000], [4000, 8000], [8000, 12000]]);
    assert.deepEqual(timeline.items.map((item) => [item.startMs, item.endMs]), [[0, 3800], [4200, 7800], [8200, 12000]]);
});

test("uses available silence cuts and fills only missing cuts by weight", () => {
    const timeline = compileNarrationTimeline({ text: "第一段。\n\n第二段。\n\n第三段。", durationMs: 9000, silences: [{ startMs: 2800, endMs: 3200 }], expectedShotCount: 3 });
    assert.equal(timeline.items[0].shotEndMs, 3000);
    assert.equal(timeline.items[1].shotEndMs, 6000);
});

test("falls back to weighted text timing when silence boundaries are missing", () => {
    const timeline = compileNarrationTimeline({ text: "短句。\n\n这是明显更长的一段旁白内容。", durationMs: 10_000, silences: [], expectedShotCount: 2 });
    assert.equal(timeline.items.length, 2);
    assert.ok(timeline.items[0].shotEndMs < 5000);
    assert.equal(timeline.items[1].shotEndMs, 10_000);
});

test("formats a readable sentence and shot timeline", () => {
    const timeline = compileNarrationTimeline({ text: "第一段。\n\n第二段。", durationMs: 6000, silences: [{ startMs: 2800, endMs: 3200 }], expectedShotCount: 2 });
    const text = formatNarrationTimeline(timeline);
    assert.match(text, /镜头 01/);
    assert.match(text, /00:03\.000/);
    assert.match(text, /第一段。/);
});

test("rejects narration blocks that do not match selected videos", () => {
    assert.throws(() => compileNarrationTimeline({ text: "只有一段。", durationMs: 5000, silences: [], expectedShotCount: 2 }), /1.*2/);
});

test("matches storyboard narration to word timestamps while ignoring punctuation", () => {
    const timeline = compileWordNarrationTimeline({
        durationMs: 7000,
        shotTexts: ["清晨，城市逐渐苏醒。", "第一班地铁。"],
        words: [
            { text: "清晨，", startMs: 200, endMs: 900 },
            { text: "城市", startMs: 900, endMs: 1600 },
            { text: "逐渐", startMs: 1800, endMs: 2500 },
            { text: "苏醒。", startMs: 2500, endMs: 3400 },
            { text: "第一班", startMs: 3900, endMs: 4700 },
            { text: "地铁", startMs: 4700, endMs: 5500 },
        ],
    });

    assert.ok(timeline);
    assert.deepEqual(timeline.items.map((item) => [item.startMs, item.endMs]), [[200, 3400], [3900, 5500]]);
    assert.deepEqual(timeline.items.map((item) => [item.shotStartMs, item.shotEndMs]), [[0, 3650], [3650, 7000]]);
});

test("returns null when storyboard narration cannot be consumed in order", () => {
    const timeline = compileWordNarrationTimeline({
        durationMs: 3000,
        shotTexts: ["第二段", "第一段"],
        words: [
            { text: "第一段", startMs: 0, endMs: 1200 },
            { text: "第二段", startMs: 1400, endMs: 2600 },
        ],
    });

    assert.equal(timeline, null);
});

test("converts narration duration to the supported video generation range", () => {
    assert.equal(narrationTimelineVideoSeconds(1000), "4");
    assert.equal(narrationTimelineVideoSeconds(3650), "4");
    assert.equal(narrationTimelineVideoSeconds(18_000), "15");
});

test("builds matched alignment updates for every storyboard shot", () => {
    const result = alignStoryboardNarration({
        durationMs: 7000,
        shots: [{ id: "shot-1", text: "第一段" }, { id: "shot-2", text: "第二段" }],
        words: [{ text: "第一段", startMs: 100, endMs: 2600 }, { text: "第二段", startMs: 3200, endMs: 6200 }],
    });

    assert.equal(result.matchedCount, 2);
    assert.equal(result.shotCount, 2);
    assert.deepEqual(result.issues, []);
    assert.equal(result.updates.get("shot-1")?.status, "matched");
    assert.deepEqual([result.updates.get("shot-2")?.narrationStartMs, result.updates.get("shot-2")?.narrationEndMs], [2900, 7000]);
});

test("fails the whole alignment when a spoken storyboard shot has no narration text", () => {
    const result = alignStoryboardNarration({
        durationMs: 5000,
        shots: [{ id: "shot-1", text: "" }, { id: "shot-2", text: "第二段" }],
        words: [{ text: "第二段", startMs: 0, endMs: 2500 }],
    });

    assert.equal(result.matchedCount, 0);
    assert.equal(result.shotCount, 2);
    assert.deepEqual(result.issues, [{ index: 0, reason: "缺少旁白文本" }]);
    assert.equal(result.updates.get("shot-1")?.status, "failed");
    assert.equal(result.updates.get("shot-2")?.status, "failed");
    assert.equal(result.updates.get("shot-2")?.narrationStartMs, undefined);
});
