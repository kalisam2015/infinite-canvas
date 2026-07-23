import { Alert, Button, Input, Modal } from "antd";
import { FileSearch } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";

export function CanvasVideoStoryboardDialog({ open, node, config, model, rewriteInstruction, loading, error, onModelChange, onRewriteChange, onSubmit, onCancel, onOpenConfig }: { open: boolean; node: CanvasNodeData | null; config: AiConfig; model: string; rewriteInstruction: string; loading: boolean; error: string; onModelChange: (value: string) => void; onRewriteChange: (value: string) => void; onSubmit: () => void; onCancel: () => void; onOpenConfig: () => void }) {
    return (
        <Modal
            open={open}
            title={null}
            width={620}
            centered
            destroyOnHidden
            onCancel={onCancel}
            footer={null}
        >
            <div className="flex items-start gap-3 border-b border-border pb-4">
                <FileSearch className="mt-0.5 size-5 text-foreground" />
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">反推视频分镜</h2>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{node?.title || "视频"} · {formatDuration(node?.metadata?.durationMs)}</p>
                </div>
            </div>

            <div className="space-y-5 py-5">
                <section>
                    <div className="mb-2 text-sm font-medium text-foreground">视频理解模型</div>
                    <ModelPicker config={config} value={model} onChange={onModelChange} capability="video-analysis" fullWidth placeholder="选择视频理解模型" onMissingConfig={onOpenConfig} />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">模型脚本负责上传整段视频并返回结构化 JSON。长视频不会作为后续生成的参考视频。</p>
                </section>

                <section>
                    <div className="mb-2 text-sm font-medium text-foreground">改写要求</div>
                    <Input.TextArea value={rewriteInstruction} onChange={(event) => onRewriteChange(event.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} placeholder="例如：保留镜头结构，将文案改成面向企业客户的科技产品介绍。" disabled={loading} />
                </section>

                {error ? <Alert type="error" showIcon message="反推失败" description={error} /> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button onClick={onCancel} disabled={loading}>取消</Button>
                <Button type="primary" icon={<FileSearch className="size-4" />} loading={loading} disabled={!model} onClick={onSubmit}>开始反推</Button>
            </div>
        </Modal>
    );
}

function formatDuration(durationMs?: number) {
    if (!durationMs) return "未知时长";
    const seconds = Math.round(durationMs / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
