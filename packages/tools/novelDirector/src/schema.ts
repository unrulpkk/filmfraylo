import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/);
const text = z.string().trim().min(1).max(1600);
export const relativePath = z.string().min(1).max(2048).refine(
  value => !/^[\\/]|[:\u0000-\u001f]/.test(value) && value.split(/[\\/]/).every(part => part && part !== "." && part !== ".."),
  "路径必须是工作区相对路径，不能包含 ..",
);
const span = z.strictObject({ start: z.number().int().min(0), end: z.number().int().positive() });
const evidence = span.extend({ quote: text });
export const assetSchema = z.strictObject({
  id,
  kind: z.enum(["character", "appearance", "voice", "location", "sceneState"]),
  name: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  parentId: id.optional(),
  evidence: z.array(evidence).min(1).max(12),
  design: text.describe("原文未确定部分的统一设计；无补充写无。不将设计冒称原文事实"),
  locks: z.array(text).min(2).max(12),
  sampleText: z.string().trim().min(1).max(200).optional().describe("仅 voice 使用；试听文本，不属于剧情对白"),
});
export const referenceSchema = z.strictObject({
  path: relativePath,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const timing = { start: z.number().finite().min(0), end: z.number().finite().positive() };
export const shotSchema = z.strictObject({
  id,
  source: span,
  locationId: id,
  sceneStateId: id,
  duration: z.number().int().min(4).max(30),
  framing: text,
  camera: text,
  axis: text.describe("世界方位、视线与屏幕运动方向"),
  entryState: text,
  exitState: text,
  continuityNote: z.string().trim().max(1600).default(""),
  cast: z.array(z.strictObject({
    characterId: id,
    appearanceId: id,
    voiceId: id.optional(),
    position: text,
    entryState: text,
    exitState: text,
  })).max(8),
  beats: z.array(z.strictObject({ ...timing, action: text })).min(1).max(4),
  dialogue: z.array(z.strictObject({ ...timing, speakerId: id, text, source: span })).max(12),
  sound: text,
});
export const projectSchema = z.strictObject({
  version: z.literal(1),
  projectId: id,
  revision: z.number().int().nonnegative(),
  sourcePath: relativePath,
  sourceText: z.string().min(1).max(16_000_000),
  sourceHash: z.string(),
  style: text,
  maxShotSeconds: z.number().int().min(4).max(30),
  speechCharsPerSecond: z.number().min(1).max(6),
  assets: z.array(assetSchema.extend({ reference: referenceSchema.optional() })).max(10000),
  shots: z.array(shotSchema).max(20000),
});
const project = { projectId: id };
const write = { ...project, revision: z.number().int().nonnegative() };
const page = { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(8).default(4) };
export const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), ...project, sourcePath: relativePath, style: text,
    maxShotSeconds: z.number().int().min(4).max(30).default(12), speechCharsPerSecond: z.number().min(1).max(6).default(4) }),
  z.strictObject({ action: z.literal("inspect"), ...project }),
  z.strictObject({ action: z.literal("source"), ...project, offset: page.offset, length: z.number().int().min(1).max(12000).default(6000) }),
  z.strictObject({ action: z.literal("readAssets"), ...project, ...page, kind: assetSchema.shape.kind.optional(), ids: z.array(id).min(1).max(8).optional() }),
  z.strictObject({ action: z.literal("addAssets"), ...write, assets: z.array(assetSchema).min(1).max(8) }),
  z.strictObject({ action: z.literal("assetPrompt"), ...project, assetId: id }),
  z.strictObject({ action: z.literal("bindReference"), ...write, assetId: id, path: relativePath }),
  z.strictObject({ action: z.literal("saveShots"), ...write, shots: z.array(shotSchema).min(1).max(8) }),
  z.strictObject({ action: z.literal("readShots"), ...project, ...page, ids: z.array(id).min(1).max(8).optional() }),
  z.strictObject({ action: z.literal("compile"), ...project, ...page }),
  z.strictObject({ action: z.literal("export"), ...write }),
]);
export type Project = z.infer<typeof projectSchema>;
export type Asset = Project["assets"][number];
export type Shot = z.infer<typeof shotSchema>;
