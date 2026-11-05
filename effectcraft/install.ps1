# Installs TransitionLab into EffectCraft as a dockable panel (Window > TransitionLab > TransitionLab.jsx).
# Run from the unpacked folder:  powershell -ExecutionPolicy Bypass -File install.ps1
# Restart EffectCraft afterwards if it is open.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here "TransitionLab-EC.jsx"
$assets = Join-Path $here "assets"
if (-not (Test-Path $src)) { throw "TransitionLab-EC.jsx not found next to install.ps1" }
if (-not (Test-Path $assets)) { $assets = Join-Path (Split-Path -Parent $here) "assets" }
if (-not (Test-Path $assets)) { throw "assets folder not found next to install.ps1" }

$dest = Join-Path $env:APPDATA "EffectCraft\Scripts\ScriptUI Panels\TransitionLab"
New-Item -ItemType Directory -Force $dest | Out-Null
if (Test-Path (Join-Path $dest "assets")) { Remove-Item -Recurse -Force (Join-Path $dest "assets") }
Copy-Item -Recurse $assets (Join-Path $dest "assets")
Get-ChildItem (Join-Path $dest "assets") -Recurse -Filter ".gitkeep" | Remove-Item -Force

# an installed panel has no folder of its own: write where it lives into the script
$code = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8)
$self = ((Join-Path $dest "TransitionLab.jsx") -replace "\\", "/")
$code = $code.Replace('var SCRIPT_FILE = File($.fileName);', 'var SCRIPT_FILE = File("' + $self + '");')
[IO.File]::WriteAllText((Join-Path $dest "TransitionLab.jsx"), $code, (New-Object Text.UTF8Encoding $false))

Write-Host "TransitionLab installed to $dest"
Write-Host "Open it in EffectCraft: Window > TransitionLab > TransitionLab.jsx"
