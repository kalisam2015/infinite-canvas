import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

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

const textSize = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
const configSize = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
const gap = 96;

export function parseVideoStoryboardResponse(value: unknown, durationMs?: number) {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    let parsed: unknown = value;
    if (typeof value === "string") {
        const json = extractJson(value);
        try {
            parsed = JSON.parse(json);
        } catch {
            throw new Error(`视频分析结果不是有效 JSON：${value.slice(0, 500)}`);
        }
    }
    return { ...normalizeVideoStoryboard(parsed, durationMs), rawResponse: raw };
}

export function normalizeVideoStoryboard(value: unknown, durationMs?: number): VideoStoryboard {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("视频分析结果必须是对象");
    const source = value as Record<string, unknown>;
    const shots = Array.isArray(source.shots) ? source.shots : [];
    if (!shots.length) throw new Error("视频分析结果缺少 shots 镜头列表");
    const normalized = shots
        .map((shot) => normalizeShot(shot, durationMs))
        .filter((shot): shot is VideoStoryboardShot => Boolean(shot))
        .sort((a, b) => a.startMs - b.startMs);
    if (!normalized.length) throw new Error("视频分析结果没有有效镜头");
    return {
        summary: text(source.summary),
        style: text(source.style),
        originalCopy: text(source.originalCopy || source.copy),
        rewrittenCopy: text(source.rewrittenCopy),
        titles: stringArray(source.titles || source.title),
        hashtags: stringArray(source.hashtags || source.topics),
        shots: mergeShortShots(splitLongShots(normalized)),
    };
}

export function storyboardShotSeconds(shot: VideoStoryboardShot) {
    return String(Math.max(2, Math.min(15, Math.round((shot.endMs - shot.startMs) / 1000))));
}

export function buildVideoStoryboardGraph({ source, storyboard, config }: { source: CanvasNodeData; storyboard: VideoStoryboard; config: AiConfig }) {
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const x = source.position.x + source.width + gap;
    let y = source.position.y;
    const addText = (title: string, content: string, position: { x: number; y: number }) => {
        const node = createCanvasNode(CanvasNodeType.Text, { x: position.x + textSize.width / 2, y: position.y + textSize.height / 2 }, { content, prompt: content, status: "success", fontSize: 14 });
        nodes.push({ ...node, title });
        return node;
    };
    const addConfig = (title: string, metadata: NonNullable<CanvasNodeData["metadata"]>, position: { x: number; y: number }) => {
        const node = createCanvasNode(CanvasNodeType.Config, { x: position.x + configSize.width / 2, y: position.y + configSize.height / 2 }, metadata);
        nodes.push({ ...node, title });
        return node;
    };

    const overview = addText("视频概要与原文案", [storyboard.summary, storyboard.style, storyboard.originalCopy].filter(Boolean).join("\n\n"), { x, y });
    y += textSize.height + gap;
    const rewrite = addText("改写文案", storyboard.rewrittenCopy || storyboard.originalCopy, { x, y });
    connections.push({ id: nanoid(), fromNodeId: overview.id, toNodeId: rewrite.id });
    y += textSize.height + gap;
    const titles = addText("标题与话题", [...storyboard.titles, ...storyboard.hashtags].join("\n"), { x, y });
    connections.push({ id: nanoid(), fromNodeId: rewrite.id, toNodeId: titles.id });
    y += textSize.height + gap;

    const audioText = storyboard.shots.map((shot) => [shot.dialogue, shot.narration].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
    if (audioText) {
        const audioSource = addText("台词与旁白", audioText, { x, y });
        const audioConfig = addConfig("音频生成配置", { generationMode: "audio", model: config.audioModel, prompt: audioText, status: "idle" }, { x: x + textSize.width + gap, y });
        connections.push({ id: nanoid(), fromNodeId: audioSource.id, toNodeId: audioConfig.id });
        y += Math.max(textSize.height, configSize.height) + gap;
    }

    storyboard.shots.forEach((shot, index) => {
        const content = formatShot(shot);
        const textNode = addText(`分镜 ${String(index + 1).padStart(2, "0")}`, content, { x, y });
        const videoNode = addConfig(`视频配置 ${String(index + 1).padStart(2, "0")}`, {
            generationMode: "video",
            model: config.videoModel,
            seconds: storyboardShotSeconds(shot),
            size: typeof shot.videoParams.size === "string" ? shot.videoParams.size : config.size,
            vquality: typeof shot.videoParams.resolution === "string" ? shot.videoParams.resolution : config.vquality,
            generateAudio: typeof shot.videoParams.generateAudio === "string" ? shot.videoParams.generateAudio : config.videoGenerateAudio,
            watermark: typeof shot.videoParams.watermark === "string" ? shot.videoParams.watermark : config.videoWatermark,
            prompt: shot.generationPrompt,
            status: "idle",
        }, { x: x + textSize.width + gap, y });
        connections.push({ id: nanoid(), fromNodeId: textNode.id, toNodeId: videoNode.id });
        y += Math.max(textSize.height, configSize.height) + gap;
    });

    return { nodes, connections, selectedNodeId: nodes.at(-1)?.id };
}

function normalizeShot(value: unknown, durationMs?: number): VideoStoryboardShot | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const startMs = Math.max(0, number(source.startMs ?? source.start ?? 0));
    const endMs = Math.min(durationMs || Number.MAX_SAFE_INTEGER, Math.max(startMs, number(source.endMs ?? source.end ?? startMs + 2000)));
    if (endMs <= startMs) return null;
    return {
        startMs,
        endMs,
        visual: text(source.visual || source.scene),
        camera: text(source.camera),
        action: text(source.action),
        dialogue: text(source.dialogue),
        narration: text(source.narration),
        subtitle: text(source.subtitle),
        soundEffect: text(source.soundEffect || source.sfx),
        transition: text(source.transition),
        generationPrompt: text(source.generationPrompt || source.prompt || source.visual),
        videoParams: source.videoParams && typeof source.videoParams === "object" ? (source.videoParams as Record<string, unknown>) : {},
    };
}

