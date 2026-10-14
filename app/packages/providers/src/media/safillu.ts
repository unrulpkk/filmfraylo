const rules = [
  { type: "input", field: "apiKey" as const, title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
  { type: "input", field: "baseUrl" as const, title: "NewAPI 地址", value: "https://api.safillu.com" },
];
type Context = ProviderContext<ProviderConfig<typeof rules>>;
type Task = { task_id?: string; status?: string; data?: unknown; audio_url?: string; format?: string; error?: unknown };

function connection(context: Context) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("请填写 Safillu NewAPI 的 API Key");
  const baseUrl = (context.config.baseUrl?.trim() || "https://api.safillu.com").replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = new URL(baseUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("NewAPI 地址无效");
  return { baseUrl, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } };
}

async function api(context: Context, path: string, signal: AbortSignal, body?: unknown): Promise<Task> {
  const { baseUrl, headers } = connection(context);
  const response = await context.tool.fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST", headers, signal, redirect: "error",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`NewAPI 请求失败（HTTP ${response.status}）：${context.tool.errorMessage(await response.text())}`);
  const result = await response.json() as Task;
  if (result.error && !result.status) throw new Error(context.tool.errorMessage(result.error) || "NewAPI 请求失败");
  return result;
}

function wait(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 5000);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function generate(context: Context, kind: "image" | "voice-design" | "bgm" | "video", body: unknown) {
  // ACT: 任务只提交一次；超时或停止仅结束本地等待，不自动重新扣费提交。
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const root = kind === "video" ? "/tfrouter-frames/v1/video" : kind === "image" ? "/runninghub-image/v1" : "/runninghub-audio/v1";
  const submitted = await api(context, `${root}/${kind === "video" ? "generateVideo" : kind === "image" ? "generations" : kind}`, signal, body);
  const taskId = kind === "video" ? submitted.data : submitted.task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("NewAPI 未返回任务 ID，请检查平台任务记录后再提交");
  try {
    while (true) {
      const task = await api(context, kind === "video" ? `${root}/getVideoStatus` : `${root}/tasks/${encodeURIComponent(taskId)}`, signal,
        kind === "video" ? { taskICode: taskId } : undefined);
      if (task.status === "success" || task.status === "completed") return task;
      if (["failed", "cancelled", "incomplete"].includes(task.status ?? "")) throw new Error(context.tool.errorMessage(task.error ?? task) || "生成失败");
      if (!["pending", "queued", "in_progress"].includes(task.status ?? "")) throw new Error("NewAPI 返回未知任务状态");
      await wait(signal);
    }
  } catch (error) {
    throw new Error(`任务 ${taskId}：${error instanceof Error ? error.message : String(error)}。停止等待不会取消线上任务，可在平台查询。`);
  }
}

function text(value: string | undefined, label: string, max: number) {
  const result = value?.trim();
  if (!result || result.length > max) throw new Error(`${label}须为 1–${max} 个字符`);
  return result;
}

function asset(url: unknown, mediaType: "image" | "video" | "audio"): MediaAsset {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("NewAPI 未返回有效的媒体地址");
  return { type: "url", url, mediaType };
}

function base64(input: MediaInput, type: "image" | "video" | "audio") {
  if (input.type === "url") throw new Error("H3 base64 接口需要本地参考素材，请先将素材导入画布");
  const allowed = { image: ["image/png", "image/jpeg", "image/webp"], audio: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac"], video: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"] };
  if (!allowed[type].includes(input.mimeType)) throw new Error(`H3 不支持参考素材格式 ${input.mimeType}`);
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data.replace(/^data:[^;]+;base64,/, "");
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) throw new Error("参考素材 Base64 无效");
  const bytes = Buffer.byteLength(data, "base64");
  if (bytes > 30 * 1024 * 1024) throw new Error("H3 单个参考素材不能超过 30 MiB");
  return { url: `data:${input.mimeType};base64,${data}`, bytes };
}

