const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function normalizeGoOS(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return 'linux';
  return platform;
}

function normalizeGoArch(arch = process.arch) {
  if (arch === 'x64' || arch === 'amd64') return 'amd64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  if (arch === 'ia32' || arch === '386') return '386';
  return arch;
}

function executableName(goos) {
  return goos === 'windows' ? 'multica.exe' : 'multica';
}

function prepareMulticaCli(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const goos = normalizeGoOS(options.platform || process.platform);
  const goarch = normalizeGoArch(options.targetArch || process.env.ELECTRON_BUILDER_ARCH || process.arch);
  const outputDir = options.outputDir || path.join(rootDir, 'resources', 'bundled-multica', goos + '-' + goarch);
  const outputPath = path.join(outputDir, executableName(goos));
  const serverDir = path.join(rootDir, 'apps', 'agent-manager', 'server');

  if (!fs.existsSync(path.join(serverDir, 'go.mod'))) {
    throw new Error('Multica server source not found at ' + serverDir);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const ldflags = [
    '-X',
    'main.version=agent-club',
    '-X',
    'main.commit=vendored',
    '-X',
    'main.date=' + new Date().toISOString(),
  ];

  console.log('[prepareMulticaCli] Building multica CLI for ' + goos + '/' + goarch);
  execFileSync('go', ['build', '-trimpath', '-ldflags', ldflags.join(' '), '-o', outputPath, './cmd/multica'], {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      GOOS: goos,
      GOARCH: goarch,
      CGO_ENABLED: process.env.CGO_ENABLED || '0',
    },
  });

  if (goos !== 'windows') {
    fs.chmodSync(outputPath, 0o755);
  }

  console.log('[prepareMulticaCli] Wrote ' + path.relative(rootDir, outputPath));
  return outputPath;
}

if (require.main === module) {
  const archArgIndex = process.argv.indexOf('--arch');
  const targetArch = archArgIndex >= 0 ? process.argv[archArgIndex + 1] : undefined;
  prepareMulticaCli({ targetArch });
}

module.exports = {
  executableName,
  normalizeGoArch,
  normalizeGoOS,
  prepareMulticaCli,
};
