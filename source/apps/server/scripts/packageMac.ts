import { $ } from "bun";
import { chmod, mkdir, readFile, symlink, writeFile } from "@toonflow/file";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import config from "../../../appConfig";
import { packageRuntime } from "./packageRuntime";

if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) throw new Error("请在对应架构的 macOS 构建 DMG");
if (Bun.version !== "1.4.3") throw new Error("运行包固定使用 Bun 1.4.3");
const root = resolve(import.meta.dirname, "../../..");
const version = config.app.version;
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(version)) throw new Error("版本号须为 x.y.z 或 x.y.z-preview.1");
const name = `filmFraylo-web-${version}-macos-${process.arch}`;
const stage = resolve(root, "dist", name);
const app = resolve(stage, "FilmFrayloWeb.app");
const resources = resolve(app, "Contents/Resources");
await mkdir(resolve(root, "dist"), { recursive: true });
await mkdir(stage);
await $`${process.execPath} run build:server`.cwd(root);
await mkdir(resources, { recursive: true });
await mkdir(resolve(app, "Contents/MacOS"));
await packageRuntime(resources, `macos-${process.arch}`, "docs/macPackage.md");
await chmod(resolve(resources, "runtime/bun"), 0o755);
await $`iconutil -c icns ${resolve(root, "packages/assets/logo.iconset")} -o ${resolve(resources, "filmFraylo.icns")}`;
await writeFile(resolve(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>FilmFraylo</string>
<key>CFBundleDisplayName</key><string>FilmFraylo</string>
<key>CFBundleIdentifier</key><string>local.filmfraylo.web</string>
<key>CFBundleExecutable</key><string>filmFraylo</string>
<key>CFBundleIconFile</key><string>filmFraylo.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version.split("-")[0]}</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
</dict></plist>`);
await writeFile(resolve(app, "Contents/MacOS/filmFraylo"), `#!/bin/sh
set -eu
appRoot=$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)
if [ "$#" -eq 0 ]; then set -- start --open; fi
if output=$("$appRoot/runtime/bun" "$appRoot/filmFraylo.js" "$@" 2>&1); then
  exit 0
else
  /usr/bin/osascript -e 'on run argv' -e 'display alert "FilmFraylo 启动失败" message (item 1 of argv)' -e 'end run' "$output"
  exit 1
fi
`, { mode: 0o755 });
for (const [file, command] of [["installSkills.command", "install"], ["stop.command", "stop"]]) {
  await writeFile(resolve(resources, file), `#!/bin/sh\nset -eu\nappRoot=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$appRoot/runtime/bun" "$appRoot/filmFraylo.js" ${command} "$@"\n`, { mode: 0o755 });
}
await symlink("/Applications", resolve(stage, "Applications"));
const archive = resolve(root, "dist", `${name}.dmg`);
await $`hdiutil create -volname FilmFraylo -srcfolder ${stage} -ov -format UDZO ${archive}`;
const hash = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(`${archive}.sha256`, `${hash}  ${name}.dmg\n`);
console.log(`已生成 ${archive}；内置对应架构 Bun，本地 Web + Server，无需安装源码依赖。`);
