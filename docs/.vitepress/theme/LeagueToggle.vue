<script setup>
import { useDocsLeague } from './useDocsLeague.js';

const { league } = useDocsLeague();
</script>

<template>
  <div class="league-toggle">
    <p class="league-toggle__eyebrow">League</p>
    <div class="league-toggle__control">
      <button
        v-for="id in ['ftc', 'frc']"
        :key="id"
        type="button"
        :class="{ 'is-active': league === id }"
        @click="league = id"
      >
        {{ id.toUpperCase() }}
      </button>
    </div>
    <p class="league-toggle__hint">
      Field preview follows this choice.
    </p>
  </div>
</template>
