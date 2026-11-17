param([string]$Node = 'node', [string]$Python = 'python')
$ErrorActionPreference = 'Stop'
# Build the bank, then validate. Both scripts live in tools/.
& $Python (Join-Path $PSScriptRoot 'tools/audio-bank/build_bank.py')
if ($LASTEXITCODE -ne 0) { throw 'Audio bank build failed.' }
& $Python (Join-Path $PSScriptRoot 'tools/verify.py') --node $Node
if ($LASTEXITCODE -ne 0) { throw 'Offline validation failed.' }
