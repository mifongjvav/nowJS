# 作品 API 与存档

## 调用边界

平台在作品初始脚本执行前注入只读、冻结的 `window.game`。作品无需安装任何沙箱包、导入 `/game` / `/vue`、加载 `game.global.js` 或自行握手；这些内容侧 SDK 入口已移除。

当前离线会话只按 adapter 暴露存储方法，以及有条件的纯文本剪贴板方法。不要从 SDK 通用插件例子推断 MOSS 提供登录、用户信息、联网、支付、排行榜、关闭播放器或任意 `game.call/on/ready`。

公开方法使用严格对象参数，不接受额外字段。均返回 Promise，可传可选第二参数 `{ signal, timeoutMs }`；客户端 timeout 不能延长 Host 上限。处理失败、超时、取消和页面关闭，不吞错后显示“已保存”。

```js
await window.game.storageSet({ key: "save", value: JSON.stringify(state) });
const raw = await window.game.storageGet({ key: "save" }); // string | null
if (raw !== null) {
  // JSON parse 后仍按作品自己的版本和 schema 校验。
}
await window.game.storageDelete({ key: "save" }); // void

// 仅在 clipboardRead 已声明、观看者同意且宿主提供 adapter 时存在：
if (typeof window.game?.clipboardReadText === "function") {
  const text = await window.game.clipboardReadText({});
}
```

方法存在性可用于本地调试与降级，不代表已授予浏览器原生权限。不要创建假 `window.game` 覆盖平台对象。

## 显式异步存档

| 项目 | 作品通过 SDK 可用的上限 |
| --- | --- |
| key | 非空，128 UTF-8 bytes |
| value / get 返回 | 字符串，16 KiB UTF-8；对象先 JSON.stringify |
| 单会话累计写入 | 1 MiB；最多 128 个不同写 key，删除也计写 key |
| 读取并发 | 最多 4 |
| set / delete 并发 | 各最多 1；按需串行保存 |
| Host 执行 / 默认调用超时 | 5 秒 |
| 底层存储总量 | 每作用域 5 MiB、256 条；SDK 单次/单会话限制仍更严 |

桥接通用 payload 64 KiB、每秒 30 请求、并发 64，不要每帧保存或将大文件经 RPC 当作云盘。节流到语义节点，串行写并等待结果。

平台 IndexedDB adapter 内部支持更大的键值，不代表作品可越过 SDK 的 128-byte / 16-KiB 限制。

## Web Storage 兼容

作品 iframe 原生 Web Storage 因不透明 Origin 不可用时，SDK 提供 `localStorage/sessionStorage` 的内存兼容对象。只使用 `getItem/setItem/removeItem/clear/key/length`；不依赖属性下标、StorageEvent 或 Worker 访问。

- MOSS 在初始脚本前恢复 scoped localStorage。同步调用立刻更新内存，约 100 ms 合并后经桥接异步落盘；关闭前未提交的写入可能丢失。
- 持久 localStorage 最多 128 条、48 KiB，包含桥接计量开销；两份内存存储共享 1 MiB 累计 UTF-8 写入额度（含键和值），并非当前内容大小。
- sessionStorage 每次播放从空开始，结束清空。
- adapter 未提供或 preload 失败时，localStorage 只保留当前会话；落盘失败会警告。需持久化确认时使用显式异步存档。
- 同步 localStorage 与 `storageGet/Set/Delete` 是两套独立键空间，写同名 key 不互通。

## 作用域与隐私

存档保存在观看者当前浏览器的可信 player IndexedDB，**不是云存档**。按观看者作用域、作品和 public/preview 隔离；preview 再绑定 fileSetId。公开版本更新沿用该作品的 public 存档，作者须维护数据版本迁移。预览新文件集可能看到空存档，这是隔离预期。

作品不传 namespace、workId、viewerId 或账号身份，作用域由宿主固定。切换账号、匿名/登录、更换设备、清理浏览器、第三方存储分区都会影响可见存档；第三方存储完全不可用时，MOSS player 可能直接拒绝启动，而不是静默承诺持久化。

## 剪贴板

`clipboardReadText({})` 参数必须是严格空对象，返回 string，最多 8,192 UTF-8 bytes。并发最多一个、不排队，Host 和默认调用超时 30 秒。将读取放在明确的用户操作中，处理拒绝、焦点、浏览器不支持及超量；不要在初始 top-level await 中等待用户粘贴而阻断 ready。

作品不能直接调用 `navigator.clipboard` 作为回退。没有读取图片、写文本或后台监听剪贴板的方法。不记录、上传或在无关 UI 展示剪贴板内容。
