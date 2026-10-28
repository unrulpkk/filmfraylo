<template>
  <div class="referenceEditor">
    <strong>{{ reference.label }}</strong>
    <el-select :modelValue="binding.role" :disabled="disabled" aria-label="素材作用" @update:modelValue="emit('change', { role: $event })">
      <el-option v-for="item in roles" :key="item.value" :value="item.value" :label="item.label" />
    </el-select>
    <el-input :modelValue="binding.purpose" :disabled="disabled" placeholder="具体用途，如服装、动作或机位；可留空" aria-label="素材用途说明" @update:modelValue="emit('change', { purpose: $event })" />
    <el-input :modelValue="binding.subjects" :disabled="disabled" placeholder="绑定角色，可用逗号分隔；不按连线顺序猜测" aria-label="素材绑定角色" @update:modelValue="emit('change', { subjects: $event })" />
    <el-select :modelValue="binding.retention" :disabled="disabled" aria-label="素材保留关系" @update:modelValue="emit('change', { retention: $event })">
      <el-option v-for="item in retentions" :key="item" :value="item" :label="item" />
    </el-select>
    <el-input-number v-if="reference.kind !== 'IMAGE'" :modelValue="binding.duration" :disabled="disabled" :min="0" :max="36000" :precision="3" :step="1" controlsPosition="right" aria-label="参考素材真实时长（秒）" @update:modelValue="emit('change', { duration: $event ?? undefined })" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElInput, ElInputNumber, ElOption, ElSelect } from "element-plus";
import type { PromptReference, ReferenceBinding } from "../types";

const { reference, binding, disabled } = defineProps<{ reference: PromptReference; binding: ReferenceBinding; disabled: boolean }>();
const emit = defineEmits<{ change: [patch: Partial<ReferenceBinding>] }>();
const roles = computed(() => reference.kind === "IMAGE" ? [
  { value: "reference", label: "普通参考图" }, { value: "firstFrame", label: "实际首帧" }, { value: "lastFrame", label: "实际尾帧" },
  { value: "identity", label: "人物/服装/道具" }, { value: "environment", label: "场景/构图/光照" },
] : reference.kind === "VIDEO" ? [
  { value: "reference", label: "视频内容参考" }, { value: "motion", label: "动作/表情/节奏" }, { value: "camera", label: "镜头运动" },
] : [
  { value: "voice", label: "音色/语气参考" }, { value: "reuse", label: "直接复用音频" }, { value: "music", label: "音乐参考" }, { value: "soundscape", label: "环境声/音效参考" },
]);
const retentions = computed(() => reference.kind === "AUDIO" ? ["reference", "fully_copy", "partially_copy", "weak_reference"] : ["fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference"]);
</script>

<style scoped>
.referenceEditor { display: grid; grid-template-columns: 120px 1fr; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.referenceEditor strong { align-self: center; font-size: 13px; }
.referenceEditor > :nth-child(n+3) { grid-column: 1 / -1; }
</style>
