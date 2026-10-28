<template>
  <nodeSkeleton v-bind="nodeProps" v-model:bottomVisible="node.selected" :topVisible="node.selected" topWidth="max-content" :bottomWidth="660" :downloadUrl="downloadUrl" downloadName="h3Prompt.txt">
    <div class="promptNode nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <div class="resultHeader"><strong>MiniMax H3 提示词</strong><el-tag>{{ resolvedMode }}</el-tag><el-tag v-if="state.settings.format === 'enhanced'" type="warning">自定义增强格式</el-tag></div>
      <el-input v-model="state.output" type="textarea" :rows="12" :disabled="generating" resize="vertical" placeholder="生成的 H3 提示词，可直接编辑" aria-label="H3 提示词输出" />
      <div class="outputActions"><el-button :disabled="!state.output" @click="copyOutput">复制提示词</el-button><span>仅生成提示词，不调用视频生成</span></div>
      <el-alert v-if="lastError" :title="lastError" type="error" :closable="false" showIcon />
      <el-alert v-for="(issue, index) in currentDiagnostics" :key="`${index}:${issue.message}`" :title="issue.message" :type="issue.level === 'error' ? 'error' : 'warning'" :closable="false" showIcon />
    </div>
    <template #bottom>
      <el-card class="settingsCard nodrag nopan nowheel" shadow="never" :bodyStyle="{ padding: '14px' }" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
        <div class="scrollSettings">
          <el-input v-model="state.settings.brief" type="textarea" :rows="3" :disabled="generating" placeholder="输入视频需求、剧本或分镜，也可连接文本节点" aria-label="视频创作需求" />
          <div class="settingsRow">
            <el-select v-model="state.settings.mode" :disabled="generating" aria-label="H3 生成模式"><el-option v-for="item in modeOptions" :key="item.value" :value="item.value" :label="item.label" /></el-select>
            <el-input-number v-model="state.settings.duration" :min="4" :max="15" :step="1" :precision="0" :disabled="generating" aria-label="目标视频时长（秒）" />
            <el-select v-model="state.settings.ratio" filterable allowCreate defaultFirstOption :disabled="generating" aria-label="画面比例"><el-option v-for="ratio in ratios" :key="ratio" :value="ratio" :label="ratio" /></el-select>
          </div>
          <div class="settingsRow">
            <el-select v-model="state.settings.format" :disabled="generating" aria-label="提示词格式"><el-option value="official" label="官方格式" /><el-option value="enhanced" label="实战增强（自定义 Ref2VA）" /></el-select>
            <el-select v-model="state.settings.detail" :disabled="generating" aria-label="提示词详细程度"><el-option value="concise" label="精简" /><el-option value="standard" label="标准" /><el-option value="detailed" label="详细" /></el-select>
            <el-checkbox v-if="state.settings.format === 'enhanced'" v-model="state.settings.retention" :disabled="generating">保留 retention_analysis</el-checkbox>
          </div>
          <referenceItem v-if="refList.length" v-model="refList" @preview="setReferencePreview" @remove="removeReference" />
          <el-collapse>
            <el-collapse-item v-if="references.length" name="references" :title="`素材用途与首尾帧（${references.length}）`">
              <p class="help">普通参考图不会自动视为首帧。音视频会在生成前读取时长，无法读取时可手动填写真实时长。</p>
              <referenceEditor v-for="reference in references" :key="reference.key" :reference="reference" :binding="state.bindings[reference.key]!" :disabled="generating" @change="updateReference(reference.key, $event)" />
            </el-collapse-item>
            <el-collapse-item name="advanced" title="高级创作要求（可选）">
              <div class="advancedFields"><el-input v-for="field in advancedFields" :key="field.key" v-model="state.settings[field.key]" type="textarea" :rows="2" :placeholder="field.label" :aria-label="field.label" :disabled="generating" /></div>
              <div v-for="line in state.settings.dialogues" :key="line.id" class="dialogueRow">
                <el-input v-model="line.speaker" placeholder="说话者" aria-label="对白说话者" :disabled="generating" /><el-input v-model="line.language" placeholder="语言，如 Chinese" aria-label="对白语言" :disabled="generating" />
                <el-input v-model="line.text" type="textarea" :rows="2" placeholder="完整原文台词或歌词" aria-label="完整原文台词或歌词" :disabled="generating" />
                <el-checkbox v-model="line.voiceover" :disabled="generating">画外音/旁白</el-checkbox><el-checkbox v-model="line.singing" :disabled="generating">演唱</el-checkbox><el-button :disabled="generating" @click="removeDialogue(line.id)">移除对白</el-button>
              </div>
              <el-button :disabled="generating" @click="addDialogue">添加对白或歌词</el-button>
              <el-select v-model="state.settings.targetModel" clearable filterable :disabled="generating" placeholder="可选：按下游模型校验限制" aria-label="下游视频模型"><el-option v-for="model in mediaModels" :key="`${model.providerId}:${model.modelId}`" :value="JSON.stringify([model.providerId, model.modelId])" :label="`${model.providerLabel} / ${model.label}`" /></el-select>
              <el-checkbox v-model="state.settings.analyzeVisual" :disabled="generating">让文本模型读取图片/视频（需所选模型支持）</el-checkbox>
              <p class="help">音频不发送给文本模型识别。参考素材还需按映射顺序连接下游视频节点，STRING 连线只传提示词。</p>
            </el-collapse-item>
          </el-collapse>
          <el-input v-if="state.output" v-model="state.settings.refinement" type="textarea" :rows="2" :disabled="generating" placeholder="基于当前提示词继续优化的补充要求" aria-label="继续优化要求" />
        </div>
        <div class="modelFooter">
          <el-select v-model="state.settings.textModel" filterable :loading="modelsLoading" :disabled="generating" placeholder="选择已有文本 AI 模型" aria-label="提示词生成文本模型" @visible-change="visible => visible && loadModels()">
            <el-option-group v-for="group in modelGroups" :key="group.id" :label="group.label"><el-option v-for="model in group.models" :key="model.modelId" :label="model.label" :value="JSON.stringify([model.providerId, model.modelId])" /></el-option-group>
          </el-select>
          <span v-if="generating" class="phase">{{ phase === 'repairing' ? '修复格式（最多一次）' : '生成中' }}</span>
          <el-button v-if="generating" @click="cancel">取消</el-button>
          <template v-else><el-button v-if="state.output" :disabled="!selectedModel || !state.settings.refinement.trim()" @click="start(true)">优化当前</el-button><el-button type="primary" :disabled="!selectedModel" @click="start(false)">生成提示词</el-button></template>
        </div>
      </el-card>
    </template>
  </nodeSkeleton>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
