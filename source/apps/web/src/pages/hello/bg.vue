<template>
  <picture class="bgArt" aria-hidden="true">
    <source media="(prefers-reduced-motion: reduce)" :srcset="posterUrl" />
    <img :src="filmUrl" alt="" width="640" height="800" />
  </picture>
</template>

<script setup lang="ts">
import filmUrl from "@/assets/welcomeFilm.gif";
import posterUrl from "@/assets/welcomeFilmPoster.png";
</script>

<style lang="scss" scoped>
.bgArt {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  background: #090e1e;
  pointer-events: none;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
