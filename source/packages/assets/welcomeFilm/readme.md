# 欢迎页胶片动图

`index.html` 是欢迎页 GIF 的可编辑 SVG/HyperFrames 源文件，640 × 800、4 秒循环。镜头光圈旋转 60°，胶片移动一个 186px 图案周期；顶部留给页面现有品牌标识。

运行时只加载 `apps/web/src/assets/welcomeFilm.gif` 与 `welcomeFilmPoster.png`，不加载此 HTML 或 GSAP。源文件使用固定版本 GSAP 3.14.2；离线重生成时可下载该文件并将 script 路径改为本地路径。

在本目录生成中间视频（需要 Node.js、HyperFrames 与 FFmpeg）：

```powershell
npx --yes hyperframes@0.8.157 render . --format mp4 --fps 15 --workers 2 -q high -o welcomeFilm.mp4
ffmpeg -y -i welcomeFilm.mp4 -filter_complex "[0:v]split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -loop 0 ../../../apps/web/src/assets/welcomeFilm.gif
ffmpeg -y -i ../../../apps/web/src/assets/welcomeFilm.gif -frames:v 1 ../../../apps/web/src/assets/welcomeFilmPoster.png
```

生成完成后不要提交中间 MP4。GIF 为 15fps、60 帧、无限循环；静态图用于系统减少动态效果设置。
