<template>
  <main class="hello" :class="{ configuring: view !== 'welcome' }">
    <div class="pageLanguage"><languageSelect popover /></div>
    <section class="welcomePanel" aria-labelledby="welcomeTitle">
      <div v-if="view !== 'welcome'" class="providerContent">
        <header class="providerHeader">
          <el-button text :icon="IconArrowLeft" :disabled="saving" @click="view = 'welcome'">返回</el-button>
          <h1 id="welcomeTitle">配置语言模型</h1>
        </header>
        <div class="providerBody">
          <languageModel />
        </div>
        <el-button
          v-if="view === 'custom'"
          type="primary"
          :loading="saving"
          :disabled="!hello.configured"
          @click="completeSetup">
          开始使用
        </el-button>
      </div>
      <div v-else class="welcomeContent">
        <h1 id="welcomeTitle">快速开始</h1>
        <p class="description">使用 Safillu NewAPI，一次配置 DeepSeek、生图、H3 视频、音色设计与 BGM。</p>
        <el-input v-model="newApiKey" type="password" showPassword autocomplete="off" placeholder="输入 Safillu NewAPI Key" aria-label="Safillu NewAPI Key" :disabled="saving" />
        <el-button class="loginButton" type="primary" :loading="saving" :disabled="!newApiKey.trim()" @click="configureNewApi">配置 NewAPI 并开始使用</el-button>

        <el-button class="mobileConnectButton" :type="deviceHubEnabled ? 'success' : undefined" :plain="deviceHubEnabled" :icon="deviceHubEnabled || mobileConnection.mode === 'remote' ? IconDeviceDesktop : IconQrcode" @click="mobileConnectVisible = true">{{ mobileConnectionLabel }}</el-button>
        <div class="secondaryActions">
          <el-button class="secondaryButton" round @click="view = 'custom'">
            <icon-key class="buttonIcon" />
            添加私有提供商
          </el-button>
        </div>
      </div>

      <footer class="pageFooter">
        <p>© {{ new Date().getFullYear() }} FilmFraylo · 保留所有权利。</p>
      </footer>
    </section>
    <div class="artPanel" aria-hidden="true">
      <bg class="artBg" />
      <div class="artBrand">
        <img class="artLogo" :src="logoUrl" alt="" />
        <span class="artName">FilmFraylo</span>
      </div>
    </div>
    <mobileConnect v-model="mobileConnectVisible" />
  </main>
</template>

<script setup lang="ts">
import axios from "axios";
import { defineAsyncComponent, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconArrowLeft, IconQrcode, IconDeviceDesktop } from "@tabler/icons-vue";
import safillu from "@toonflow/providers/language/safillu";
import safilluSource from "@toonflow/providers/media/safillu?raw";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import { saveSettings } from "@/stores/settings";
import type { MediaProvider } from "@/components/settings/panels/mediaModel/types";
import { useHelloStore } from "@/stores/hello";
import anonymousData from "@/lib/anonymousData";
import logoUrl from "@toonflow/assets/filmFrayloLogo.png";
import bg from "./bg.vue";
import languageSelect from "@/components/languageSelect.vue";
import { deviceHubEnabled, mobileConnection, mobileConnectionLabel } from "@/lib/mobile";

const languageModel = defineAsyncComponent(() => import("@/components/settings/panels/languageModel/index.vue"));
const mobileConnect = defineAsyncComponent(() => import("@/components/mobileConnect.vue"));
const mobileConnectVisible = ref(false);
const view = ref<"welcome" | "custom">("welcome");
const saving = ref(false);
const newApiKey = ref("");
const router = useRouter();
const hello = useHelloStore();

