import type { H3Mode, PromptDiagnostic, PromptInput, PromptReference, ScenePlan, SceneSpeech } from "./types";

export class promptFormatError extends Error {
  constructor(public issues: string[]) { super(issues.join("；")); this.name = "promptFormatError"; }
}
export class promptSemanticError extends Error {
  constructor(message: string) { super(message); this.name = "promptSemanticError"; }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new promptFormatError(["场景计划中的对象无效"]);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, required = false): string {
  if (typeof value !== "string" || value.length > 64000 || required && !value.trim()) throw new promptFormatError([`${field} 须为${required ? "非空" : ""}文本`]);
  return value;
}
function list(value: unknown, field: string, max = 50): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new promptFormatError([`${field} 须为不超过 ${max} 项的数组`]);
  return value;
}

export function readPlan(raw: string): ScenePlan {
  if (raw.length > 180000) throw new promptFormatError(["模型返回内容过长"]);
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: Record<string, unknown>;
  try { value = record(JSON.parse(cleaned)); }
  catch (error) { if (error instanceof promptFormatError) throw error; throw new promptFormatError(["模型须返回完整的场景计划 JSON"]); }
  return {
    subjects: list(value.subjects ?? [], "subjects").map(item => {
      const subject = record(item); const key = text(subject.key, "subject.key", true);
      if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) throw new promptFormatError(["主体 key 须为稳定的小驼峰标识"]);
      return { key, name: text(subject.name, "subject.name", true), ...(subject.englishName ? { englishName: text(subject.englishName, "subject.englishName", true) } : {}), description: text(subject.description, "subject.description", true), references: list(subject.references ?? [], "subject.references").map(ref => text(ref, "subject.reference", true)) };
    }),
    referenceDescriptions: list(value.referenceDescriptions ?? [], "referenceDescriptions").map(item => {
      const ref = record(item); return { reference: text(ref.reference, "reference", true), description: text(ref.description, "reference.description", true) };
    }),
    summary: text(value.summary ?? "", "summary"), continuity: text(value.continuity ?? "", "continuity"),
    retention: list(value.retention ?? [], "retention").map(item => {
      const ref = record(item); return { reference: text(ref.reference, "retention.reference", true), description: text(ref.description, "retention.description", true) };
    }),
    shots: list(value.shots, "shots", 20).map(item => {
      const shot = record(item);
      if (typeof shot.start !== "number" || !Number.isFinite(shot.start) || typeof shot.end !== "number" || !Number.isFinite(shot.end)) throw new promptFormatError(["镜头起止时间须为有限数字"]);
      return { start: shot.start, end: shot.end, visual: text(shot.visual, "shot.visual", true), speech: list(shot.speech ?? [], "shot.speech").map(item => {
        const speech = record(item);
        if (typeof speech.voiceover !== "boolean") throw new promptFormatError(["speech.voiceover 须为布尔值"]);
        return { speaker: text(speech.speaker, "speaker", true), subject: text(speech.subject ?? "", "speech.subject"), language: text(speech.language, "language", true), text: text(speech.text, "dialogue", true), voiceover: speech.voiceover, singing: speech.singing === true, dialogueId: text(speech.dialogueId ?? "", "dialogueId") };
      }) };
    }),
    endState: text(value.endState, "endState", true), soundscape: text(value.soundscape ?? "", "soundscape"),
    music: text(value.music ?? "", "music"), musicEvidence: text(value.musicEvidence ?? "", "musicEvidence"),
    warnings: list(value.warnings ?? [], "warnings").map(item => text(item, "warning")),
  };
}

function sourceText(input: PromptInput) {
  const { settings } = input;
  return [settings.brief, ...input.context, settings.style, settings.characters, settings.action, settings.camera, settings.soundscape, settings.music, settings.preserve, settings.change, settings.continuity, settings.refinement].join("\n");
}

