$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$archiveName = 'SWC2026-APAC-v1-share.zip'
$archivePath = [IO.Path]::GetFullPath((Join-Path $projectRoot $archiveName))

if (-not $archivePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Archive path escapes the workspace: $archivePath"
}

if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

$entries = @(
  '.gitignore',
  '.nojekyll',
  'app',
  'index.html',
  'KUJI-REFERENCE-ANALYSIS.md',
  'README.md',
  'README-FIGURE-DRAW-v32.md',
  'handoff.md',
  'RESULT-VIDEO-IMPACT-REVIEW.md',
  'writing reference',
  'resource',
  'scripts',
  'WORKLOG.md'
)

$toolsDirectory = Join-Path $projectRoot '.tools'
if (Test-Path -LiteralPath $toolsDirectory) {
  $toolFiles = Get-ChildItem -LiteralPath $toolsDirectory -File | ForEach-Object {
    '.tools/' + $_.Name
  }
  $entries += $toolFiles
}

$tarArguments = @(
  '-a',
  '-c',
  '-f',
  $archivePath,
  '--exclude=.git',
  '--exclude=*/.git',
  '--exclude=*/.git/*',
  '--exclude=*.kuji',
  '--exclude=*/node_modules',
  '--exclude=*/node_modules/*'
) + $entries

Push-Location $projectRoot
try {
  & tar.exe @tarArguments
  if ($LASTEXITCODE -ne 0) {
    throw "tar.exe failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$archive = Get-Item -LiteralPath $archivePath
Write-Host ('Created {0} ({1:N1} MB)' -f $archive.Name, ($archive.Length / 1MB))
