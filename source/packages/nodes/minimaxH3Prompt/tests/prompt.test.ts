import { describe, expect, test } from "bun:test";
import { reactive, watch } from "vue";
import { createPromptState, defaultSettings, type PromptInput, type PromptReference, type ReferenceBinding, type ScenePlan, type SceneSpeech } from "../src/types";
import { resolveMode, validateInput } from "../src/constraints";
import { modeReferences, syncReferences } from "../src/references";
import { promptFormatError, promptSemanticError, readPlan, renderPrompt, validateOutput, validatePlan } from "../src/format";
import { generateIntoState } from "../src/generation";
import { modelPrompt } from "../src/rules";

function input(brief = "A product bottle slowly rotates on a studio turntable."): PromptInput {
  return { settings: { ...defaultSettings(), brief }, references: [], context: [] };
}
function reference(kind: PromptReference["kind"], index = 1, patch: Partial<PromptReference> = {}): PromptReference {
  return { kind, index, key: `${kind.toLowerCase()}${index}`, label: `<${{ IMAGE: "Picture", VIDEO: "Video", AUDIO: "Audio" }[kind]} ${index}>`,
    source: `${kind}${index}`, sourceHandle: "out", role: kind === "AUDIO" ? "voice" : "reference", purpose: "", subjects: "", retention: kind === "AUDIO" ? "reference" : "fully_preserved", mediaUrl: `${kind}${index}.asset`,
    media: { url: `${kind}${index}.asset`, mimeType: `${kind.toLowerCase()}/test` }, ...(kind !== "IMAGE" ? { duration: 3 } : {}), ...patch };
}
function plan(request: PromptInput): ScenePlan {
  return { subjects: [], referenceDescriptions: request.references.map(ref => ({ reference: ref.key, description: "Use only the user-declared role of this asset." })),
    summary: "[reference generation] Create the requested scene using the declared references.", retention: request.references.map(ref => ({ reference: ref.key, description: "Preserve only the requested features." })),
    continuity: "Keep the requested spatial relationships and lighting.", shots: [{ start: 0, end: request.settings.duration, visual: "A studio medium shot holds the original product centered as the turntable rotates slowly clockwise. The camera remains still.", speech: [] }],
    endState: "the product completes the requested movement and comes to rest.", soundscape: "A soft turntable motor hum.", music: "N/A", musicEvidence: "", warnings: [] };
}
function render(request: PromptInput, scene = plan(request)) {
  const mode = resolveMode(request), references = modeReferences(mode, request.references);
  validatePlan(scene, request, mode, references);
  const result = renderPrompt(scene, request, mode, references);
  expect(validateOutput(result.output, request, mode, references).filter(item => item.level === "error")).toEqual([]);
  return result.output;
}
function speech(speaker: string, text: string, language: string, dialogueId: string, patch: Partial<SceneSpeech> = {}): SceneSpeech {
  return { speaker, text, language, dialogueId, subject: "", voiceover: false, singing: false, ...patch };
}

