<template>
  <div class="about">
    <div class="brand">
      <img class="brandLogo" :src="logoUrl" :alt="`${product.name} Logo`" />
      <div>
        <h3>{{ product.name }}</h3>
        <p v-if="version" class="version" @click="onVersionClick">v{{ version }}</p>
      </div>
    </div>
    <section class="updates" aria-label="版本更新">
      <h4>版本更新</h4>
      <template v-if="isDesktop && !isRemoteConnection">
        <p class="updateStatus" aria-live="polite">{{ updateStatus }}</p>
        <p class="hint">下载期间可以继续创作。保存工作后，选择重启完成更新，项目和配置会保留。</p>
        <el-alert v-if="desktopUpdateError" :title="desktopUpdateError" type="error" :closable="false" showIcon />
        <div v-if="progress || snapshot?.updateReady" class="downloadProgress">
          <p>{{ progress?.phase === 'preparing' ? '正在校验并准备更新' : snapshot?.updateReady ? '更新已下载，可以稍后重启' : '正在后台下载' }}<span v-if="progress"> · {{ formatBytes(progress.received) }}<template v-if="progress.total"> / {{ formatBytes(progress.total) }}</template></span></p>
          <el-progress v-if="progress?.total || snapshot?.updateReady" :percentage="percentage" :status="snapshot?.updateReady ? 'success' : undefined" />
        </div>
        <div class="updateActions">
          <el-button :loading="desktopUpdateAction === 'check'" :disabled="working || snapshot?.channel === 'dev'" @click="runUpdate('check')">检查更新</el-button>
          <el-button v-if="snapshot?.canUpdate && snapshot.updateAvailable && !snapshot.updateReady" type="primary" :loading="desktopUpdateAction === 'download'" :disabled="working" @click="runUpdate('download')">下载更新</el-button>
          <el-button v-if="snapshot?.canUpdate && snapshot.updateReady" type="primary" :loading="desktopUpdateAction === 'apply'" :disabled="working" @click="runUpdate('apply')">重启并更新</el-button>
          <el-button v-if="snapshot?.updating && !desktopUpdateAction" @click="runUpdate('read')">刷新状态</el-button>
        </div>
      </template>
      <p v-else class="hint">请在本机桌面客户端中检查和安装更新。</p>
      <el-button tag="a" link :href="`${product.repositoryUrl}/releases/latest`" target="_blank" rel="noopener noreferrer">更新说明与完整安装包</el-button>
    </section>
    <div class="support">
      <h4>技术支持</h4>
      <p class="phone">{{ product.supportPhone }}</p>
      <img class="wechatQr" :src="wechatQrUrl" alt="微信技术支持二维码" />
      <p class="hint">微信扫码联系技术支持</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { product } from "@/lib/product";
import { computed, inject, onMounted } from "vue";
import { ElAlert, ElButton, ElMessage, ElProgress } from "element-plus";
import { isDesktop, isRemoteConnection } from "@/lib/platform";
import { checkDesktopUpdate, desktopUpdateAction, desktopUpdateError, desktopUpdateSnapshot, runDesktopUpdate } from "@/stores/desktopUpdate";
import { logoUrl } from "@/lib/product";
import { wechatQrUrl } from "@/lib/product";
const version = import.meta.env.appVersion;
const snapshot = desktopUpdateSnapshot;
const progress = computed(() => snapshot.value?.updateProgress);
const working = computed(() => !!desktopUpdateAction.value || !!snapshot.value?.updating);
const percentage = computed(() => snapshot.value?.updateReady ? 100 : Math.min(100, Math.round((progress.value?.received ?? 0) / (progress.value?.total || 1) * 100)));
const updateStatus = computed(() => {
  if (snapshot.value?.channel === "dev") return "开发版本不提供自动更新";
  if (desktopUpdateAction.value === "check") return "正在检查新版本…";
  if (desktopUpdateAction.value === "apply" || snapshot.value?.updating && desktopUpdateAction.value !== "download") return "正在准备重启更新…";
  if (snapshot.value?.updateReady) return `v${snapshot.value.latestVersion} 已准备好`;
  if (snapshot.value?.updateAvailable) return `发现新版本 v${snapshot.value.latestVersion}，当前 v${snapshot.value.version}`;
  if (desktopUpdateError.value) return "暂时无法检查更新，请重试或查看下载页";
  return snapshot.value?.latestVersion ? "当前已是最新版本" : "启动时自动检查新版本，也可以手动检查";
});

onMounted(() => {
  if (isDesktop && !isRemoteConnection) void checkDesktopUpdate(true).catch(() => {});
});

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function runUpdate(action: "read" | "check" | "download" | "apply") {
  try { await runDesktopUpdate(action); }
  catch { /* 操作和失败状态由全局 Store 保留，关闭面板不会取消下载或重复安装。 */ }
}

const revealDeveloper = inject<(() => void) | undefined>("revealDeveloper", undefined);
let versionClicks = 0;
let versionClickTimer: ReturnType<typeof setTimeout> | undefined;

function onVersionClick() {
  clearTimeout(versionClickTimer);
  versionClicks++;
  if (versionClicks >= 7) {
    versionClicks = 0;
    revealDeveloper?.();
    ElMessage.success("开发者选项已开启");
    return;
  }
  versionClickTimer = setTimeout(() => { versionClicks = 0; }, 3000);
}
</script>

<style lang="scss" scoped>
.about {
  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 0 12px;

    .brandLogo { width: 64px; height: 64px; object-fit: contain; }
    h3 { margin: 0 0 8px; font-size: 20px; color: var(--el-text-color-primary); }
    p { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); }
  }

  .updates {
    padding: 12px 0;
    border-top: 1px solid var(--el-border-color-lighter);

    h4 { margin: 0 0 12px; }
    .updateStatus { margin: 0 0 8px; }
    .hint { margin: 0 0 12px; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; }
    .downloadProgress { margin: 12px 0; p { font-size: 12px; color: var(--el-text-color-secondary); } }
    .updateActions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; .el-button { margin: 0; } }
  }

  .support {
    padding: 12px 0 4px;
    border-top: 1px solid var(--el-border-color-lighter);

    h4 { margin: 0 0 12px; font-size: 14px; color: var(--el-text-color-primary); }
    .phone { margin: 0 0 12px; font-size: 14px; color: var(--el-text-color-primary); }
    .wechatQr { width: 160px; height: 160px; object-fit: contain; display: block; }
    .hint { margin: 8px 0 0; font-size: 12px; color: var(--el-text-color-secondary); }
  }
}
</style>
