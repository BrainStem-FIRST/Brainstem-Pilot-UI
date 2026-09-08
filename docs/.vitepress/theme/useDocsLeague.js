import { ref } from 'vue';

const league = ref('ftc');

export function useDocsLeague() {
  return { league };
}
