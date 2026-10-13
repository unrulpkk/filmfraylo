import { cp, mkdir, readFile, readdir, writeFile } from "@toonflow/file";
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
  const bunModules = resolve(root, "node_modules/.bun");
  for (const entry of await readdir(bunModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const modules = join(bunModules, entry.name, "node_modules");
    for (const child of await readdir(modules, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const packages = child.name.startsWith("@")
        ? (await readdir(join(modules, child.name))).map(name => join(modules, child.name, name))
        : [join(modules, child.name)];
      for (const directory of packages) {
        for (const file of await readdir(directory, { withFileTypes: true })) {
          if (file.isFile() && /^(license|licence|notice|copying)(\.|$)/i.test(file.name))
            notices += `\n--- ${entry.name} / ${child.name} / ${file.name} ---\n${await readFile(join(directory, file.name), "utf8")}\n`;
        }
      }
    }
  }
  await writeFile(resolve(output, "thirdPartyNotices.txt"), notices);
  await writeFile(resolve(output, "buildInfo.json"), JSON.stringify({
    product: "FilmFraylo", version, platform, bun: Bun.version,
    commit: process.env.GITHUB_SHA ?? null, repository: process.env.GITHUB_REPOSITORY ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null, builtAt: new Date().toISOString(),
  }, null, 2));

}
