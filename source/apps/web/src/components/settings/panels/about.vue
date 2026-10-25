<template>
  <div class="about">
    <div class="brand">
      <img class="brandLogo" :src="logoUrl" :alt="`${product.name} Logo`" />
      <div>
        <h3>{{ product.name }}</h3>
        <p v-if="version" class="version" @click="onVersionClick">v{{ version }}</p>
      </div>
    </div>
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
import { inject } from "vue";
import { ElMessage } from "element-plus";
import { logoUrl } from "@/lib/product";
import { wechatQrUrl } from "@/lib/product";
const version = import.meta.env.appVersion;

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