describe("H3 modes and generic scene requirements", () => {
  test("text only creates official T2VA without dialogue or score", () => {
    const request = input(); expect(resolveMode(request)).toBe("T2VA");
    const output = render(request); expect(output).toStartWith("integrated_multimodal_description:\n[Shot 1]");
    expect(output).toEndWith("non_diegetic_music:\nN/A"); expect(output).not.toContain("<d>"); expect(output).not.toContain("subject_definitions:");
  });
  test("actual first-frame nature image creates I2VA with exact alignment", () => {
    const request = input("Nature documentary: a fern frond uncurls from the supplied first frame."); request.references = [reference("IMAGE", 1, { role: "firstFrame" })];
    expect(resolveMode(request)).toBe("I2VA"); expect(render(request)).toStartWith("For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\n");
  });
  test("first and last animation frames are ordered by role, not connection order", () => {
    const request = input("3D animation: interpolate the character's reaching gesture between these frames.");
    request.references = [reference("IMAGE", 1, { role: "lastFrame" }), reference("IMAGE", 2, { role: "firstFrame" })];
    const refs = modeReferences(resolveMode(request), request.references); expect(resolveMode(request)).toBe("FL2VA"); expect(refs[0]!.key).toBe("image2"); expect(refs[0]!.label).toBe("<Picture 1>");
    const output = render(request); expect(output).toContain("Picture 2 (from Shot 1) aligns with the 5.00-second mark");
  });
  test("last frame uses actual final shot and exact target duration", () => {
    const request = input("A live-action actor places a cup on the table, ending at this frame."); request.settings.duration = 8; request.references = [reference("IMAGE", 1, { role: "lastFrame" })];
    const scene = plan(request); scene.shots = [{ start: 0, end: 3.5, visual: "Medium shot: the actor approaches the table.", speech: [] }, { start: 3.5, end: 8, visual: "Close-up: the cup settles on the table.", speech: [] }];
    expect(resolveMode(request)).toBe("L2VA"); const output = render(request, scene);
    expect(output).toContain("<Picture 1> (from [Shot 2]) aligns with the 8.00-second mark"); expect(output).toContain("[Shot 2] At 00:03.500,"); expect(output).toContain("At 8.00 seconds,");
  });
  test("ordinary reference image never silently becomes an actual first frame", () => {
    const request = input(); request.references = [reference("IMAGE")]; expect(resolveMode(request)).toBe("Ref2VA");
    request.settings.mode = "I2VA"; expect(validateInput(request).some(item => item.level === "error")).toBe(true);
  });
  test("character image and voice create Ref2VA and explicit speaker binding", () => {
    const request = input("Live action: Mira greets the camera."); request.references = [reference("IMAGE"), reference("AUDIO", 1, { subjects: "Mira", purpose: "Voice timbre only, not source dialogue" })];
    request.settings.dialogues = [{ id: "greeting", speaker: "Mira", language: "Chinese", text: "你好，欢迎回来。", voiceover: false, singing: false }];
    const scene = plan(request); scene.subjects = [{ key: "mira", name: "Mira", description: "The actor shown in {{ref:image1}}.", references: ["image1", "audio1"] }]; scene.shots[0]!.speech = [speech("Mira", "你好，欢迎回来。", "Chinese", "greeting", { subject: "mira" })];
    const output = render(request, scene); expect(resolveMode(request)).toBe("Ref2VA"); expect(output).toContain("Voice-timbre binding: <Subject 1> (S1)"); expect(output).toContain("this does not copy source dialogue"); expect(output).toContain("<d>[Chinese] 你好，欢迎回来。</d>");
  });
  test("multiple images keep independent purposes and many-to-one subject mapping", () => {
    const request = input("2D animation with the supplied character, environment, clothing and expression.");
    request.references = [reference("IMAGE", 1, { purpose: "character", subjects: "hero" }), reference("IMAGE", 2, { role: "environment", purpose: "background" }), reference("IMAGE", 3, { purpose: "clothing", subjects: "hero", retention: "attribute_transfer" }), reference("IMAGE", 4, { purpose: "expression", subjects: "hero" })];
    const scene = plan(request); scene.subjects = [{ key: "hero", name: "Hero", description: "Use the declared character, costume and expression references.", references: ["image1", "image3", "image4"] }];
    const output = render(request, scene); expect(output).toContain("Sources: <Picture 1>, <Picture 3>, <Picture 4>"); expect(output).toContain("<Picture 3>: attribute_transfer"); expect(output).toContain("<Picture 2>");
  });
  test("one image can define several subjects and environment", () => {
    const request = input("Use both people and the room in the supplied image."); request.references = [reference("IMAGE", 1, { purpose: "both people and the room", subjects: "leftActor,rightActor" })];
    const scene = plan(request); scene.subjects = [{ key: "leftActor", name: "Left actor", description: "Person on the left of {{ref:image1}}.", references: ["image1"] }, { key: "rightActor", name: "Right actor", description: "Person on the right of {{ref:image1}}.", references: ["image1"] }];
    const output = render(request, scene); expect(output).toContain("<Subject 1>"); expect(output).toContain("<Subject 2>"); expect(output.match(/Sources: <Picture 1>/g)).toHaveLength(2);
  });
  test("multilingual dialogue uses actual first-speaking order and preserves lyrics", () => {
    const request = input("Two people exchange the supplied lines, followed by a short sung response.");
    request.settings.dialogues = [{ id: "zh", speaker: "Lin", language: "Chinese", text: "我们出发吧。", voiceover: false, singing: false }, { id: "en", speaker: "Jo", language: "English", text: "Ready when you are.", voiceover: true, singing: false }, { id: "song", speaker: "Lin", language: "Chinese", text: "小河轻轻流。", voiceover: false, singing: true }];
    const scene = plan(request); scene.shots[0]!.speech = [speech("Jo", "Ready when you are.", "English", "en", { voiceover: true }), speech("Lin", "我们出发吧。", "Chinese", "zh"), speech("Lin", "小河轻轻流。", "Chinese", "song", { singing: true })];
    const output = render(request, scene); expect(output).toContain("Jo (S1) says in an off-screen voiceover"); expect(output).toContain("lips remain completely closed"); expect(output).toContain("Lin (S2) says: <d>[Chinese] 我们出发吧。</d>"); expect(output).toContain("Lin (S2) sings: <d>[Chinese] 小河轻轻流。</d>");
  });
  test("explicit camera, continuity and complex action are passed intact without a fixed genre", () => {
    const request = input("A glass marble rolls down a spiral track, lands in a bowl, circles twice and settles.");
    request.settings.camera = "Slow dolly left by one meter at constant speed; finish in a close-up."; request.settings.preserve = "Keep the bowl on the right and the red track unchanged."; request.settings.change = "Only the marble moves."; request.settings.continuity = "Continue the prior shot's warm morning light.";
    const message = JSON.parse(modelPrompt(request, "T2VA", [], "", {})); expect(message.settings.camera).toBe(request.settings.camera); expect(message.settings.preserve).toBe(request.settings.preserve); expect(message.settings.change).toBe(request.settings.change); expect(message.settings.continuity).toBe(request.settings.continuity);
    const scene = plan(request); scene.shots[0]!.visual = "In warm morning light, the unchanged red track remains left of the bowl. A slow constant-speed one-meter dolly left follows the marble spiraling down, falling into the bowl, circling twice and losing momentum naturally. Finish in close-up.";
    expect(render(request, scene)).toContain("circling twice and losing momentum naturally");
  });
  test("overlong dialogue warns and remains complete", () => {
    const request = input(); const text = "这是用户要求保留的完整长台词，必须逐字保留，不能因为镜头短就自行删减。".repeat(3);
    request.settings.dialogues = [{ id: "long", speaker: "Narrator", language: "Chinese", text, voiceover: true, singing: false }];
    expect(validateInput(request).some(item => item.level === "warning" && item.message.includes("台词"))).toBe(true);
    const scene = plan(request); scene.shots[0]!.speech = [speech("Narrator", text, "Chinese", "long", { voiceover: true })]; expect(render(request, scene)).toContain(text);
  });
  test("enhanced format is explicit, Ref-only and retention is optional", () => {
    const request = input(); request.references = [reference("IMAGE")]; request.settings.format = "enhanced"; request.settings.retention = false;
    const output = render(request); expect(output).toContain("scale_and_continuity:\nDuration: 5.00 seconds. Aspect ratio: 16:9."); expect(output).not.toContain("retention_analysis:");
    request.references = []; expect(validateInput(request).some(item => item.level === "error")).toBe(true);
  });
});

