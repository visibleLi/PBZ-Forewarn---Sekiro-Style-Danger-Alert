param([string]$Node = 'node', [string]$Python = 'python')
$ErrorActionPreference = 'Stop'
# Prepare the pinned development-only interface checker, then build and validate.
& npm --prefix (Join-Path $PSScriptRoot 'tools/dev-types') ci --include=dev --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Interface checker preparation failed.' }
# Build the bank, then validate. Both scripts live in tools/.
& $Python (Join-Path $PSScriptRoot 'tools/audio-bank/build_bank.py')
if ($LASTEXITCODE -ne 0) { throw 'Audio bank build failed.' }
& $Python (Join-Path $PSScriptRoot 'tools/verify.py') --node $Node
if ($LASTEXITCODE -ne 0) { throw 'Offline validation failed.' }
