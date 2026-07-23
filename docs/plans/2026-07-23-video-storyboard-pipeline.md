# Long Video Storyboard Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a browser-direct video understanding workflow that analyzes one long video through a configurable model script and creates editable storyboard text, audio config, and per-shot video config nodes on Infinite Canvas.

**Architecture:** Extend the existing model capability registry with a dedicated video-analysis capability and pass the locally stored video Blob to a user-authored model script. Normalize the script result in a small API service, convert it into the existing canvas node/connection model with a pure graph builder, and trigger the workflow from a video-node toolbar action and modal.

**Tech Stack:** Vite, React, TypeScript, Ant Design, Tailwind, Zustand, localforage, existing model-plugin runtime, existing Infinite Canvas node APIs.

---

> Project rule: `AGENTS.md` says Codex does not run syntax checks, tests, builds, or formatting after implementation. Commands below are exact manual verification commands for the user unless they explicitly ask Codex to run them.

### Task 1: Register the video-analysis model capability

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Modify: `web/src/components/layout/channel-editor-drawer.tsx`
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Modify: `web/src/components/layout/model-script-editor.tsx`
- Modify: `web/src/services/api/model-plugin.ts`

**Step 1: Extend the model and config types**

Add a dedicated capability and default model field:

```ts
export type ModelCapability = "image" | "video" | "text" | "audio" | "video-analysis";

export type AiConfig = {
    // existing fields...
    videoAnalysisModel: string;
};
```

Set `defaultConfig.videoAnalysisModel` to an empty string. Include it in persisted normalization, legacy channel construction, and model option normalization. Do not assign an existing generation model automatically.

**Step 2: Expose the capability in channel configuration**

Add the Chinese label `视频理解` to capability selectors, script-editor labels, and the default-model groups in the application configuration modal. Use the existing `ModelPicker` and current channel/model storage.

**Step 3: Extend the model script runtime input**

Add a serializable runtime descriptor that still carries the original Blob:

```ts
export type PluginVideoInput = {
    blob: Blob;
    name: string;
    type: string;
    size: number;
    width?: number;
    height?: number;
    durationMs?: number;
};

type RunPluginArgs = {
    // existing fields...
    videos?: PluginVideoInput[];
};
```

Pass `videos` into the `new Function` runner beside `images` and document it in `PLUGIN_VARIABLES` for `video-analysis` only.

**Step 4: Add the script return contract and starter template**

The return description must require an object or JSON string containing `summary`, optional copy/title fields, and `shots`. Add one provider-neutral upload template that:

```js
const form = new FormData();
form.append("video", videos[0].blob, videos[0].name);
form.append("prompt", prompt);
return await request({
  method: "post",
  url: `${baseUrl}/v1/video-analysis`,
  headers: { Authorization: `Bearer ${apiKey}` },
  data: form,
});
```

The template is an editable example, not a promised standard endpoint.

**Step 5: Manual verification**

Run if requested:

```powershell
cd web
npm run typecheck
```

Expected: no missing `ModelCapability` record entries and no missing `videoAnalysisModel` fields.

**Step 6: Commit**

```powershell
git add web/src/stores/use-config-store.ts web/src/components/layout/channel-editor-drawer.tsx web/src/components/layout/app-config-modal.tsx web/src/components/layout/model-script-editor.tsx web/src/services/api/model-plugin.ts
git commit -m "feat: add video analysis model scripts"
```

### Task 2: Normalize video-analysis results

**Files:**
- Create: `web/src/lib/canvas/video-storyboard.ts`
- Create: `web/tests/video-storyboard.test.mjs`

**Step 1: Write the normalization tests**

Cover these cases:

```js
test("normalizes ordered storyboard shots", async () => {
  const result = normalizeVideoStoryboard({
    summary: "示例",
    shots: [
      { startMs: 5000, endMs: 9000, visual: "第二镜", generationPrompt: "prompt 2" },
      { startMs: 0, endMs: 3000, visual: "第一镜", generationPrompt: "prompt 1" },
    ],
  }, 10000);
  assert.deepEqual(result.shots.map((shot) => shot.startMs), [0, 5000]);
});
```

Also verify JSON fenced-string extraction, missing `shots`, invalid ranges, values beyond source duration, missing prompt fallback, and clamping generation duration to 2-15 seconds.

**Step 2: Implement the public types**

