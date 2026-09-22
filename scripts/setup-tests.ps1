$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsPath = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Path $toolsPath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'test-tools/package.json'), (Join-Path $projectRoot 'test-tools/package-lock.json') -Destination $toolsPath
& npm.cmd ci --prefix $toolsPath
if ($LASTEXITCODE -ne 0) { throw 'Test dependency installation failed' }
Write-Host 'Ready. Browser tests additionally require a local Google Chrome installation.'
