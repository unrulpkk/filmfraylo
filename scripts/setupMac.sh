#!/bin/sh
set -eu
# Bootstrap uses macOS built-in tools before the bundled runtime exists.
scriptRoot=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository=$(tr -d '\r\n' < "$scriptRoot/../references/releaseRepository.txt")
register=false
inspect=false
codex=codex
harness=codex
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repository) repository=$2; shift 2 ;;
    --codex) codex=$2; shift 2 ;;
    --harness) harness=$2; shift 2 ;;
    --register) register=true; shift ;;
    --inspect) inspect=true; shift ;;
    *) printf '%s\n' "Unknown option: $1" >&2; exit 1 ;;
  esac
done
case "$harness" in codex|claude|cursor|opencode|gemini|generic) ;; *) echo 'Unknown harness.' >&2; exit 1 ;; esac
if [ "$register" = true ] && [ "$harness" != codex ]; then echo '--register is only for Codex; omit it for other harnesses.' >&2; exit 1; fi
[ "$(uname -s)" = Darwin ] || { echo 'Use setupWindows.ps1 on Windows.' >&2; exit 1; }
# Detect Apple Silicon even when the calling shell is running under Rosetta.
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then architecture=arm64
else
  case "$(uname -m)" in x86_64) architecture=x64 ;; arm64) architecture=arm64 ;; *) echo 'Unsupported Mac architecture.' >&2; exit 1 ;; esac
fi
asset="filmFraylo-macos-$architecture.dmg"
app="$HOME/Applications/FilmFraylo.app"
if [ -d /Applications/FilmFraylo.app ]; then app=/Applications/FilmFraylo.app; fi
if [ "$inspect" = true ]; then printf 'platform=macos-%s\nasset=%s\nrepository=%s\napp=%s\nharness=%s\n' "$architecture" "$asset" "$repository" "$app" "$harness"; exit 0; fi
if [ ! -d "$app" ]; then
  printf '%s' "$repository" | /usr/bin/grep -Eq '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$' || { echo 'Use --repository owner/repo or install the Skill ZIP from a GitHub Release.' >&2; exit 1; }
  downloadRoot=$(mktemp -d "${TMPDIR:-/tmp}/filmFraylo.XXXXXX")
  url="https://github.com/$repository/releases/latest/download/$asset"
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
  [ -f "$mountRoot/FilmFraylo.app/Contents/Info.plist" ] || { echo 'Unexpected DMG layout.' >&2; exit 1; }
  mkdir -p "$HOME/Applications"
  [ ! -e "$app" ] || { echo 'Install target already exists; not overwritten.' >&2; exit 1; }
  /usr/bin/ditto "$mountRoot/FilmFraylo.app" "$app"
  /usr/bin/hdiutil detach "$mountRoot"
  trap - EXIT
fi
resources="$app/Contents/Resources"
[ -x "$resources/runtime/bun" ] || { echo 'Incomplete application. Reinstall the complete DMG.' >&2; exit 1; }
installedPlatform=$(/usr/bin/plutil -extract platform raw -o - "$resources/buildInfo.json")
[ "$installedPlatform" = "macos-$architecture" ] || { echo 'Installed application uses another architecture; existing files were preserved.' >&2; exit 1; }
# Keep Gatekeeper enabled; do not remove quarantine or change system security settings.
if [ -z "$(tr -d '\r\n' < "$scriptRoot/../references/releaseRepository.txt")" ]; then
  cp "$resources/build/mcp/skills/filmfraylo/references/releaseRepository.txt" "$scriptRoot/../references/releaseRepository.txt"
fi
skills=$(dirname -- "$(dirname -- "$scriptRoot")")
launch=$("$resources/runtime/bun" "$resources/filmFraylo.js" start --open --skills "$skills")
set -- --harness "$harness" --app "$resources" --skills "$skills" --codex "$codex"
if [ "$register" = true ]; then set -- "$@" --register; fi
printf '%s\n' "$launch" | "$resources/runtime/bun" "$scriptRoot/connectHarness.mjs" "$@"