describe("limits, binding and structural validation", () => {
  test("official asset, duration and mode limits are enforced", () => {
    const request = input(); request.references = Array.from({ length: 10 }, (_, index) => reference("IMAGE", index + 1)); expect(validateInput(request).some(item => item.level === "error")).toBe(true);
    request.references = [reference("VIDEO", 1, { duration: 8 }), reference("VIDEO", 2, { duration: 8 })]; expect(validateInput(request).some(item => item.message.includes("总时长"))).toBe(true);
    request.references = [reference("AUDIO", 1, { duration: 1 })]; expect(validateInput(request).some(item => item.message.includes("2–15"))).toBe(true);
    request.settings.mode = "FL2VA"; expect(validateInput(request).some(item => item.message.includes("各一张"))).toBe(true);
  });
  test("specific channel capabilities narrow limits without a model-ID allowlist", () => {
    const request = input(); request.references = [reference("VIDEO"), reference("VIDEO", 2)]; request.target = { mode: [["imageReference:9", "videoReference:1", "audioReference:3"]], durationResolutionMap: [{ duration: [4, 8], resolution: ["768P"] }] };
    const issues = validateInput(request); expect(issues.some(item => item.message.includes("混合参考上限"))).toBe(true); expect(issues.some(item => item.message.includes("不支持 5 秒"))).toBe(true);
  });
  test("roles and retention markers cannot cross incompatible media types", () => {
    const request = input(); request.references = [reference("AUDIO", 1, { role: "firstFrame", retention: "fully_preserved" })]; expect(validateInput(request).filter(item => item.level === "error").length).toBeGreaterThanOrEqual(2);
  });
  test("reference labels survive repeated generation and connection reordering", () => {
    const bindings: Record<string, ReferenceBinding> = {}; const nodes = [{ source: "b", sourceHandle: "out", dataType: "IMAGE", value: { url: "b.png", mimeType: "image/png" } }, { source: "voice", sourceHandle: "out", dataType: "AUDIO", value: { url: "voice.wav", mimeType: "audio/wav" } }, { source: "a", sourceHandle: "out", dataType: "IMAGE", value: { url: "a.png", mimeType: "image/png" } }];
    const first = syncReferences(nodes, bindings); const second = syncReferences([...nodes].reverse(), bindings); expect(second.map(ref => [ref.key, ref.label])).toEqual(first.map(ref => [ref.key, ref.label]));
    expect(first.find(ref => ref.kind === "AUDIO")!.label).toBe("<Audio 1>"); expect(first.find(ref => ref.source === "b")!.label).toBe("<Picture 1>");
    const remaining = syncReferences(nodes.filter(node => node.source !== "b"), bindings); expect(remaining.find(ref => ref.source === "a")!.label).toBe("<Picture 1>");
  });
  test("undefined references, timing gaps and raw placeholders are rejected", () => {
    const request = input(); const scene = plan(request); scene.shots[0]!.start = 1; expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptFormatError);
    scene.shots[0]!.start = 0; scene.shots[0]!.visual = "{{subject:missing}} moves."; expect(() => renderPrompt(scene, request, "T2VA", [])).toThrow(promptFormatError);
    scene.shots[0]!.visual = "<Picture 3> moves."; expect(() => renderPrompt(scene, request, "T2VA", [])).toThrow(promptFormatError);
  });
  test("invented dialogue, omitted or altered original lines, and unsolicited music fail semantically", () => {
    const request = input(); const scene = plan(request); scene.shots[0]!.speech = [speech("Actor", "Hello!", "English", "")]; expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptSemanticError);
    scene.shots[0]!.speech = []; scene.music = "Orchestral score"; expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptSemanticError);
    scene.music = "N/A"; request.settings.dialogues = [{ id: "line", speaker: "Actor", language: "English", text: "Exact wording.", voiceover: false, singing: false }]; expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptSemanticError);
    scene.shots[0]!.speech = [speech("Actor", "Changed wording.", "English", "line")]; expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptSemanticError);
  });
  test("visible text is verbatim and unknown voice bindings report a semantic problem", () => {
    const request = input(); request.settings.screenText = "新品上市"; const scene = plan(request);
    expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptSemanticError); scene.shots[0]!.visual += ' A label reads "新品上市".'; expect(render(request, scene)).toContain('"新品上市"');
    request.settings.screenText = ""; request.references = [reference("AUDIO", 1, { subjects: "Unknown person" })]; const refScene = plan(request); expect(() => validatePlan(refScene, request, "Ref2VA", request.references)).toThrow(promptSemanticError);
  });
  test("subject IDs stay stable when model subject ordering changes", () => {
    const request = input(); request.references = [reference("IMAGE")]; const scene = plan(request);
    scene.subjects = [{ key: "first", name: "First", description: "First supplied subject.", references: ["image1"] }, { key: "second", name: "Second", description: "Second supplied subject.", references: ["image1"] }];
    const first = renderPrompt(scene, request, "Ref2VA", request.references); scene.subjects.reverse(); const next = renderPrompt(scene, request, "Ref2VA", request.references, first.subjectIds);
    expect(next.subjectIds).toEqual(first.subjectIds); expect(next.output).toContain("<Subject 2>: Second supplied subject.");
  });
  test("English generic names do not accidentally retain untranslated object labels", () => {
    const request = input("白色陶瓷杯放在桌上。"); const scene = plan(request);
    scene.subjects = [{ key: "cup", name: "白色陶瓷杯", englishName: "the white ceramic cup", description: "A white ceramic cup.", references: [] }]; scene.shots[0]!.visual = "{{subject:cup}} remains on the table.";
    const output = render(request, scene); expect(output).toContain("the white ceramic cup remains"); expect(output).not.toContain("白色陶瓷杯"); expect(output).toContain("16:9 aspect ratio");
  });
  test("independent output validation catches edited frame alignment and time errors", () => {
    const request = input(); request.references = [reference("IMAGE", 1, { role: "lastFrame" })]; const output = render(request);
    expect(validateOutput(output.replace("5.00-second mark", "8.00-second mark"), request, "L2VA", modeReferences("L2VA", request.references)).some(issue => issue.message.includes("对齐"))).toBe(true);
    expect(validateOutput(output.replace("At 5.00 seconds,", "At 7.00 seconds,"), request, "L2VA", modeReferences("L2VA", request.references)).some(issue => issue.message.includes("最终时间"))).toBe(true);
  });
  test("explicit music-reference role permits music while keeping soundscape separate", () => {
    const request = input(); request.references = [reference("AUDIO", 1, { role: "music" })]; const scene = plan(request); scene.music = "Use {{ref:audio1}} only as the requested score reference.";
    expect(render(request, scene)).toEndWith("non_diegetic_music:\nUse <Audio 1> only as the requested score reference.");
  });
  test("a dialogue line cannot be reassigned to a different named subject", () => {
    const request = input(); request.settings.dialogues = [{ id: "greeting", speaker: "Mira", language: "English", text: "Hello.", voiceover: false, singing: false }]; const scene = plan(request);
    scene.subjects = [{ key: "jo", name: "Jo", description: "Jo is the other actor.", references: [] }]; scene.shots[0]!.speech = [speech("Mira", "Hello.", "English", "greeting", { subject: "jo" })];
    expect(() => validatePlan(scene, request, "T2VA", [])).toThrow(promptSemanticError);
  });
});

