import type { MediaKind, PromptReference, ReferenceBinding, ReferenceInput } from "./types";

export function referenceKey(input: Pick<ReferenceInput, "source" | "sourceHandle">) {
  return encodeURIComponent(JSON.stringify([input.source, input.sourceHandle]));
}

export function syncReferences(inputs: ReferenceInput[], bindings: Record<string, ReferenceBinding>): PromptReference[] {
  const counters = { IMAGE: 0, VIDEO: 0, AUDIO: 0 };
  for (const binding of Object.values(bindings)) if (binding && binding.kind in counters && Number.isSafeInteger(binding.index)) {
    counters[binding.kind] = Math.max(counters[binding.kind], binding.index);
  }
  const current = inputs.flatMap(input => {
    if (!["IMAGE", "VIDEO", "AUDIO"].includes(String(input.dataType))) return [];
    const kind = input.dataType as MediaKind;
    const key = `${kind}:${referenceKey(input)}`;
    const value = input.value && typeof input.value === "object" ? input.value as { url?: unknown; mimeType?: unknown } : undefined;
    const media = typeof value?.url === "string" && typeof value.mimeType === "string" ? { url: value.url, mimeType: value.mimeType } : undefined;
    if (!bindings[key]) bindings[key] = { kind, index: ++counters[kind], role: kind === "AUDIO" ? "voice" : "reference", purpose: "", subjects: "", retention: kind === "AUDIO" ? "reference" : "fully_preserved", mediaUrl: media?.url ?? "" };
    const binding = bindings[key]!;
    if (media && binding.mediaUrl !== media.url) { binding.mediaUrl = media.url; delete binding.duration; }
    const category = { IMAGE: "Picture", VIDEO: "Video", AUDIO: "Audio" }[kind];
    return [{ ...binding, key, label: `<${category} ${binding.index}>`, source: input.source, sourceHandle: input.sourceHandle, media }];
  });
  // 连接顺序变化不改变素材身份；断开素材后压紧当前编号，避免“第 3 张图”实际不存在。
  const active = { IMAGE: 0, VIDEO: 0, AUDIO: 0 };
  return current.sort((a, b) => a.kind.localeCompare(b.kind) || a.index - b.index).map(ref => ({
    ...ref, label: `<${{ IMAGE: "Picture", VIDEO: "Video", AUDIO: "Audio" }[ref.kind]} ${++active[ref.kind]}>`,
  }));
}

export function modeReferences(mode: string, references: PromptReference[]): PromptReference[] {
  if (mode === "Ref2VA" || mode === "T2VA") return references;
  // Base 模式的实际首尾帧按官方 Picture 1/2 对齐；Ref2VA 保留各类别持久编号。
  return [...references].sort((a, b) => Number(b.role === "firstFrame") - Number(a.role === "firstFrame"))
    .map((reference, index) => ({ ...reference, label: `<Picture ${index + 1}>` }));
}

export function referenceManifest(references: PromptReference[]) {
  return references.map(({ key, label, kind, role, purpose, subjects, retention, duration }) => ({ key, label, kind, role, purpose, subjects, retention, duration }));
}
