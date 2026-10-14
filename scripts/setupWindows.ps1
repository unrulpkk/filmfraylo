param([string]$repository = '', [string]$codex = 'codex', [switch]$register, [switch]$inspect,
  [ValidateSet('codex', 'claude', 'cursor', 'opencode', 'gemini', 'generic')][string]$harness = 'codex')
$ErrorActionPreference = 'Stop'
if ($register -and $harness -ne 'codex') { throw '-register is only for Codex. Other harnesses receive configuration to merge; omit -register.' }
# Bootstrap runs before the bundled runtime exists, using Windows built-in tools.
if ($env:OS -ne 'Windows_NT') { throw 'Use setupMac.sh on macOS.' }
$architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($architecture -ne 'AMD64') { throw "Unsupported Windows architecture: $architecture. This release supports Windows x64." }
$asset = 'filmFraylo-windows-x64.zip'
if (!$repository) { $repository = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../references/releaseRepository.txt') -Raw).Trim() }
$appParent = Join-Path $env:LOCALAPPDATA 'FilmFraylo'
$appRoot = Join-Path $appParent 'app'
if ($inspect) {
  @{ harness = $harness; platform = 'windows-x64'; asset = $asset; repository = $repository; installed = (Test-Path -LiteralPath (Join-Path $appRoot 'FilmFraylo.exe')) } | ConvertTo-Json
  return
}
if (!(Test-Path -LiteralPath (Join-Path $appRoot 'FilmFraylo.exe'))) {
  if ($repository -notmatch '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$') { throw 'Repository not configured. Use -repository owner/repo, or install the Skill ZIP from a published GitHub Release.' }
  if (Test-Path -LiteralPath $appRoot) { throw "Install directory already exists: $appRoot. It has not been overwritten." }
  $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) ('filmFraylo' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $downloadRoot | Out-Null
  $url = "https://github.com/$repository/releases/latest/download/$asset"
  $archive = Join-Path $downloadRoot $asset
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
  Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256" -OutFile "$archive.sha256"
  $expected = (Get-Content -LiteralPath "$archive.sha256" -Raw).Trim()
  if ($expected -notmatch ('^([a-fA-F0-9]{64})\s+\*?' + [regex]::Escape($asset) + '$')) { throw 'Invalid checksum file.' }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Matches[1]) { throw 'Download checksum mismatch. Package was not executed.' }
  $extracted = Join-Path $downloadRoot 'extracted'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    foreach ($entry in $zip.Entries) {
      $destination = [IO.Path]::GetFullPath((Join-Path $extracted $entry.FullName))
      if (!$destination.StartsWith([IO.Path]::GetFullPath($extracted) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive entry.' }
    }
  } finally { $zip.Dispose() }
  Expand-Archive -LiteralPath $archive -DestinationPath $extracted
  $folders = @(Get-ChildItem -LiteralPath $extracted -Directory)
  if ($folders.Count -ne 1 -or !(Test-Path -LiteralPath (Join-Path $folders[0].FullName 'FilmFraylo.exe'))) { throw 'Unexpected package layout.' }
  New-Item -ItemType Directory -Path $appParent -Force | Out-Null
  $source = [IO.Path]::GetFullPath($folders[0].FullName)
  $target = [IO.Path]::GetFullPath($appRoot)
  if (!$source.StartsWith([IO.Path]::GetFullPath($downloadRoot) + '\') -or !$target.StartsWith([IO.Path]::GetFullPath($appParent) + '\')) { throw 'Unsafe installation paths.' }
  Move-Item -LiteralPath $source -Destination $target
}
$buildInfo = Get-Content -LiteralPath (Join-Path $appRoot 'buildInfo.json') -Raw | ConvertFrom-Json
if ($buildInfo.product -ne 'FilmFraylo' -or $buildInfo.platform -ne 'windows-x64') { throw 'Installed application does not match this platform. Existing files were preserved.' }
$repositoryFile = Join-Path $PSScriptRoot '../references/releaseRepository.txt'
if (!(Get-Content -LiteralPath $repositoryFile -Raw).Trim()) {
  Copy-Item -LiteralPath (Join-Path $appRoot 'build/mcp/skills/filmfraylo/references/releaseRepository.txt') -Destination $repositoryFile
}
$skills = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeCommand = Join-Path $appRoot 'runtime/bun.exe'
$previousEncoding = $OutputEncoding
$previousConsoleEncoding = [Console]::OutputEncoding
try {
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = $OutputEncoding
  $launch = & $runtimeCommand (Join-Path $appRoot 'filmFraylo.js') start --open --skills $skills
  if ($LASTEXITCODE -ne 0) { throw 'FilmFraylo launch failed. See the message above.' }
  $options = @('--harness', $harness, '--app', $appRoot, '--skills', $skills, '--codex', $codex)
  if ($register) { $options += '--register' }
  ($launch -join "`n") | & $runtimeCommand (Join-Path $PSScriptRoot 'connectHarness.mjs') @options
  if ($LASTEXITCODE -ne 0) { throw 'FilmFraylo MCP setup failed. Existing Skill files were preserved.' }
} finally {
  $OutputEncoding = $previousEncoding
  [Console]::OutputEncoding = $previousConsoleEncoding
}
