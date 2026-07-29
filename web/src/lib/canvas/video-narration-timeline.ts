export type NarrationSilence = { startMs: number; endMs: number };

export type NarrationTimelineItem = {
    index: number;
    text: string;
    startMs: number;
    endMs: number;
    shotStartMs: number;
    shotEndMs: number;
    transition: "cut";
};

export type NarrationTimeline = {
    durationMs: number;
    items: NarrationTimelineItem[];
};

export type StoryboardNarrationAlignment = {
    updates: Map<string, { status: "matched" | "failed"; narrationStartMs?: number; narrationEndMs?: number; seconds?: string; error?: string }>;
    matchedCount: number;
    shotCount: number;
    issues: Array<{ index: number; reason: string }>;
};

export function splitNarrationSentences(value: string) {
    const text = value.trim();
    if (!text) return [];
    const blocks = text.split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean);
    if (blocks.length > 1) return blocks;
    return text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
}

export function compileNarrationTimeline(args: { text: string; durationMs: number; silences: NarrationSilence[]; expectedShotCount: number }): NarrationTimeline {
    const sentences = splitNarrationSentences(args.text);
    if (sentences.length !== args.expectedShotCount) throw new Error(`旁白包含 ${sentences.length} 段，但选择了 ${args.expectedShotCount} 个视频`);
    const durationMs = Math.max(1, Math.round(args.durationMs));
    const weights = sentences.map(textWeight);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const expectedCuts: number[] = [];
    let cumulative = 0;
    for (let index = 0; index < sentences.length - 1; index += 1) {
        cumulative += weights[index];
        expectedCuts.push(Math.round((durationMs * cumulative) / totalWeight));
    }
    const candidates = args.silences
        .filter((silence) => silence.endMs - silence.startMs >= 120)
        .map((silence) => Math.round((silence.startMs + silence.endMs) / 2))
        .filter((value) => value > 0 && value < durationMs)
        .sort((a, b) => a - b);
    const cuts = chooseCuts(expectedCuts, candidates);
    const boundaries = [0, ...cuts, durationMs];
    return {
        durationMs,
        items: sentences.map((text, index) => {
            const shotStartMs = boundaries[index];
            const shotEndMs = boundaries[index + 1];
            const speech = speechBounds(shotStartMs, shotEndMs, args.silences);
            return { index, text, startMs: speech.startMs, endMs: speech.endMs, shotStartMs, shotEndMs, transition: "cut" as const };
        }),
    };
}

export function compileWordNarrationTimeline(args: { shotTexts: string[]; durationMs: number; words: Array<{ text: string; startMs: number; endMs: number }> }): NarrationTimeline | null {
    if (!args.shotTexts.length || !args.words.length) return null;
    const sourceChars: string[] = [];
    const sourceWordIndexes: number[] = [];
    let previousStartMs = -1;
    for (let wordIndex = 0; wordIndex < args.words.length; wordIndex += 1) {
        const word = args.words[wordIndex];
        if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.startMs < previousStartMs || word.endMs <= word.startMs) return null;
        previousStartMs = word.startMs;
        for (const char of matchChars(word.text)) {
            sourceChars.push(char);
            sourceWordIndexes.push(wordIndex);
        }
    }
    if (!sourceChars.length) return null;
    const matches: Array<{ text: string; startMs: number; endMs: number }> = [];
    let cursor = 0;
    for (const text of args.shotTexts) {
        const target = matchChars(text);
        if (!target.length) return null;
        const start = findSequence(sourceChars, target, cursor);
        if (start < 0) return null;
        const firstWord = args.words[sourceWordIndexes[start]];
        const lastWord = args.words[sourceWordIndexes[start + target.length - 1]];
        matches.push({ text, startMs: Math.round(firstWord.startMs), endMs: Math.round(lastWord.endMs) });
        cursor = start + target.length;
    }
    const durationMs = Math.max(1, Math.round(args.durationMs), matches[matches.length - 1].endMs);
    const boundaries = [0];
    for (let index = 0; index < matches.length - 1; index += 1) boundaries.push(Math.round((matches[index].endMs + matches[index + 1].startMs) / 2));
    boundaries.push(durationMs);
    return {
        durationMs,
        items: matches.map((match, index) => ({ index, ...match, shotStartMs: boundaries[index], shotEndMs: boundaries[index + 1], transition: "cut" as const })),
    };
}

