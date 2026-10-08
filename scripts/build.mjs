import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
// Wrap each existing sprite frame in a small SVG; no native image library needed.
rmSync('media/merlin/frames', { recursive: true, force: true });
mkdirSync('media/merlin/frames', { recursive: true });
for (const [state, count] of Object.entries({ idle: 4, moving: 4, magic: 6, disappear: 6, appear: 6, speaking: 4 })) {
  const png = readFileSync(`media/merlin/${state}.png`).toString('base64');
  for (let scale = 1; scale <= 6; scale++) for (let frame = 0; frame < count; frame++) writeFileSync(`media/merlin/frames/${state}-${frame}-${scale}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${32 * scale}" height="${32 * scale}" viewBox="${frame * 32} 0 32 32"><image width="${count * 32}" height="32" href="data:image/png;base64,${png}" style="image-rendering:pixelated"/></svg>`);
}
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
execFileSync('node',['node_modules/typescript/bin/tsc'],{stdio:'inherit'});
await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',external:['vscode'],outfile:'dist/extension.js'});
await build({entryPoints:['src/editorSpeech.ts','src/roaming.ts','src/suggestedFix.ts','src/diagnostics.ts','webview/animation.ts','webview/voice.ts','src/merlinViewProvider.ts','src/companionConnection.ts'],bundle:true,platform:'node',external:['vscode'],outdir:'dist/test',entryNames:'[name]',format:'cjs'});
await build({entryPoints:['webview/main.ts'],bundle:true,platform:'browser',outfile:'dist/webview.js'});