describe("generation lifecycle and persistence", () => {
  test("host text AI failure preserves the complete prior state", async () => {
    const state = createPromptState({ output: "prior valid result", subjectIds: { "subject:actor": 1 } }); const before = JSON.stringify(state);
    await expect(generateIntoState(state, input(), async () => { throw new Error("host model unavailable"); })).rejects.toThrow("host model unavailable"); expect(JSON.stringify(state)).toBe(before);
  });
  test("format repair is attempted exactly once and can recover", async () => {
    const state = createPromptState(), request = input(); let calls = 0;
    await generateIntoState(state, request, async () => ++calls === 1 ? "broken JSON" : JSON.stringify(plan(request))); expect(calls).toBe(2); expect(state.output).toContain("integrated_multimodal_description:");
  });
  test("repeated format errors and semantic failures do not overwrite old output", async () => {
    const state = createPromptState({ output: "old" }); let calls = 0;
    await expect(generateIntoState(state, input(), async () => { calls++; return "invalid"; })).rejects.toThrow(promptFormatError); expect(calls).toBe(2); expect(state.output).toBe("old");
    const request = input(), scene = plan(request); scene.music = "Unrequested soundtrack"; calls = 0;
    await expect(generateIntoState(state, request, async () => { calls++; return JSON.stringify(scene); })).rejects.toThrow(promptSemanticError); expect(calls).toBe(1); expect(state.output).toBe("old");
  });
  test("cancellation and a newer manual edit preserve the current output", async () => {
    const state = createPromptState({ output: "old" }), request = input(), controller = new AbortController();
    await expect(generateIntoState(state, request, async () => { controller.abort(); return JSON.stringify(plan(request)); }, { signal: controller.signal })).rejects.toThrow(); expect(state.output).toBe("old");
    await expect(generateIntoState(state, request, async () => { state.output = "new manual edit"; return JSON.stringify(plan(request)); })).rejects.toThrow("已被修改"); expect(state.output).toBe("new manual edit");
  });
  test("refinement receives the current edited prompt and preserves reference identities", async () => {
    const state = createPromptState({ output: "current edited H3 prompt" }), request = input(); request.settings.refinement = "Make the camera move slower.";
    await generateIntoState(state, request, async completion => { const message = JSON.parse(completion.prompt); expect(message.currentPrompt).toBe("current edited H3 prompt"); expect(message.settings.refinement).toBe(request.settings.refinement); return JSON.stringify(plan(request)); }, { refine: true });
  });
  test("manual editing synchronously updates STRING output and saved state restores it", () => {
    const state = reactive(createPromptState()), outputs = { text: { dataType: "STRING", value: "" } };
    const stop = watch(() => state.output, value => { outputs.text = { dataType: "STRING", value }; }, { immediate: true, flush: "sync" });
    state.settings.camera = "Track left"; state.output = render(input()); state.bindings = { image1: reference("IMAGE") }; state.subjectIds = { "subject:actor": 2 };
    state.output += "\nUser manually edited text."; expect(outputs.text.value).toBe(state.output);
    const restored = createPromptState(JSON.parse(JSON.stringify(state))); expect(restored).toEqual(JSON.parse(JSON.stringify(state))); stop();
  });
  test("validation rejects invalid input before any text AI request", async () => {
    const request = input(); request.settings.duration = 3; let called = false;
    await expect(generateIntoState(createPromptState(), request, async () => { called = true; return ""; })).rejects.toThrow("4–15"); expect(called).toBe(false);
  });
  test("response parser accepts one JSON fence but rejects prose or oversized results", () => {
    const scene = plan(input()); expect(readPlan(`\`\`\`json\n${JSON.stringify(scene)}\n\`\`\``)).toEqual(scene);
    expect(() => readPlan("An explanation followed by JSON")).toThrow(promptFormatError); expect(() => readPlan(" ".repeat(180001))).toThrow(promptFormatError);
  });
});
