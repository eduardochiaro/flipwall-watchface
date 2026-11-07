// The settings page travels inside the app: index.js hands the phone the whole
// page as a data: URL. This builds it: src/pkjs/page/config.html with the shared
// modules (catalog, timezone, face, code) and the page logic (app.js) inlined,
// written out as src/pkjs/page.js for index.js to require. Run by every build.
//
//   node scripts/inline-config.mjs                     page.js only
//   node scripts/inline-config.mjs out.html [platform] also a page to open in a
//                                                      browser, with sample state
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const version = JSON.parse(read('package.json')).version;

// Each module runs in its own scope with a CommonJS-shaped module object, and
// require() hands back an earlier one by its file name. Order matters.
const MODULES = ['catalog', 'timezone', 'face', 'code'];
const modules = 'var __modules = {};\n' +
  'function require(name) { return __modules[name.replace(/^.*\\//, \'\')]; }\n' +
  MODULES.map((name) => `__modules['${name}'] = (function () {\nvar module = { exports: {} }, exports = module.exports;\n` +
    `${read(`src/pkjs/modules/${name}.js`)}\nreturn module.exports;\n})();`).join('\n');

const html = read('src/pkjs/page/config.html');
const tags = { modules: '<script src="modules.js"></script>', app: '<script src="app.js"></script>',
  fonts: '<link rel="stylesheet" href="fonts.css">' };
for (const t of Object.values(tags)) {
  if (!html.includes(t)) { throw new Error(`config.html lost its ${t}`); }
}
const app = read('src/pkjs/page/app.js').replace('%%VERSION%%', version);
for (const [name, text] of [['modules', modules], ['app', app]]) {
  if (/<\/script/i.test(text)) { throw new Error(`${name} holds a </script> that would end the page's script`); }
}
// Through functions: the sources may hold "$" sequences a string replacement reads.
const page = html.replace(tags.modules, () => `<script>\n${modules}\n</script>`)
  .replace(tags.app, () => `<script>\n${app}\n</script>`)
  // The watch fonts Google Fonts doesn't have, written by scripts/fonts.py.
  .replace(tags.fonts, () => `<style>\n${read('src/pkjs/page/fonts.css')}</style>`);

writeFileSync(new URL('../src/pkjs/page.js', import.meta.url),
  '// Generated from src/pkjs/page/ by scripts/inline-config.mjs. Do not edit.\n' +
  `module.exports = ${JSON.stringify(page)};\n`);

const [out, platform = 'basalt'] = process.argv.slice(2);
if (out) {
  const state = JSON.stringify({ settings: {}, platform });
  writeFileSync(out, page.replace('var STATE = null; //$$STATE$$', () => `var STATE = ${state};`));
}
