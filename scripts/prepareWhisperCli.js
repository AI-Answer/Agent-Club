/**
 * Prepare whisper.cpp CLI for Electron packaging.
 *
 * Resolution order:
 *  1. GitHub release download (Linux / Windows)
 *  2. Homebrew whisper-cpp copy (macOS dev/CI when available)
 *
 * Output: resources/bundled-whisper/{platform}-{arch}/whisper-cli[.exe]
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_WHISPER_VERSION = 'v1.8.7';

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirectorySafe(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyFileSafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureExecutableMode(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

function getVersion() {
  return (process.env.WHISPER_CPP_VERSION || DEFAULT_WHISPER_VERSION).trim();
}

function getAssetName(platform, arch, tag) {
  if (platform === 'win32') {
    return arch === 'x64' ? 'whisper-bin-x64.zip' : 'whisper-bin-Win32.zip';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'whisper-bin-ubuntu-arm64.tar.gz' : 'whisper-bin-ubuntu-x64.tar.gz';
  }
  return null;
}

function getDownloadUrl(assetName, tag) {
  return `https://github.com/ggml-org/whisper.cpp/releases/download/${tag}/${assetName}`;
}

function downloadFile(url, outputPath) {
  console.log(`  Downloading whisper.cpp from ${url}`);
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 300000 });
    return;
  }
  execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], { timeout: 300000 });
}

function extractArchive(archivePath, outputDir, platform) {
  ensureDirectory(outputDir);
  if (archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      const ps = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', outputDir]);
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', outputDir]);
  }
}

function findBinaryInDir(dir, binaryName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === binaryName) return fullPath;
    if (entry.isDirectory()) {
      const found = findBinaryInDir(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
}

function copyDirectoryContents(sourceDir, targetDir) {
  ensureDirectory(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
    } else {
      copyFileSafe(sourcePath, targetPath);
      ensureExecutableMode(targetPath);
    }
  }
}

function bundleFromHomebrew(targetDir, binaryName) {
  try {
    const prefix = execFileSync('brew', ['--prefix', 'whisper-cpp'], { encoding: 'utf-8', timeout: 10000 }).trim();
    const cliPath = path.join(prefix, 'bin', binaryName);
    if (!fs.existsSync(cliPath)) return null;

    const targetBinary = path.join(targetDir, binaryName);
    copyFileSafe(cliPath, targetBinary);
    ensureExecutableMode(targetBinary);

    const libDir = path.join(targetDir, 'lib');
    ensureDirectory(libDir);

    const libCandidates = [
      path.join(prefix, 'lib', 'libwhisper.1.dylib'),
      path.join(prefix, 'lib', 'libwhisper.dylib'),
    ];
    for (const libPath of libCandidates) {
      if (fs.existsSync(libPath)) {
        copyFileSafe(libPath, path.join(libDir, path.basename(libPath)));
      }
    }

    const ggmlDir = path.join(prefix, '..', 'ggml', 'lib');
    if (fs.existsSync(ggmlDir)) {
      for (const entry of fs.readdirSync(ggmlDir)) {
        if (entry.endsWith('.dylib')) {
          copyFileSafe(path.join(ggmlDir, entry), path.join(libDir, entry));
        }
      }
    }

    return targetBinary;
  } catch {
    return null;
  }
}

function downloadAndExtract(platform, arch, tag) {
  const assetName = getAssetName(platform, arch, tag);
  if (!assetName) {
    throw new Error(`Unsupported whisper.cpp target: ${platform}-${arch}`);
  }

  const url = getDownloadUrl(assetName, tag);
  const tempDir = path.join(os.tmpdir(), 'agentclub-whisper', tag, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);
  downloadFile(url, archivePath);
  extractArchive(archivePath, extractDir, platform);

  const binaryName = getBinaryName(platform);
  if (platform === 'win32') {
    const releaseDir = path.join(extractDir, 'Release');
    if (!fs.existsSync(releaseDir)) {
      throw new Error('Windows whisper.cpp Release directory not found');
    }
    return { releaseDir, binaryName, tempDir, url };
  }

  const binaryPath = findBinaryInDir(extractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in downloaded archive`);
  }
  return { binaryPath, tempDir, url };
}

function prepareWhisperCli() {
  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  const arch = process.env.WHISPER_ARCH || process.env.npm_config_target_arch || process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const tag = getVersion().startsWith('v') ? getVersion() : `v${getVersion()}`;
  const targetDir = path.join(projectRoot, 'resources', 'bundled-whisper', runtimeKey);
  const binaryName = getBinaryName(platform);

  console.log(`Preparing whisper.cpp CLI for ${runtimeKey} (${tag})`);
  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  if (platform === 'darwin') {
    const homebrewBinary = bundleFromHomebrew(targetDir, binaryName);
    if (homebrewBinary) {
      sourceType = 'homebrew';
      sourceDetail = { path: homebrewBinary };
      console.log('  Bundled whisper-cli from Homebrew whisper-cpp');
    }
  } else {
    try {
      const result = downloadAndExtract(platform, arch, tag);
      tempDir = result.tempDir;
      sourceDetail = { url: result.url };
      sourceType = 'download';

      if (platform === 'win32') {
        copyDirectoryContents(result.releaseDir, targetDir);
        console.log('  Downloaded Windows whisper.cpp Release bundle');
      } else {
        copyFileSafe(result.binaryPath, path.join(targetDir, binaryName));
        ensureExecutableMode(path.join(targetDir, binaryName));
        console.log('  Downloaded Linux whisper.cpp binary');
      }
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  const targetBinaryPath = path.join(targetDir, binaryName);
  const prepared = fs.existsSync(targetBinaryPath);

  const manifest = {
    platform,
    arch,
    version: tag,
    generatedAt: new Date().toISOString(),
    sourceType,
    source: sourceDetail,
    files: prepared ? fs.readdirSync(targetDir) : [],
    skipped: !prepared,
    reason: prepared ? undefined : 'whisper-cli binary not found',
  };

  writeJson(path.join(targetDir, 'manifest.json'), manifest);

  if (tempDir) removeDirectorySafe(tempDir);

  if (prepared) {
    console.log(`  Bundled whisper-cli prepared: resources/bundled-whisper/${runtimeKey}/${binaryName}`);
    return { prepared: true, dir: targetDir, sourceType };
  }

  console.warn('  whisper-cli not bundled — local STT will rely on system PATH in dev');
  return { prepared: false, reason: 'not_found' };
}

module.exports = prepareWhisperCli;

if (require.main === module) {
  prepareWhisperCli();
}
