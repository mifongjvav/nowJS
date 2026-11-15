# ZIP 与资源规范

## 入口与预算

压缩构建目录的**内容**，不是外面的 `dist/` 或项目目录：

```text
work.zip
├── index.html
└── assets/
    ├── main.js
    ├── style.css
    └── image.png
```

不要求作者附带 manifest、SHA 文件、权限配置或 SDK。MOSS 客户端解包，计算逐文件 SHA-256 和大小，再上传文件集。
`.html` / `.htm` 单文件模式会将内容命名为 `index.html`；ZIP 内的 `index.htm` 不会自动改名，`Index.html` 也不是根入口。

| 项目 | 默认上传限制 / SDK 0.4.1 上限 |
| --- | --- |
| 文件数 | 2,000；相同内容的多个路径仍逐文件计数 |
| 单文件原始大小 | 25 MiB（26,214,400 bytes） |
| 全部文件原始大小 | 50 MiB（52,428,800 bytes） |
| 路径长度 | 512 UTF-8 bytes |
| SDK 编译后的资源计划 | 100 MiB |
| 上传 manifest 请求 | 默认 2 MiB，由平台生成 |

线上上传限制可收紧，以实际 capabilities 和 SDK 的较严值为准。50 MiB 指解压后逻辑文件总量，**不是 ZIP 压缩体积**；高压缩率不会增加额度。封面可能作为额外文件加入上传，预算应留余量。不要继承参考容器的 10 MB 限制，也不把检查界面的资源扫描阈值当成平台硬上限。

ZIP 使用标准 Store 或 Deflate，保持正确 CRC；不加密、不分卷。MOSS 支持 ZIP64，但通常不需要。避免重复路径和符号链接。排除 `node_modules`、版本库、环境秘密、缓存和无用 sourcemap；这是交付卫生要求，不是扩展名白名单。

## 路径与 URL

文件路径区分大小写。文件名及目录段禁止空段、`.`、`..`、前导 `/`、反斜线、ASCII 控制字符、ASCII 空白、DEL 和 `% : ? #`。普通 Unicode 可用；长度按 UTF-8 bytes，建议简洁的文件名。

资源引用支持 `./assets/a.png`、不越界的 `../` 及 `/assets/a.png` 包根写法；推荐相对引用，**不要说包根路径一律不可用**。引用可对普通 Unicode 文件名进行一次 URL 编码，不能编码斜线/反斜线、双重编码或越过根目录。

- HTML 静态属性、CSS URL 和字面量 `new URL("./a.png", import.meta.url)` 会被转换为子 iframe 的 Blob URL。
- 普通静态引用允许 query 和 fragment；query 在 Blob 物化时丢弃，完整 fragment 保留。不要用脚本 URL query 传业务配置。
- module 与自动 Worker 引用不允许 query/hash。
- `fetch("assets/config.json")` 支持 GET/HEAD，路径始终基于根 `index.html`，不是调用脚本所在目录。返回原始上传字节；query/hash 不改变内容。计算出的包内路径也可用。
- `fetch` 没有网络回退；HTTP(S)、协议相对地址、POST 和直接 `data:` fetch 不可用。Worker 中没有这个包内 fetch 兼容层。
- 动态 `img.src = "./a.png"`、插入 script/link、字符串拼出的 CSS URL 不会自动重写；改静态引用、模块中的字面量 `new URL`，或包内 fetch 字节后自行生成 Blob URL并清理。

## 文件类型按用途区分

已知识别：`html css js mjs json txt csv xml png jpg jpeg gif webp avif ico svg woff woff2 ttf otf mp3 ogg wav m4a mp4 webm bin`，取文件名最后一个点号后的扩展名，不区分大小写。

| 文件 | 可用方式 |
| --- | --- |
| 根 `index.html` | 唯一执行文档 |
| 其他 `.html` | 被动模板；`fetch("templates/card.html").text()`，SDK 不自动解析、执行或导航至该文档 |
| `.js/.mjs` | script、module、自动 Worker 的执行资源 |
| `.css` | stylesheet、CSS import |
| 已知非 HTML 资源 | 按用途静态引用或 fetch；已知 JSON/TXT/CSV/XML/BIN 可生成自动 Blob |
| 未知/无扩展名，如 `.glb/.gltf/.data/.wasm/.htm` | 允许携带，作为 `application/octet-stream` 原始数据通过包内 fetch 读取；不能直接用作自动资源或字面量 `new URL` |

例如 `.wasm` 应先 `fetch("assets/core.wasm").arrayBuffer()`，经 `wasm` 授权后编译；不能因为携带文件就认为已获得执行权限。模型加载器若内部会 fetch 纹理/decoder，也要逐个核对。

HTML/CSS/JS/SVG 必须有效 UTF-8；额外 HTML 也校验编码。编译器会解析包中未引用的已知 JS/CSS/SVG，不能靠“当前不执行”保留不兼容库代码；被移除的 classic nomodule 专用脚本有特定例外。

内联 `data:` 可以用在非执行图片、字体、音视频等资源位置；不接受作 script/module/Worker/stylesheet（含 CSS import）或直接 fetch。静态媒体采用包内文件通常更省内存。

## 自检

- 根目录精确包含 `index.html`；没有外套目录。
- 所有依赖、懒加载资源和数据都在最终构建目录；路径大小写一致。
- 逐文件和总量检查原始 bytes，保留封面余量；不包含秘密与开发依赖。
- HTML 模板和通用数据没有被误作脚本、样式或自动 Blob 资源。
- 审计最终 ZIP，记录摘要；不要只检查源项目目录。
