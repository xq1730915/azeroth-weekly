$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAddonRoot = Join-Path $taskRoot 'addon\AzerothWeekly'
$taskOutputRoot = Join-Path $taskRoot 'dist\addon'
New-Item -ItemType Directory -Force -Path $taskOutputRoot | Out-Null
$taskFiles = Get-Content -LiteralPath (Join-Path $taskAddonRoot 'AzerothWeekly.toc') | Where-Object { $_ -match '\.lua$' }
foreach ($taskFile in $taskFiles) { if (-not (Test-Path -LiteralPath (Join-Path $taskAddonRoot $taskFile.Trim()))) { throw "插件文件缺失：$taskFile" } }
$taskArchivePath = Join-Path $taskOutputRoot 'AzerothWeekly.zip'
Compress-Archive -LiteralPath $taskAddonRoot -DestinationPath $taskArchivePath -Force
Get-Item -LiteralPath $taskArchivePath | Select-Object FullName,Length
