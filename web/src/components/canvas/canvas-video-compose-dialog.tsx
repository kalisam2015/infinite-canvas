import { Alert, Button, Input, Modal, Progress } from "antd";
import { Film, Music2, Square } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { LocalMediaServiceConfig } from "@/services/local-video-compose";
import type { CanvasNodeData } from "@/types/canvas";

type Props = {
    open: boolean;
    videos: CanvasNodeData[];
    narration?: CanvasNodeData | null;
    config: LocalMediaServiceConfig;
    loading: boolean;
    progress: number;
    error: string;
    onConfigChange: (config: LocalMediaServiceConfig) => void;
    onSubmit: () => void;
    onCancel: () => void;
};

export function CanvasVideoComposeDialog({ open, videos, narration, config, loading, progress, error, onConfigChange, onSubmit, onCancel }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const wordCount = narration?.metadata?.audioTimeline?.words.length || 0;
    return (
        <Modal title={null} open={open} onCancel={loading ? undefined : onCancel} footer={null} width={620} centered destroyOnHidden closable={!loading}>
            <div className="space-y-5 pt-1" style={{ color: theme.node.text }}>
                <div className="flex items-center gap-3">
                    <Film className="size-5" />
                    <div>
                        <div className="text-base font-semibold">合并视频</div>
                        <div className="mt-0.5 text-xs opacity-50">{videos.length} 个片段 · 1080×1920 · 30fps · H.264 8Mbps · AAC 192kbps</div>
                    </div>
                </div>

                {narration ? (
                    <div className="flex items-center gap-3 border-y py-3" style={{ borderColor: theme.toolbar.border }}>
                        <Music2 className="size-4 shrink-0 opacity-55" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{narration.title || "统一旁白"}</div>
                            <div className="mt-0.5 text-xs opacity-50">{wordCount ? `优先使用 ${wordCount} 个字词时间戳，匹配失败时分析停顿` : "分析旁白停顿生成镜头时间轴"}，并替换所有片段原声</div>
                        </div>
                        {narration.metadata?.durationMs ? <span className="text-xs opacity-45">{formatDuration(narration.metadata.durationMs)}</span> : null}
                    </div>
                ) : null}

                <div>
                    <div className="mb-2 text-xs font-medium opacity-55">片段顺序</div>
                    <div className="max-h-48 divide-y overflow-y-auto border-y" style={{ borderColor: theme.toolbar.border }}>
                        {videos.map((video, index) => (
                            <div key={video.id} className="flex items-center gap-3 py-2.5">
                                <span className="w-6 shrink-0 text-right text-xs opacity-40">{String(index + 1).padStart(2, "0")}</span>
                                <Film className="size-4 shrink-0 opacity-45" />
                                <span className="min-w-0 flex-1 truncate text-sm">{video.title || `视频 ${index + 1}`}</span>
                                {video.metadata?.durationMs ? <span className="text-xs opacity-40">{formatDuration(video.metadata.durationMs)}</span> : null}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <label className="space-y-1.5">
                        <span className="text-xs font-medium opacity-55">Local URL</span>
                        <Input value={config.url} disabled={loading} onChange={(event) => onConfigChange({ ...config, url: event.target.value })} placeholder="http://127.0.0.1:17372" />
                    </label>
                    <label className="space-y-1.5">
                        <span className="text-xs font-medium opacity-55">Connect token</span>
                        <Input.Password value={config.token} disabled={loading} onChange={(event) => onConfigChange({ ...config, token: event.target.value })} />
                    </label>
                </div>

                {loading ? <Progress percent={Math.max(0, Math.min(100, progress))} status="active" strokeColor={theme.toolbar.activeText} /> : null}
                {error ? <Alert type="error" showIcon message={error} /> : null}

                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel} icon={loading ? <Square className="size-4" /> : undefined}>{loading ? "停止" : "取消"}</Button>
                    <Button type="primary" loading={loading} disabled={loading || videos.length < 2 || !config.token.trim()} onClick={onSubmit} icon={<Film className="size-4" />}>开始合并</Button>
                </div>
            </div>
        </Modal>
    );
}

function formatDuration(durationMs: number) {
    const total = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
