# Unified Narration Timeline Design

## Goal

Use one generated TTS narration as the master clock for storyboard videos. Selected visual clips are retimed to narration sentence boundaries, Seedance native speech is disabled for newly created storyboard configs, and the final MP4 uses the unified narration track.

## User Flow

1. Reverse a long video into storyboard text and video config nodes.
2. Generate one full narration from the existing audio config node with a fixed TTS model, voice, speed, and instructions.
3. Generate storyboard video clips with `generateAudio: false`.
4. In the canvas side panel, select at least two video nodes and one generated audio node.
5. Open `合并视频`; the dialog shows that unified narration timing will be used.
6. The local service detects narration pauses, aligns script sentences, retimes each clip, concatenates the visual track, and replaces clip audio with the narration.
7. The canvas receives a `完整成片` video node and a `成片时间轴` text node containing exact sentence, subtitle, shot, and cut times.

## Timeline Model

The full narration prompt is split by blank lines first and Chinese/English sentence punctuation second. The local service returns audio duration and silence ranges. The web client maps sentences to voiced ranges; when silence detection cannot provide enough boundaries, it distributes remaining time by weighted character count.

Each timeline item contains:

```json
{
  "index": 0,
  "text": "买一台英伟达DGX B300要1200万。",
  "startMs": 180,
  "endMs": 3950,
  "shotStartMs": 0,
  "shotEndMs": 4200,
  "transition": "cut"
}
```

Shot cuts use sentence boundaries. The first release uses deterministic hard cuts. Clip video is trimmed when too long and last-frame padded when too short. Subtitle timing is stored in the timeline node; styled subtitle burning is deferred.

## Local Service

Add an authenticated multipart endpoint for narration analysis and extend video compose requests with an optional narration file and timeline JSON. Narrated jobs normalize clips as video-only streams, concatenate them, then mux the unified narration as AAC 48kHz stereo. Existing video-only selection keeps the current source-audio behavior.

## Safety And Failure Handling

- Exactly one narration audio node is accepted.
- Sentence count must equal selected video count after normalization; otherwise the dialog reports a clear mismatch.
- Frontend expected clip count and service received count remain strictly validated.
- Project navigation and cancellation continue to abort the task and discard late results.
- Local URL, token, Origin restrictions, and remote URL protections remain unchanged.

## Testing

- Pure timeline compiler tests: sentence splitting, silence mapping, weighted fallback, monotonic cuts.
- FFmpeg argument tests: trim/pad video-only clips and mux narration.
- HTTP tests: authenticated narration analysis and narrated compose multipart contract.
- Web client tests: selected audio upload, timeline payload, result polling, mismatch errors.
- Real end-to-end test with three visual clips and one narration file, verifying duration and non-silent AAC output.