export function validatePlan(plan: ScenePlan, input: PromptInput, mode: H3Mode, references: PromptReference[]): PromptDiagnostic[] {
  const errors: string[] = [];
  const warnings: PromptDiagnostic[] = plan.warnings.filter(Boolean).map(message => ({ level: "warning", message }));
  if (!plan.shots.length) errors.push("至少需要一个镜头");
  let end = 0;
  for (const shot of plan.shots) {
    if (Math.abs(shot.start - end) > 0.001 || shot.start < 0 || shot.end <= shot.start || shot.end > input.settings.duration + 0.001) errors.push("镜头时间须连续、递增且在目标时长内");
    end = shot.end;
    if (/\[Shot\s+\d+\]|<d>|\(S\d/.test(shot.visual)) errors.push("镜头描述不应自行写入镜头编号或对白标签，交由渲染器处理");
  }
  if (Math.abs(end - input.settings.duration) > 0.001) errors.push("最后镜头结束时间须与总时长一致");
  if (new Set(plan.subjects.map(subject => subject.key)).size !== plan.subjects.length) errors.push("主体 key 不能重复");
  const known = new Set(references.map(ref => ref.key));
  for (const subject of plan.subjects) for (const key of subject.references) if (!known.has(key)) errors.push(`主体引用了不存在的素材 ${key}`);
  for (const item of [...plan.referenceDescriptions, ...plan.retention]) if (!known.has(item.reference)) errors.push(`素材说明引用不存在的素材 ${item.reference}`);
  if (mode === "Ref2VA") {
    if (!plan.summary.trim() || !/^\[[a-z +]+\]/i.test(plan.summary.trim())) errors.push("Ref2VA summary 须以实际任务类型方括号开头");
    for (const ref of references) {
      if (!plan.referenceDescriptions.some(item => item.reference === ref.key)) errors.push(`${ref.label} 缺少用途定义`);
      if ((input.settings.format === "official" || input.settings.retention) && !plan.retention.some(item => item.reference === ref.key)) errors.push(`${ref.label} 缺少保留关系说明`);
    }
  }
  if (errors.length) throw new promptFormatError([...new Set(errors)]);
  const source = sourceText(input);
  const supplied = new Map(input.settings.dialogues.map(line => [line.id, line]));
  const spoken = plan.shots.flatMap(shot => shot.speech);
  for (const ref of references.filter(ref => ref.kind !== "AUDIO")) {
    for (const name of ref.subjects.split(/[,，、\n]+/).map(name => name.trim()).filter(Boolean)) {
      const subject = plan.subjects.find(subject => subject.key === name || subject.name === name);
      if (!subject || !subject.references.includes(ref.key)) throw new promptSemanticError(`${ref.label} 未保留用户指定的主体绑定“${name}”，请核对素材角色`);
    }
  }
  for (const ref of references.filter(ref => ref.kind === "AUDIO" && ref.role === "voice")) {
    for (const name of ref.subjects.split(/[,，、\n]+/).map(name => name.trim()).filter(Boolean)) {
      const subject = plan.subjects.find(subject => subject.key === name || subject.name === name);
      if (!subject && !spoken.some(speech => speech.speaker === name)) throw new promptSemanticError(`${ref.label} 的音色绑定“${name}”未能对应到主体或说话者，请明确角色名称`);
      if (subject && !spoken.some(speech => speech.subject === subject.key)) warnings.push({ level: "warning", message: `${ref.label} 绑定的角色“${name}”本次未发声；保留音色用途，不虚构台词` });
    }
  }
  for (const speech of spoken) {
    const line = speech.dialogueId ? supplied.get(speech.dialogueId) : undefined;
    if (speech.dialogueId && !line) throw new promptSemanticError("模型引用了不存在的对白行");
    if (line && (line.text !== speech.text || line.speaker !== speech.speaker || line.language !== speech.language || line.voiceover !== speech.voiceover || line.singing !== speech.singing)) throw new promptSemanticError("模型改变了用户提供的完整台词、语言或说话者；原结果已保留");
    if (!line) {
      const at = source.indexOf(speech.text);
      const context = at < 0 ? "" : source.slice(Math.max(0, at - 90), at + speech.text.length + 30);
      if (at < 0 || !/(?:说|台词|对白|旁白|喊|唱|says?|dialogue|voiceover|shouts?|sings?|[：:])/i.test(context)) throw new promptSemanticError("模型提出了未经确认的台词；请用对白行明确内容，未覆盖原结果");
    }
    if (speech.subject && !plan.subjects.some(subject => subject.key === speech.subject)) throw new promptFormatError(["对白引用了未定义主体"]);
    const subject = plan.subjects.find(subject => subject.key === speech.subject);
    if (subject && speech.speaker !== subject.name && speech.speaker !== subject.key) throw new promptSemanticError("台词说话者与主体身份不一致，请明确角色名称；原结果已保留");
  }
  for (const line of supplied.values()) if (!spoken.some(speech => speech.dialogueId === line.id)) throw new promptSemanticError("模型遗漏了用户提供的完整台词；原结果已保留");
  for (const value of input.settings.screenText.split("\n").map(value => value.trim()).filter(Boolean)) if (!plan.shots.some(shot => shot.visual.includes(`"${value}"`)) && !plan.endState.includes(`"${value}"`)) throw new promptSemanticError("模型遗漏或改写了用户指定的画面文字");
  if (plan.music.trim() && plan.music.trim() !== "N/A" && !input.settings.music.trim() && !references.some(ref => ref.kind === "AUDIO" && ref.role === "music")) {
    if (!plan.musicEvidence.trim() || !source.includes(plan.musicEvidence) || /(?:no|without|不要|没有|不加|无需|禁止)\s*(?:background\s*)?(?:music|score|配乐|音乐|bgm)/i.test(plan.musicEvidence)) throw new promptSemanticError("配乐缺少用户需求依据，未采用模型新增的配乐");
  }
  const units = spoken.reduce((total, speech) => total + [...speech.text].filter(c => /[\p{L}\p{N}]/u.test(c)).length, 0);
  if (units > input.settings.duration * 6) warnings.push({ level: "warning", message: "完整台词可能超过自然朗读时长；已保留全文，请延长时长或分段" });
  return warnings;
}

function cutTime(seconds: number) {
  const milliseconds = Math.round(seconds * 1000);
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

function frameAlignment(mode: H3Mode, duration: number, final: number) {
  if (mode === "I2VA") return "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
  if (mode === "FL2VA") return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${final}) aligns with the ${duration.toFixed(2)}-second mark of the target video.`;
  if (mode === "L2VA") return `How the reference pictures align with the target video — <Picture 1> (from [Shot ${final}]) aligns with the ${duration.toFixed(2)}-second mark of the target video.`;
  return "";
}

export function renderPrompt(plan: ScenePlan, input: PromptInput, mode: H3Mode, references: PromptReference[], previousSubjectIds: Record<string, number> = {}) {
  const subjectIds = { ...previousSubjectIds };
  let next = Math.max(0, ...Object.values(subjectIds).filter(Number.isSafeInteger));
  const labels = new Map<string, string>();
  for (const subject of plan.subjects) {
    const key = `subject:${subject.key}`;
    if (!Object.hasOwn(subjectIds, key)) subjectIds[key] = ++next;
    labels.set(subject.key, mode === "Ref2VA" ? `<Subject ${subjectIds[key]}>` : subject.englishName || subject.name);
  }
  const media = new Map(references.map(ref => [ref.key, ref.label]));
  function expand(value: string) {
    return value.replace(/\{\{(subject|ref):([^}]+)\}\}/g, (_all, kind: string, key: string) => {
      const label = (kind === "subject" ? labels : media).get(key);
      if (!label) throw new promptFormatError(["提示词包含未定义的主体或素材占位符"]);
      return label;
    });
  }
  const speakerIds = new Map<string, number>();
  const speechSubjects = new Map<string, string>();
  for (const shot of plan.shots) for (const speech of shot.speech) {
    if (!speakerIds.has(speech.speaker)) speakerIds.set(speech.speaker, speakerIds.size + 1);
    if (speech.subject) speechSubjects.set(speech.subject, speech.speaker);
  }
  function speechText(speech: SceneSpeech) {
    const name = speech.subject ? labels.get(speech.subject)! : speech.speaker;
    const id = `(S${speakerIds.get(speech.speaker)})`;
    return `${name} ${id} ${speech.voiceover ? `says in an off-screen voiceover${speech.singing ? ", singing" : ""}` : speech.singing ? "sings" : "says"}: <d>[${speech.language}] ${speech.text}</d>${speech.voiceover ? " while the corresponding on-screen character's lips remain completely closed." : ""}`;
  }
  const body = plan.shots.map((shot, index) => `${index ? `[Shot ${index + 1}] At ${cutTime(shot.start)}, ` : `[Shot 1] ${input.settings.duration.toFixed(2)} seconds, ${input.settings.ratio} aspect ratio. `}${expand(shot.visual)}${shot.speech.length ? "\n" + shot.speech.map(speechText).join("\n") : ""}`).join("\n")
    + `\nAt ${input.settings.duration.toFixed(2)} seconds, ${expand(plan.endState)}`;
  const soundscape = expand(plan.soundscape.trim() || "N/A");
  const music = expand(plan.music.trim() || "N/A");
  let output: string;
  if (mode !== "Ref2VA") {
    const alignment = frameAlignment(mode, input.settings.duration, plan.shots.length);
    output = `${alignment ? alignment + "\n\n" : ""}integrated_multimodal_description:\n${body}\n\noverall_soundscape:\n${soundscape}\n\nnon_diegetic_music:\n${music}`;
  } else {
    const definitions = [
      ...plan.referenceDescriptions.map(item => {
        const ref = references.find(ref => ref.key === item.reference)!;
        const voices = ref.kind === "AUDIO" && ref.role === "voice" ? ref.subjects.split(/[,，、\n]+/).map(name => name.trim()).filter(Boolean).flatMap(name => {
          const subject = plan.subjects.find(subject => subject.key === name || subject.name === name);
          const speaker = subject ? speechSubjects.get(subject.key) : name;
          return speaker && speakerIds.has(speaker) ? [`${subject ? labels.get(subject.key) + " " : speaker + " "}(S${speakerIds.get(speaker)})`] : [];
        }) : [];
        return `${ref.label}: ${expand(item.description)}${voices.length ? ` Voice-timbre binding: ${voices.join(", ")}; this does not copy source dialogue.` : ""}`;
      }),
      ...plan.subjects.map(subject => `${labels.get(subject.key)}${speechSubjects.has(subject.key) ? ` (S${speakerIds.get(speechSubjects.get(subject.key)!)})` : ""}: ${expand(subject.description)}${subject.references.length ? ` Sources: ${subject.references.map(key => media.get(key)).join(", ")}.` : ""}`),
    ];
    const sections = [`subject_definitions:\n${definitions.join("\n")}`];
    if (input.settings.format === "enhanced") sections.push(`scale_and_continuity:\nDuration: ${input.settings.duration.toFixed(2)} seconds. Aspect ratio: ${input.settings.ratio}. ${expand(plan.continuity)}`);
    sections.push(`summary:\n${expand(plan.summary)}`);
    if (input.settings.format === "official" || input.settings.retention) sections.push(`retention_analysis:\n${plan.retention.map(item => {
      const ref = references.find(ref => ref.key === item.reference)!;
      return `${ref.label}: ${ref.retention} - ${expand(item.description)}`;
    }).join("\n")}`);
    sections.push(`detailed_description:\n${body}`, `overall_soundscape:\n${soundscape}`, `non_diegetic_music:\n${music}`);
    output = sections.join("\n\n");
  }
  const allowed = new Set([...references.map(ref => ref.label), ...labels.values()]);
  const invalid = [...output.matchAll(/<(?:Picture|Video|Audio|Subject)\s+\d+>/g)].find(match => !allowed.has(match[0]));
  if (invalid || /\{\{|\}\}|```|\b(?:TODO|PLACEHOLDER)\b|\[insert\b/i.test(output)) throw new promptFormatError(["提示词包含未定义引用、代码围栏或未替换占位符"]);
  if (/^\s*(?:subject_definitions|summary|retention_analysis|scale_and_continuity|integrated_multimodal_description|detailed_description|overall_soundscape|non_diegetic_music):/m.test(plan.shots.map(shot => shot.visual).join("\n"))) throw new promptFormatError(["镜头正文包含重复结构章节"]);
  return { output, subjectIds };
}

export function validateOutput(output: string, input: PromptInput, mode: H3Mode, references: PromptReference[]): PromptDiagnostic[] {
  if (!output.trim()) return [];
  const issues: PromptDiagnostic[] = [];
  const headers = [...output.matchAll(/^(subject_definitions|scale_and_continuity|summary|retention_analysis|integrated_multimodal_description|detailed_description|overall_soundscape|non_diegetic_music):\s*$/gm)].map(match => match[1]);
  const expected = mode !== "Ref2VA" ? ["integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"]
    : ["subject_definitions", ...(input.settings.format === "enhanced" ? ["scale_and_continuity"] : []), "summary", ...(input.settings.format === "official" || input.settings.retention ? ["retention_analysis"] : []), "detailed_description", "overall_soundscape", "non_diegetic_music"];
  if (JSON.stringify(headers) !== JSON.stringify(expected)) issues.push({ level: "error", message: "提示词章节缺失、重复或排序不符合当前模式" });
  const definitions = mode === "Ref2VA" ? output.split(/\n(?:scale_and_continuity|summary):/)[0]! : "";
  const subjects = new Set([...definitions.matchAll(/^<Subject \d+>/gm)].map(match => match[0]));
  const allowed = new Set([...references.map(ref => ref.label), ...subjects]);
  if ([...output.matchAll(/<(?:Subject|Picture|Video|Audio) \d+>/g)].some(match => !allowed.has(match[0]))) issues.push({ level: "error", message: "提示词包含当前未定义的素材或主体编号；请核对素材映射" });
  if (/\{\{|\}\}|```|\b(?:TODO|PLACEHOLDER)\b|\[insert\b/i.test(output)) issues.push({ level: "error", message: "提示词包含占位符或代码围栏" });
  const body = (output.split(mode === "Ref2VA" ? "detailed_description:\n" : "integrated_multimodal_description:\n")[1]?.split("\noverall_soundscape:")[0] ?? "").replace(/<d>[\s\S]*?<\/d>/g, "");
  const shots = [...body.matchAll(/\[Shot (\d+)\](?: At (\d{2}):(\d{2})\.(\d{3}),)?/g)];
  if (!shots.length) issues.push({ level: "error", message: "提示词缺少实际镜头描述" });
  let previousCut = 0;
  if (shots.some((shot, index) => {
    const cut = Number(shot[2] ?? 0) * 60 + Number(shot[3] ?? 0) + Number(shot[4] ?? 0) / 1000;
    const invalid = Number(shot[1]) !== index + 1 || (index === 0 ? Boolean(shot[2]) : !shot[2] || cut <= previousCut || cut >= input.settings.duration);
    previousCut = cut; return invalid;
  }) || !body.includes(`At ${input.settings.duration.toFixed(2)} seconds,`)) issues.push({ level: "error", message: "镜头编号、切镜时间或最终时间与目标时长不一致" });
  const alignment = frameAlignment(mode, input.settings.duration, shots.length);
  if (alignment && !output.startsWith(alignment + "\n\n") || !alignment && /^(?:For the target video|How the reference pictures align)/.test(output)) issues.push({ level: "error", message: "首尾帧对齐指令与所选模式、最终镜头或时长不一致" });
  const speakerIds = new Set<string>();
  let invalidSpeakers = false;
  for (const speaker of body.matchAll(/\(S(\d+)\)/g)) if (!speakerIds.has(speaker[1]!)) {
    if (Number(speaker[1]) !== speakerIds.size + 1) invalidSpeakers = true;
    speakerIds.add(speaker[1]!);
  }
  if ([...definitions.matchAll(/\(S(\d+)\)/g)].some(speaker => !speakerIds.has(speaker[1]!)) || invalidSpeakers) issues.push({ level: "error", message: "说话者编号与首次实际发声顺序不一致" });
  const narrative = output.replace(/<d>[\s\S]*?<\/d>/g, "").replace(/"[^"\n]*"/g, "");
  const chinese = [...narrative.matchAll(/[\u3400-\u9fff]/g)].length;
  if (chinese > 30 && chinese > narrative.length * 0.15) issues.push({ level: "warning", message: "正文可能未充分使用英文，请核对；对白、画面文字和专有名称保留原文" });
  return issues;
}
