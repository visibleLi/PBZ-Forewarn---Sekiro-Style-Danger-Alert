param([string]$Node = 'node', [string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& $Python (Join-Path $PSScriptRoot 'verify.py') --node $Node
if ($LASTEXITCODE -ne 0) { throw 'Offline validation failed.' }
