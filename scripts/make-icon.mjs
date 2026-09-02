// Generates build/icon.png (used by electron-builder for .icns/.ico) from the
// same renderer the running app uses for its tray and window icons.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { encodePng, renderAppIcon } = require('../dist/main/main/icon-render.js');
mkdirSync('build', { recursive: true });
const size = 1024;
writeFileSync('build/icon.png', encodePng(size, size, renderAppIcon(size)));
console.log('wrote build/icon.png');
