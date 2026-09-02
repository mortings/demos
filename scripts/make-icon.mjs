// Generates build/icon.png (used by electron-builder for .icns/.ico) from the
// same renderer the running app uses for its tray and window icons.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { encodePng, renderMic } = require('../dist/main/main/icon-render.js');
mkdirSync('build', { recursive: true });
const size = 1024;
writeFileSync('build/icon.png', encodePng(size, size, renderMic(size, { color: [255, 255, 255], background: [37, 99, 235], inset: 0.2 })));
console.log('wrote build/icon.png');
