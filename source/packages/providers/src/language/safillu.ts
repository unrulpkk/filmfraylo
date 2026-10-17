const rules = [
  { type: "input", field: "apiKey" as const, title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
];

export default {
  id: "safillu",
  label: "Safillu AI · DeepSeek",
  icon: "",
  version: "1.0.0",
  apiUrl: "https://api.safillu.com/v1",
  protocol: "openai-completions",
  readme: "使用 Safillu AI 的统一密钥调用 DeepSeek。",
  rules,
  models: [
    { id: "deepseek-flash", label: "DeepSeek Flash", type: "text", think: true },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", type: "text", think: true },
  ],
} satisfies ProviderDefinition<typeof rules>;
