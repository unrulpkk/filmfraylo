import { $ } from "bun";
import { cp, mkdir, writeFile } from "@toonflow/file";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
// 原生构建负责节点、工具、扩展、Web、Server、MCP、供应商和全局技能。
await $`${process.execPath} run build:server`.cwd(root);
const name = `filmFraylo${Date.now()}`;
const output = resolve(root, "dist", name);
await mkdir(output, { recursive: true });
for (const directory of ["web", "server", "mcp", "nodes", "tools", "ext", "providers", "skills"]) {
  await cp(resolve(root, "build", directory), resolve(output, "build", directory), { recursive: true });
}
const result = await Bun.build({ entrypoints: [resolve(import.meta.dirname, "filmFraylo.ts")],
  outdir: output, target: "bun", format: "esm", minify: true });
if (!result.success) throw new AggregateError(result.logs, "启动入口构建失败");
await cp(resolve(root, "LICENSE"), resolve(output, "license.txt"));
await cp(resolve(root, "docs/filmFraylo.md"), resolve(output, "readme.md"));
await cp(resolve(root, "docs/filmFrayloValidation.md"), resolve(output, "filmFrayloValidation.md"));
await writeFile(resolve(output, "package.json"), JSON.stringify({ name: "filmfraylo-local", private: true, type: "module",
  scripts: { start: "bun filmFraylo.js start", installSkills: "bun filmFraylo.js install" } }, null, 2));
await writeFile(resolve(output, "start.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nbun filmFraylo.js start %*\r\npause\r\n');
await writeFile(resolve(output, "start.sh"), '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec bun filmFraylo.js start "$@"\n', { mode: 0o755 });
await $`tar -czf ${resolve(root, "dist", `${name}.tar.gz`)} -C ${resolve(root, "dist")} ${name}`;
console.log(`已打包：${output}.tar.gz\n需要 Bun 1.3.14 或更新版本；无需源码或 node_modules 安装。数据首次启动时创建，未包含用户密钥与工作区。`);
