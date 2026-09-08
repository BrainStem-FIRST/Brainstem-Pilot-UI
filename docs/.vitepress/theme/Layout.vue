<script setup>
import DefaultTheme from 'vitepress/theme';
import DocsHome from './DocsHome.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <DocsHome />
    </template>
  </Layout>
</template>