export default {
  id: "safillu",
  label: "Safillu NewAPI",
  icon: "",
  version: "1.0.0",
  readme: "Z-Image 生图、MiniMax H3 Base64 视频、Qwen3 音色设计和 YuE2 BGM。音色设计输出为语音文件，BGM 时长是最大时长。停止生成仅停止本地等待，线上任务仍可能完成。",
  rules,
  models: [
    { id: "Z-Image-Base", label: "Z-Image Base", type: "image", mode: ["text"], imageSizes: ["1K", "2K"], imageRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"] },
    { id: "MiniMax-H3", label: "MiniMax H3 · Base64", type: "video", mode: ["text", "startEndRequired", ["imageReference:5", "audioReference:3", "videoReference:1"]], audio: true,
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["768P", "1080P", "2K"] }] },
    { id: "Qwen3-TTS-VoiceDesign", label: "Qwen3 · 音色设计", type: "audio" },
    { id: "YuE2-BGM", label: "YuE2 · BGM 背景音乐", type: "audio" },
  ] satisfies ProviderModel[],
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {
    if (request.model !== "Z-Image-Base") throw new Error("请选择 Z-Image-Base 模型");
    if (request.images?.length || request.mask) throw new Error("Z-Image-Base 仅支持文生图，请移除参考图片");
    const result = await generate(this, "image", { model: request.model, prompt: text(request.prompt, "生图提示词", 12000), ratio: request.ratio ?? "1:1", resolution: request.size ?? "1K", n: request.n ?? 1 });
    if (!Array.isArray(result.data) || !result.data.length) throw new Error("NewAPI 未返回图片");
    return result.data.map(item => asset(item?.url, "image"));
  },
  async generateAudio(request: AudioRequest): Promise<MediaAsset[]> {
    if (request.images?.length || request.audios?.length) throw new Error("音色设计和 BGM 使用文字描述，不支持参考图片或音频");
    const content = text(request.text ?? request.prompt, "音频文本", 4000);
    let result: Task;
    if (request.model === "Qwen3-TTS-VoiceDesign") {
      const speed = request.speed ?? 0.9;
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error("语速须在 0.5–2 之间");
      result = await generate(this, "voice-design", { model: request.model, text: content, voice_prompt: text(request.prompt, "音色描述", 4000), speed });
    } else if (request.model === "YuE2-BGM") {
      const duration = request.other?.duration ?? 10;
      if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 120) throw new Error("BGM 时长须为 1–120 秒整数");
      result = await generate(this, "bgm", { model: request.model, prompt: content, duration });
    } else { throw new Error("请选择音色设计或 BGM 模型"); }
    return [asset(result.audio_url, "audio")];
  },
  async generateVideo(request: VideoRequest): Promise<MediaAsset[]> {
    if (request.model !== "MiniMax-H3") throw new Error("请选择 MiniMax-H3 模型");
    const images = request.images ?? [], audios = request.audios ?? [], videos = request.videos ?? [];
    const frames = !!(request.firstFrame || request.lastFrame || request.mode === "startEndRequired");
    if (frames && (!request.firstFrame || !request.lastFrame || images.length || audios.length || videos.length)) throw new Error("H3 首尾帧须同时提供首帧和尾帧，且不能混入参考素材");
    if (images.length > 5 || audios.length > 3 || videos.length > 1) throw new Error("H3 最多支持 5 张图片、3 段音频和 1 个视频");
    const duration = request.duration ?? 5, resolution = (request.resolution ?? "768P").toLowerCase();
    if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error("H3 时长须为 4–15 秒整数");
    if (!(frames ? ["768p", "2k"] : ["768p", "1080p", "2k"]).includes(resolution)) throw new Error("H3 分辨率无效；首尾帧仅支持 768P 和 2K");
    if (request.generateAudio === false) throw new Error("H3 不支持关闭音频");
    let total = 0;
    const reference = (input: MediaInput, type: "image" | "audio" | "video", role: string) => {
      const media = base64(input, type);
      total += media.bytes;
      return { role, type: `${type}_url`, [`${type}_url`]: { url: media.url } };
    };
    const references = frames ? [reference(request.firstFrame!, "image", "first_frame"), reference(request.lastFrame!, "image", "last_frame")] : [
      ...images.map(item => reference(item, "image", "reference_image")), ...audios.map(item => reference(item, "audio", "reference_audio")), ...videos.map(item => reference(item, "video", "reference_video")),
    ];
    if (total > 64 * 1024 * 1024) throw new Error("H3 参考素材合计不能超过 64 MiB");
    const result = await generate(this, "video", { model: request.model, prompt: text(request.prompt, "视频提示词", 12000), duration, resolution, metadata: { ratio: frames ? "adaptive" : request.ratio ?? "16:9", references } });
    return [asset((result.data as { data?: unknown } | undefined)?.data, "video")];
  },
} satisfies ProviderDefinition<typeof rules>;
