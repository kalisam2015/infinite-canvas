# Native GPT-5.6 Video Analysis Implementation Plan

> Superseded: OpenAI Responses `input_file` does not accept MP4. Native video analysis now uses the Doubao Chat API `video_url` Base64 protocol implemented in `web/src/services/api/model-plugin.ts`.

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Make long-video reverse storyboarding submit the complete MP4 to GPT-5.6 through the standard Responses API `input_file` input, without keyframe extraction or private video endpoints.

**Architecture:** Keep the existing browser-direct model plugin runtime and video storyboard parser. Replace the built-in video-analysis upload template with a Responses API template that converts `videos[0].blob` to a Base64 Data URL and sends it as `input_file.file_data`; preserve the user-editable script model so providers can adapt the request. Improve plugin errors so API response bodies explain unsupported file input, size limits, and route mismatches.

**Tech Stack:** React + TypeScript, Axios, browser `FileReader`/`FormData`, OpenAI-compatible Responses API, existing canvas storyboard normalization.

---

### Task 1: Update the video-analysis plugin contract

**Files:**
- Modify: `web/src/services/api/model-plugin.ts:145-205`

**Steps:**

1. Add `video-analysis` to the `prompt` plugin variable capabilities so the editor exposes the actual analysis prompt variable.
2. Keep `videos`, `model`, `baseUrl`, `apiKey`, and `request` documented for the video-analysis script.
3. Replace the current generic `/v1/video-analysis` multipart template with a template named `OpenAI Responses 原生文件输入`.
4. In that template, reject missing video input, read `videos[0].blob` with `FileReader.readAsDataURL`, and send:
   - `model` at the top level;
   - `input[0].role = "user"`;
   - an `input_file` content item containing `filename`, `file_data`, and `detail: "auto"`;
   - an `input_text` content item containing `prompt`.
5. Extract `data.output_text`; if absent, flatten `data.output[].content[].text`; throw an actionable error when no text is returned; return the extracted JSON string.

### Task 2: Preserve useful provider diagnostics

**Files:**
- Modify: `web/src/services/api/model-plugin.ts:158-169`

**Steps:**

1. In the plugin catch block, detect Axios responses and serialize a bounded excerpt of `error.response.data`.
2. Include that excerpt in the thrown Chinese error while preserving cancellation behavior.
3. Ensure the error does not include request headers or API keys.

### Task 3: Update user-facing configuration documentation

**Files:**
- Modify: `CHANGELOG.md:5`
- Modify: `docs/content/docs/progress/pending-test.mdx:10`

**Steps:**

1. Add an Unreleased adjustment noting that the built-in video-analysis template now uses Responses `input_file` with the complete video.
2. Add a pending-test item covering a GPT-5.6 channel configured with the Responses template: request goes to `/v1/responses`, payload contains `input_file.file_data`, no `/v1/files` or `video_url` request is made, and valid `shots` creates the storyboard graph.
3. Document expected errors for unsupported `input_file`, oversized requests, and missing `output_text`.

### Task 4: Read-only verification

**Files:**
- Inspect: `web/src/services/api/model-plugin.ts`
- Inspect: `web/src/services/api/video-analysis.ts`
- Inspect: `web/src/lib/canvas/video-storyboard.ts`

**Steps:**

1. Run `git diff --check`.
2. Verify with `rg` that the built-in template uses `/v1/responses`, `input_file`, and `input_text`, and that no new video path references `/v1/files` or `video_url`.
3. Do not run build, typecheck, or tests because the repository `AGENTS.md` explicitly delegates those checks to the user.
4. Keep unrelated user changes (`AGENTS.md`, `canvas/`) untouched.

### Task 5: Commit the implementation

**Steps:**

1. Stage only the implementation files and documentation changed by these tasks.
2. Commit with `feat: use Responses input_file for native video analysis`.
