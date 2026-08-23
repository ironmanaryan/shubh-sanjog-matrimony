#!/usr/bin/env node
/**
 * Cross-platform dev orchestrator — `npm run dev` starts BOTH:
 *   1. the Express API   (node server/index.js)      → http://localhost:4000
 *   2. the Next.js app   (next dev)                  → http://localhost:3000
 *
 * Zero extra dependencies: spawns both child processes, prefixes their output
 * ([api] / [web]) so logs stay readable, and tears the sibling down whenever
 * one exits or the orchestrator receives Ctrl+C / SIGTERM.
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEXT_BIN = require.resolve('next/dist/bin/next');

const children = [];
let shuttingDown = false;

function killAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child || child.killed || child.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') {
        // On Windows, child.kill() does not reap detached grandchildren.
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* already gone */
    }
  }
}

function prefix(label, color) {
  return (chunk) => {
    process.stdout.write(
      chunk
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => `\x1b[${color}m[${label}]\x1b[0m ${line}`)
        .join('\n') + '\n'
    );
  };
}

function start(label, color, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Let Ctrl+C reach this orchestrator; we forward shutdown explicitly.
    windowsHide: true,
  });
  children.push(child);

  child.stdout.on('data', prefix(label, color));
  child.stderr.on('data', prefix(label, color));

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`\n[${label}] exited with code ${code ?? 'signal'} — shutting everything down.`);
    killAll();
    process.exit(code ?? 1);
  });

  return child;
}

console.log('Starting Shubh Sanjog development stack…');
start('api', '36', process.execPath, [path.join(ROOT, 'server', 'index.js')]); // cyan
start('web', '35', process.execPath, [NEXT_BIN, 'dev']); // magenta

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    console.log(`\nReceived ${signal} — stopping API and web server…`);
    killAll();
    process.exit(0);
  });
}

// Safety net: make sure children never outlive the orchestrator.
process.on('exit', killAll);
