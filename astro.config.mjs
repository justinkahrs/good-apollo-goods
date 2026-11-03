import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';

const isNetlify =
  process.env.NETLIFY === 'true' || process.env.GAG_NETLIFY === 'true';
const isNodeRuntime =
  process.env.GAG_LOCAL_RUNTIME === 'true' ||
  process.env.GAG_VPS_RUNTIME === 'true';

export default defineConfig({
  site: 'https://goodapollogoods.com',
  output: 'static',
  adapter:
    isNodeRuntime
      ? node({ mode: 'standalone' })
      : isNetlify
        ? netlify()
        : vercel({ maxDuration: 90 }),
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
