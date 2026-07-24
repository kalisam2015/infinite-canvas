import { getMediaBlob } from "@/services/file-storage";
import { runModelPlugin } from "@/services/api/model-plugin";
import { parseVideoStoryboardResponse } from "@/lib/canvas/video-storyboard";
import { resolveModelRequestConfig, resolveVideoAnalysisScript, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";

const ANALYSIS_PROMPT = `请完整分析上传的长视频，并只返回一个 JSON 对象，不要输出 Markdown 或解释。

返回字段：
summary：视频概要
style：整体视觉与音乐风格
originalCopy：原始文案、台词和旁白
rewrittenCopy：根据改写要求生成的新文案
titles：标题数组
hashtags：话题标签数组
shots：按时间排序的镜头数组

每个 shots 项必须包含：startMs、endMs、visual、camera、action、dialogue、narration、subtitle、soundEffect、transition、generationPrompt、videoParams。每个镜头控制在 2-15 秒，优先按真实转场、动作或台词段落拆分。
时间码使用毫秒。generationPrompt 必须能直接用于 AI 视频生成。videoParams 可包含 size、resolution、generateAudio、watermark。`;

export async function analyzeVideoStoryboard(config: AiConfig, node: CanvasNodeData, options?: { model?: string; rewriteInstruction?: string; signal?: AbortSignal }) {
    const model = options?.model || config.videoAnalysisModel;
    if (!model) throw new Error("请先配置视频理解模型");
    const script = resolveVideoAnalysisScript(config, model);
    if (!script) throw new Error("请先为视频理解模型配置调用脚本");
    const blob = await readVideoBlob(node);
    const requestConfig = resolveModelRequestConfig(config, model);
    const prompt = `${ANALYSIS_PROMPT}\n\n改写要求：${options?.rewriteInstruction?.trim() || "保留原意和镜头结构，整理为可编辑的中文制作脚本。"}`;
    const result = await runModelPlugin({
        capability: "video-analysis",
        script,
        config: requestConfig,
        prompt,
        videos: [
            {
                blob,
                name: node.title || "source-video.mp4",
                type: blob.type || node.metadata?.mimeType || "video/mp4",
                size: blob.size,
                width: node.metadata?.naturalWidth,
                height: node.metadata?.naturalHeight,
                durationMs: node.metadata?.durationMs,
            },
        ],
        params: { durationMs: node.metadata?.durationMs, outputLanguage: "zh-CN" },
        signal: options?.signal,
    });
    return parseVideoStoryboardResponse(result, node.metadata?.durationMs);
}

async function readVideoBlob(node: CanvasNodeData) {
    if (node.metadata?.storageKey) {
        const stored = await getMediaBlob(node.metadata.storageKey);
        if (stored) return stored;
    }
    if (node.metadata?.content) {
        try {
            const response = await fetch(node.metadata.content);
            if (response.ok) return await response.blob();
        } catch {
            // Fall through to the actionable error below.
        }
    }
    throw new Error("无法读取视频文件，请重新上传后再试");
}
