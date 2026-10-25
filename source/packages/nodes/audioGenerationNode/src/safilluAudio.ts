type Model = { providerId: string; modelId: string };

export function safilluAudioMode(model: Model | undefined): "voiceDesign" | "bgm" | undefined {
  if (model?.providerId !== "safillu") return;
  if (model.modelId === "Qwen3-TTS-VoiceDesign") return "voiceDesign";
  if (model.modelId === "YuE2-BGM") return "bgm";
}

export function safilluAudioParameters(mode: "voiceDesign" | "bgm" | undefined, data: {
  voicePrompt: string; speed: number; duration: number; language: string; sampleRate: number; format: string;
}) {
  if (mode === "voiceDesign") return { voicePrompt: data.voicePrompt, speed: data.speed };
  if (mode === "bgm") return { duration: data.duration };
  return { language: data.language, sampleRate: data.sampleRate, format: data.format };
}
