---
name: moss-work-builder
description: >-
  为 MOSS / PICKCAT 创建、适配和打包可在离线作品沙箱运行的 HTML 作品。
  用于生成上传 ZIP、修复部署或播放器兼容问题、迁移 CDN 与网络依赖，以及配置作品权限和存档。
metadata:
  version: "1.0.0"
  sandbox-runtime: "0.4.1"
  verified-at: "2026-11-14"
---

# MOSS 作品构建指南

MOSS 托管作者上传的静态作品，PICKCAT 通过可信 MOSS player 展示作品。
作品运行在 player 内部的**不透明 Origin iframe**，资源来自上传包并被转换为 Blob；不是普通静态网站，也没有作品专属 HTTP 服务。

目标产物：根目录包含 `index.html` 的可上传 ZIP、必要的作品权限清单，以及本次产物的检查与验证结果。全程称“作品”，品牌写作 **MOSS**。

## 何时使用

- 从零制作可上传 MOSS 的网页作品。
- 将已有 HTML、Vite 或其他前端项目构建为离线作品包。
- 修复缺失资源、模块导入、动态资源 URL、沙箱权限或存档问题。

本 Skill 负责作品制作和交付；平台登录、上传、发布与删除按用户授权执行。不要把作者项目改造成 MOSS 管理端或社区站点，也不要为作品安装宿主沙箱 SDK。

## 工作流程

1. **确认运行基线。** 读取 [平台与播放](references/platform-and-playback.md)，识别用户项目的构建链、联网依赖、存储和必需能力。有当前 MOSS 源码时核对 SDK 版本及相关实现；有明确 API 地址时可读取 `${API_PREFIX}/capabilities` 获取动态上传限制。该接口只声明上传/业务能力，不能据此推断沙箱 API。没有当前资料时使用本 Skill 的 0.4.1 基线，并明确尚未核实线上版本；不编造在线文档或安装地址。
2. **确定适配范围。** 保留原有玩法、业务与视觉意图；先识别不能离线完成的功能。CDN 依赖和静态数据改为包内文件；远端 AI、账号、支付、排行榜、云数据库等没有任意 URL 代理，不能仅改一个 URL 就变为可用。核心需求依赖这些服务时，说明限制并与用户确认本地替代方案，其他适配继续进行。
3. **组织静态产物。** 先读 [ZIP 与资源](references/zip-artifact-spec.md)。只打包构建产物目录的内容，根入口精确为 `index.html`，补齐依赖、UTF-8、路径和体积检查。单文件 HTML/HTM 上传可用，但外部文件不会随之自动上传；多资源优先 ZIP。
4. **修复加载兼容。** 先读 [JS / CSS 与构建](references/build-compatibility.md)。保留可用的内联脚本、ES modules、TLA 与 CSS；修复动态 import、Vite preload、动态 DOM URL、SVG 和运行时路径。不要套用其他容器的 Chrome 61、禁内联、禁 module、10 MB ZIP 上限等规则。
5. **按实际需要声明能力。** 先读 [权限与设备能力](references/capabilities.md)。列出 `worker`、`wasm`、`pointerLock`、`eval`、`clipboardRead` 的最小集合；`eval` 自动包含 `wasm`。这些是 MOSS 上传界面的版本属性，**不放进作品 ZIP 的自定义 manifest**。观看者同意由平台完成；不可通过改 CSP、嵌套 iframe 或自造桥接绕过。
6. **处理状态与适配。** 使用存档、剪贴板时读 [作品 API 与存储](references/game-api-and-storage.md)；做输入、媒体和画布时读 [跨端与性能](references/experience-and-performance.md)。不要伪造不存在的 `window.game` 方法或把平台登录当作作品可读取的身份。
7. **审计实际产物。** 使用随包 Python 脚本检查目录或最终 ZIP：`python scripts/audit_artifact.py <产物路径>`。修复全部 error，逐条判断 warning。它只做结构、字节和提示扫描，**不代替 SDK 准备或真实播放**。在有 Node 24+ 及可信 SDK 构建产物时，再运行 `node scripts/verify_sandbox.mjs <产物目录> --sdk <SDK的dist/index.js绝对路径>`。没有所需运行时或 SDK 时完成人工检查并标记未执行的层级；不要下载来历不明的 SDK。
8. **打包并复核。** `python scripts/audit_artifact.py <产物目录> --output <作品.zip>` 先检查再打包，拒绝覆盖已有文件。重新审计生成的 ZIP，记录 SHA-256、文件数、解压后字节量及权限清单。脚本不会改变业务代码或自动提交平台。
9. **交付与真实验收。** 报告 ZIP 路径、修改要点、声明权限和验证层级：结构审计 / SDK 静态准备 / MOSS 私有预览 / PICKCAT 实际播放。只通过 prepare 不代表运行成功；只有实际观察到的步骤可标为通过。待验证时给出最短操作：上传本次 ZIP、勾选所需能力、部署、预览核心流程，再发布并在 PICKCAT 验证同一版本的权限确认、输入、媒体及存档。普通浏览器直开仅作为辅助调试。

## 交付门槛

- 根入口、路径、文件数、原始字节预算和完整性符合平台与 SDK 两者中较严的限制。
- 执行依赖全部本地化；不依赖网络、次级文档导航、原生跨源存储或未提供的宿主方法。
- 需要的权限已明确交给作者配置；授权拒绝、浏览器不支持和存档失败有可理解的处理。
- 检查结果如实分层，未验证的线上、浏览器和设备能力不写成“已兼容”。

## Reference

| 文档 | 何时读 |
| --- | --- |
| [平台与播放](references/platform-and-playback.md) | 每次开始；部署/发布区别、PICKCAT 准入和当前集成状态 |
| [ZIP 与资源](references/zip-artifact-spec.md) | 组织文件、离线资源、文件类型和最终 ZIP |
| [JS / CSS 与构建](references/build-compatibility.md) | 构建链、模块、动态资源、SVG 和错误定位 |
| [权限与设备能力](references/capabilities.md) | Worker、WASM、eval、鼠标锁定、剪贴板及受限 Web API |
| [作品 API 与存储](references/game-api-and-storage.md) | `window.game`、存档作用域、配额与异常 |
| [跨端与性能](references/experience-and-performance.md) | 嵌入式视口、触摸、媒体与性能验收 |
