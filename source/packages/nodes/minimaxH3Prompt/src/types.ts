export type H3Mode = "T2VA" | "I2VA" | "FL2VA" | "L2VA" | "Ref2VA";
export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO";
export type ReferenceRole = "reference" | "firstFrame" | "lastFrame" | "identity" | "environment" | "motion" | "camera" | "voice" | "reuse" | "music" | "soundscape";
export type Retention = "fully_preserved" | "partially_preserved" | "attribute_transfer" | "weak_reference" | "fully_copy" | "partially_copy" | "reference";
export type Dialogue = { id: string; speaker: string; language: string; text: string; voiceover: boolean; singing: boolean };
export type PromptSettings = {
  brief: string; mode: H3Mode | "auto"; duration: number; ratio: string;
  format: "official" | "enhanced"; retention: boolean; detail: "concise" | "standard" | "detailed";
  style: string; characters: string; action: string; camera: string; soundscape: string; music: string;
  preserve: string; change: string; continuity: string; screenText: string; refinement: string; analyzeVisual: boolean;
  textModel: string; targetModel: string; dialogues: Dialogue[];
};
export type ReferenceBinding = {
  kind: MediaKind; index: number; role: ReferenceRole; purpose: string; subjects: string;
  retention: Retention; mediaUrl: string; duration?: number;
};
export type PromptReference = ReferenceBinding & {
  key: string; label: string; source: string; sourceHandle: string;
  media?: { url: string; mimeType: string };
};
export type ReferenceInput = { source: string; sourceHandle: string; dataType: string | string[]; value?: unknown };
export type TargetCapabilities = { mode?: (string | string[])[]; durationResolutionMap?: { duration: number[]; resolution: string[] }[] };
export type PromptInput = { settings: PromptSettings; references: PromptReference[]; context: string[]; target?: TargetCapabilities };
export type PromptDiagnostic = { level: "error" | "warning"; message: string };
export type SceneSpeech = { speaker: string; subject: string; language: string; text: string; voiceover: boolean; singing: boolean; dialogueId: string };
export type ScenePlan = {
  subjects: { key: string; name: string; englishName?: string; description: string; references: string[] }[];
  referenceDescriptions: { reference: string; description: string }[];
  summary: string; retention: { reference: string; description: string }[]; continuity: string;
  shots: { start: number; end: number; visual: string; speech: SceneSpeech[] }[];
  endState: string; soundscape: string; music: string; musicEvidence: string; warnings: string[];
};
export type PromptState = {
  schemaVersion: 1; settings: PromptSettings; bindings: Record<string, ReferenceBinding>;
  subjectIds: Record<string, number>; output: string; diagnostics: PromptDiagnostic[];
  plan?: ScenePlan; resolvedMode?: H3Mode;
};

export function defaultSettings(): PromptSettings {
  return {
    brief: "", mode: "auto", duration: 5, ratio: "16:9", format: "official", retention: true, detail: "standard",
    style: "", characters: "", action: "", camera: "", soundscape: "", music: "", preserve: "", change: "", continuity: "", screenText: "",
    refinement: "", analyzeVisual: false, textModel: "", targetModel: "", dialogues: [],
  };
}

export function createPromptState(saved?: Partial<PromptState>): PromptState {
  return {
    schemaVersion: 1, settings: { ...defaultSettings(), ...saved?.settings }, bindings: saved?.bindings ?? {},
    subjectIds: saved?.subjectIds ?? {}, output: typeof saved?.output === "string" ? saved.output : "",
    diagnostics: saved?.diagnostics ?? [], ...(saved?.plan ? { plan: saved.plan } : {}), ...(saved?.resolvedMode ? { resolvedMode: saved.resolvedMode } : {}),
  };
}
