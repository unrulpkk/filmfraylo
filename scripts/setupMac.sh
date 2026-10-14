#!/bin/sh
set -eu
# Bootstrap uses macOS built-in tools before the bundled runtime exists.
scriptRoot=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository=$(tr -d '\r\n' < "$scriptRoot/../references/releaseRepository.txt")
register=false
inspect=false
codex=codex
harness=codex
mode=desktop
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repository) repository=$2; shift 2 ;;
    --codex) codex=$2; shift 2 ;;
    --harness) harness=$2; shift 2 ;;
    --mode) mode=$2; shift 2 ;;
    --register) register=true; shift ;;
    --inspect) inspect=true; shift ;;
    *) printf '%s\n' "Unknown option: $1" >&2; exit 1 ;;
  esac
done
case "$harness" in codex|claude|cursor|opencode|gemini|workbuddy|generic) ;; *) echo 'Unknown harness.' >&2; exit 1 ;; esac
case "$mode" in desktop|web) ;; *) echo 'Unknown mode; use desktop or web.' >&2; exit 1 ;; esac
if [ "$register" = true ] && [ "$harness" != codex ] && [ "$harness" != workbuddy ]; then echo '--register is only for Codex/WorkBuddy; omit it for other harnesses.' >&2; exit 1; fi
[ "$(uname -s)" = Darwin ] || { echo 'Use setupWindows.ps1 on Windows.' >&2; exit 1; }
# Detect Apple Silicon even when the calling shell is running under Rosetta.
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then architecture=arm64
else
  case "$(uname -m)" in x86_64) architecture=x64 ;; arm64) architecture=arm64 ;; *) echo 'Unsupported Mac architecture.' >&2; exit 1 ;; esac
fi
asset="filmFraylo-$mode-macos-$architecture.dmg"
appName=FilmFraylo.app
if [ "$mode" = web ]; then appName=FilmFrayloWeb.app; fi
app="$HOME/Applications/$appName"
if [ -d "/Applications/$appName" ]; then app="/Applications/$appName"; fi
if [ "$inspect" = true ]; then printf 'platform=macos-%s\nasset=%s\nrepository=%s\napp=%s\nharness=%s\n' "$architecture" "$asset" "$repository" "$app" "$harness"; exit 0; fi
if [ ! -d "$app" ]; then
  printf '%s' "$repository" | /usr/bin/grep -Eq '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$' || { echo 'Use --repository owner/repo or install the Skill ZIP from a GitHub Release.' >&2; exit 1; }
  downloadRoot=$(mktemp -d "${TMPDIR:-/tmp}/filmFraylo.XXXXXX")
  /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' "https://api.github.com/repos/$repository/releases/latest" -o "$downloadRoot/release.json"
  tag=$(/usr/bin/plutil -extract tag_name raw -o - "$downloadRoot/release.json")
  printf '%s' "$tag" | /usr/bin/grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || { echo 'No stable version tag found.' >&2; exit 1; }
  url="https://github.com/$repository/releases/download/$tag/$asset"
  /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' "$url" -o "$downloadRoot/$asset"
  /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' "$url.sha256" -o "$downloadRoot/$asset.sha256"
  expected=$(awk '{print $1}' "$downloadRoot/$asset.sha256")
  printf '%s' "$expected" | /usr/bin/grep -Eq '^[a-fA-F0-9]{64}$' || { echo 'Invalid checksum file.' >&2; exit 1; }
  actual=$(/usr/bin/shasum -a 256 "$downloadRoot/$asset" | awk '{print $1}')
  [ "$expected" = "$actual" ] || { echo 'Download checksum mismatch. Package was not executed.' >&2; exit 1; }
  mountRoot="$downloadRoot/mounted"
  mkdir "$mountRoot"
  /usr/bin/hdiutil attach "$downloadRoot/$asset" -nobrowse -readonly -mountpoint "$mountRoot"
  trap '/usr/bin/hdiutil detach "$mountRoot" >/dev/null 2>&1 || true' EXIT
  [ -f "$mountRoot/$appName/Contents/Info.plist" ] || { echo 'Unexpected DMG layout.' >&2; exit 1; }
  mkdir -p "$HOME/Applications"
  [ ! -e "$app" ] || { echo 'Install target already exists; not overwritten.' >&2; exit 1; }
  /usr/bin/ditto "$mountRoot/$appName" "$app"
  /usr/bin/hdiutil detach "$mountRoot"
  trap - EXIT
fi
resources="$app/Contents/Resources"
runtimeCommand="$resources/runtime/bun"
info="$resources/buildInfo.json"
mcpDirectory="$resources/build/mcp"
if [ "$mode" = desktop ]; then
  runtimeCommand="$app/Contents/MacOS/bun"
  info="$resources/app/buildInfo.json"
  mcpDirectory="$resources/app/mcp"
  [ "$(/usr/bin/plutil -extract mode raw -o - "$info")" = desktop ] || { echo 'This is not a native desktop package.' >&2; exit 1; }
fi
[ -x "$runtimeCommand" ] || { echo 'Incomplete application. Reinstall the complete DMG.' >&2; exit 1; }
installedPlatform=$(/usr/bin/plutil -extract platform raw -o - "$info")
[ "$installedPlatform" = "macos-$architecture" ] || { echo 'Installed application uses another architecture; existing files were preserved.' >&2; exit 1; }
# Keep Gatekeeper enabled; do not remove quarantine or change system security settings.
if [ -z "$(tr -d '\r\n' < "$scriptRoot/../references/releaseRepository.txt")" ]; then
  cp "$mcpDirectory/skills/filmfraylo/references/releaseRepository.txt" "$scriptRoot/../references/releaseRepository.txt"
fi
skills=$(dirname -- "$(dirname -- "$scriptRoot")")
if [ "$mode" = desktop ]; then
  launch=$("$runtimeCommand" "$resources/app/desktopHarness.js")
else
  launch=$("$runtimeCommand" "$resources/filmFraylo.js" start --open --skills "$skills")
fi
set -- --harness "$harness" --app "$resources" --skills "$skills" --codex "$codex"
if [ "$register" = true ]; then set -- "$@" --register; fi
printf '%s\n' "$launch" | "$runtimeCommand" "$scriptRoot/connectHarness.mjs" "$@"
