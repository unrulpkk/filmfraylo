<template>
  <nodeSkeleton v-bind="nodeProps" :fullscreenVisible="false">
    <div class="h3Editor nodrag nopan nowheel" @pointerdown.stop @keydown.stop @dblclick.stop>
      <el-tabs v-if="!planner" v-model="tab">
        <el-tab-pane label="中文提示词" name="chinese" />
        <el-tab-pane label="英文 · FilmFraylo" name="english" />
        <el-tab-pane label="英文 · H3 原生" name="native" />
      </el-tabs>
      <el-input v-if="planner || tab === 'chinese'" v-model="displayText" type="textarea" :rows="10" :readonly="connected" :aria-label="planner ? '自然语言输入' : '中文提示词'" />
      <el-input v-else :modelValue="tab === 'native' ? nativeText : currentPair?.english ?? ''" type="textarea" :rows="10" readonly :aria-label="tab === 'native' ? 'H3 原生英文提示词' : 'FilmFraylo 英文提示词'" />
      <template v-if="planner && currentPair">
        <div class="outputLabel">英文提示词 · FilmFraylo</div>
        <el-input :modelValue="currentPair.english" type="textarea" :rows="8" readonly aria-label="英文提示词输出" />
      </template>
      <el-alert v-if="error" :title="error" type="error" :closable="false" showIcon />
      <div class="h3Footer">
        <el-select v-model="model" :loading="loadingModels" :disabled="busy" aria-label="DeepSeek 模型" placeholder="选择 DeepSeek" @visible-change="visible => visible && loadModels()">
          <el-option v-for="item in models" :key="modelKey(item)" :label="`${item.providerLabel} · ${item.label}`" :value="modelKey(item)" />
        </el-select>
        <el-button :disabled="!draft.trim() || !selectedModel || !!incomingError || !!sourcePair" @click="busy ? cancel() : convert(true)">{{ sourcePair ? '使用上游结果' : busy ? '停止' : currentPair ? '重新转换' : '转换' }}</el-button>
        <el-button :disabled="!currentPair || busy" @click="copyText">复制{{ !planner && tab === 'chinese' ? '中文' : !planner && tab === 'native' ? '原生英文' : '英文' }}</el-button>
      </div>
      <div class="outputState" aria-live="polite">{{ busy ? 'DeepSeek 正在整理并翻译…' : currentPair ? '已就绪 · 下游接收英文（参考图1 格式）' : '等待转换 · 下游暂不输出' }}</div>
      <div v-if="planner" class="outputState">中文出口接 H3 中英提示词的第一个标签；英文出口接普通文本节点。</div>
    </div>
  </nodeSkeleton>
</template>