function mergeShortShots(shots: VideoStoryboardShot[]) {
    const result: VideoStoryboardShot[] = [];
    shots.forEach((shot) => {
        if (shot.endMs - shot.startMs >= 2000 || !result.length) {
            result.push(shot);
            return;
        }
        const previous = result[result.length - 1];
        result[result.length - 1] = { ...previous, endMs: shot.endMs, visual: [previous.visual, shot.visual].filter(Boolean).join("\n"), action: [previous.action, shot.action].filter(Boolean).join("\n"), dialogue: [previous.dialogue, shot.dialogue].filter(Boolean).join("\n"), narration: [previous.narration, shot.narration].filter(Boolean).join("\n"), generationPrompt: [previous.generationPrompt, shot.generationPrompt].filter(Boolean).join("；") };
    });
    if (result.length > 1 && result[0].endMs - result[0].startMs < 2000) {
        const first = result.shift()!;
        const next = result[0];
        result[0] = { ...next, startMs: first.startMs, visual: [first.visual, next.visual].filter(Boolean).join("\n"), action: [first.action, next.action].filter(Boolean).join("\n"), dialogue: [first.dialogue, next.dialogue].filter(Boolean).join("\n"), narration: [first.narration, next.narration].filter(Boolean).join("\n"), generationPrompt: [first.generationPrompt, next.generationPrompt].filter(Boolean).join("；") };
    }
    return result;
}

function splitLongShots(shots: VideoStoryboardShot[]) {
    return shots.flatMap((shot) => {
        const duration = shot.endMs - shot.startMs;
        if (duration <= 15000) return [shot];
        const count = Math.ceil(duration / 15000);
        return Array.from({ length: count }, (_, index) => ({ ...shot, startMs: shot.startMs + (duration * index) / count, endMs: shot.startMs + (duration * (index + 1)) / count }));
    });
}

function formatShot(shot: VideoStoryboardShot) {
    return [`时间码：${formatTime(shot.startMs)} - ${formatTime(shot.endMs)}`, `画面：${shot.visual}`, `景别/运镜：${shot.camera}`, `人物动作：${shot.action}`, `台词/旁白：${[shot.dialogue, shot.narration].filter(Boolean).join("\n")}`, `字幕/音效：${[shot.subtitle, shot.soundEffect].filter(Boolean).join(" / ")}`, `转场：${shot.transition}`, `生成提示词：${shot.generationPrompt}`].join("\n");
}

function extractJson(value: string) {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return fenced.trim();
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    return start >= 0 && end > start ? value.slice(start, end + 1) : value;
}

function text(value: unknown) {
    return Array.isArray(value) ? value.filter(Boolean).join("\n") : typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.map(text).filter(Boolean) : value ? [text(value)] : [];
}

function number(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(value: number) {
    const total = Math.max(0, Math.round(value));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