import { ElAlert, ElButton, ElCard, ElCheckbox, ElCollapse, ElCollapseItem, ElInput, ElInputNumber, ElMessage, ElOption, ElOptionGroup, ElSelect, ElTag } from "element-plus";
import { IconMovie } from "@tabler/icons-vue";
import { nodeSkeleton, useNode, nodeTools, z, type NodeAiModel, type NodeHandle, type NodeMediaModel, type NodeOutput } from "@toonflow/nodes-scaffold/runtime";
import { useNodeReferences } from "@toonflow/node-shared/useNodeReferences";
import { useNodeGeneration } from "@toonflow/node-shared/useNodeGeneration";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import referenceItem from "@toonflow/node-shared/referenceItem";
import referenceEditor from "./components/referenceEditor.vue";
import { createPromptState, type PromptState, type PromptReference, type ReferenceBinding, type PromptInput } from "./types";
import { syncReferences, modeReferences, referenceManifest } from "./references";
import { resolveMode, validateInput } from "./constraints";
import { validateOutput } from "./format";
import { generateIntoState } from "./generation";
import { readMediaDuration } from "./mediaMetadata";

defineOptions({ inheritAttrs: false, icon: IconMovie, handles: [
  { id: "in", type: "target", dataType: ["STRING", "IMAGE", "VIDEO", "AUDIO"], label: "需求文本 / 图片 / 视频 / 音频参考" },
  { id: "text", type: "source", dataType: "STRING", label: "H3 提示词" },
] satisfies NodeHandle[] });
const { node, nodeProps, outputs, ai, files, ffmpeg, nodeEvent } = useNode({ label: "MiniMax H3 提示词", outputs: { text: { dataType: "STRING", value: "" } } });
const state = computed(() => {
  const data = node.data as typeof node.data & { h3Prompt?: PromptState };
  return data.h3Prompt ??= createPromptState();
});
const { refList, setReferencePreview, removeReference } = useNodeReferences();
const references = ref<PromptReference[]>([]);
watch([refList, () => state.value.bindings], ([inputs, bindings]) => { references.value = syncReferences(inputs, bindings); }, { deep: true, immediate: true });
const models = ref<NodeAiModel[]>([]), mediaModels = ref<NodeMediaModel[]>([]), modelsLoading = ref(false);
const modelGroups = computed(() => groupNodeModels(models.value));
const selectedModel = computed(() => models.value.find(model => JSON.stringify([model.providerId, model.modelId]) === state.value.settings.textModel));
const targetModel = computed(() => mediaModels.value.find(model => JSON.stringify([model.providerId, model.modelId]) === state.value.settings.targetModel));
const input = computed<PromptInput>(() => ({ settings: state.value.settings, references: references.value,
  context: refList.value.flatMap(item => item.dataType === "STRING" && typeof item.value === "string" ? [item.value] : []), target: targetModel.value }));
