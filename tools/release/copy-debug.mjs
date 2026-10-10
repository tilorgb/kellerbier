import { copyFileSync } from 'node:fs';

/**
 * Puts the debug build next to the release (`vite.debug.config.ts`): the two
 * builds empty their own folders, so the debug one is built apart and copied
 * across afterwards.
 */
copyFileSync('release-debug/Kellerbier-debug.html', 'release/Kellerbier-debug.html');
console.log('release/Kellerbier-debug.html written');
