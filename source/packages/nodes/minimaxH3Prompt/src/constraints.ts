import type { H3Mode, PromptDiagnostic, PromptInput } from "./types";

// 官方 H3-Base 的边界；具体渠道还可进一步收紧，不把某个网关的限制当成官方通用限制。
export const h3Limits = { minDuration: 4, maxDuration: 15, images: 9, videos: 3, audios: 3, files: 12, minMediaDuration: 2, maxMediaDuration: 15 };

export function resolveMode(input: PromptInput): H3Mode {
  if (input.settings.mode !== "auto") return input.settings.mode;
  const refs = input.references;
  if (!refs.length) return "T2VA";
  if (refs.every(ref => ref.kind === "IMAGE")) {
    if (refs.length === 1 && refs[0]!.role === "firstFrame") return "I2VA";
    if (refs.length === 1 && refs[0]!.role === "lastFrame") return "L2VA";
    if (refs.length === 2 && refs.some(ref => ref.role === "firstFrame") && refs.some(ref => ref.role === "lastFrame")) return "FL2VA";
  }
  return "Ref2VA";
}

export function validateInput(input: PromptInput): PromptDiagnostic[] {
  const diagnostics: PromptDiagnostic[] = [];
  const error = (message: string) => diagnostics.push({ level: "error", message });
  const warning = (message: string) => diagnostics.push({ level: "warning", message });
  const { settings, references, target } = input;
  const source = [settings.brief, ...input.context].join("\n").trim();
  if (!source) error("请输入视频需求或连接有内容的文本节点");
  if (source.length > 160000) error("本次文本超过 160000 字符，请先拆分创作范围");
  if (!Number.isInteger(settings.duration) || settings.duration < h3Limits.minDuration || settings.duration > h3Limits.maxDuration) error("H3 时长须为 4–15 秒的整数");
  if (!/^[1-9]\d{0,3}:[1-9]\d{0,3}$/.test(settings.ratio)) error("画面比例须为正整数比例，例如 16:9");
  if (!["auto", "T2VA", "I2VA", "FL2VA", "L2VA", "Ref2VA"].includes(settings.mode)) error("未知的 H3 模式");
  const mode = resolveMode(input);
  const counts = { IMAGE: 0, VIDEO: 0, AUDIO: 0 };
  for (const ref of references) {
    counts[ref.kind]++;
    if (!ref.media?.url) error(`${ref.label} 尚无素材输出`);
    const validRoles = ref.kind === "IMAGE" ? ["reference", "firstFrame", "lastFrame", "identity", "environment", "motion", "camera"] : ref.kind === "VIDEO" ? ["reference", "identity", "environment", "motion", "camera", "reuse"] : ["voice", "reuse", "music", "soundscape", "reference"];
    if (!validRoles.includes(ref.role)) error(`${ref.label} 的用途与素材类型不兼容`);
    const validRetention = ref.kind === "AUDIO" ? ["fully_copy", "partially_copy", "reference", "weak_reference"] : ["fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference"];
    if (!validRetention.includes(ref.retention)) error(`${ref.label} 的保留标记与素材类型不兼容`);
    if (ref.kind !== "IMAGE" && ["firstFrame", "lastFrame"].includes(ref.role)) error(`${ref.label} 不是图片，不能用作首尾帧`);
    if (ref.kind !== "IMAGE" && (!Number.isFinite(ref.duration) || ref.duration! < 2 || ref.duration! > 15)) error(`${ref.label} 的时长须为 2–15 秒；请等待素材读取或手动填写真实时长`);
  }
  if (counts.IMAGE > h3Limits.images || counts.VIDEO > h3Limits.videos || counts.AUDIO > h3Limits.audios || references.length > h3Limits.files) error("H3 官方参考上限为 9 图、3 视频、3 音频，混合素材合计最多 12 个");
  for (const kind of ["VIDEO", "AUDIO"] as const) if (references.filter(ref => ref.kind === kind).reduce((total, ref) => total + (ref.duration ?? 0), 0) > 15.001) error(`${kind === "VIDEO" ? "视频" : "音频"}参考总时长不能超过 15 秒`);
  const first = references.filter(ref => ref.role === "firstFrame"), last = references.filter(ref => ref.role === "lastFrame");
  if (first.length > 1 || last.length > 1) error("同一任务最多指定一张首帧和一张尾帧");
  if (mode === "T2VA" && references.length) error("T2VA 不接受参考素材，请移除素材或选择其他模式");
  if ((mode === "I2VA" || mode === "L2VA") && (references.length !== 1 || counts.IMAGE !== 1 || (mode === "I2VA" ? first.length : last.length) !== 1)) error(`${mode} 需要一张明确标记为${mode === "I2VA" ? "首帧" : "尾帧"}的图片，不能混入其他素材`);
  if (mode === "FL2VA" && (references.length !== 2 || counts.IMAGE !== 2 || first.length !== 1 || last.length !== 1)) error("FL2VA 需要明确的首帧和尾帧各一张，不能混入其他素材");
  if (mode === "Ref2VA" && !references.length) error("Ref2VA 至少需要一个参考素材");
  if (mode === "Ref2VA" && (first.length || last.length)) warning("Ref2VA 的首尾画面作为参考目标，不承诺与专用首尾帧接口相同的精确锁定；请核对下游通道");
  if (references.some(ref => ref.kind === "AUDIO")) warning("音频仅按标签、用途和角色绑定；本插件不会假称已识别参考音频内容");
  if (!settings.analyzeVisual && references.some(ref => ref.kind !== "AUDIO")) warning("未启用视觉分析，素材细节仅依据用户描述；未知外观保持未知");
  if (settings.format === "enhanced" && mode !== "Ref2VA") error("实战增强格式仅用于 Ref2VA；Base 模式请使用官方格式");
  const durations = target?.durationResolutionMap?.flatMap(item => item.duration);
  if (durations?.length && !durations.includes(settings.duration)) error(`所选下游模型不支持 ${settings.duration} 秒`);
  if (target?.mode?.length) {
    const mixed = target.mode.filter(Array.isArray);
    if (mode === "Ref2VA" && mixed.length && !mixed.some(values => Object.entries(counts).every(([kind, count]) => count <= Number(values.find(value => value.startsWith(`${kind.toLowerCase()}Reference:`))?.split(":")[1] ?? 0)))) error("参考素材数量超过所选下游模型的混合参考上限");
    if (mode === "FL2VA" && !target.mode.some(value => ["startEndRequired", "startFrameOptional", "endFrameOptional"].includes(String(value)))) error("所选下游模型未声明首尾帧模式");
    if (mode === "L2VA" && !target.mode.includes("startFrameOptional")) error("所选下游模型未声明仅尾帧模式；可取消目标渠道选择以生成通用 H3 提示词");
    if (mode === "I2VA" && !target.mode.includes("endFrameOptional")) warning("所选通道的单图参考不代表精确首帧锁定，请核对实际下游接口");
  }
  for (const line of settings.dialogues) {
    if (!line.speaker.trim() || !line.text.trim() || !line.language.trim()) error("对白行须填写说话者、语言和完整台词");
    const units = [...line.text].filter(character => /[\p{L}\p{N}]/u.test(character)).length;
    if (units > settings.duration * 6) warning(`说话者“${line.speaker}”的台词可能超过时长，已保留全文；请延长时长或拆分片段`);
  }
  if (new Set(settings.dialogues.map(line => line.id)).size !== settings.dialogues.length) error("对白行 ID 不能重复");
  return diagnostics;
}
