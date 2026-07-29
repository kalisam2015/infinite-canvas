import { Alert, Button, Input, Modal, Switch } from "antd";
import { FileSearch } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { LocalMediaServiceConfig } from "@/services/local-video-compose";

export function CanvasVideoStoryboardDialog({ open, node, config, model, rewriteInstruction, asrEnabled, localServiceConfig, deepgramApiKey, loading, error, onModelChange, onRewriteChange, onAsrEnabledChange, onLocalServiceConfigChange, onDeepgramApiKeyChange, onSubmit, onCancel, onOpenConfig }: { open: boolean; node: CanvasNodeData | null; config: AiConfig; model: string; rewriteInstruction: string; asrEnabled: boolean; localServiceConfig: LocalMediaServiceConfig; deepgramApiKey: string; loading: boolean; error: string; onModelChange: (value: string) => void; onRewriteChange: (value: string) => void; onAsrEnabledChange: (value: boolean) => void; onLocalServiceConfigChange: (value: LocalMediaServiceConfig) => void; onDeepgramApiKeyChange: (value: string) => void; onSubmit: () => void; onCancel: () => void; onOpenConfig: () => void }) {
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

                <section className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm font-medium text-foreground">Deepgram 原片口播校准</div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">本地服务提取音轨并返回字词时间戳，失败时仍保留视频模型估算。</p>
                        </div>
                        <Switch checked={asrEnabled} disabled={loading} onChange={onAsrEnabledChange} />
                    </div>
                    {asrEnabled ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Input value={localServiceConfig.url} disabled={loading} onChange={(event) => onLocalServiceConfigChange({ ...localServiceConfig, url: event.target.value })} placeholder="http://127.0.0.1:17372" />
                            <Input.Password value={localServiceConfig.token} disabled={loading} onChange={(event) => onLocalServiceConfigChange({ ...localServiceConfig, token: event.target.value })} placeholder="本地服务 Token" />
                            <Input.Password className="col-span-2" value={deepgramApiKey} disabled={loading} onChange={(event) => onDeepgramApiKeyChange(event.target.value)} placeholder="Deepgram API Key（本机已配置时可留空）" />
                        </div>
                    ) : null}
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