```ts
export type VideoStoryboardShot = {
    startMs: number;
    endMs: number;
    visual: string;
    camera: string;
    action: string;
    dialogue: string;
    narration: string;
    subtitle: string;
    soundEffect: string;
    transition: string;
    generationPrompt: string;
    videoParams: Record<string, unknown>;
};

export type VideoStoryboard = {
    summary: string;
    style: string;
    originalCopy: string;
    rewrittenCopy: string;
    titles: string[];
    hashtags: string[];
    shots: VideoStoryboardShot[];
    rawResponse?: string;
};
```

**Step 3: Implement strict, small normalization helpers**

Provide:

```ts
export function normalizeVideoStoryboard(value: unknown, durationMs?: number): VideoStoryboard;
export function parseVideoStoryboardResponse(value: unknown, durationMs?: number): VideoStoryboard;
export function storyboardShotSeconds(shot: VideoStoryboardShot): string;
```

Use `JSON.parse` after extracting the first fenced or balanced JSON object. Do not add a schema library solely for this feature. Throw a Chinese error that contains the raw response when the response cannot be parsed.

**Step 4: Manual verification**

Run if requested:

```powershell
cd web
node --test tests/video-storyboard.test.mjs
```

Expected: all normalization tests pass.

**Step 5: Commit**

```powershell
git add web/src/lib/canvas/video-storyboard.ts web/tests/video-storyboard.test.mjs
git commit -m "feat: normalize video storyboard analysis"
```

### Task 3: Add the browser-direct video analysis service

**Files:**
- Create: `web/src/services/api/video-analysis.ts`
- Modify: `web/src/services/api/model-plugin.ts`

**Step 1: Resolve the source video Blob**

Use `getMediaBlob(node.metadata.storageKey)` first. Fall back to fetching `node.metadata.content` only when needed. Create one `PluginVideoInput` with the node title and saved metadata.

**Step 2: Build the analysis prompt**

Keep the prompt in this service as one exported constant/function. It must request JSON only and explicitly request:

- full-video summary and visual style;
- original and rewritten copy;
- titles and hashtags;
- ordered shots with millisecond timecodes;
- visual, camera, action, dialogue, narration, subtitle, sound effect and transition;
- a direct video-generation prompt and suggested parameters per shot.

Append the user's rewrite instruction without changing the output schema.

**Step 3: Call the configured script**

Implement:

```ts
export async function analyzeVideoStoryboard(
    config: AiConfig,
    node: CanvasNodeData,
    options?: { model?: string; rewriteInstruction?: string; signal?: AbortSignal },
) {
    // resolve model/channel/script, read Blob, run plugin, normalize response
}
```

Require a selected `video-analysis` model with a non-empty script. Use `resolveModelRequestConfig`, `resolveModelScript`, `runModelPlugin`, and `parseVideoStoryboardResponse`.

**Step 4: Preserve actionable errors**

Return clear errors for missing local media, missing analysis model, missing script, upload rejection, cancellation, and invalid result JSON. Do not silently fall back to the text or video-generation model.

**Step 5: Commit**

```powershell
git add web/src/services/api/video-analysis.ts web/src/services/api/model-plugin.ts
git commit -m "feat: add long video analysis service"
```

### Task 4: Build storyboard canvas nodes and connections

**Files:**
- Modify: `web/src/lib/canvas/video-storyboard.ts`
- Modify: `web/tests/video-storyboard.test.mjs`

**Step 1: Add graph-builder tests**

Verify that two shots produce:

- one overview/original-copy text node;
- one rewritten-copy text node;
- one title/topic text node;
- one audio config node when dialogue or narration exists;
- one storyboard text node and one video config node per shot;
- connections from each shot text node to its matching video config node;
- no connection from the original long video to video-generation configs.

**Step 2: Implement a pure graph builder**

```ts
export function buildVideoStoryboardGraph(args: {
    source: CanvasNodeData;
    storyboard: VideoStoryboard;
    config: AiConfig;
}): { nodes: CanvasNodeData[]; connections: CanvasConnection[]; selectedNodeId?: string };
```

Layout rules:

- place overview nodes to the right of the source video;
- place each shot on a separate row;
- place the storyboard text node first and its video config node to the right;
- use 96px gaps and existing node default sizes;
- put title/topic and audio branches below the overview nodes;
- preserve existing canvas node factories and metadata conventions.

Each shot text node should contain a compact Chinese structure:

