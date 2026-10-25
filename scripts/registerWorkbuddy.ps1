$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
# Release bootstrap: use the system shell without requiring development dependencies.
$entry = ([Console]::In.ReadToEnd() | ConvertFrom-Json).mcpServers.filmfraylo
if (!$entry.command -or !$entry.args -or $entry.args[-1] -ne '--external') { throw 'Invalid FilmFraylo MCP configuration.' }
$directory = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.workbuddy'
$path = Join-Path $directory 'mcp.json'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$original = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { $null }
try { $document = if ($null -ne $original) { $original | ConvertFrom-Json } else { [pscustomobject]@{} } }
catch { throw 'WorkBuddy mcp.json is not valid JSON; existing file preserved.' }
if ($document -isnot [pscustomobject]) { throw 'WorkBuddy mcp.json must be a JSON object; existing file preserved.' }
if (!$document.PSObject.Properties['mcpServers']) { $document | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) }
if ($document.mcpServers -isnot [pscustomobject]) { throw 'WorkBuddy mcpServers must be an object; existing file preserved.' }
$existing = $document.mcpServers.PSObject.Properties['filmfraylo']
if ($existing) {
  $server = $existing.Value
  if ($server.command -cne $entry.command -or (ConvertTo-Json -InputObject @($server.args) -Compress) -cne (ConvertTo-Json -InputObject @($entry.args) -Compress) -or $server.disabled -eq $true -or $server.enabled -eq $false) {
    throw 'WorkBuddy already has a different or disabled filmfraylo server. Existing configuration preserved.'
  }
  Write-Output $path
  return
}
$document.mcpServers | Add-Member -NotePropertyName filmfraylo -NotePropertyValue $entry
$temporary = Join-Path $directory ('filmFraylo-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
  [IO.File]::WriteAllText($temporary, ($document | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
  if ($null -eq $original) {
    [IO.File]::Move($temporary, $path)
  } else {
    if ([IO.File]::ReadAllText($path) -cne $original) { throw 'WorkBuddy configuration changed during setup; retry after editing finishes.' }
    [IO.File]::Replace($temporary, $path, "$path.filmFraylo-$([Guid]::NewGuid().ToString('N')).bak")
  }
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
Write-Output $path
