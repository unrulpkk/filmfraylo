const rules = [
  { type: "input", field: "apiKey" as const, title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
];

export default {
  id: "safillu",
  label: "Safillu AI · DeepSeek",
  icon: "",
  version: "1.0.2",
  apiUrl: "https://api.safillu.com/v1",
  protocol: "openai-completions",
  readme: "使用 Safillu AI 的统一密钥调用 DeepSeek。调用前，请前往 [Safillu 官网](https://api.safillu.com/) 注册账号并申请 API Key（已有账号直接登录申请），然后将 Key 填入下方 API 密钥输入框并保存。请直接在本地设置中填写，无需发送到聊天中。",
  rules,
  models: [
    { id: "deepseek-flash", label: "DeepSeek Flash", type: "text", think: true },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", type: "text", think: true },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", type: "text", think: true },
  ],
} satisfies ProviderDefinition<typeof rules>;
