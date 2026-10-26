import product from "@toonflow/product/config" with { type: "json" };

// Web 与本地 Server 不依赖桌面 SDK。
export default {
  app: { name: product.name, version: process.env.appVersion ?? "2.0.6" },
};
