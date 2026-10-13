# FilmFraylo 品牌

应用名称为 FilmFraylo，创作 Skill 为 `$filmfraylo`，Windows 启动入口为 `FilmFraylo.exe`。应用标题、首页、引导、关于、提示、多语言文案、启动器、文档和 GitHub 发布名称统一使用新名称。

继续使用用户提供的蓝紫色图形标识，资源名更新为 filmFrayloLogo.png 与 filmFrayloSplash.bgra。safillu 是模型供应商名称，API 域名、Key、供应商 ID 和配置字段保持不变。

为兼容已保存的项目，内部 @toonflow 包名、画布字段、通信协议及官方 MCP Skill 保留。原始 LICENSE 和第三方许可保持不变。

源码版发现旧 data/myToonflow/settings.json、Windows 包发现旧 %LOCALAPPDATA%/safillu/data/settings.json 时沿用原目录；新安装分别使用 data/filmFraylo 和 %LOCALAPPDATA%/FilmFraylo/data。--data 始终优先，不自动移动项目。
