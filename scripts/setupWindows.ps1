param([string]$repository = '', [string]$codex = 'codex', [switch]$register, [switch]$inspect,
  [ValidateSet('', 'check', 'prepare', 'apply')][string]$update = '', [string]$version = '',
  [string]$installation = '', [string]$dataDirectory = '', [switch]$restart,
  [ValidateSet('desktop', 'web')][string]$mode = 'desktop',
  [ValidateSet('codex', 'claude', 'cursor', 'opencode', 'gemini', 'workbuddy', 'generic')][string]$harness = 'codex')
$ErrorActionPreference = 'Stop'
if ($register -and $harness -notin @('codex', 'workbuddy')) { throw '-register is only for Codex/WorkBuddy. Other harnesses receive configuration to merge; omit -register.' }
# Bootstrap runs before the bundled runtime exists, using Windows built-in tools.
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Use setupMac.sh on macOS.' }
$architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($architecture -ne [Runtime.InteropServices.Architecture]::X64) { throw "Unsupported Windows architecture: $architecture. This release supports Windows x64." }
$asset = "filmFraylo-$mode-windows-x64.zip"
if (!$repository) { $repository = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../references/releaseRepository.txt') -Raw).Trim() }
$appParent = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'FilmFraylo'
# A stable user path remains visible when setup is launched from a packaged desktop harness.
if ($harness -eq 'workbuddy') { $appParent = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.filmfraylo' }
$appRoot = Join-Path $appParent 'app'
if ($mode -eq 'desktop') { $appParent = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.filmfraylo'; $appRoot = Join-Path $appParent 'desktop' }
if ($update) {
  if ($mode -ne 'desktop' -or $inspect -or $register) { throw 'Update supports desktop only; do not combine with inspect or register.' }
  if ($installation) { $appRoot = [IO.Path]::GetFullPath($installation) }
  $updater = Join-Path $PSScriptRoot 'updateClient.js'
  if (!(Test-Path -LiteralPath $updater)) { throw 'Install the complete latest Release Skill ZIP first; this Skill has no bundled client updater.' }
  $runtime = Join-Path $appRoot 'app/bin/bun.exe'
  if (!(Test-Path -LiteralPath $runtime)) { throw 'Installed desktop runtime not found. Check the installation path; no new installation was started.' }
  # Run outside the program being replaced, so the updater itself does not lock the old executable.
  $helperDirectory = Join-Path ([IO.Path]::GetTempPath()) ('filmFrayloUpdate' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $helperDirectory | Out-Null
  $helper = Join-Path $helperDirectory 'bun.exe'
  Copy-Item -LiteralPath $runtime -Destination $helper
  $options = @($updater, '--action', $update, '--installation', $appRoot, '--repository', $repository, '--platform', 'windows-x64')
  if ($version) { $options += @('--version', $version) }
  if ($dataDirectory) { $options += @('--data', $dataDirectory) }
  if ($restart) { $options += '--restart' }
  $previousEncoding = [Console]::OutputEncoding
  try {
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    & $helper @options
    $updateExit = $LASTEXITCODE
  } finally {
    [Console]::OutputEncoding = $previousEncoding
    Remove-Item -LiteralPath $helper
    Remove-Item -LiteralPath $helperDirectory
  }
  exit $updateExit
}
if ($version -or $installation -or $dataDirectory -or $restart) { throw 'Update options require -update check, prepare or apply.' }
$entryRelative = if ($mode -eq 'desktop') { 'app/bin/launcher.exe' } else { 'filmFraylo.js' }
if ($inspect) {
  @{ harness = $harness; mode = $mode; platform = 'windows-x64'; asset = $asset; repository = $repository; installed = (Test-Path -LiteralPath (Join-Path $appRoot $entryRelative)) } | ConvertTo-Json
  return
}
if (!(Test-Path -LiteralPath (Join-Path $appRoot $entryRelative))) {
  if ($repository -notmatch '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$') { throw 'Repository not configured. Use -repository owner/repo, or install the Skill ZIP from a published GitHub Release.' }
  if (Test-Path -LiteralPath $appRoot) { throw "Install directory already exists: $appRoot. It has not been overwritten." }
  $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) ('filmFraylo' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $downloadRoot | Out-Null
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest"
  $attachment = @($release.assets | Where-Object { $_.name -eq $asset })
  if ($attachment.Count -ne 1) { throw "Release $($release.tag_name) has no $mode package for this system ($asset). No fallback was started." }
  $url = $attachment[0].browser_download_url
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
  if ($folders.Count -ne 1 -or !(Test-Path -LiteralPath (Join-Path $folders[0].FullName $entryRelative))) { throw 'Unexpected package layout.' }
  New-Item -ItemType Directory -Path $appParent -Force | Out-Null
  $source = [IO.Path]::GetFullPath($folders[0].FullName)
  $target = [IO.Path]::GetFullPath($appRoot)
  if (!$source.StartsWith([IO.Path]::GetFullPath($downloadRoot) + '\') -or !$target.StartsWith([IO.Path]::GetFullPath($appParent) + '\')) { throw 'Unsafe installation paths.' }
  Move-Item -LiteralPath $source -Destination $target
}
$infoRelative = if ($mode -eq 'desktop') { 'app/Resources/app/buildInfo.json' } else { 'buildInfo.json' }
$buildInfo = Get-Content -LiteralPath (Join-Path $appRoot $infoRelative) -Raw | ConvertFrom-Json
if ($buildInfo.product -ne 'FilmFraylo' -or $buildInfo.platform -ne 'windows-x64') { throw 'Installed application does not match this platform. Existing files were preserved.' }
if ($mode -eq 'desktop' -and $buildInfo.mode -ne 'desktop') { throw 'This is not a native desktop package.' }
$repositoryFile = Join-Path $PSScriptRoot '../references/releaseRepository.txt'
if (!(Get-Content -LiteralPath $repositoryFile -Raw).Trim()) {
  $repoRelative = if ($mode -eq 'desktop') { 'app/Resources/app/mcp/skills/filmfraylo/references/releaseRepository.txt' } else { 'build/mcp/skills/filmfraylo/references/releaseRepository.txt' }
  Copy-Item -LiteralPath (Join-Path $appRoot $repoRelative) -Destination $repositoryFile
}
$skills = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeCommand = Join-Path $appRoot 'runtime/bun.exe'
if ($mode -eq 'desktop') { $runtimeCommand = Join-Path $appRoot 'app/bin/bun.exe' }
$previousEncoding = $OutputEncoding
$previousConsoleEncoding = [Console]::OutputEncoding
try {
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = $OutputEncoding
  $launchOptions = @('start', '--open', '--skills', $skills)
  if ($harness -eq 'workbuddy') { $launchOptions += @('--data', (Join-Path $appParent 'data')) }
  if ($mode -eq 'desktop') {
    $launch = & $runtimeCommand (Join-Path $appRoot 'app/Resources/app/desktopHarness.js')
  } else {
    $launch = & $runtimeCommand (Join-Path $appRoot 'filmFraylo.js') @launchOptions
  }
  if ($LASTEXITCODE -ne 0) { throw 'FilmFraylo launch failed. See the message above.' }
  $options = @('--harness', $harness, '--app', $appRoot, '--skills', $skills, '--codex', $codex)
  if ($register) { $options += '--register' }
  ($launch -join "`n") | & $runtimeCommand (Join-Path $PSScriptRoot 'connectHarness.mjs') @options
  if ($LASTEXITCODE -ne 0) { throw 'FilmFraylo MCP setup failed. Existing Skill files were preserved.' }
} finally {
  $OutputEncoding = $previousEncoding
  [Console]::OutputEncoding = $previousConsoleEncoding
}
