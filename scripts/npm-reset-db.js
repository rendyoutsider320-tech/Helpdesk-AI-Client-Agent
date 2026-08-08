#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptDir = __dirname;
const moduleRoot = path.resolve(scriptDir, '..');
const envPaths = [
  path.join(moduleRoot, '.env'),
  path.join(moduleRoot, 'helpdesk-ai', '.env'),
  path.join(moduleRoot, '..', '.env'),
  path.join(moduleRoot, '..', 'helpdesk-ai', '.env'),
];

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadDotEnv() {
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      console.log(`Loading environment from ${p}`);
      return parseEnvFile(p);
    }
  }
  console.log('No .env file found; using process environment variables');
  return {};
}

function main() {
  const userArgs = process.argv.slice(2);
  const defaultAction = 'reset';
  const args = [];
  let hasAction = false;

  for (const arg of userArgs) {
    if (arg.startsWith('--action=')) {
      hasAction = true;
      args.push(arg);
      continue;
    }
    if (arg === '--action') {
      hasAction = true;
      args.push(arg);
      continue;
    }
    args.push(arg);
  }

  if (!hasAction) {
    args.unshift('--action', defaultAction);
  }

  const env = loadDotEnv();
  const mergedEnv = Object.assign({}, process.env, env);

  const resetScript = path.join(moduleRoot, 'scripts', 'reset_db.go');
  const migrationsPath = path.join(moduleRoot, 'migrations');
  const cmdArgs = ['run', resetScript, '--dir', migrationsPath, ...args];

  console.log('Running DB migration with args:', cmdArgs.join(' '));
  const result = spawnSync('go', cmdArgs, {
    cwd: moduleRoot,
    env: mergedEnv,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('Failed to execute go:', result.error.message);
    process.exit(1);
  }
  process.exit(result.status);
}

main();
