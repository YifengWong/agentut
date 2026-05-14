// build.js — runs after tsc to copy plugin sources to dist (uncompiled)
import fs from 'fs-extra';

fs.copySync('plugins', 'dist/plugins');
console.log('Plugins copied to dist/plugins');
