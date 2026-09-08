<script setup>
import { withBase, useData } from 'vitepress';
import LeagueHero from './LeagueHero.vue';
import LeagueToggle from './LeagueToggle.vue';

const { frontmatter } = useData();
const hero = frontmatter.value.hero || {};
</script>

<template>
  <section class="docs-home">
    <div class="docs-home__copy">
      <div class="docs-home__copy-inner">
        <img
          class="docs-home__logo"
          :src="withBase('/favicon.png')"
          alt="BrainSTEM Pilot"
          draggable="false"
        />
        <h1 class="docs-home__title">
          <span class="docs-home__name">{{ hero.name }}</span>
          <span class="docs-home__text">{{ hero.text }}</span>
        </h1>
        <p v-if="hero.tagline" class="docs-home__tagline">{{ hero.tagline }}</p>
        <div v-if="hero.actions?.length" class="docs-home__actions">
          <a
            v-for="action in hero.actions"
            :key="action.link"
            class="docs-home__action"
            :class="action.theme === 'brand' ? 'docs-home__action--brand' : 'docs-home__action--alt'"
            :href="withBase(action.link)"
          >
            {{ action.text }}
          </a>
        </div>
      </div>
    </div>
    <div class="docs-home__stage">
      <LeagueHero />
      <LeagueToggle class="docs-home__league" />
    </div>
  </section>
</template>
