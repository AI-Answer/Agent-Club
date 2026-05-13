#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { prepareMulticaCli } = require('./prepareMulticaCli.js');

const args = new Set(process.argv.slice(2));
const forceLink = args.has('--force-link');
const noGlobalLink = args.has('--no-global-link');
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const homeBinDir = path.join(os.homedir(), '.agent-club', 'bin');
const localBinDir = path.join(os.homedir(), '.local', 'bin');
const binaryName = process.platform === 'win32' ? 'multica.exe' : 'multica';

function commandExists(command) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function copyExecutable(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (process.platform !== 'win32') {
    fs.chmodSync(target, 0o755);
  }
}

const builtCliPath = prepareMulticaCli({ rootDir });
const installedPath = path.join(homeBinDir, binaryName);
copyExecutable(builtCliPath, installedPath);

console.log('[setup-multica-cli] Installed Agent Club Multica CLI at ' + installedPath);

if (!noGlobalLink && process.platform !== 'win32') {
  fs.mkdirSync(localBinDir, { recursive: true });
  const linkPath = path.join(localBinDir, 'multica');
  const existingIsOurs = fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink() && fs.readlinkSync(linkPath) === installedPath;

  if (!fs.existsSync(linkPath) || existingIsOurs || forceLink) {
    try {
      fs.rmSync(linkPath, { force: true });
      fs.symlinkSync(installedPath, linkPath);
      console.log('[setup-multica-cli] Linked ' + linkPath + ' -> ' + installedPath);
    } catch (error) {
      console.warn('[setup-multica-cli] Could not link ' + linkPath + ': ' + error.message);
    }
  } else if (commandExists('multica')) {
    console.log('[setup-multica-cli] Existing multica command found; leaving it in place. Use --force-link to replace it.');
  } else {
    console.log('[setup-multica-cli] ' + linkPath + ' already exists; leaving it in place. Use --force-link to replace it.');
  }
}

try {
  const version = execFileSync(installedPath, ['version'], { encoding: 'utf8' }).trim();
  console.log('[setup-multica-cli] ' + version);
} catch (error) {
  console.warn('[setup-multica-cli] Installed CLI did not print a version: ' + error.message);
}
