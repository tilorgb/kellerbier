#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { AtlasBuildError, buildAtlases, formatBuildReport } from './build.mjs';

const rootDir = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const outDir = fileURLToPath(new URL('../../assets/atlases/', import.meta.url));

try {
  const report = await buildAtlases({ rootDir, outDir });
  console.log(formatBuildReport(report));
} catch (error) {
  if (error instanceof AtlasBuildError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
  process.exitCode = 1;
}
