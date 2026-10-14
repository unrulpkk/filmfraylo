# FilmFraylo 桌面版

完整解压 Windows ZIP，运行 `app/bin/launcher.exe`，即可打开 FilmFraylo 独立桌面窗口；不能单独移动这个 EXE。macOS 将 DMG 中的 FilmFraylo.app 复制到用户 Applications 目录后打开。画布、本地服务、MCP 在同一应用中运行，不会额外打开浏览器。

Windows 使用系统 WebView2；若系统缺少它，需要安装微软官方 WebView2 Runtime。运行包内含 Bun 和桌面运行组件，用户无需安装开发工具。macOS 使用系统 WebKit。

全新安装数据默认在 `~/.filmfraylo/desktopData`；已有安装目录旁的 data/settings.json 时继续使用原目录。设置和作品不保存在可替换的应用资源中。无 Key 可创建项目和画布，生成媒体前再在设置中填写 safillu API Key。关闭应用会停止本实例的服务。

使用 FilmFraylo Skill，选择桌面版，指定当前 Harness；Skill 读取公开的运行状态并连接原生 MCP，不将 token 写入宿主配置。首次连接可能需要宿主信任或重新加载工具。已有不同配置时保留原配置并说明冲突，不会自动迁移项目。

完整源码：https://github.com/unrulpkk/filmfraylo 。应用资源 app/buildInfo.json 记录版本与构建提交；Release 附带 ZIP / DMG 的 SHA256。校验通过说明下载包与公布摘要一致，不等同于代码签名、安全保证或源码可复现构建证明。当前没有付费签名证书，系统可能提示或阻止；不关闭系统防护。