export function formatNarrationTimeline(timeline: NarrationTimeline) {
    return timeline.items
        .map((item) => [`镜头 ${String(item.index + 1).padStart(2, "0")}`, `时间：${formatTime(item.shotStartMs)} - ${formatTime(item.shotEndMs)}`, `字幕：${item.text}`, "转场：硬切"].join("\n"))
        .join("\n\n");
}

export function narrationTimelineVideoSeconds(durationMs: number) {
    return String(Math.max(4, Math.min(15, Math.round(durationMs / 1000))));
}

export function alignStoryboardNarration(args: { shots: Array<{ id: string; text: string }>; durationMs: number; words: Array<{ text: string; startMs: number; endMs: number }> }): StoryboardNarrationAlignment {
    const missing = args.shots.flatMap((shot, index) => shot.text.trim() ? [] : [{ index, reason: "缺少旁白文本" }]);
    if (missing.length) return failedAlignment(args.shots, missing, "分镜旁白信息不完整");
    const timeline = compileWordNarrationTimeline({ shotTexts: args.shots.map((shot) => shot.text), durationMs: args.durationMs, words: args.words });
    if (!timeline) return failedAlignment(args.shots, [{ index: 0, reason: "字词时间戳无法按分镜顺序匹配" }], "字词时间戳匹配失败");
    return {
        updates: new Map(args.shots.map((shot, index) => {
            const item = timeline.items[index];
            return [shot.id, { status: "matched" as const, narrationStartMs: item.shotStartMs, narrationEndMs: item.shotEndMs, seconds: narrationTimelineVideoSeconds(item.shotEndMs - item.shotStartMs) }];
        })),
        matchedCount: args.shots.length,
        shotCount: args.shots.length,
        issues: [],
    };
}

function failedAlignment(shots: Array<{ id: string }>, issues: Array<{ index: number; reason: string }>, error: string): StoryboardNarrationAlignment {
    return { updates: new Map(shots.map((shot) => [shot.id, { status: "failed" as const, error }])), matchedCount: 0, shotCount: shots.length, issues };
}

function chooseCuts(expected: number[], candidates: number[]) {
    const result = [...expected];
    const assignedTargets = new Set<number>();
    const assignedCandidates = new Set<number>();
    const pairs = expected.flatMap((target, targetIndex) => candidates.map((candidate, candidateIndex) => ({ targetIndex, candidateIndex, distance: Math.abs(candidate - target) }))).sort((a, b) => a.distance - b.distance);
    pairs.forEach((pair) => {
        if (assignedTargets.has(pair.targetIndex) || assignedCandidates.has(pair.candidateIndex)) return;
        result[pair.targetIndex] = candidates[pair.candidateIndex];
        assignedTargets.add(pair.targetIndex);
        assignedCandidates.add(pair.candidateIndex);
    });
    return result.map((value, index) => Math.max(index ? result[index - 1] + 1 : 1, value));
}

function speechBounds(shotStartMs: number, shotEndMs: number, silences: NarrationSilence[]) {
    let startMs = shotStartMs;
    let endMs = shotEndMs;
    const leading = silences.find((silence) => silence.startMs <= shotStartMs && silence.endMs > shotStartMs);
    if (leading) startMs = Math.min(shotEndMs, leading.endMs);
    const trailing = [...silences].reverse().find((silence) => silence.startMs < shotEndMs && silence.endMs >= shotEndMs);
    if (trailing) endMs = Math.max(shotStartMs, trailing.startMs);
    return endMs > startMs ? { startMs, endMs } : { startMs: shotStartMs, endMs: shotEndMs };
}

function textWeight(value: string) {
    return Math.max(1, Array.from(value.replace(/[\s，。！？!?；;、]/g, "")).length);
}

function matchChars(value: string) {
    return Array.from(value.normalize("NFKC").toLocaleLowerCase()).filter((char) => /[\p{L}\p{N}]/u.test(char));
}

function findSequence(source: string[], target: string[], fromIndex: number) {
    for (let start = fromIndex; start <= source.length - target.length; start += 1) {
        if (target.every((char, index) => source[start + index] === char)) return start;
    }
    return -1;
}

function formatTime(value: number) {
    const total = Math.max(0, Math.round(value));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