async function configureNewApi() {
  if (saving.value || !newApiKey.value.trim()) return;
  saving.value = true;
  try {
    const apiKey = newApiKey.value.trim();
    const response = await axios.get<{ code: number; data: MediaProvider[] }>("/api/providers/media/list");
    if (response.data.code !== 200) throw new Error("读取媒体供应商失败");
    if (!response.data.data.some(provider => provider.id === safillu.id)) {
      const added = await axios.post("/api/providers/media/add", { source: safilluSource });
      if (added.data.code !== 200) throw new Error(added.data.message || "添加 NewAPI 失败");
    }
    await saveSettings(current => {
      const providers = (current.customProviders ?? []) as { id: string }[];
      const configs = (current.mediaProviderConfigs ?? {}) as Record<string, Record<string, unknown>>;
      const { id, label, version, apiUrl, protocol, models } = safillu;
      return {
        customProviders: [{ id, label, version, apiUrl, protocol, models, apiKey }, ...providers.filter(provider => provider.id !== id)],
        mediaProviderConfigs: { ...configs, [id]: { ...configs[id], apiKey, baseUrl: "https://api.safillu.com" } },
      };
    });
    invalidateNodeModels("language");
    invalidateNodeModels("media");
    newApiKey.value = "";
    await hello.complete();
    await router.replace("/home");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "配置 NewAPI 失败");
  } finally { saving.value = false; }
}

async function completeSetup() {
  if (saving.value) return;
  saving.value = true;
  try {
    await hello.complete();
    anonymousData.track("onboarding.complete");
    await router.replace("/home");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存引导状态失败，请重试");
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.hello {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100svh;
  padding: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-family: "Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;

  .pageLanguage {
    position: fixed;
    top: 16px;
    inset-inline-end: calc(50% + 8px);
    z-index: 2;
    max-width: calc(50% - 24px);
  }

  .welcomePanel {
    display: grid;
    grid-template-rows: 1fr auto 1fr;
    gap: 32px;
    min-width: 0;
    min-height: 544px;
    padding: 48px clamp(24px, 4.4vw, 64px);

    .providerContent {
      grid-row: 1;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 24px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;

      .providerHeader {
        h1 {
          margin: 16px 0 0;
          font-size: 28px;
          font-weight: 650;
        }
      }

      .providerBody {
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px;
      }
    }

    .welcomeContent {
      grid-row: 2;
      width: 100%;
      max-width: 420px;
      text-align: center;

      h1 {
        margin: 0 0 12px;
        font-size: clamp(32px, 3.4vw, 40px);
        font-weight: 650;
        line-height: 1.35;
        letter-spacing: -0.8px;
      }

      .description {
        margin: 0 0 32px;
        color: var(--el-text-color-secondary);
        font-size: 14px;
        line-height: 1.8;
      }

      .buttonIcon {
        width: 18px;
        height: 18px;
        margin-inline-end: 8px;
      }

      .loginButton {
        width: 100%;
        height: auto;
        min-height: 50px;
        padding: 12px;
        white-space: normal;
        border-radius: calc(var(--ui-radius) * 1.625);
        font-size: 16px;
        font-weight: 600;
      }

      .secondaryActions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;

        .secondaryButton {
          height: auto;
          min-height: 36px;
          margin: 0;
          padding: 8px 16px;
          white-space: normal;
          font-size: 13px;
        }
      }

      .mobileConnectButton { width: 100%; margin: 12px 0 0; min-height: 42px; }
    }

    .pageFooter {
      grid-row: 3;
      align-self: end;
      color: var(--el-text-color-secondary);
      font-size: 12px;

      p {
        margin: 10px 0 0;
        line-height: 1.6;
      }
    }
  }

  &.configuring {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;

    .welcomePanel {
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 24px;
      min-height: 0;

      .pageFooter {
        grid-row: 2;
      }
    }
  }

  .artPanel {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 28px;
    border-radius: calc(var(--ui-radius) * 1.125);
    overflow: hidden;
    background: radial-gradient(ellipse at 76% 82%, #f3dcb1 0%, transparent 46%), radial-gradient(ellipse at 25% 52%, #667ab5 0%, transparent 52%),
      radial-gradient(ellipse at 90% 18%, #369889 0%, transparent 48%), linear-gradient(145deg, #123f38, #467f72 48%, #a8c9ad);

    .artBg {
      z-index: 0;
    }

    .artBrand {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #fff;

      .artLogo {
        width: 44px;
        height: 44px;
        object-fit: contain;
      }

      .artName {
        font-size: 30px;
        font-weight: 600;
        letter-spacing: 0.4px;
      }
    }
  }

  @media (max-width: 700px) {
    grid-template-columns: 1fr;

    .pageLanguage {
      inset-inline-end: 16px;
      max-width: calc(100% - 32px);
    }

    .welcomePanel {
      padding: 32px 20px;

      .welcomeContent {
        justify-self: center;
      }
    }

    .artPanel {
      display: none;
    }
  }
}
</style>
