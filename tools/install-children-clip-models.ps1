param(
  [string]$ComfySharedPath = "$env:LOCALAPPDATA\Comfy-Desktop\ComfyUI-Shared"
)

$ErrorActionPreference = 'Stop'
$loraDirectory = Join-Path $ComfySharedPath 'models\loras'
$targetPath = Join-Path $loraDirectory 'picture-books-children-cartoon.safetensors'
$downloadUrl = 'https://huggingface.co/Muapi/picture-books-children-cartoon/resolve/main/picture-books-children-cartoon.safetensors?download=true'
$expectedSha256 = 'f640491814667d5947c7627e46a1c8cc1f98c28fd2f238dc49d37ec664a76cc2'

New-Item -ItemType Directory -Path $loraDirectory -Force | Out-Null

if (Test-Path -LiteralPath $targetPath) {
  $currentHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($currentHash -eq $expectedSha256) {
    Write-Output "Children clip LoRA is already installed: $targetPath"
    exit 0
  }
}

Write-Output "Downloading children clip LoRA to $targetPath"
Invoke-WebRequest -Uri $downloadUrl -OutFile $targetPath -TimeoutSec 600

$downloadedHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($downloadedHash -ne $expectedSha256) {
  throw "Downloaded LoRA checksum mismatch. Expected $expectedSha256, got $downloadedHash"
}

Write-Output "Children clip LoRA installed successfully: $targetPath"
