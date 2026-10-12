$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsPath = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Path $toolsPath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'test-tools/package.json'), (Join-Path $projectRoot 'test-tools/package-lock.json') -Destination $toolsPath
& npm.cmd ci --prefix $toolsPath
if ($LASTEXITCODE -ne 0) { throw 'Test dependency installation failed' }
# 브라우저 테스트 6종이 쓰는 ffmpeg(테스트용 영상 생성). 새로 받은 저장소에는 없으므로 Python 패키지로 받는다.
$ffmpeg = Join-Path $toolsPath 'imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) {
  $py = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { throw 'ffmpeg 설치에 Python이 필요합니다. Python을 설치한 뒤 다시 실행하세요.' }
  & $py -m pip install --disable-pip-version-check --no-deps --target $toolsPath imageio-ffmpeg==0.6.0
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ffmpeg)) { throw 'ffmpeg 설치 실패' }
}
Write-Host '준비 완료. 브라우저 테스트에는 Google Chrome 설치가 추가로 필요합니다.'
