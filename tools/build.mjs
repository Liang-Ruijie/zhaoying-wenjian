// Bundles the game into ONE self-contained index.html (JS, CSS, music and logo
// inlined) so it runs from GitHub Pages, any static host, or a double-click.

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const publicBuild=process.argv.includes('--public');

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.mp3': 'dataurl' },
  legalComments: 'eof',
  define:{__PUBLIC_BUILD__:publicBuild?'true':'false'},
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'assets/seal.svg')).toString('base64');
const jadeFrame = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'assets/ui/jade-frame.svg')).toString('base64');
const html = read('src/index.template.html')
  .replace(/%ICON%/g, () => icon)
  .replace('/*FONTS*/', '')
  .replace('/*CSS*/', () => read('src/style.css')+'\n'+read('src/ink-theme.css').replaceAll('%JADE_FRAME%', jadeFrame)+'\n'+read('src/mobile.css')+'\n'+read('src/mobile-menus.css'))
  .replace('/*JS*/', () => js);

const out = publicBuild?path.join(root,'release/pages/index.html'):path.resolve(root, process.argv[2] || 'index.html');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out, html);
const targetDir=publicBuild?path.dirname(out):path.join(root,'dist');
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(path.join(targetDir,'index.html'),html);
fs.copyFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(targetDir,'THIRD_PARTY_NOTICES.txt'));
if(publicBuild){fs.writeFileSync(path.join(targetDir,'.nojekyll'),'');fs.writeFileSync(path.join(targetDir,'version.json'),JSON.stringify({...JSON.parse(read('release-version.json')),flavor:'public-static',clientSha256:createHash('sha256').update(html).digest('hex')},null,2));}
console.log(`${path.relative(root, out)}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB  (js ${(js.length / 1024).toFixed(0)} KB)`);
