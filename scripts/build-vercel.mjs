/**
 * Custom Vercel build script using the Build Output API.
 * Outputs to .vercel/output/ so Vercel knows exactly where functions and
 * static files are — bypassing the "api/ scan before build" timing issue.
 */
import { execSync } from 'child_process';
import { cpSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** Resolve a local bin (works with both npm and pnpm on Vercel Linux). */
const bin = (name) => resolve(root, 'node_modules/.bin', name);

// ── 1. Frontend (Vite) ──────────────────────────────────────────────────────
console.log('\n▶  Building frontend with Vite...');
execSync(`${bin('vite')} build`, { stdio: 'inherit', cwd: root });

// ── 2. API function ─────────────────────────────────────────────────────────
const funcDir = resolve(root, '.vercel/output/functions/api/index.func');
mkdirSync(funcDir, { recursive: true });

console.log('\n▶  Bundling API with esbuild...');
execSync(
  [
    bin('esbuild'),
    'server-fn/index.ts',
    '--platform=node',
    '--bundle',              // inline all @shared/* and server/* imports
    '--format=esm',          // Node 20 supports ESM natively
    `--outfile=${funcDir}/index.mjs`,
  ].join(' '),
  { stdio: 'inherit', cwd: root },
);

// Vercel function metadata
writeFileSync(
  resolve(funcDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs20.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
    },
    null,
    2,
  ),
);

// ── 3. Static files ─────────────────────────────────────────────────────────
console.log('\n▶  Copying static files...');
const staticDir = resolve(root, '.vercel/output/static');
mkdirSync(staticDir, { recursive: true });
cpSync(resolve(root, 'dist/public'), staticDir, { recursive: true });

// ── 4. Routing config ───────────────────────────────────────────────────────
writeFileSync(
  resolve(root, '.vercel/output/config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // All /api/* and /trpc/* calls → serverless function
        { src: '/api(?:/.*)?$', dest: '/api/index' },
        { src: '/trpc(?:/.*)?$', dest: '/api/index' },
        // Serve static assets (JS, CSS, images…)
        { handle: 'filesystem' },
        // SPA fallback — everything else → index.html
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('\n✓  Vercel output ready → .vercel/output/\n');
