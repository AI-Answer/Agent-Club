param(
  [string]$RepoUrl = "",
  [string]$InstallDir = "",
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
  $RepoUrl = if ($env:AGENT_CLUB_REPO) { $env:AGENT_CLUB_REPO } else { "https://github.com/Samin12/Agent-Club.git" }
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = if ($env:AGENT_CLUB_DIR) { $env:AGENT_CLUB_DIR } else { Join-Path $HOME "Agent-Club" }
}

function Write-Step {
  param([string]$Message)
  Write-Host "[agent-club] $Message"
}

function Fail {
  param([string]$Message)
  Write-Error "[agent-club] ERROR: $Message"
  exit 1
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-PathForCurrentProcess {
  param([string]$PathToAdd)
  if ((Test-Path $PathToAdd) -and (($env:Path -split ";") -notcontains $PathToAdd)) {
    $env:Path = "$PathToAdd;$env:Path"
  }
}

function Test-NodeVersion {
  if (-not (Test-CommandExists "node")) {
    return $false
  }

  $ok = node -e "const major=Number(process.versions.node.split('.')[0]); process.exit(major >= 22 && major < 25 ? 0 : 1)"
  return $LASTEXITCODE -eq 0
}

function Ensure-Winget {
  if (-not (Test-CommandExists "winget")) {
    Fail "winget is required to install missing prerequisites. Install App Installer from Microsoft Store, then run this script again."
  }
}

function Ensure-Git {
  if (Test-CommandExists "git") {
    Write-Step "Git is installed"
    return
  }

  Ensure-Winget
  Write-Step "Installing Git with winget..."
  winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
  Add-PathForCurrentProcess "C:\Program Files\Git\cmd"

  if (-not (Test-CommandExists "git")) {
    Fail "Git installed, but it is not on PATH. Open a new PowerShell window and run this script again."
  }
}

function Ensure-Node {
  if (Test-NodeVersion) {
    Write-Step "Node $(node --version) is installed"
    return
  }

  Ensure-Winget
  Write-Step "Installing Node.js LTS with winget..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  Add-PathForCurrentProcess "C:\Program Files\nodejs"

  if (-not (Test-NodeVersion)) {
    $current = if (Test-CommandExists "node") { node --version } else { "missing" }
    Fail "Node.js >=22 and <25 is required. Current: $current. Open a new PowerShell window or install Node 22/24 from https://nodejs.org/."
  }

  Write-Step "Node $(node --version) is ready"
}

function Ensure-Bun {
  Add-PathForCurrentProcess (Join-Path $HOME ".bun\bin")

  if (Test-CommandExists "bun") {
    Write-Step "Bun $(bun --version) is installed"
    return
  }

  Write-Step "Installing Bun..."
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://bun.sh/install.ps1 | iex"
  Add-PathForCurrentProcess (Join-Path $HOME ".bun\bin")

  if (-not (Test-CommandExists "bun")) {
    Fail "Bun installed, but it is not on PATH. Open a new PowerShell window and run this script again."
  }

  Write-Step "Bun $(bun --version) installed"
}

function Clone-OrUpdateRepo {
  $parent = Split-Path -Parent $InstallDir
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
  }

  if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Step "Updating existing checkout at $InstallDir"
    git -C $InstallDir fetch --prune
    git -C $InstallDir pull --ff-only
    return
  }

  if (Test-Path $InstallDir) {
    Fail "$InstallDir exists but is not a git checkout. Move it or pass -InstallDir with another path."
  }

  Write-Step "Cloning Agent Club into $InstallDir"
  git clone $RepoUrl $InstallDir
}

function Install-Dependencies {
  Push-Location $InstallDir
  try {
    Write-Step "Installing dependencies with Bun..."
    bun install
  }
  finally {
    Pop-Location
  }
}

function Start-App {
  Push-Location $InstallDir
  Write-Step "Starting Agent Club. Keep this PowerShell window open while using the dev app."
  bun run start
  Pop-Location
}

Write-Step "Installing Agent Club from $RepoUrl"
Ensure-Git
Ensure-Node
Ensure-Bun
Clone-OrUpdateRepo
Install-Dependencies

if (-not $NoStart) {
  Start-App
} else {
  Write-Step "Done. Start later with: cd `"$InstallDir`"; bun run start"
}
