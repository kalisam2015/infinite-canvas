import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/services/api/video.ts", import.meta.url), "utf8");
const storyboardSource = await readFile(new URL("../src/lib/canvas/video-storyboard.ts", import.meta.url), "utf8");
const analysisSource = await readFile(new URL("../src/services/api/video-analysis.ts", import.meta.url), "utf8");

test("custom Seedance channels use the OpenAI-compatible video task protocol", () => {
    assert.match(source, /isRelaySeedanceVideoConfig/);
    assert.match(source, /createRelaySeedanceTask/);
    assert.match(source, /duration,/);
    assert.match(source, /width,/);
    assert.match(source, /height,/);
    assert.match(source, /fps:\s*30/);
    assert.match(source, /response_format:\s*"url"/);
    assert.match(source, /created\.task_id\s*\|\|\s*created\.id/);
    assert.match(source, /payload\.metadata\?\.url/);
});

test("all video generation tasks poll every thirty seconds", () => {
    assert.match(source, /const VIDEO_TASK_POLL_INTERVAL_MS = 30000/);
    assert.match(source, /await delay\(VIDEO_TASK_POLL_INTERVAL_MS,/);
});

test("custom Seedance channels clamp generated duration to four through fifteen seconds", () => {
    assert.match(source, /Number\(normalizeSeedanceDuration\(config\.videoSeconds\)\)/);
});

test("storyboard generation uses the four second minimum", () => {
    assert.match(storyboardSource, /Math\.max\(4,\s*Math\.min\(15/);
    assert.match(analysisSource, /4-15 秒/);
    assert.match(storyboardSource, /splitLongShots\(mergeShortShots\(normalized\)\)/);
});
