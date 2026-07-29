import assert from "node:assert/strict";
import test from "node:test";

import { mergePromptWithUpstreamText, stripUpstreamTextFromPrompt } from "../src/components/canvas/canvas-node-generation.js";

test("collapses an accumulated audio prompt to one upstream narration", () => {
    const narration = "第一段旁白\n\n第二段旁白";
    assert.equal(mergePromptWithUpstreamText(Array.from({ length: 10 }, () => narration).join("\n\n"), narration), narration);
});

test("keeps a config instruction and appends upstream narration only once", () => {
    const narration = "第一段旁白\n\n第二段旁白";
    assert.equal(mergePromptWithUpstreamText(`请使用自然语气\n\n${narration}\n\n${narration}`, narration), `请使用自然语气\n\n${narration}`);
});

test("removes accumulated upstream narration from the config prompt", () => {
    const narration = "第一段旁白\n\n第二段旁白";
    assert.equal(stripUpstreamTextFromPrompt(Array.from({ length: 10 }, () => narration).join("\n\n"), narration), "");
});
