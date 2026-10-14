#!/bin/sh
set -eu
# macOS bootstrap uses plutil to preserve unrelated JSON fields without dependencies.
[ "$(uname -s)" = Darwin ] || { echo 'This registration script requires macOS.' >&2; exit 1; }
umask 077
directory="$HOME/.workbuddy"
mkdir -p "$directory"
path="$directory/mcp.json"
temporary=$(mktemp "$directory/filmFraylo.XXXXXX")
incoming=$(mktemp "$directory/filmFraylo.XXXXXX")
snapshot=$(mktemp "$directory/filmFraylo.XXXXXX")
trap 'rm -f "$temporary" "$incoming" "$snapshot"' EXIT
cat > "$incoming"
entry=$(/usr/bin/plutil -extract mcpServers.filmfraylo json -o - "$incoming")
existed=false
if [ -e "$path" ]; then
  existed=true
  cp -p "$path" "$snapshot"
  cp -p "$snapshot" "$temporary"
  if ! /usr/bin/plutil -extract mcpServers json -o /dev/null "$temporary" 2>/dev/null; then
    /usr/bin/plutil -insert mcpServers -json '{}' "$temporary"
  fi
  [ "$(/usr/bin/plutil -type mcpServers "$temporary")" = dictionary ] || { echo 'WorkBuddy mcpServers must be an object; existing file preserved.' >&2; exit 1; }
  if /usr/bin/plutil -extract mcpServers.filmfraylo json -o /dev/null "$temporary" 2>/dev/null; then
    currentCommand=$(/usr/bin/plutil -extract mcpServers.filmfraylo.command raw -o - "$temporary")
    newCommand=$(/usr/bin/plutil -extract mcpServers.filmfraylo.command raw -o - "$incoming")
    currentArgs=$(/usr/bin/plutil -extract mcpServers.filmfraylo.args json -o - "$temporary")
    newArgs=$(/usr/bin/plutil -extract mcpServers.filmfraylo.args json -o - "$incoming")
    disabled=$(/usr/bin/plutil -extract mcpServers.filmfraylo.disabled raw -o - "$temporary" 2>/dev/null || true)
    enabled=$(/usr/bin/plutil -extract mcpServers.filmfraylo.enabled raw -o - "$temporary" 2>/dev/null || true)
    [ "$currentCommand" = "$newCommand" ] && [ "$currentArgs" = "$newArgs" ] && [ "$disabled" != true ] && [ "$enabled" != false ] || { echo 'WorkBuddy already has a different or disabled filmfraylo server; preserved.' >&2; exit 1; }
    printf '%s\n' "$path"
    exit 0
  fi
else
  printf '%s\n' '{"mcpServers":{}}' > "$temporary"
fi
/usr/bin/plutil -insert mcpServers.filmfraylo -json "$entry" "$temporary"
/usr/bin/plutil -convert json "$temporary"
if [ "$existed" = true ]; then
  cmp -s "$path" "$snapshot" || { echo 'WorkBuddy configuration changed during setup; retry after editing finishes.' >&2; exit 1; }
  cp -p "$snapshot" "$path.filmFraylo-$(/usr/bin/uuidgen).bak"
  mv -f "$temporary" "$path"
else
  # Hard link creation refuses a destination created concurrently by WorkBuddy.
  ln "$temporary" "$path"
fi
printf '%s\n' "$path"
