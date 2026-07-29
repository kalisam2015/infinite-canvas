import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/services/api/model-plugin.ts", import.meta.url), "utf8");
const start = source.indexOf("export const DOUBAO_VIDEO_ANALYSIS_SCRIPT");
const end = source.indexOf("export function defaultVideoAnalysisScriptForModel", start);
const script = source.slice(start, end);

test("Doubao video analysis keeps long requests alive with SSE streaming", () => {
    assert.match(script, /max_tokens:\s*16384/);
    assert.match(script, /stream:\s*true/);
    assert.match(script, /response\.body\.getReader\(\)/);
    assert.match(script, /finishReason/);
    assert.match(script, /signal,/);
});
