# PowerShell launcher for backend Next.js dev server as a Windows service/scheduled task.
# Runs with absolute paths to avoid PATH issues in SYSTEM context.
$ErrorActionPreference = 'Stop'

$backendDir = "C:\Users\user\Documents\coding\userhythm\backend"
$nodeExe    = "C:\Program Files\nodejs\node.exe"
$nextBin    = Join-Path $backendDir "node_modules\next\dist\bin\next"

# Prisma engine envs (match npm run dev script)
$env:PRISMA_CLIENT_ENGINE_TYPE = "library"
$env:PRISMA_GENERATE_ENGINE = "library"
$env:PRISMA_CLI_QUERY_ENGINE_TYPE = "binary"
$env:PRISMA_CLI_QUERY_ENGINE_BINARY_TARGETS = "native"
$env:NODE_ENV = "development"

Start-Process -FilePath $nodeExe `
  -ArgumentList @($nextBin, "dev") `
  -WorkingDirectory $backendDir `
  -NoNewWindow `
  -WindowStyle Hidden

