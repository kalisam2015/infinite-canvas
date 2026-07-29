import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildApiUrl, createModelChannel, defaultBaseUrlForApiFormat } from "../src/stores/use-config-store.js";

const videoSource = await readFile(new URL("../src/services/api/video.ts", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../src/components/layout/channel-editor-drawer.tsx", import.meta.url), "utf8");
const configModalSource = await readFile(new URL("../src/components/layout/app-config-modal.tsx", import.meta.url), "utf8");

test("preserves Seedance as a channel protocol with the Ark Plan default base URL", () => {
    assert.equal(defaultBaseUrlForApiFormat("seedance" as never), "https://ark.cn-beijing.volces.com/api/v3");
    assert.equal(createModelChannel({ apiFormat: "seedance" as never }).apiFormat, "seedance");
});

test("adds the version path required by each channel protocol", () => {
    assert.equal(buildApiUrl("http://127.0.0.1:3001", "/videos", "openai"), "http://127.0.0.1:3001/v1/videos");
    assert.equal(buildApiUrl("http://127.0.0.1:3001/api/v3", "/videos", "openai"), "http://127.0.0.1:3001/v1/videos");
    assert.equal(buildApiUrl("http://127.0.0.1:3001", "/models", "gemini"), "http://127.0.0.1:3001/v1beta/models");
    assert.equal(buildApiUrl("http://127.0.0.1:3001", "/contents/generations/tasks", "seedance"), "http://127.0.0.1:3001/api/v3/contents/generations/tasks");
    assert.equal(buildApiUrl("http://127.0.0.1:3001/v1", "/contents/generations/tasks", "seedance"), "http://127.0.0.1:3001/api/v3/contents/generations/tasks");
    assert.equal(buildApiUrl("http://127.0.0.1:3001/api/v3/", "/contents/generations/tasks", "seedance"), "http://127.0.0.1:3001/api/v3/contents/generations/tasks");
});

test("shows Seedance in channel protocol selectors and summaries", () => {
    assert.match(editorSource, /label:\s*"Seedance"[^\n]+value:\s*"seedance"/);
    assert.match(configModalSource, /apiFormat === "seedance"\s*\?\s*"Seedance"/);
});

test("routes Seedance channels to the native task API with an explicit audio flag", () => {
    assert.match(videoSource, /requestConfig\.apiFormat === "seedance"[\s\S]{0,300}createSeedanceTask/);
    assert.match(videoSource, /generate_audio:\s*boolConfig\(config\.videoGenerateAudio,\s*true\)/);
    assert.match(videoSource, /contents\/generations\/tasks/);
});
