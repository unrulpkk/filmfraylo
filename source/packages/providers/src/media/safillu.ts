const rules = [
  { type: "input", field: "apiKey" as const, title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
  { type: "input", field: "baseUrl" as const, title: "NewAPI 地址", value: "https://api.safillu.com" },
];
type Context = ProviderContext<ProviderConfig<typeof rules>>;
type Task = { task_id?: string; status?: string; data?: unknown; audio_url?: string; format?: string; error?: unknown };

function baseAddress(context: Context) {
  const baseUrl = (context.config.baseUrl?.trim() || "https://api.safillu.com").replace(/\/+$/, "").replace(/\/v1$/, "");
  const url = new URL(baseUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("NewAPI 地址无效");
  return baseUrl;
}

function connection(context: Context) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("调用 Safillu 模型需要 API Key，请到 https://api.safillu.com/ 申请，并在设置 → 媒体模型 → Safillu AI 中填写");
  return { baseUrl: baseAddress(context), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } };
}

async function api(context: Context, path: string, signal: AbortSignal, body?: unknown, query = false): Promise<Task> {
  const { baseUrl, headers } = connection(context);
  for (let attempt = 0; ; attempt++) {
    const response = await context.tool.fetch(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      signal,
      redirect: "error",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (query && response.status === 429 && attempt < 4) {
      const retryAfter = response.headers.get("retry-after");
      const retryMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
      await response.body?.cancel();
      await wait(signal, Math.min(60000, Math.max(5000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0)));
      continue;
    }
    if (!response.ok) throw new Error(`NewAPI 请求失败（HTTP ${response.status}）：${context.tool.errorMessage(await response.text())}`);
    const result = (await response.json()) as Task;
    if (result.error && !result.status) throw new Error(context.tool.errorMessage(result.error) || "NewAPI 请求失败");
    return result;
  }
}

function wait(signal: AbortSignal, milliseconds = 5000) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function generate(
  context: Context,
  kind: "image" | "qwenImage" | "edit" | "voice-design" | "bgm" | "video",
  body: { model: string } & Record<string, unknown>
) {
  // ACT: 任务只提交一次；超时或停止仅结束本地等待，不自动重新扣费提交。
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const root =
    kind === "video"
      ? body.model === "MiniMax-H3-SelfLift" ? "/h3-selflift/v1/video" : "/tfrouter-frames/v1/video"
      : kind === "image"
      ? "/image/v1"
      : kind === "qwenImage"
      ? "/qwen-image/v1"
      : kind === "edit"
      ? "/image-edit/v1"
      : "/audio/v1";
  let submitted: Task;
  try {
    submitted = await api(
      context,
      `${root}/${kind === "video" ? "generateVideo" : kind === "image" || kind === "qwenImage" ? "generations" : kind === "edit" ? "edits" : kind}`,
      signal,
      body
    );
  } catch (error) {
    throw new Error(`提交未取得任务回执：${context.tool.errorMessage(error) || "连接中断"}。请先检查平台任务记录，确认后再提交，避免重复扣费。`);
  }
  const taskId = kind === "video" ? submitted.data : submitted.task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("NewAPI 未返回任务 ID，请检查平台任务记录后再提交");
  const queryPath = kind === "video" ? `${root}/getVideoStatus` : `${root}/tasks/${encodeURIComponent(taskId)}`;
  const receipt = {
    taskId,
    model: body.model,
    baseUrl: connection(context).baseUrl,
    queryPath,
    queryMethod: kind === "video" ? ("POST" as const) : ("GET" as const),
  };
  try {
    await context.tool.recordTask?.({ ...receipt, status: "pending" });
    while (true) {
      const task = await api(context, queryPath, signal, kind === "video" ? { taskICode: taskId } : undefined, true);
      if (task.status === "success" || task.status === "completed") {
        await context.tool.recordTask?.({ ...receipt, status: "success" });
        return { ...task, task_id: taskId };
      }
      if (["failed", "cancelled", "incomplete"].includes(task.status ?? "")) {
        await context.tool.recordTask?.({ ...receipt, status: "failed" });
        throw new Error(context.tool.errorMessage(task.error ?? task) || "生成失败");
      }
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

function seed(request: MediaRequest) {
  const value = request.other?.seed;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("seed 须为非负安全整数，支持 0");
  return value;
}

async function asset(context: Context, value: unknown, mediaType: "image" | "video" | "audio", taskId: string, format?: string): Promise<MediaAsset> {
  try {
    const { baseUrl, headers } = connection(context);
    if (typeof value !== "string") throw new Error("未返回有效的媒体地址");
    const url = new URL(value, `${baseUrl}/`);
    if (url.origin !== new URL(baseUrl).origin || url.username || url.password) throw new Error("成品地址不属于当前 safillu 站点");
    const signal = AbortSignal.any([AbortSignal.timeout(120000), ...(context.signal ? [context.signal] : [])]);
    // 成品需要原 API Key；只在本站下载，禁止重定向携带凭据到其他站点。
    const response = await context.tool.fetch(url.href, { headers: { Authorization: headers.Authorization }, signal, redirect: "error" });
    if (!response.ok) throw new Error(`成品下载失败（HTTP ${response.status}）`);
    const formats: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      flac: "audio/flac",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      aac: "audio/aac",
      mp4: "video/mp4",
    };
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const mimeType = !contentType || contentType === "application/octet-stream" ? formats[format ?? ""] : contentType;
    const maxBytes = 100 * 1024 * 1024;
    if (!mimeType?.startsWith(`${mediaType}/`) || Number(response.headers.get("content-length")) > maxBytes || !response.body) {
      await response.body?.cancel();
      throw new Error("成品类型不匹配或超过 100 MiB");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("成品超过 100 MiB");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    if (!size) throw new Error("成品文件为空");
    return { type: "binary", data: new Uint8Array(Buffer.concat(chunks)), mimeType, mediaType };
  } catch (error) {
    throw new Error(
      `任务 ${taskId} 已生成，但下载失败：${error instanceof Error ? error.message : "未知错误"}。请从平台下载已有成品，不要重新提交生成。`
    );
  }
}

function base64(input: MediaInput, type: "image" | "video" | "audio") {
  if (input.type === "url") throw new Error("请先将参考素材导入画布");
  const allowed = {
    image: ["image/png", "image/jpeg", "image/webp"],
    audio: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac"],
    video: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"],
  };
  if (!allowed[type].includes(input.mimeType)) throw new Error(`不支持参考素材格式 ${input.mimeType}`);
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data.replace(/^data:[^;]+;base64,/, "");
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) throw new Error("参考素材 Base64 无效");
  const bytes = Buffer.byteLength(data, "base64");
  if (bytes > 30 * 1024 * 1024) throw new Error("单个参考素材不能超过 30 MiB");
  return { url: `data:${input.mimeType};base64,${data}`, bytes };
}

type PriceModel = { model_name: string; billing_mode?: string; billing_expr?: string; quota_type?: number; model_price?: number;
  billing_usage_schema?: Record<string, { enum?: string[] }>; billing_plugin_variants?: (PriceModel & { plugin_key: string })[] };
const priceCatalogs = new Map<string, { expires: number; value: Promise<PriceModel[]> }>();

async function priceCatalog(context: Context) {
  const baseUrl = baseAddress(context);
  const previous = priceCatalogs.get(baseUrl);
  if (previous && previous.expires > Date.now()) return previous.value;
  if (priceCatalogs.size >= 8) priceCatalogs.delete(priceCatalogs.keys().next().value!);
  const value = (async () => {
    const response = await context.tool.fetch(`${baseUrl}/api/pricing`, { headers: { Accept: "application/json" }, redirect: "error", signal: context.signal });
    if (!response.ok) throw new Error(`Safillu 价格查询失败（HTTP ${response.status}）`);
    const result = await response.json() as { success?: boolean; data?: PriceModel[] };
    if (result.success !== true || !Array.isArray(result.data)) throw new Error("Safillu 价格数据格式无效");
    return result.data;
  })();
  const entry = { expires: Date.now() + 30000, value };
  priceCatalogs.set(baseUrl, entry);
  try { return await value; }
  catch (error) { if (priceCatalogs.get(baseUrl) === entry) priceCatalogs.delete(baseUrl); throw error; }
}

// ACT: 只解释媒体报价所需的数值、u、tier、四则运算和条件表达式，不执行线上脚本。
// 遇到新的计费函数或未知用量字段返回“无法估价”，避免把不支持的规则算成零费用。
function priceExpression(expression: string, usage: Record<string, string | number>): number {
  if (expression.length > 4000) throw new Error("计费表达式过长");
  const tokens = expression.match(/"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-zA-Z_][a-zA-Z_0-9]*|==|!=|[()+*/?:,\-]/g) ?? [];
  if (tokens.length > 512 || tokens.join("") !== expression.replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "")) throw new Error("不支持的计费语法");
  let position = 0, depth = 0;
  type Value = number | string | boolean;
  const number = (value: Value) => { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("计费用量无效"); return value; };
  const expect = (token: string) => { if (tokens[position++] !== token) throw new Error("计费表达式无效"); };
  function atom(): Value {
    if (++depth > 24) throw new Error("计费表达式嵌套过深");
    try {
      const token = tokens[position++];
      if (!token) throw new Error("计费表达式不完整");
      if (token === "(") { const value = conditional(); expect(")"); return value; }
      if (token === "-") return -number(atom());
      if (token.startsWith('"')) return JSON.parse(token);
      if (/^\d/.test(token)) return number(Number(token));
      if (token !== "u" && token !== "tier") throw new Error("不支持的计费函数");
      expect("(");
      const key = conditional();
      if (typeof key !== "string") throw new Error("计费字段无效");
      if (token === "tier") { expect(","); const value = number(conditional()); expect(")"); return value; }
      expect(")");
      if (!Object.hasOwn(usage, key)) throw new Error("未知计费用量");
      return usage[key];
    } finally { depth--; }
  }
  function product(): Value {
    let left = atom();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const op = tokens[position++], right = number(atom());
      left = op === "*" ? number(left) * right : number(left) / right;
    }
    return left;
  }
  function sum(): Value {
    let left = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const op = tokens[position++], right = number(product());
      left = op === "+" ? number(left) + right : number(left) - right;
    }
    return left;
  }
  function conditional(): Value {
    if (++depth > 24) throw new Error("计费表达式嵌套过深");
    try {
      let value = sum();
      if (tokens[position] === "==" || tokens[position] === "!=") {
        const op = tokens[position++], right = sum(); value = op === "==" ? value === right : value !== right;
      }
      if (tokens[position] !== "?") return value;
      if (typeof value !== "boolean") throw new Error("计费条件无效");
      position++; const yes = conditional(); expect(":"); const no = conditional(); return value ? yes : no;
    } finally { depth--; }
  }
  const amount = number(conditional());
  if (position !== tokens.length || amount < 0) throw new Error("计费结果无效");
  return amount;
}

export default {
  id: "safillu",
  label: "Safillu AI",
  icon: "",
  version: "1.5.0",
  modelsUrl: "https://api.safillu.com/v1/models",
  readme:
    "支持 Z-Image 与 Qwen 文生图、Qwen 图片编辑、MiniMax H3 视频、Qwen3 音色设计和 YuE2 BGM。Qwen 编辑至少提供一张原图，图片数量与编辑参数由当前站点接口校验；模型名称与能力可从线上同步。H3 最多支持 9 图、3 音频、1 视频；首尾帧仅支持 768P/2K。成品下载使用同一 API Key。停止生成仅停止本地等待，线上任务仍可能完成。",
  rules,
  async getPrice(request: ProviderPriceRequest): Promise<ProviderPrice | null> {
    const model = (await priceCatalog(this)).find(item => item.model_name === request.model);
    if (!model) return null;
    // 此适配器的 H3 提交走 tfrouter-frames，使用线上同一通道的报价，不能取其它 H3 通道的默认价。
    const pricing = request.model === "MiniMax-H3"
      ? model.billing_plugin_variants?.find(item => item.plugin_key === "tfrouter-h3-frames") ?? model : model;
    const resolution = request.type === "video" ? (request.resolution ?? "768P").toUpperCase() : "";
    const resolutions = pricing.billing_usage_schema?.resolution?.enum;
    if (resolutions && !resolutions.includes(resolution)) return null;
    if (request.type === "image" && (!Number.isInteger(request.n ?? 1) || (request.n ?? 1) < 1 || (request.n ?? 1) > 4)) return null;
    if (request.type === "video" && (!Number.isFinite(request.duration ?? 5) || (request.duration ?? 5) <= 0)) return null;
    try {
      const amount = pricing.billing_mode === "tiered_expr" && typeof pricing.billing_expr === "string"
        ? priceExpression(pricing.billing_expr, { calls: 1, ...(request.type === "video" ? { resolution, seconds: request.duration ?? 5 } : {}), ...(request.type === "image" ? { image_count: request.n ?? 1 } : {}) })
        : pricing.quota_type === 1 && typeof pricing.model_price === "number" ? pricing.model_price : undefined;
      if (amount === undefined || !Number.isFinite(amount) || amount < 0) return null;
      return { price: `$${Number(amount.toFixed(6))} USD`, tips: "线上基础预估价（单次调用）；账号分组倍率另计，以平台实际扣费为准。" };
    } catch { return null; }
  },
  models: [
    {
      id: "Z-Image-Base",
      label: "Z-Image Base",
      type: "image",
      mode: ["text"],
      imageSizes: ["1K", "2K"],
      imageRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
    },
    {
      id: "Qwen-Image-2.1",
      label: "Qwen Image 2.1",
      type: "image",
      mode: ["text"],
      imageSizes: ["1K", "2K"],
      imageRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
    },
    {
      id: "Qwen-Image-2.1-Edit",
      label: "Qwen Image 2.1 · 图片编辑",
      type: "image",
      mode: ["singleImage", "multiReference"],
      imageSizes: ["1K", "2K"],
      imageRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
    },
    {
      id: "MiniMax-H3",
      label: "MiniMax H3",
      type: "video",
      mode: ["text", "singleImage", "startEndRequired", ["imageReference:9", "audioReference:3", "videoReference:1"]],
      audio: true,
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480P", "768P", "1080P", "2K"] }],
    },
    {
      id: "MiniMax-H3-SelfLift",
      label: "MiniMax H3 · SelfLift",
      type: "video",
      mode: ["text", "singleImage", "startEndRequired", ["imageReference:9", "audioReference:3", "videoReference:1"]],
      audio: true,
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480P", "768P", "1080P", "2K"] }],
    },
    { id: "Qwen3-TTS-VoiceDesign", label: "Qwen3 · 音色设计", type: "audio" },
    { id: "YuE2-BGM", label: "YuE2 · BGM 背景音乐", type: "audio" },
  ] satisfies ProviderModel[],
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {
    if (request.mask) throw new Error("当前图片接口不支持蒙版，请使用参考图和编辑提示词");
    const body = {
      model: request.model,
      prompt: text(request.prompt, "图片提示词", 12000),
      ratio: text(request.ratio ?? "1:1", "图片比例", 64),
      resolution: text(request.size ?? "1K", "图片分辨率", 64),
      seed: seed(request),
    };
    const negativePrompt = request.other?.negativePrompt;
    if (negativePrompt !== undefined && (typeof negativePrompt !== "string" || negativePrompt.length > 12000))
      throw new Error("负向提示词须为不超过 12000 字符的字符串");
    if (request.n !== undefined && (!Number.isInteger(request.n) || request.n < 1 || request.n > 4)) throw new Error("生图数量须为 1–4 的整数");
    let result: Task & { task_id: string };
    if (request.model === "Qwen-Image-2.1-Edit") {
      if (!request.images?.length) throw new Error("Qwen 图片编辑至少需要一张原图");
      const images = request.images.map((input) => base64(input, "image"));
      if (images.reduce((total, image) => total + image.bytes, 0) > 64 * 1024 * 1024) throw new Error("参考图片合计不能超过 64 MiB");
      // ACT: 同一编辑协议的业务参数由线上接口校验，客户端不固定参考图数量或输出规格。
      result = await generate(this, "edit", { ...body, images: images.map((image) => image.url), n: request.n, negative_prompt: negativePrompt });
    } else if (request.model === "Z-Image-Base" || request.model === "Qwen-Image-2.1") {
      body.resolution = body.resolution.toUpperCase();
      if (!["1K", "2K"].includes(body.resolution) || !["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"].includes(body.ratio))
        throw new Error("图片分辨率或比例无效");
      if (request.images?.length) throw new Error("该模型仅支持文生图，请移除参考图片");
      const n = request.n ?? 1;
      result = await generate(this, request.model === "Z-Image-Base" ? "image" : "qwenImage", { ...body, n, negative_prompt: negativePrompt });
    } else {
      throw new Error("该图片模型尚未接入，请更新 safillu 适配器");
    }
    if (!Array.isArray(result.data) || !result.data.length) throw new Error("NewAPI 未返回图片");
    return Promise.all(result.data.map((item) => asset(this, item?.url, "image", result.task_id, item?.format)));
  },
  async generateAudio(request: AudioRequest): Promise<MediaAsset[]> {
    if (request.images?.length || request.audios?.length) throw new Error("音色设计和 BGM 使用文字描述，不支持参考图片或音频");
    const content = text(request.text ?? request.prompt, "音频文本", 4000);
    let result: Task & { task_id: string };
    if (request.model === "Qwen3-TTS-VoiceDesign") {
      const speed = request.speed ?? 0.9;
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error("语速须在 0.5–2 之间");
      result = await generate(this, "voice-design", {
        model: request.model,
        text: content,
        voice_prompt: text(request.prompt, "音色描述", 4000),
        speed,
        seed: seed(request),
      });
    } else if (request.model === "YuE2-BGM") {
      const duration = request.other?.duration ?? 10;
      if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 120) throw new Error("BGM 时长须为 1–120 秒整数");
      result = await generate(this, "bgm", { model: request.model, prompt: content, duration, seed: seed(request) });
    } else {
      throw new Error("请选择音色设计或 BGM 模型");
    }
    return [await asset(this, result.audio_url, "audio", result.task_id, result.format)];
  },
  async generateVideo(request: VideoRequest): Promise<MediaAsset[]> {
    if (request.model !== "MiniMax-H3" && request.model !== "MiniMax-H3-SelfLift") throw new Error("当前视频模型尚未接入调用协议，请更新 safillu 适配器");
    const images = request.images ?? [],
      audios = request.audios ?? [],
      videos = request.videos ?? [];
    const frames = !!(request.firstFrame || request.lastFrame || request.mode === "startEndRequired");
    if (frames && (!request.firstFrame || !request.lastFrame || images.length || audios.length || videos.length))
      throw new Error("H3 首尾帧须同时提供首帧和尾帧，且不能混入参考素材");
    if (images.length > 9 || audios.length > 3 || videos.length > 1) throw new Error("H3 最多支持 9 张图片、3 段音频和 1 个视频");
    const duration = request.duration ?? 5,
      resolution = (request.resolution ?? "768P").toLowerCase();
    if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error("H3 时长须为 4–15 秒整数");
    // 参考模式的可选档位来自线上模型能力；这里只校验协议格式，避免新档位被旧名单拦截。
    if (!/^(?:[1-9]\d{2,4}p|[1-9]\d?k)$/.test(resolution)) throw new Error("H3 分辨率格式无效");
    if (frames && !["768p", "2k"].includes(resolution)) throw new Error("H3 首尾帧仅支持 768P 和 2K");
    if (request.generateAudio === false) throw new Error("H3 不支持关闭音频");
    let total = 0;
    const reference = (input: MediaInput, type: "image" | "audio" | "video", role: string) => {
      const media = base64(input, type);
      total += media.bytes;
      return { role, type: `${type}_url`, [`${type}_url`]: { url: media.url } };
    };
    const references = frames
      ? [reference(request.firstFrame!, "image", "first_frame"), reference(request.lastFrame!, "image", "last_frame")]
      : [
          ...images.map((item) => reference(item, "image", "reference_image")),
          ...audios.map((item) => reference(item, "audio", "reference_audio")),
          ...videos.map((item) => reference(item, "video", "reference_video")),
        ];
    if (total > 64 * 1024 * 1024) throw new Error("H3 参考素材合计不能超过 64 MiB");
    const ratio = request.ratio ?? (frames ? "adaptive" : "16:9");
    if (!["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"].includes(ratio) && !(frames && ratio === "adaptive"))
      throw new Error("H3 画面比例无效；仅首尾帧支持 adaptive");
    const result = await generate(this, "video", {
      model: request.model,
      prompt: text(request.prompt, "视频提示词", 12000),
      duration,
      metadata: { resolution, ratio, references, seed: seed(request), generate_audio: request.generateAudio },
    });
    const { baseUrl } = connection(this);
    return [await asset(this, `${baseUrl}/v1/tasks/${encodeURIComponent(result.task_id)}/artifacts/video/content`, "video", result.task_id, "mp4")];
  },
} satisfies ProviderDefinition<typeof rules>;
