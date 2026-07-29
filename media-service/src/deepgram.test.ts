import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDeepgramResponse, requestDeepgramTranscription } from "./deepgram.js";

test("normalizes Deepgram transcript words to millisecond timing", () => {
    const result = normalizeDeepgramResponse({
        results: {
            channels: [{ alternatives: [{ transcript: "你好世界", words: [
                { word: "你好", punctuated_word: "你好", start: 0.12, end: 0.48, confidence: 0.98 },
                { word: "世界", punctuated_word: "世界。", start: 0.5, end: 0.92, confidence: 0.96 },
            ] }] }],
        },
    });

    assert.equal(result.text, "你好世界");
    assert.deepEqual(result.words, [
        { text: "你好", startMs: 120, endMs: 480, confidence: 0.98 },
        { text: "世界。", startMs: 500, endMs: 920, confidence: 0.96 },
    ]);
});

test("uploads extracted audio bytes to the Deepgram native listen endpoint", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const result = await requestDeepgramTranscription(Buffer.from("wav-data"), { apiKey: "dg-key", model: "nova-3", language: "zh" }, async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "你好", words: [{ word: "你好", start: 0, end: 0.4, confidence: 1 }] }] }] } }), { status: 200, headers: { "content-type": "application/json" } });
    });

    assert.match(requestUrl, /^https:\/\/api\.deepgram\.com\/v1\/listen\?/);
    assert.match(requestUrl, /model=nova-3/);
    assert.match(requestUrl, /language=zh/);
    assert.equal(new Headers(requestInit?.headers).get("authorization"), "Token dg-key");
    assert.equal(new Headers(requestInit?.headers).get("content-type"), "audio/wav");
    assert.equal(Buffer.from(requestInit?.body as Uint8Array).toString(), "wav-data");
    assert.equal(result.words[0].endMs, 400);
});