<script setup lang="ts">
import { computed, effectScope, onMounted, onScopeDispose, ref, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { ElAlert, ElButton, ElInput, ElMessage, ElOption, ElSelect, ElTabPane, ElTabs } from "element-plus";
import { IconLanguage, IconWand } from "@tabler/icons-vue";
import { nodeSkeleton, nodeTools, useNode, useNodeEvent, z, type NodeAiModel, type NodeInputValue, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { h3BuilderHandles, h3Handles, h3PairSchema, h3References, h3SystemPrompt, readH3Pair, type H3Pair, type H3Result } from "../h3Prompt";

const props = defineProps<{ planner?: boolean }>();
const { node, nodeProps, outputs, ai, nodeEvent } = useNode({
  label: props.planner ? "H3 自然语言整理" : "H3 中英提示词",
  icon: props.planner ? IconWand : IconLanguage,
  handles: structuredClone(props.planner ? h3BuilderHandles : h3Handles),
  outputs: { text: { dataType: "STRING", value: "" }, ...(props.planner ? { chinese: { dataType: "STRING" as const, value: "" } } : {}) },
});
const flow = useVueFlow();
const data = computed(() => node.data as typeof node.data & { h3Draft?: string; h3Model?: string; h3Result?: H3Result });
const inputValues = ref<NodeInputValue[]>([]);
const connected = computed(() => inputValues.value.length > 0);
const incomingError = computed(() => inputValues.value.length > 1 ? "每次只能接入一个文本节点" : inputValues.value.some(value => value.dataType !== "STRING" || typeof value.value !== "string" || !value.value.trim()) ? "上游文本尚未就绪" : "");
const sourcePair = computed(() => {
  if (incomingError.value || inputValues.value.length !== 1) return;
  const input = inputValues.value[0];
  const source = flow.findNode(input.source);
  if (source?.type !== "remote-h3PromptBuilderNode" && source?.type !== "remote-h3PromptNode") return;
  const result = source.data.h3Result as H3Result | undefined;
  const parsed = h3PairSchema.safeParse(result && { chinese: result.chinese, english: result.english });
  const value = parsed.success ? parsed.data : undefined;
  const expected = input.sourceHandle === "chinese" ? value?.chinese : value?.english;
  return value && expected && h3References(expected) === input.value ? value : undefined;
});
const draft = computed({
  get: () => connected.value ? sourcePair.value?.chinese ?? (typeof inputValues.value[0]?.value === "string" ? inputValues.value[0].value : "") : data.value.h3Draft ?? "",
  set: (value: string) => { if (!connected.value) data.value.h3Draft = value; },
});
const model = computed({ get: () => data.value.h3Model ?? "", set: (value: string) => { data.value.h3Model = value; } });
const models = ref<NodeAiModel[]>([]);
const modelKey = (item: NodeAiModel) => JSON.stringify([item.providerId, item.modelId]);
const selectedModel = computed(() => models.value.find(item => modelKey(item) === model.value));
const loadingModels = ref(false);
const busy = ref(false);
const tab = ref("chinese");
const error = ref("");
const currentPair = computed<H3Pair | undefined>(() => {
  if (incomingError.value) return;
  if (sourcePair.value) return sourcePair.value;
  const result = data.value.h3Result;
  return result?.input === draft.value && result.model === model.value ? result : undefined;
});
const displayText = computed({ get: () => !props.planner && currentPair.value ? currentPair.value.chinese : draft.value, set: (value: string) => { draft.value = value; } });
const nativeText = computed(() => h3References(currentPair.value?.english ?? "", true));
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let running: Promise<void> | undefined;
let disposed = false;
let revision = 0;

nodeEvent.on("input:in", values => { inputValues.value = values; });
watch(() => inputValues.value.map(value => JSON.stringify([value.source, value.sourceHandle])).join("|"), () => {
  if (!props.planner && connected.value) tab.value = "chinese";
});
nodeEvent.on("canConnect", (connection, context) => {
  if (context.edges.some(edge => edge.target === node.id && edge.targetHandle === "in" && (edge.source !== connection.source || edge.sourceHandle !== connection.sourceHandle))) return false;
  const visited = new Set<string>();
  const pending = [connection.target];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === connection.source) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...context.edges.filter(edge => edge.source === id).map(edge => edge.target));
  }
  return true;
});

// ACT: 宿主现有连接契约询问接收端；用公开事件提前校验，不新增宿主分支，也不事后删除连线。
if (props.planner) {
  const connections = effectScope();
  const listeners = new Map<string, () => void>();
  watch(() => flow.getNodes.value.map(target => target.id), ids => {
    const active = new Set(ids);
    for (const [id, off] of listeners) if (!active.has(id)) { off(); listeners.delete(id); }
    for (const id of ids) {
      if (id === node.id || listeners.has(id)) continue;
      const off = connections.run(() => useNodeEvent(id, flow).on("canConnect", connection => {
        if (connection.source !== node.id) return true;
        if (connection.sourceHandle === "chinese") return flow.findNode(id)?.type === "remote-h3PromptNode" && connection.targetHandle === "in";
        const sources = (flow.findNode(id)?.data.handles as NodeHandle[] | undefined)?.filter(handle => handle.type === "source") ?? [];
        return sources.length > 0 && sources.every(handle => handle.dataType === "STRING");
      }));
      if (off) listeners.set(id, off);
    }
  }, { immediate: true, flush: "sync" });
  onScopeDispose(() => connections.stop());
}

watch([draft, model, sourcePair, incomingError], () => {
  cancel();
  error.value = incomingError.value;
  if (sourcePair.value) data.value.h3Result = { ...sourcePair.value, input: draft.value, model: model.value };
  if (draft.value.trim() && !currentPair.value && !incomingError.value && selectedModel.value) timer = setTimeout(() => { void convert(); }, 1200);
}, { immediate: true });
watch(currentPair, pair => {
  outputs.value.text.value = pair?.english ?? "";
  if (outputs.value.chinese) outputs.value.chinese.value = pair?.chinese ?? "";
}, { immediate: true, flush: "sync" });

function cancel() {
  revision++;
  clearTimeout(timer);
  controller?.abort();
}

async function loadModels() {
  if (loadingModels.value) return;
  loadingModels.value = true;
  try {
    models.value = (await ai.getModels()).filter(item => /deepseek/i.test(`${item.modelId} ${item.label}`));
    if (!models.value.length) throw new Error("请先在语言模型设置中配置 DeepSeek");
    if (!model.value) {
      const choice = models.value.find(item => item.providerId === "safillu" && /flash/i.test(item.modelId)) ?? models.value[0];
      model.value = modelKey(choice);
    } else if (!selectedModel.value) throw new Error("原 DeepSeek 模型已不可用，请重新选择");
    if (!currentPair.value && draft.value.trim() && !incomingError.value) timer = setTimeout(() => { void convert(); }, 1200);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "读取 DeepSeek 模型失败"; }
  finally { loadingModels.value = false; }
}