const resolvedMode = computed(() => resolveMode(input.value));
const currentDiagnostics = computed(() => {
  const manual = validateOutput(state.value.output, input.value, resolvedMode.value, modeReferences(resolvedMode.value, references.value));
  return [...new Map([...state.value.diagnostics, ...manual].map(issue => [issue.message, issue])).values()];
});
watch(() => state.value.output, value => { outputs.value.text = { dataType: "STRING", value }; }, { immediate: true, flush: "sync" });
let controller: AbortController | undefined;
let pending: Promise<unknown> | undefined;
const cancel = () => controller?.abort(new DOMException("用户取消生成", "AbortError"));
const generation = useNodeGeneration(outputs, cancel);
const { generating } = generation;
const phase = ref<"generating" | "repairing">("generating");
const lastError = ref("");
const downloadUrl = ref("");
watch(() => state.value.output, (value, _old, cleanup) => {
  const url = value ? URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" })) : "";
  downloadUrl.value = url; if (url) cleanup(() => URL.revokeObjectURL(url));
}, { immediate: true });
const modeOptions = [{ value: "auto", label: "自动判断" }, { value: "T2VA", label: "T2VA · 文生视频" }, { value: "I2VA", label: "I2VA · 实际首帧" }, { value: "FL2VA", label: "FL2VA · 首尾帧" }, { value: "L2VA", label: "L2VA · 实际尾帧" }, { value: "Ref2VA", label: "Ref2VA · 多模态参考" }];
const ratios = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const advancedFields = [
  { key: "style", label: "视觉风格（可选）" }, { key: "characters", label: "人物、场景与道具设定（可选）" },
  { key: "action", label: "动作、情绪与发展（可选）" }, { key: "camera", label: "构图、景别、机位与镜头运动（可选）" },
  { key: "soundscape", label: "环境声与同步音效（可选）" }, { key: "music", label: "明确要求的背景配乐（可选，默认不添加）" },
  { key: "preserve", label: "必须保持的视觉元素（可选）" }, { key: "change", label: "允许变化的视觉元素（可选）" },
  { key: "continuity", label: "前一镜头的连续性信息（可选）" }, { key: "screenText", label: "必须原样显示的画面文字，每行一项（可选）" },
] as const;

