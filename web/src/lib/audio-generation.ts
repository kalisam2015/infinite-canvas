const openAiAudioVoiceOptions = [
    { value: "alloy", label: "Alloy" },
    { value: "ash", label: "Ash" },
    { value: "ballad", label: "Ballad" },
    { value: "coral", label: "Coral" },
    { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" },
    { value: "nova", label: "Nova" },
    { value: "onyx", label: "Onyx" },
    { value: "sage", label: "Sage" },
    { value: "shimmer", label: "Shimmer" },
    { value: "verse", label: "Verse" },
    { value: "marin", label: "Marin" },
    { value: "cedar", label: "Cedar" },
];

const seedTtsAudioVoiceOptions = [
    { value: "zh_female_vv_uranus_bigtts", label: "vivi 2.0" },
    { value: "saturn_zh_female_cancan_tob", label: "知性灿灿" },
    { value: "saturn_zh_female_keainvsheng_tob", label: "可爱女生" },
    { value: "saturn_zh_female_tiaopigongzhu_tob", label: "调皮公主" },
    { value: "saturn_zh_male_shuanglangshaonian_tob", label: "爽朗少年" },
    { value: "saturn_zh_male_tiancaitongzhuo_tob", label: "天才同桌" },
    { value: "zh_female_xiaohe_uranus_bigtts", label: "小何" },
    { value: "zh_male_m191_uranus_bigtts", label: "云舟" },
    { value: "zh_male_taocheng_uranus_bigtts", label: "小天" },
    { value: "en_male_tim_uranus_bigtts", label: "Tim" },
];

export const audioVoiceOptions = [...openAiAudioVoiceOptions, ...seedTtsAudioVoiceOptions];

export function audioVoiceOptionsForModel(model: string) {
    return model.toLowerCase().includes("seed-tts") ? seedTtsAudioVoiceOptions : openAiAudioVoiceOptions;
}

export const audioFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "wav", label: "WAV" },
    { value: "opus", label: "Opus" },
    { value: "aac", label: "AAC" },
    { value: "flac", label: "FLAC" },
    { value: "pcm", label: "PCM" },
];

export function normalizeAudioVoiceValue(value: string, model = "") {
    const options = model ? audioVoiceOptionsForModel(model) : audioVoiceOptions;
    return options.some((item) => item.value === value) ? value : options[0].value;
}

export function normalizeAudioFormatValue(value: string) {
    return audioFormatOptions.some((item) => item.value === value) ? value : "mp3";
}

export function normalizeAudioSpeedValue(value: string) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return "1";
    return String(Math.max(0.25, Math.min(4, Number(speed.toFixed(2)))));
}

export function audioVoiceLabel(value: string, model = "") {
    const voice = normalizeAudioVoiceValue(value, model);
    return audioVoiceOptions.find((item) => item.value === voice)?.label || voice;
}

export function audioFormatLabel(value: string) {
    const format = normalizeAudioFormatValue(value);
    return audioFormatOptions.find((item) => item.value === format)?.label || format;
}

export function audioSpeedLabel(value: string) {
    return `${normalizeAudioSpeedValue(value)}x`;
}

export function audioMimeType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}
