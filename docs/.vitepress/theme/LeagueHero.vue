<script setup>
import { ref, computed, watch } from 'vue';
import { withBase } from 'vitepress';
import { useDocsLeague } from './useDocsLeague.js';

const { league } = useDocsLeague();
const failed = ref(false);
const src = computed(() => withBase(`/media/${league.value}.mp4`));

watch(league, () => {
  failed.value = false;
});
</script>

<template>
  <div class="league-stage">
    <video
      v-if="!failed"
      :key="league"
      class="league-stage__video"
      :src="src"
      autoplay
      loop
      muted
      playsinline
      preload="auto"
      @error="failed = true"
    />
    <div v-else class="league-stage__fallback">
      {{ league.toUpperCase() }} preview
    </div>
    <div class="league-stage__fade" />
    <div class="league-stage__caption">
      <span class="league-stage__dot" />
      <span>{{ league.toUpperCase() }} field</span>
    </div>
  </div>
</template>