let modelsRequest: Promise<void> | undefined;
function loadModels(): Promise<void> {
  if (modelsRequest) return modelsRequest;
  modelsLoading.value = true;
  modelsRequest = Promise.all([ai.getModels(), ai.getMediaModels()]).then(([text, media]) => {
    models.value = text; mediaModels.value = media.filter(model => model.type === "video");
    if (!state.value.settings.textModel && text[0]) state.value.settings.textModel = JSON.stringify([text[0].providerId, text[0].modelId]);
  }).catch(error => { lastError.value = error instanceof Error ? error.message : "模型列表读取失败"; })
    .finally(() => { modelsLoading.value = false; modelsRequest = undefined; });
  return modelsRequest;
}
function updateReference(key: string, patch: Partial<ReferenceBinding>) {
  if (generating.value) throw new Error("提示词正在生成，请完成后修改素材用途");
  const binding = state.value.bindings[key];
  if (!binding || !references.value.some(ref => ref.key === key)) throw new Error("参考素材已断开，请重新读取当前映射");
  Object.assign(binding, patch);
}
function addDialogue() { state.value.settings.dialogues.push({ id: crypto.randomUUID(), speaker: "", language: "Chinese", text: "", voiceover: false, singing: false }); }
function removeDialogue(id: string) { state.value.settings.dialogues = state.value.settings.dialogues.filter(line => line.id !== id); }
async function copyOutput() {
  try { await navigator.clipboard.writeText(state.value.output); ElMessage.success("提示词已复制"); }
  catch { ElMessage.error("复制失败，请在文本框中手动选择并复制"); }
}
function start(refine: boolean) {
  if (generating.value) throw new Error("节点正在生成提示词");
  const choice = selectedModel.value;
  if (!choice) throw new Error("请先选择已配置的文本 AI 模型");
  if (refine && (!state.value.output || !state.value.settings.refinement.trim())) throw new Error("请填写基于当前提示词的优化要求");
  controller = new AbortController();
  const signal = controller.signal;
  lastError.value = "";
  pending = generation.run(async () => {
    if (refList.value.some(item => item.value === undefined)) throw new Error("连接的素材或文本节点尚无输出，请先补充内容");
    if (state.value.settings.targetModel && !targetModel.value) throw new Error("所选下游模型已不可用，请重新选择或取消目标渠道限制");
    const workspace = files.getWorkspaceFiles();
    for (const reference of references.value.filter(ref => ref.kind !== "IMAGE" && ref.duration === undefined)) {
      const duration = await readMediaDuration(await ffmpeg(signal), reference, signal);
      state.value.bindings[reference.key]!.duration = duration;
    }
    await nextTick();
    signal.throwIfAborted();
    // 输入、素材用途和实际媒体一同快照；生成中引用变化会取消，防止旧映射覆盖新输入。
    const snapshot = JSON.parse(JSON.stringify(input.value)) as PromptInput;
    const visual = snapshot.settings.analyzeVisual ? modeReferences(resolveMode(snapshot), snapshot.references).filter(ref => ref.kind !== "AUDIO" && ref.media)
      .map(ref => ({ dataType: ref.kind, value: { ...ref.media! } }) as Extract<NodeOutput, { dataType: "IMAGE" | "VIDEO" }>) : [];
    const directory = visual.length ? (await workspace.list()).directory : undefined;
    return generateIntoState(state.value, snapshot, async request => {
      const result = await ai.generate({ ...request, providerId: choice.providerId, modelId: choice.modelId, ...(directory ? { directory, references: visual } : {}) });
      return result.text;
    }, { signal, refine, phase: value => { phase.value = value; } });
  }).catch(error => { lastError.value = error instanceof Error ? error.message : "提示词生成失败"; })
    .finally(() => { controller = undefined; });
  return { status: "generating", mode: resolvedMode.value };
}
// 上游宿主会在其它节点变化时重建输入数组；只在本节点的实际输入改变时取消。
watch(() => JSON.stringify(refList.value.map(({ source, sourceHandle, dataType, value }) => ({ source, sourceHandle, dataType, value }))), () => {
  if (generating.value) controller?.abort(new Error("参考连接或内容已改变，请重新生成；上次结果保留"));
});
nodeEvent.on("save", reason => { if (reason === "reload" && generating.value) throw new Error("提示词正在生成，请完成后刷新节点"); });
nodeEvent.on("delete", async () => { cancel(); await pending; });
onScopeDispose(cancel);
onMounted(loadModels);

