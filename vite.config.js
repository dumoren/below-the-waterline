import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const siteUrl = loadEnv(mode, process.cwd(), 'SITE_URL').SITE_URL;
  const previewUrl = siteUrl ? new URL('social-preview.jpg', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).href : null;
  return {
    base: './',
    build: { target: 'es2022', chunkSizeWarningLimit: 900 },
    plugins: [{
      name: 'social-preview-url',
      transformIndexHtml(html) {
        return previewUrl ? html.replaceAll('content="./social-preview.jpg"', `content="${previewUrl}"`) : html;
      },
    }],
  };
});
