// Bundles the Express server and all its dependencies into one file for Netlify Server,
// so nothing has to be found in node_modules at runtime. Run by the Netlify build.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.js'],
  outfile: 'netlify/server/server.bundle.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['pg-native'], // optional native driver; pg works without it
  define: { 'process.env.BK_SCHEMA_SQL': JSON.stringify(readFileSync('src/db/schema.sql', 'utf8')) },
  logLevel: 'info',
});