const settingsSchema = z.object({
  brief: z.string().max(160000), mode: z.enum(["auto", "T2VA", "I2VA", "FL2VA", "L2VA", "Ref2VA"]), duration: z.number().int().min(4).max(15), ratio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
  format: z.enum(["official", "enhanced"]), retention: z.boolean(), detail: z.enum(["concise", "standard", "detailed"]), analyzeVisual: z.boolean(),
  textModel: z.string().max(600), targetModel: z.string().max(600), style: z.string().max(10000), characters: z.string().max(30000), action: z.string().max(30000), camera: z.string().max(10000), soundscape: z.string().max(10000), music: z.string().max(10000), preserve: z.string().max(20000), change: z.string().max(20000), continuity: z.string().max(20000), screenText: z.string().max(20000), refinement: z.string().max(30000),
  dialogues: z.array(z.object({ id: z.string().min(1).max(100), speaker: z.string().min(1).max(200), language: z.string().min(1).max(80), text: z.string().min(1).max(20000), voiceover: z.boolean(), singing: z.boolean() })).max(100),
}).partial().strict();
nodeTools.register({ name: "getConfig", description: "读取 FilmFraylo H3 提示词插件设置、真实文本模型、素材标签、模式诊断和可选下游视频模型；不含 Key，不生成视频", parameters: z.strictObject({}), async execute() {
  await loadModels(); return { settings: state.value.settings, resolvedMode: resolvedMode.value, references: referenceManifest(modeReferences(resolvedMode.value, references.value)), models: models.value, targetModels: mediaModels.value, diagnostics: validateInput(input.value) };
} });
nodeTools.register({ name: "setConfig", description: "修改 H3 提示词插件设置；textModel/targetModel 使用 getConfig 返回的 [providerId,modelId] JSON 字符串；只设置本插件，不启动视频", parameters: z.strictObject({ settings: settingsSchema }), execute({ settings }) {
  if (generating.value) throw new Error("生成中不能修改设置"); Object.assign(state.value.settings, settings); return { settings: state.value.settings, resolvedMode: resolvedMode.value };
} });
nodeTools.register({ name: "setReference", description: "按 getConfig 返回的真实 key 设置素材用途、首尾帧角色、角色绑定、保留关系和真实时长；不猜测角色", parameters: z.strictObject({ key: z.string().min(1), role: z.enum(["reference", "firstFrame", "lastFrame", "identity", "environment", "motion", "camera", "voice", "reuse", "music", "soundscape"]).optional(), purpose: z.string().max(5000).optional(), subjects: z.string().max(2000).optional(), retention: z.enum(["fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference", "fully_copy", "partially_copy", "reference"]).optional(), duration: z.number().positive().max(36000).optional() }), execute({ key, ...patch }) { updateReference(key, patch); return { references: referenceManifest(references.value), resolvedMode: resolvedMode.value }; } });
nodeTools.register({ name: "generatePrompt", description: "使用宿主文本 AI 后台生成或优化 H3 提示词，不生成视频；格式最多修复一次，失败保留原输出。先读取 getConfig、配置需求与素材用途，再调用，之后用 getGenerationStatus/getResult 查询", parameters: z.strictObject({ refine: z.boolean().optional() }), async execute({ refine }, { signal }) { signal?.throwIfAborted(); await loadModels(); return start(refine === true); } });
nodeTools.register({ name: "getResult", description: "读取完整纯文本 H3 提示词、实际模式和诊断；不把已开始当作已完成", parameters: z.strictObject({}), execute() { return { text: state.value.output, mode: state.value.resolvedMode, diagnostics: currentDiagnostics.value, phase: generating.value ? phase.value : "idle" }; } });
nodeTools.register({ name: "setOutput", description: "手动编辑完整 H3 提示词并同步 STRING 输出，不调用模型；不接受正在生成时覆盖", parameters: z.strictObject({ text: z.string().max(100000) }), execute({ text }) { if (generating.value) throw new Error("请先取消生成再编辑输出"); state.value.output = text; return { text, diagnostics: currentDiagnostics.value }; } });
</script>

<style scoped>
.promptNode { width: 540px; padding: 14px; display: grid; gap: 10px; }
.resultHeader, .outputActions, .modelFooter, .settingsRow { display: flex; align-items: center; gap: 8px; }
.resultHeader strong { flex: 1; }
.outputActions span, .help, .phase { font-size: 12px; color: var(--el-text-color-secondary); }
.scrollSettings { max-height: min(56vh, 520px); overflow: auto; display: grid; gap: 10px; }
.settingsRow > .el-select { flex: 1; min-width: 0; }
.settingsRow .el-input-number { width: 130px; }
.modelFooter { padding-top: 12px; }
.modelFooter > .el-select { flex: 1; min-width: 0; }
.advancedFields { display: grid; gap: 8px; margin-bottom: 10px; }
.dialogueRow { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 0; border-top: 1px solid var(--el-border-color-lighter); }
.dialogueRow > :nth-child(3) { grid-column: 1 / -1; }
.help { line-height: 1.6; }
</style>
