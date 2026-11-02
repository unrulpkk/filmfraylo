<template>
  <h3PromptEditor planner />
</template>

<script setup lang="ts">
import { IconWand } from "@tabler/icons-vue";
import { h3BuilderHandles } from "@toonflow/node-shared/h3Prompt";
import h3PromptEditor from "@toonflow/node-shared/h3PromptEditor";

defineOptions({ inheritAttrs: false, icon: IconWand, handles: h3BuilderHandles });
</script>
