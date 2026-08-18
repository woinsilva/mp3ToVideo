$ErrorActionPreference = 'Stop'

$toolsRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $toolsRoot 'tools'
$archivePath = Join-Path $toolsRoot 'rife-ncnn-vulkan-20221029-windows.zip'
$extractPath = Join-Path $toolsRoot 'rife-install-temp'
$targetPath = Join-Path $toolsRoot 'rife-ncnn-vulkan'
$releaseUrl = 'https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-windows.zip'

if (Test-Path -LiteralPath (Join-Path $targetPath 'rife-ncnn-vulkan.exe')) {
  Write-Host "RIFE already installed at $targetPath"
  exit 0
}

Invoke-WebRequest -Uri $releaseUrl -OutFile $archivePath
Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force
Move-Item -LiteralPath (Join-Path $extractPath 'rife-ncnn-vulkan-20221029-windows') -Destination $targetPath
Remove-Item -LiteralPath $extractPath -Recurse -Force
Remove-Item -LiteralPath $archivePath -Force

Write-Host "RIFE installed at $targetPath"
