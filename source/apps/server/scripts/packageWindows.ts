import { $ } from "bun";
import { mkdir, readFile, writeFile } from "@toonflow/file";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import config from "../../../appConfig";
import { packageRuntime } from "./packageRuntime";

if (process.platform !== "win32" || process.arch !== "x64") throw new Error("请在 Windows x64 构建运行包");
if (Bun.version !== "1.4.3") throw new Error("运行包固定使用 Bun 1.4.3，请使用对应版本构建");
const root = resolve(import.meta.dirname, "../../..");
const version = config.app.version;
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(version)) throw new Error("版本号须为 x.y.z 或 x.y.z-preview.1");
const name = `filmFraylo-web-${version}-windows-x64`;
const output = resolve(root, "dist", name);
// ACT: 每次使用新目录，避免混入旧包、凭证和本地工作区；已有输出不覆盖。
await mkdir(resolve(root, "dist"), { recursive: true });
await mkdir(output);
await $`${process.execPath} run build:server`.cwd(root);
await packageRuntime(output, "windows-x64", "docs/windowsPackage.md");
await writeFile(resolve(output, "stop.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nruntime\\bun.exe filmFraylo.js stop %*\r\npause\r\n');
await writeFile(resolve(output, "installSkills.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nruntime\\bun.exe filmFraylo.js install %*\r\npause\r\n');
await writeFile(resolve(output, "start.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nruntime\\bun.exe filmFraylo.js start --open %*\r\n');

const archive = resolve(root, "dist", `${name}.zip`);
await $`tar -a -cf ${archive} -C ${resolve(root, "dist")} ${name}`;
const hash = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(`${archive}.sha256`, `${hash}  ${name}.zip\n`);
console.log(`已生成 ${archive}；本地 Web 包，使用 start.cmd 或 Skill 启动。`);
