# Unified Narration Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified TTS narration timeline that retimes storyboard clips, replaces per-clip Seedance speech, and writes an exact sentence/shot timeline back to Infinite Canvas.

**Architecture:** Reuse the existing audio generation node for one full TTS file. Add a pure web timeline compiler, a local FFmpeg narration-analysis endpoint, and an optional narrated mode in the existing compose job. The canvas compose dialog accepts one selected audio node alongside video nodes and creates both the final video and a timeline text node.

**Tech Stack:** React, TypeScript, Ant Design, localforage, Express, Multer, native FFmpeg, Node test runner.

---

### Task 1: Timeline compiler

**Files:**
- Create: `web/src/lib/canvas/video-narration-timeline.ts`
- Create: `web/tests/video-narration-timeline.test.ts`

1. Write failing tests for sentence splitting, silence-boundary mapping, weighted fallback, and exact monotonic shot ranges.
2. Run the focused test and confirm RED.
3. Implement `splitNarrationSentences`, `compileNarrationTimeline`, and `formatNarrationTimeline`.
4. Run the focused test and confirm GREEN.

### Task 2: Narration analysis in the Windows service

**Files:**
- Modify: `media-service/src/video-compose.ts`
- Modify: `media-service/src/http-server.ts`
- Modify: `media-service/src/video-compose.test.ts`
- Modify: `media-service/src/http-server.test.ts`

1. Write failing tests for parsing FFmpeg duration/silence output and authenticated `POST /audio/timeline`.
2. Implement FFmpeg `silencedetect` analysis and return `{ durationMs, silences }`.
3. Verify uploaded narration files are always removed.
4. Run `npm test` in `media-service`.

### Task 3: Narrated FFmpeg composition

**Files:**
- Modify: `media-service/src/video-compose.ts`
- Modify: `media-service/src/http-server.ts`
- Modify: `media-service/src/video-compose.test.ts`

1. Write failing tests for video-only trim/pad normalization and final narration mux arguments.
2. Extend jobs with optional narration input and per-clip duration list.
3. Keep the current source-audio path unchanged when narration is absent.
4. Run service tests.

### Task 4: Browser client contract

**Files:**
- Modify: `web/src/services/local-video-compose.ts`
- Modify: `web/tests/local-video-compose.test.ts`

1. Write failing tests for narration analysis and narrated multipart compose requests.
2. Add `analyzeNarrationTimeline` and optional narration/timeline fields to `composeVideosLocally`.
3. Preserve cancellation and progress behavior.
4. Run focused web tests.

### Task 5: Storyboard defaults and canvas workflow

**Files:**
- Modify: `web/src/lib/canvas/video-storyboard.ts`
- Modify: `web/src/types/canvas.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/components/canvas/canvas-side-panel.tsx`
- Modify: `web/src/components/canvas/canvas-video-compose-dialog.tsx`

1. Default generated storyboard video configs to `generateAudio: false` and store narration/subtitle metadata per shot.
2. Carry that metadata to generated video nodes.
3. Allow selecting one audio node with the videos; show the narration mode and timing summary in the dialog.
4. Analyze the narration, compile exact timing, compose, and create `完整成片` plus `成片时间轴`.
5. Keep normal source-audio concatenation when no audio node is selected.

### Task 6: Documentation and verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

1. Record the user-visible behavior and test checklist.
2. Run service tests, focused web tests, a real narrated FFmpeg composition, and `git diff --check`.
3. Do not run the full project build or typecheck per `AGENTS.md`.
