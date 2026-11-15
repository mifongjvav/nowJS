# MOSS 与 PICKCAT 的部署和播放

基线：2026-11-14，MOSS 仓库内 SDK 0.4.1。Skill 版本 1.0.0 与运行时版本独立。
资料来自源码和实际契约，不把长期设计提案或其他平台文档当作已实现能力。

## 作者流程与状态

1. 使用 PICKCAT 授权登录 MOSS，上传 ZIP 或 HTML/HTM；客户端解包、生成清单与逐文件 SHA-256，服务端校验并存储原始字节。
2. 上传完成产生不可变文件集，含本次声明的权限；草稿指向该文件集。
3. 部署执行真实 SDK prepare，校验大小、路径、SHA、HTML/CSS/JS 和资源图，**不运行作品代码**。ready 表示该文件集通过指定 runtime 的准备。
4. 私有预览通过授权入口下载同一文件集，再在浏览器准备和执行；浏览器的 connected、runtime ready、业务可用是不同层级。
5. 发布冻结元数据、文件集、部署和版本快照，与 PICKCAT 同步。保存/上传草稿不直接更新公开版本。

发布前必须有当前草稿的 ready 部署及封面。MOSS 默认标题 1–200 Unicode 码点、简介最多 20,000 码点；封面可由平台另选，常用 PNG/JPEG/WebP/GIF，无需在 ZIP 伪造封面配置。
标题、简介、版本说明和封面有 MOSS 内容审核；PICKCAT 的来源审核接缝当前默认通过，但仍有社区可见性、下架、删除、账号准入等限制，不能承诺包合规就一定公开。

上传默认最多 5 个开放会话、1 小时有效；每文件集默认最多 3 次部署尝试、准备租约 15 分钟。这些是可配置业务限制，不是作品执行时间；遇到失败先定位，再以修正后的包产生新文件集，别无休止重试同一内容。

## 播放边界

公开入口为 `${API_PREFIX}/player/play/:workId/:accessId`；预览为 `${API_PREFIX}/player/preview/:accessId`，由平台生成，作品不要硬编码或自行拼接凭证。
入口、manifest、文件逐次授权，无逐作品静态 HTTP 站点。文件字节在可信 player 内校验后交给 SDK，用户代码只在内层不透明 iframe 执行。

公开播放同时要求来源仍公开、当前发布修订与社区水位一致、社区审核 approved 且 visibility public、部署可用、作者未停用及作品无来源治理限制。
撤回、删除或社区处置可使旧入口失效；预览是独立授权流程，不能用公开资格来替代。社区处置与来源安全治理不同，不通过作品代码绕过。

PICKCAT 来源入口只能来自后端的 MOSS iframe 描述；当前 URL 准入为外部 HTTPS、无凭据、无 fragment，长度最多 2,048。前端拒绝本站同 Origin 和 HTTP loopback；后端的显式开发开关不代表网页前端也接受 HTTP。当前代码没有固定 MOSS 主机名白名单，不把任意字符串包含 moss 当作可信判据。
可信 player 的 frame-ancestors 仅允许配置中的 MOSS 用户端与 PICKCAT Origin，不能拿入口嵌到任意站点。

PICKCAT 播放器需登录；开启实名能力时需完成实名，成年人放行，未成年人按北京时间周五至周日或已收录法定节假日的 **20:00–21:00** 准入，页面存活期间会重新判断。不是作品 SDK 的时间能力，不在包内模拟或规避；MOSS 作者预览也不能代表此入口已验收。

## 权限交互与版本协调

可信 player 会发送 `loading/permission/ready/error`；permission 表示用户需要与可信播放器交互，不代表作品已执行。外层须让 iframe 可见且可聚焦，停止等待 ready 的外层超时，恢复 loading 后继续监督启动。只有可信直接窗口及精确 Origin 的消息有效；内层作品不能自行发送 ready 来越过加载/授权。

配套 PICKCAT 前端修复见 [PR #78](https://github.com/codemao-pickcat/codemao-shequ-web/pull/78)：识别 permission，确认时去除遮罩/inert，暂停外层超时，仅向经过准入的 MOSS 入口 Origin 委派 clipboard-read。**PR 合并和部署前，旧 PICKCAT 仍可能遮住确认 UI 或阻止剪贴板**；SDK 支持不等于线上已部署修复。交付要求这些权限的作品时，应检查当前部署并完成允许/拒绝与剪贴板的真实验证；保留作品所需能力，不能为躲过平台缺口静默删除核心功能。

外层的 allow-same-origin 或 clipboard-read 只用于可信 player，内层作品保持不透明，原生剪贴板和 fullscreen 仍禁用。不要将宿主的权限照抄到作品 iframe。

没有当前源码或线上访问时，如实报告“使用随包基线，PICKCAT 实播待验证”。平台安装按钮原有命令可能仍是占位，不把它作为公开发行渠道。
