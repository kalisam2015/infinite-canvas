import assert from "node:assert/strict";
import test from "node:test";

import { buildVolcengineV3AudioUrl, normalizeAudioTimeline, requestAudioGeneration } from "../src/services/api/audio.js";
import { DOUBAO_AUDIO_SCRIPT, runModelPlugin } from "../src/services/api/model-plugin.js";
import { defaultConfig } from "../src/stores/use-config-store.js";

test("uses the configured New API V3 mode for Seed TTS", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestHeaders: Headers | undefined;
    let requestBody: Record<string, any> | undefined;
    globalThis.fetch = async (input, init) => {
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body));
        const lines = [
            JSON.stringify({ code: 0, data: "YQ==" }),
            JSON.stringify({ code: 0, data: "Yg==" }),
            JSON.stringify({ code: 0, sentence: { text: "你好", words: [{ word: "你", startTime: 0.1, endTime: 0.3 }] } }),
            JSON.stringify({ code: 20000000, message: "OK" }),
        ].join("\n");
        return new Response(lines, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    };

    try {
        const result = await requestAudioGeneration(
            {
                ...defaultConfig,
                model: "seed::seed-tts-2.0",
                audioModel: "seed::seed-tts-2.0",
                audioVoice: "zh_male_m191_uranus_bigtts",
                channels: [
                    {
                        id: "seed",
                        name: "New API",
                        baseUrl: "http://127.0.0.1:3001",
                        apiKey: "new-api-token",
                        apiFormat: "openai",
                        models: [{ name: "seed-tts-2.0", capability: "audio", audioMode: "volcengine-v3" }],
                    },
                ],
            },
            "你好",
        );

        assert.equal(requestUrl, "http://127.0.0.1:3001/api/v3/tts/unidirectional");
        assert.equal(requestHeaders?.get("X-Api-Key"), "new-api-token");
        assert.equal(requestHeaders?.get("X-Api-Resource-Id"), "seed-tts-2.0");
        assert.equal(requestBody?.namespace, "UnidirectionalTTS");
        assert.equal(requestBody?.req_params?.speaker, "zh_male_m191_uranus_bigtts");
        assert.equal(requestBody?.req_params?.audio_params?.enable_subtitle, true);
        assert.deepEqual(result.timeline?.words, [{ text: "你", startMs: 100, endMs: 300 }]);
        assert.equal(await result.blob.text(), "ab");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("builds the V3 endpoint from New API base URLs", () => {
    assert.equal(buildVolcengineV3AudioUrl("http://127.0.0.1:3001"), "http://127.0.0.1:3001/api/v3/tts/unidirectional");
    assert.equal(buildVolcengineV3AudioUrl("http://127.0.0.1:3001/v1/"), "http://127.0.0.1:3001/api/v3/tts/unidirectional");
    assert.equal(buildVolcengineV3AudioUrl("http://127.0.0.1:3001/api/v3"), "http://127.0.0.1:3001/api/v3/tts/unidirectional");
});

test("requests and preserves Seed TTS subtitle timestamps", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, any> | undefined;
    globalThis.fetch = async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        const lines = [
            JSON.stringify({ data: "YQ==" }),
            JSON.stringify({ sentence: { text: "你好", words: [{ word: "你", startTime: 0.1, endTime: 0.3, confidence: 0.98 }] } }),
            JSON.stringify({ code: 20000000 }),
        ].join("\n");
        return new Response(lines, { status: 200, headers: { "Content-Type": "application/json" } });
    };

    try {
        const result = (await runModelPlugin({
            capability: "audio",
            script: DOUBAO_AUDIO_SCRIPT,
            config: { apiKey: "key", baseUrl: "", model: "seed-tts-2.0" } as never,
            prompt: "你好",
            params: { instructions: "zh_female_vv_uranus_bigtts", format: "mp3" },
        })) as { audio: Blob; timeline: { sentences: unknown[] } };

        assert.equal(requestBody?.req_params?.audio_params?.enable_subtitle, true);
        assert.equal(result.audio instanceof Blob, true);
        assert.equal(result.timeline.sentences.length, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("normalizes Seed TTS words to millisecond timestamps", () => {
    assert.deepEqual(
        normalizeAudioTimeline({
            sentences: [
                {
                    text: "你好",
                    words: [
                        { word: "你", startTime: 0.1, endTime: 0.3, confidence: 0.98 },
                        { word: "好", startTime: 0.31, endTime: 0.6 },
                        { word: "", startTime: 0.6, endTime: 0.7 },
                    ],
                },
            ],
        }),
        {
            text: "你好",
            words: [
                { text: "你", startMs: 100, endMs: 300, confidence: 0.98 },
                { text: "好", startMs: 310, endMs: 600 },
            ],
        },
    );
});

test("returns no timeline when the provider has no valid words", () => {
    assert.equal(normalizeAudioTimeline({ sentences: [{ text: "你好", words: [] }] }), undefined);
});
