<template>
  <div class="about">
    <div class="brand">
      <img class="brandLogo" :src="logoUrl" alt="FilmFraylo Logo" />
      <div>
        <h3>FilmFraylo</h3>
        <p v-if="version">v{{ version }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import logoUrl from "@toonflow/assets/filmFrayloLogo.png";
const version = import.meta.env.appVersion;
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
}
</style>
