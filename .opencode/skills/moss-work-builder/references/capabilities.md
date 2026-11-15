# 权限与设备能力

## 可选作品权限

默认集合为空。作者在上传版本时声明需求，可信 player 在执行作品前向观看者确认。
权限不属于 ZIP manifest，也不能由作品代码自行打开。

| 权限 | 允许的能力 | 仍需注意 |
| --- | --- | --- |
| `worker` | 包内 `.js/.mjs` 或子文档创建的 Blob Dedicated Worker | Worker 继承 CSP；无包内 fetch、window.game、Web Storage；不支持 importScripts、SharedWorker/ServiceWorker |
| `wasm` | 浏览器编译/实例化 WebAssembly | WASM 数据可携带和 fetch，但编译需授权；不能自动获得共享内存、多线程或联网 |
| `pointerLock` | 作品 iframe 鼠标锁定 | 仍需真实用户激活、浏览器支持，提供退出与非锁定操作 |
| `eval` | eval、Function 及字符串动态代码编译 | CSP 的 unsafe-eval 同时开启 WASM，规范化为 `wasm` + `eval`；代码字符串中的资源不重写 |
| `clipboardRead` | `window.game.clipboardReadText({})` 读取纯文本 | 还需可信宿主 adapter、浏览器权限/焦点/手势；不授予作品原生 clipboard-read/write |

权限列表规范顺序为 `worker, wasm, pointerLock, eval, clipboardRead`，去重后输出。
仅列出必要能力，不为了“保证兼容”全选。新需求需上传新文件集；公开作品在发布该版本后才采用新需求。

观看者可以本次同意、拒绝或明确永久授权。永久集合覆盖当前需求子集时可自动运行，新增能力重新确认。登录观看者授权可绑定 MOSS 真实账号；第三方 Cookie 不可用时可能被视为匿名，PICKCAT 登录不等于 MOSS player 已取得账号会话。授权存储与作品存档是两件事。

## Worker 细节

支持字面量 `new Worker("./worker.js")`、`new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` 和自行创建的 Blob Worker。直接字符串路径相对调用脚本解析；模块 Worker 的 literal imports 会物化成 Blob 图，不允许环。

模块 Worker 由 classic bootstrap 导入，初始化前的消息排队后重放；不要依赖重放事件的 `isTrusted`。动态 Blob 源需自包含，主文档 import map 不可用于 Worker，Worker 内不能用相对 fetch 取包文件；将数据经 postMessage/transferable 传入。

包装器对第 33 个直接存活 Worker 拒绝创建，terminate 释放名额；嵌套 Worker 等可绕过。这是兼容与清理限制，**不是 CPU、内存或 Worker 数量的硬隔离**。作者应主动控制并发和回收资源。

## 其他 Web 能力

| 能力 | 当前作品运行方式 |
| --- | --- |
| DOM / Canvas / WebGL / WebAudio | 在浏览器支持时可用；检测失败并降级，媒体从真实手势启动 |
| 图片、字体、音视频 | 包内静态资源、适用位置的 data URL 或作者生成的 Blob；编码由浏览器决定 |
| 文件选择 | 可按浏览器能力检测 `input type=file`，用户手动选择本地数据；没有平台选图、摄像头或媒体筛选承诺 |
| 网络、WebSocket、远程资源、远程 Worker | 不属于支持能力；无任意 URL 代理。将作品做成离线可运行 |
| XMLHttpRequest、SharedWorker、importScripts | 不支持；可静态识别的直接用法在准备阶段就拒绝 |
| ServiceWorker / IndexedDB / Cookie | 不作为作品可用能力；不透明 Origin，改用宿主存档 |
| 相机、麦克风、定位、通知 | 未授予；不编造设备权限或桥接 API |
| 原生剪贴板读写 | 禁用；只读文本走上述有条件的 Host RPC；无写剪贴板 API |
| 作品内 requestFullscreen | 内层 iframe 显式禁用 fullscreen；使用 PICKCAT / MOSS 外层播放器提供的展开功能 |
| 弹窗、顶层导航、下载、原生 alert/confirm/prompt、表单提交 | 无相应 sandbox 授权；改为页面内 UI 或已支持的数据交互 |
| SharedArrayBuffer / WASM threads | 不作保证；worker + wasm 不代表跨源隔离已满足 |

不得利用 WebRTC/STUN 或自身导航“补回”联网。当前 iframe/CSP 是浏览器尽力限制网络，并不承诺绝对零联网。不要以安全隔离口号替代实际适配或为作品放开 allow-same-origin。

## 自检

- 交付说明列出能力需求；没有为自己或观看者假定授权。
- 拒绝授权不启动作品；剪贴板失败能退出/重试，没有自动循环读取。
- Worker 的代码、依赖、数据传输与退出清理符合约束。
- 未提供的能力有具体替代或明确限制，不伪造成功状态。
