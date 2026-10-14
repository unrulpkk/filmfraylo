import { $ } from "bun";
import { cp, mkdir, readFile, writeFile } from "@toonflow/file";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import config from "../../../appConfig";

const root = resolve(import.meta.dirname, "../../..");
const mac = process.platform === "darwin";
if (!(mac && ["x64", "arm64"].includes(process.arch)) && !(process.platform === "win32" && process.arch === "x64")) throw new Error("Unsupported desktop platform");
if (!process.argv.includes("--built")) await $`${process.execPath} run build:desktop`.cwd(root);
const artifactRoot = resolve(root, "build/desktop/artifacts", mac ? (process.arch === "x64" ? "macX64" : "macArm64") : "");
const prefix = `stable-${mac ? "macos" : "win"}-${process.arch}`;
const manifest = JSON.parse(await readFile(resolve(artifactRoot, `${prefix}-update.json`), "utf8"));
if (manifest.version !== config.app.version) throw new Error("Desktop build version mismatch");
const payload = resolve(artifactRoot, manifest.artifact?.file ?? `${prefix}-FilmFraylo.app.tar.zst`);
const platform = `${mac ? "macos" : "windows"}-${process.arch}`;
const name = `filmFraylo-desktop-${config.app.version}-${platform}`;
const stage = resolve(root, "dist", name);
await mkdir(resolve(root, "dist"), { recursive: true });
await mkdir(stage); // Do not mix an old build or local user data into a release.
const app = resolve(stage, mac ? "FilmFraylo.app" : "app");
await mkdir(app);
const unpacked = resolve(root, "build/desktop/releasePayload.tar");
await writeFile(unpacked, Bun.zstdDecompressSync(await readFile(payload)));
await $`tar -xf ${unpacked} --strip-components=1 -C ${app}`;
const resources = resolve(app, mac ? "Contents/Resources/app" : "Resources/app");
await writeFile(resolve(resources, "buildInfo.json"), JSON.stringify({ product: "FilmFraylo", mode: "desktop",
  version: config.app.version, platform, commit: process.env.GITHUB_SHA ?? null,
  repository: process.env.GITHUB_REPOSITORY ?? null, runId: process.env.GITHUB_RUN_ID ?? null }, null, 2));
await cp(resolve(root, "LICENSE"), resolve(resources, "license.txt"));
await cp(resolve(root, "docs/desktopPackage.md"), resolve(stage, "readme.md"));
const archive = resolve(root, "dist", `${name}.${mac ? "dmg" : "zip"}`);
if (mac) await $`hdiutil create -volname FilmFraylo -srcfolder ${stage} -ov -format UDZO ${archive}`;
else await $`tar -a -cf ${archive} -C ${resolve(root, "dist")} ${name}`;
await writeFile(`${archive}.sha256`, `${createHash("sha256").update(await readFile(archive)).digest("hex")}  ${name}.${mac ? "dmg" : "zip"}\n`);
console.log(`Native desktop package: ${archive}`);
