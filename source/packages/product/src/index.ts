import productConfig from "../product.json" with { type: "json" };

// 产品身份和开放能力由 FilmFraylo 维护，上游公共功能通过此边界读取。
export const product = productConfig;

// 仅处理应用提供的文案模板；在插入用户内容前调用，避免改写项目和提示词。
export function brandMessage(message: string): string {
  return message.replace(/\bToonflow\b(?!-app)/g, product.name);
}

export function messageKey(message: string): string {
  return message.replaceAll(product.name, "Toonflow");
}
