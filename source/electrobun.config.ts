import { product } from "@toonflow/product";
import appConfig from "./appConfig";
import type { ElectrobunConfig } from "./.hutch/devkit/api/config/ElectrobunConfig";

const startupTarget = process.platform === "darwin" ? (process.arch === "x64" ? "macX64" : "macArm64") : "windowsX64";

export default {
  app: {
    name: product.name,
    identifier: product.identifier,
    version: appConfig.app.version,
    urlSchemes: ["toonflow"],
  },
  build: {
    mainProcess: "bun",
    // ACT: Photon 按包所在目录读取 WASM，保留原包，避免内联后引用构建机路径。
    bun: { entrypoint: "apps/desktop/src/index.ts", minify: true, external: ["@silvia-odwyer/photon-node", "@firecrawl/anydoc", "@firecrawl/anydoc-wasm"] },
    copy: {
      "build/desktop/harness/desktopHarness.js": "desktopHarness.js",
      "build/desktop/harness/buildInfo.json": "buildInfo.json",
      "LICENSE": "license.txt",
      "build/desktop/node_modules/@firecrawl": "bun/node_modules/@firecrawl",
      "build/desktop/photon": "bun/node_modules/@silvia-odwyer/photon-node",
      ...(process.platform === "win32" ? {
        "build/desktop/protocol/startupLauncher.exe": "startupLauncher.exe",
        "build/desktop/protocol/protocolLauncher.exe": "protocolLauncher.exe",
        "build/desktop/protocol/saveFileDialog.exe": "saveFileDialog.exe",
        "build/desktop/protocol/updateHelper.exe": "updateHelper.exe",
        "build/desktop/startup/windowsSplashWorker.js": "startup/windowsSplashWorker.js",
      } : {}),
      "build/web": "views/mainview",
      "build/mcp": "mcp",
      "build/tools": "tools",
      // ACT: 团队暂不打包，恢复时取消注释。
      // "build/agents": "agents",
      "build/nodes": "nodes",
      "build/ext": "ext",
      "packages/providers/src": "providers",
      "packages/skills": "skills",
      "packages/startup/assets/startup.json": "startup/startup.json",
      "packages/startup/assets/filmFrayloSplash.bgra": "startup/filmFrayloSplash.bgra",
      "packages/startup/assets/license.txt": "startup/license.txt",
      [`packages/startup/assets/${startupTarget}`]: `startup/${startupTarget}`,
    },
    buildFolder: "build/desktop/app",
    artifactFolder: process.platform === "darwin" ? `build/desktop/artifacts/${process.arch === "x64" ? "macX64" : "macArm64"}` : "build/desktop/artifacts",
    win: {
      icon: "packages/assets/logo.ico",
    },
    mac: {
      icons: "packages/assets/logo.iconset",
      entitlements: { "com.apple.security.device.audio-input": true },
      // ACT: CI 为 ARM 同时开启签名与公证；本地未配置凭据时仍可构建测试包。
      codesign: process.env.macCodesign === "1",
      notarize: process.env.macCodesign === "1",
    },
  },
  release: {
    // 发行更新地址由本产品构建环境显式提供。
    baseUrl: process.env.FILMFRAYLO_UPDATE_BASE_URL || process.env.SAFILLU_UPDATE_BASE_URL || `${product.repositoryUrl}/releases/latest/download`,
    // ACT: 常规构建不访问更新服务器；release:desktop 显式开启增量构建。
    generatePatch: process.env.generateUpdatePatch === "1",
  },
  ...(process.platform === "darwin" ? {
    scripts: {
      postBuild: "apps/desktop/scripts/localizeMac.ts",
      postWrap: "apps/desktop/scripts/localizeMac.ts",
    },
  } : {}),
} satisfies ElectrobunConfig;
