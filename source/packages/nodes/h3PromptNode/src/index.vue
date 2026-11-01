<template>
  <h3PromptEditor />
</template>

<script setup lang="ts">
import { IconLanguage } from "@tabler/icons-vue";
import { h3Handles } from "@toonflow/node-shared/h3Prompt";
import h3PromptEditor from "@toonflow/node-shared/h3PromptEditor";

defineOptions({ inheritAttrs: false, icon: IconLanguage, handles: h3Handles });
</script>
