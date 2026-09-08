import { defineConfig } from 'vitepress';

const DOCS_BASE = '/Brainstem-Pilot-UI/docs/';
const DOCS_ORIGIN = 'https://brainstem-first.github.io/Brainstem-Pilot-UI/docs';
const JAVADOC_FRC = `${DOCS_ORIGIN}/javadoc/frc/index.html`;
const JAVADOC_FTC = `${DOCS_ORIGIN}/javadoc/ftc/index.html`;

export default defineConfig({
  title: 'BrainSTEM Pilot',
  description: 'Install BrainSTEM Pilot, learn the editor, and browse the FRC and FTC Java APIs.',
  base: DOCS_BASE,
  srcDir: '.',
  outDir: '../dist/docs',
  cleanUrls: true,
  ignoreDeadLinks: true,
  themeConfig: {
    logo: '/favicon.png',
    siteTitle: 'BrainSTEM Pilot',
    search: {
      provider: 'local',
    },
    nav: [
      { text: 'Install', link: '/install/app' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Open the app', link: 'https://brainstem-first.github.io/Brainstem-Pilot-UI/' },
    ],
    sidebar: [
      {
        text: 'Install',
        items: [
          { text: 'The app', link: '/install/app' },
          { text: 'FRC library', link: '/install/frc' },
          { text: 'FTC library', link: '/install/ftc' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Paths', link: '/guide/paths' },
          { text: 'Path editor', link: '/guide/editor' },
          { text: 'Autos', link: '/guide/autos' },
          { text: 'FRC', link: '/guide/frc' },
          { text: 'FTC', link: '/guide/ftc' },
          { text: 'File format', link: '/guide/files' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Class reference', link: '/api' },
          { text: 'FRC Javadoc', link: JAVADOC_FRC },
          { text: 'FTC Javadoc', link: JAVADOC_FTC },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI' },
    ],
    footer: {
      message: 'Search this site from the box in the header. The Java API pages are generated from source.',
      copyright: 'Copyright © BrainSTEM FIRST',
    },
    editLink: {
      pattern: 'https://github.com/BrainStem-FIRST/Brainstem-Pilot-UI/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
