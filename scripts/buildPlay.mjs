// One command -> single-file play.html (all JS inlined). Run: npm run build
import { build } from 'vite';
import { writeFileSync } from 'node:fs';

const out = await build({
  configFile: false,
  logLevel: 'warn',
  base: './',
  build: {
    target: 'es2022', sourcemap: false, modulePreload: false, write: false,
    assetsInlineLimit: 1 << 30,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const files = (Array.isArray(out) ? out[0] : out).output;
const js = files.find((f) => f.type === 'chunk' && f.isEntry);
const html = files.find((f) => f.fileName === 'index.html');
if (!js || !html) throw new Error('build produced no entry chunk or index.html');
const code = js.code.replace(/<\/script/gi, '<\\/script');
const page = html.source.toString()
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '')
  .replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
writeFileSync('play.html', page);
console.log(`play.html written (${Math.round(page.length / 1024)} KB)`);
