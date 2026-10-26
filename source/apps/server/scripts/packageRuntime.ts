import { cp, existsSync, mkdir, readFile, readdir, realpath, writeFile } from "@toonflow/file";
import { resolve, join } from "node:path";
import config from "../../../appConfig";

export async function packageRuntime(output: string, platform: string, readme: string) {
  const root = resolve(import.meta.dirname, "../../..");
  const version = config.app.version;
  for (const directory of ["web", "server", "mcp", "nodes", "tools", "ext", "providers", "skills"]) {
    await cp(resolve(root, "build", directory), resolve(output, "build", directory), { recursive: true });
  }
  const result = await Bun.build({ entrypoints: [resolve(import.meta.dirname, "filmFraylo.ts")], outdir: output, target: "bun", minify: true });
  if (!result.success) throw new AggregateError(result.logs, "启动入口构建失败");
  await mkdir(resolve(output, "runtime"));
  await cp(process.execPath, resolve(output, process.platform === "win32" ? "runtime/bun.exe" : "runtime/bun"));
  await cp(resolve(root, "LICENSE"), resolve(output, "license.txt"));
  await cp(resolve(root, readme), resolve(output, "readme.md"));
  await writeFile(resolve(output, "package.json"), JSON.stringify({ name: "filmfraylo-local", private: true, type: "module" }, null, 2));
  // 随运行环境与依赖分发许可文本，固定到实际使用的 Bun 版本。
  let notices = `Bun ${Bun.version}\nSource: https://github.com/oven-sh/bun/tree/bun-v${Bun.version}\n${await readFile(resolve(root, "docs/bunLicense.txt"), "utf8")}\n`;
  const visited = new Set<string>();
  // ACT: 同时遍历 hoisted 和 isolated 布局；按实际路径去重，避免工作区链接循环。
  async function collectNotices(directory: string, modules = false): Promise<void> {
    const actual = await realpath(directory);
    if (visited.has(actual)) return;
    visited.add(actual);
    const entries = await readdir(actual, { withFileTypes: true });
    if (modules) {
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const child = join(actual, entry.name);
        if (entry.name === ".bun") {
          for (const store of await readdir(child, { withFileTypes: true })) {
            const nested = join(child, store.name, "node_modules");
            if (store.isDirectory() && existsSync(nested)) await collectNotices(nested, true);
          }
        } else if (!entry.name.startsWith(".")) {
          await collectNotices(child, entry.name.startsWith("@"));
        }
      }
      return;
    }
    const metadata = join(actual, "package.json");
    if (!existsSync(metadata)) return;
    const { name, version } = JSON.parse(await readFile(metadata, "utf8"));
    for (const file of entries) {
      if (file.isFile() && /^(license|licence|notice|copying)(\.|$)/i.test(file.name))
        notices += `\n--- ${name}@${version} / ${file.name} ---\n${await readFile(join(actual, file.name), "utf8")}\n`;
    }
    const nested = join(actual, "node_modules");
    if (existsSync(nested)) await collectNotices(nested, true);
  }
  await collectNotices(resolve(root, "node_modules"), true);
  await writeFile(resolve(output, "thirdPartyNotices.txt"), notices);
  await writeFile(resolve(output, "buildInfo.json"), JSON.stringify({
    product: "FilmFraylo", mode: "web", version, platform, bun: Bun.version,
    commit: process.env.GITHUB_SHA ?? null, repository: process.env.GITHUB_REPOSITORY ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null, builtAt: new Date().toISOString(),
  }, null, 2));

}
