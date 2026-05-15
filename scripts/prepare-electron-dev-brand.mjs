#!/usr/bin/env node

import { copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const brandName = 'Agent Club';
const bundleId = 'com.agentclub.dev';
const electronApp = join(root, 'node_modules/electron/dist/Electron.app');
const plistPath = join(electronApp, 'Contents/Info.plist');
const bundleIconPath = join(electronApp, 'Contents/Resources/electron.icns');
const sourceIconPath = join(root, 'resources/app.icns');
const plistBuddy = '/usr/libexec/PlistBuddy';

function runPlistBuddy(args) {
  const result = spawnSync(plistBuddy, args, { encoding: 'utf8' });
  return result.status === 0;
}

function setPlistValue(key, value) {
  if (!runPlistBuddy(['-c', `Set :${key} ${value}`, plistPath])) {
    runPlistBuddy(['-c', `Add :${key} string ${value}`, plistPath]);
  }
}

if (process.platform === 'darwin' && existsSync(plistPath)) {
  setPlistValue('CFBundleName', brandName);
  setPlistValue('CFBundleDisplayName', brandName);
  setPlistValue('CFBundleIdentifier', bundleId);
  setPlistValue('NSHumanReadableCopyright', 'Copyright 2026 Agent Club');

  if (existsSync(sourceIconPath)) {
    copyFileSync(sourceIconPath, bundleIconPath);
  }

  spawnSync('touch', [electronApp]);
} else if (process.env.AGENT_CLUB_BRAND_VERBOSE === '1') {
  console.log(`[prepare-electron-dev-brand] skipped for ${resolve(electronApp)}`);
}