function convert(force = false): Promise<void> {
  clearTimeout(timer);
  if (running) {
    const requestedRevision = revision;
    controller?.abort();
    return running.then(() => { if (revision === requestedRevision) return convert(force); });
  }
  const input = draft.value;
  const choice = selectedModel.value;
  if (!input.trim() || incomingError.value || !choice || disposed || (!force && currentPair.value)) return Promise.resolve();
  if (input.length > 24000) { error.value = "每个节点最多输入 24000 字，请先拆分长内容"; return Promise.resolve(); }
  if (sourcePair.value) return Promise.resolve();
  const selected = model.value;
  const request = new AbortController();
  controller = request;
  busy.value = true;
  error.value = "";
  running = (async () => {
    try {
      const result = await ai.generate({
        providerId: choice.providerId, modelId: choice.modelId,
        systemPrompt: h3SystemPrompt(!!props.planner),
        prompt: JSON.stringify({ input: h3References(input) }), signal: request.signal,
      });
      request.signal.throwIfAborted();
      if (draft.value !== input || model.value !== selected) return;
      const pair = readH3Pair(result.text);
      const originalDialogue = input.match(/<d>[\s\S]*?<\/d>/gi);
      if (originalDialogue && originalDialogue.join("\n") !== (pair.english.match(/<d>[\s\S]*?<\/d>/gi) ?? []).join("\n")) throw new Error("对白原文发生变化，已拒绝覆盖，请重试");
      const references = (text: string) => [...new Set(h3References(text, true).match(/<(?:Picture|Audio|Video) [1-9]\d*>/g) ?? [])].sort().join("|");
      if (references(input) !== references(pair.english)) throw new Error("参考素材编号发生变化，已拒绝覆盖，请重试");
      data.value.h3Result = { ...pair, input, model: selected };
    } catch (cause) {
      if (!request.signal.aborted && !disposed) error.value = cause instanceof Error ? cause.message : "H3 提示词转换失败";
    } finally {
      if (controller === request) { controller = undefined; busy.value = false; }
      running = undefined;
    }
  })();
  return running;
}

async function copyText() {
  const value = !props.planner && tab.value === "chinese" ? currentPair.value?.chinese : !props.planner && tab.value === "native" ? nativeText.value : currentPair.value?.english;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); ElMessage.success("已复制提示词"); }
  catch { ElMessage.error("复制失败，请选中文本手动复制"); }
}

nodeTools.register({ name: "setText", description: "设置中文提示词或自然语言，内部使用已配置的 DeepSeek 转为 H3 英文；连有上游时请修改上游", parameters: z.strictObject({ text: z.string().max(24000) }),
  execute({ text }) {
    if (connected.value) throw new Error("当前文本由上游提供，请修改上游节点");
    draft.value = text;
    return { text, status: "等待 DeepSeek 转换" };
  },
});
nodeTools.register({ name: "convert", description: "转换当前文本为 H3 中英文提示词，不生成视频", parameters: z.strictObject({}),
  async execute(_args, context) {
    if (sourcePair.value) return { ready: true, english: outputs.value.text.value };
    if (!selectedModel.value) await loadModels();
    if (!selectedModel.value) throw new Error(error.value || "请先配置 DeepSeek");
    const abort = () => cancel();
    context.signal?.addEventListener("abort", abort, { once: true });
    try { context.signal?.throwIfAborted(); await convert(true); if (error.value) throw new Error(error.value); return { ready: !!currentPair.value, english: outputs.value.text.value }; }
    finally { context.signal?.removeEventListener("abort", abort); }
  },
});
nodeTools.register({ name: "getPrompt", description: "读取中文、FilmFraylo 英文、H3 原生英文和转换状态；普通文本输出只包含 FilmFraylo 英文", parameters: z.strictObject({}),
  execute() { return { input: draft.value, chinese: currentPair.value?.chinese ?? "", english: outputs.value.text.value, native: nativeText.value, busy: busy.value, error: error.value }; },
});
nodeEvent.on("save", reason => { if (reason === "reload" && busy.value) throw new Error("请先停止或完成提示词转换，再刷新节点"); });
onMounted(loadModels);
onScopeDispose(() => { disposed = true; cancel(); });
</script>

<style lang="scss" scoped>
.h3Editor {
  width: 560px;
  max-width: calc(100vw - 80px);
  .outputLabel { margin: 12px 0 8px; color: var(--el-text-color-regular); }
  .h3Footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    .el-select { flex: 1; min-width: 0; }
    .el-button + .el-button { margin-left: 0; }
  }
  .el-alert { margin-top: 12px; }
  .outputState { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
  :deep(.el-textarea__inner) { font-family: inherit; line-height: 1.6; }
}
</style>
