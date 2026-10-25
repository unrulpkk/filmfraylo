import { computed } from "vue";
import { defineStore } from "pinia";
import { customProviders, saveSettings, settings } from "@/stores/settings";

export const useHelloStore = defineStore("hello", () => {
  const configured = computed(() => customProviders.value.some(provider =>
    typeof provider.apiKey === "string" && !!provider.apiKey.trim() && provider.models.length > 0));
  const completed = computed(() => settings.value.helloCompleted === true && configured.value);

  async function load() {
    if (typeof settings.value.helloCompleted === "boolean") return completed.value;
    if (configured.value) await complete();
    return completed.value;
  }

  async function complete() {
    if (!configured.value) throw new Error("请先配置 API Key 和语言模型");
    await saveSettings(() => ({ helloCompleted: true }));
  }

  async function reset() {
    await saveSettings(() => ({ helloCompleted: false }));
  }

  return { configured, completed, load, complete, reset };
});