```text
时间码：00:00.000 - 00:05.200
画面：...
景别/运镜：...
人物动作：...
台词/旁白：...
字幕/音效：...
转场：...
生成提示词：...
```

Each video config node should store `generationMode: "video"`, the current default video model, clamped shot duration, size, resolution, audio and watermark settings. Connect only its matching shot text node.

**Step 3: Manual verification**

Run if requested:

```powershell
cd web
node --test tests/video-storyboard.test.mjs
```

Expected: normalization and graph-builder tests pass.

**Step 4: Commit**

```powershell
git add web/src/lib/canvas/video-storyboard.ts web/tests/video-storyboard.test.mjs
git commit -m "feat: build storyboard canvas graphs"
```

### Task 5: Add the video reverse-storyboard dialog and toolbar action

**Files:**
- Create: `web/src/components/canvas/canvas-video-storyboard-dialog.tsx`
- Modify: `web/src/components/canvas/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/pages/canvas/project.tsx`

**Step 1: Build the modal**

Use Ant Design `Modal`, `Input.TextArea`, `Alert`, and the existing `ModelPicker`. The dialog contains:

- the selected source video name and duration;
- a `video-analysis` model picker;
- an optional rewrite instruction;
- a primary `开始反推` command;
- loading, cancellation, parse-error raw response, and retry states.

Keep styling local with Tailwind classes and current canvas theme tokens. Do not add global CSS.

**Step 2: Add the toolbar command**

Add `onReverseStoryboard` to `CanvasNodeHoverToolbarProps`. For non-empty video nodes, show a flat `反推分镜` command with a Lucide icon. Do not add a filled background or image-toolbar settings entry.

**Step 3: Integrate analysis in the canvas page**

In `web/src/pages/canvas/project.tsx`:

- store the active video node ID and dialog state;
- call `analyzeVideoStoryboard` with an `AbortController`;
- call `buildVideoStoryboardGraph` after success;
- append all returned nodes/connections in one state update;
- select the first generated video config node and focus its panel;
- show concise Chinese success/error messages;
- abort on dialog cancellation or component cleanup.

Do not create nodes incrementally before the analysis result has passed normalization.

**Step 4: Manual browser verification**

When the user tests:

1. Configure a model as `视频理解` and save a working script.
2. Upload a long video node.
3. Choose `反推分镜` and submit an optional rewrite instruction.
4. Confirm ordered storyboard/config node pairs are created.
5. Confirm each config has a 2-15 second duration and is not connected to the original long video.
6. Modify one shot text/config and generate only that shot.
7. Confirm cancellation and invalid JSON display useful errors without partial nodes.

**Step 5: Commit**

```powershell
git add web/src/components/canvas/canvas-video-storyboard-dialog.tsx web/src/components/canvas/canvas-node-hover-toolbar.tsx web/src/pages/canvas/project.tsx
git commit -m "feat: add video storyboard reverse workflow"
```

### Task 6: Record the user-visible change

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`

**Step 1: Update progress documentation**

Check `todo.mdx` for an existing matching item. Remove it only if present. Add one `pending-test.mdx` entry describing:

- video understanding model/script configuration;
- full-video analysis;
- storyboard, copy, title/topic, audio config and per-shot video config nodes;
- independent shot regeneration;
- invalid JSON, cancellation and upload failure behavior;
- explicit exclusion of automatic editing and publishing.

Do not update `overview/features.mdx` until the user confirms testing.

**Step 2: Update the changelog**

Add one Unreleased summary:

```text
+ [新增] 画布视频节点支持通过可配置视频理解脚本反推长视频文案和分镜，并创建可编辑的逐镜头视频生成流程。
```

**Step 3: Commit**

```powershell
git add CHANGELOG.md docs/content/docs/progress/todo.mdx docs/content/docs/progress/pending-test.mdx
git commit -m "docs: record video storyboard workflow"
```

### Task 7: Final review without running builds

**Files:**
- Review only: all files changed in Tasks 1-6

**Step 1: Inspect the final diff**

```powershell
git diff HEAD~6 -- web/src CHANGELOG.md docs/content/docs/progress
git status --short
```

Confirm no unrelated changes are included, especially the user's existing `AGENTS.md` and `canvas/` changes.

**Step 2: Hand off manual checks**

Report the commands the user may run:

```powershell
cd web
npm run typecheck
node --test tests/video-storyboard.test.mjs
```

Do not run them unless the user explicitly requests it.
