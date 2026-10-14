import { cp, mkdir, readFile, rm, writeFile } from "@toonflow/file";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const output = resolve(packageRoot, "../../build/mcp");
const result = await Bun.build({
  entrypoints: [resolve(packageRoot, "src/index.ts"), resolve(packageRoot, "src/stdio.ts"), resolve(packageRoot, "src/install.ts")],
  outdir: output,
  target: "node",
  format: "esm",
  external: ["express"],
  minify: true,
});
if (!result.success) throw new AggregateError(result.logs, "MCP 构建失败");
const registerBuild = await Bun.build({ entrypoints: [resolve(packageRoot, "../../apps/server/scripts/registerHarness.ts")],
  outdir: output, target: "bun", minify: true });
if (!registerBuild.success) throw new AggregateError(registerBuild.logs, "Harness registration build failed");
await mkdir(output, { recursive: true });
// Skill 改名后不把旧入口留在发行包中；这里只清理本次构建目录。
await rm(resolve(output, "skills"), { recursive: true, force: true });
await cp(resolve(packageRoot, "skills"), resolve(output, "skills"), { recursive: true });
const filmFrayloSkill = resolve(packageRoot, "../../..");
const skillOutput = resolve(output, "skills/filmfraylo");
await mkdir(skillOutput, { recursive: true });
// 根目录也是源码仓库；仅复制 Skill 内容，不把应用源码和本地文件打进技能包。
for (const entry of ["SKILL.md", "agents", "references", "scripts"]) {
  await cp(resolve(filmFrayloSkill, entry), resolve(skillOutput, entry), { recursive: true });
}
const repository = process.env.GITHUB_REPOSITORY || (await readFile(resolve(filmFrayloSkill, "references/releaseRepository.txt"), "utf8")).trim();
if (repository && !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error("GitHub 仓库名称无效");
await writeFile(resolve(output, "skills/filmfraylo/references/releaseRepository.txt"), `${repository}\n`);

await cp(resolve(packageRoot, "README.md"), resolve(output, "README.md"));
await cp(resolve(packageRoot, "src/skill.d.ts"), resolve(output, "skill.d.ts"));
await writeFile(resolve(output, "package.json"), JSON.stringify({
  name: "@toonflow/mcp",
  version: "0.0.0",
  type: "module",
  exports: { ".": "./index.js", "./skill": { types: "./skill.d.ts", default: "./skills/toonflow/SKILL.md" } },
  bin: { "toonflow-mcp": "./stdio.js" },
  peerDependencies: { express: "^5.2.1" },
}, null, 2));
console.log(`MCP 已构建到 ${output}`);
