import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://goodapollogoods.com',
  output: 'static',
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
