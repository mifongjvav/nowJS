# JS / CSS 与构建兼容

## 构建策略

交付浏览器能执行的静态 HTML/JS/CSS，不交 TS/TSX、Vue SFC、SSR 服务、API route 或开发服务器。保留项目已有框架和构建链；作者作品不需要遵守 MOSS 管理页面的组件库、字体或主题约定。

SDK 0.4.1 使用现代语法解析器，不等于为浏览器转译或提供所有 Web API。没有已声明的 Chrome 61 最低基线；按实际目标浏览器构建并检测能力。

Vite 单入口常见修复：将公开基础路径设为相对路径以便产物迁移，关闭 `build.modulePreload`；若生成的 preload helper 含计算式 `new URL(dep, import.meta.url)`，将 chunk 合并。Rollup 版可使用 `build.rollupOptions.output.inlineDynamicImports: true`；Rolldown 版使用 `build.rolldownOptions.output.codeSplitting: false`。**先查当前 Vite 版本和实际产物，别混用两代配置**。静态 CSS 标签和字面量模块分包本身可用，不要求一律内联全部资源。

运行时编译模板的库可能需要 `eval`；优先使用框架预编译产物。构建期使用 Node 或网络不等于作品运行期需要相同能力。

## 脚本与加载顺序

- 支持外部/内联 classic script、内联事件、外部/内联 `type="module"`、静态 import/export、文档 ESM 循环引用和 top-level await。推荐事件监听器，**不是因为平台禁内联事件**；handler 不支持依赖顶层 `return` 的写法。
- 模块导入必须是包内路径；动态 import 接受普通字符串和无插值模板字面量。不能是 `import(path)`、含插值模板、bare specifier、远端 URL、query/hash、import attributes 或 JSON modules。
- 只支持普通 JS MIME、module 和内联 `application/json` 数据块；不支持 importmap、JSON-LD 等其他 script type；JSON 数据块不得带 `src`。依赖库通过构建打包解决 bare import。
- 静态脚本在完整 DOM 装入后按文档顺序执行，`async/defer` 不保留并发时序。SDK 最后回放一次 `DOMContentLoaded/load`；不要依赖 `document.write`、流式解析时序或模块中的 `document.currentScript`。
- `import.meta.url` 是 Blob 地址。只对可识别的字面量 `new URL("./asset.png", import.meta.url)` 重写；不要自行从 location 或该 Blob 地址拼回“作品目录”。
- `eval/Function` 代码字符串不重写资源/import/Worker 引用；即使授权也需自行保证内容兼容。

## HTML / CSS / SVG

布局、表单控件、style 标签、style 属性、stylesheet、CSS import、url 和 image-set 可用；CSS 必须可被 css-tree 完整解析，CSS/Blob 依赖不得成环。

不支持执行文档中的 `base/iframe/frame/frameset/object/embed/applet/portal` 和 meta refresh；表单不能含 `action/formaction`，提交事件在本地处理。页面内视图切换可用，不依赖 history 路由、真实文档导航或新窗口。

普通 `a/area` 点击都被取消，只有 `#fragment` 得到本地处理；外链可出现在原始标记中不代表能打开。`javascript:/data:/vbscript:` 链接在准备阶段拒绝。

icon/preload/prefetch/modulepreload/preconnect/dns-prefetch/manifest 的纯提示 link 被删除，不会作为真实资源下载；混合 `rel="stylesheet preload"` 只保留 stylesheet，未知 rel（含 `shortcut`）仍拒绝。`integrity/ping/manifest/codebase/archive/srcdoc` 被移除，非 refresh 的 http-equiv meta 被丢弃；不要用自带 CSP 覆盖宿主策略。classic nomodule 整个脚本会被移除，别将唯一初始化代码藏在那里。

外置 SVG 必须自包含，拒绝脚本、事件、动画、foreignObject、image、use、style 元素及外部引用。style 属性和表现属性的 URL 仅允许指定绘图属性引用本地 `#id`。需保留复杂 SVG 时改为兼容静态 SVG 或预先栅格化；不盲删导致视觉损坏。

## 错误定位

| 准备错误 / 平台错误 | 首先检查 |
| --- | --- |
| `EXTERNAL_URL` / `PACKAGE_EXTERNAL_URL` | 实际执行的 CDN、远程资源；SVG namespace 字符串不等于联网 |
| `INLINE_RESOURCE` / `PACKAGE_INLINE_RESOURCE` | data URL 是否用于脚本、CSS import 或 fetch |
| `MISSING_RESOURCE` / `PACKAGE_MISSING_RESOURCE` | 最终 ZIP 是否包含对应路径、大小写和 fetch 根基准 |
| `DYNAMIC_IMPORT` / `UNSUPPORTED_MODULE` | 计算式 import、bare import、query/hash、JSON module |
| `DYNAMIC_RESOURCE` | 计算式 `new URL`、Vite preload helper |
| `UNSUPPORTED_REFERENCE` / `PACKAGE_UNSUPPORTED_RESOURCE` | `.glb/.wasm` 或 HTML 被用作自动 Blob，SVG 不兼容 |
| `UNSUPPORTED_API` / `UNSUPPORTED_DYNAMIC_CODE` | 直接 XHR、SharedWorker、importScripts；库的未执行分支也会被识别 |
| `INVALID_CSS` / `UNSUPPORTED_CSS` | CSS parser 未完整支持的语法，不只看浏览器是否能渲染 |
| `RESOURCE_CYCLE` | CSS import、Blob 或 Worker 模块循环；文档 ESM 环不在此列 |
| 浏览器 CSP 错误 / ready 超时 | 权限遗漏、动态 DOM URL、初始化异常、未结束的 TLA |

错误文字可能滞后于实现。例如平台某些 API 错误仍泛称移除动态代码，不能据此断言 `eval` 永远不可用；核对代码位置、权限和运行阶段。
