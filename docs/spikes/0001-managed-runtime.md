# Spike A 记录：托管 Kimi 运行时

> 日期：2026-07-22
> 状态：进行中，已通过单次真实启动/元数据/关闭链路；尚未达到 100 次循环和打包后验证门槛。

## 1. 当前实现

- 根依赖固定为 `@moonshot-ai/kimi-code@0.29.0`，不执行全局安装。
- `KimiRuntimeManager` 只在 Electron Main 内运行；Renderer 仅接收去敏状态。
- 开发态托管模式通过 Electron 自带 Node（`ELECTRON_RUN_AS_NODE=1`）或当前 Node 执行固定的 `dist/main.mjs`。
- 启动命令为 `web --port 0 --no-open --log-level error`。
- 从 Kimi ready 输出中提取 origin 和 token；token 只保存在 Main 内部私有字段。
- Ready 后依次验证公开的 `/api/v1/healthz` 和带 bearer 的 `/api/v1/meta`。
- 停止时优先调用 `/api/v1/shutdown`，失败时发送 `SIGTERM`。
- 系统 Kimi 通过 `which/where` 和 `--version` 探测，支持区间固定为 `>=0.29.0 <0.30.0`。
- REST client 同时检查 HTTP 状态与 `{code,msg,data,request_id}` envelope，`code != 0` 必须失败。
- Electron preload 固定输出 CommonJS `.cjs`；这是 `sandbox: true` 下 typed IPC 能实际注入 Renderer 的必要条件。
- IPC 同时校验发送窗口、Renderer 精确 origin/入口文件和 runtime mode allowlist；远端页面无法借 preload 启停本地运行时。

## 2. 本机证据

环境：

```text
macOS
Node 24.15.0
Electron 43.2.0
pnpm 10.12.4
托管 Kimi 0.29.0
系统 Kimi 0.28.0（明确标记为不兼容）
```

已完成一次真实集成验证：

```text
KIMI_RUNTIME_INTEGRATION=1 pnpm vitest run \
  tests/runtime/managedRuntime.integration.test.ts --reporter=verbose

1 test passed
start → healthz → authenticated meta → shutdown
duration: 1.65s
```

测试只断言去敏的 `RuntimePublicState`，不打印 bearer token。单元测试另外覆盖 ready line 解析、两种 token 输出格式去敏、版本门禁和 REST 非零 envelope。

真实 Electron 窗口也已完成一次交互验证：点击状态控件后显示 `Kimi 0.29.0`，左栏被官方 Workspace/Session 数据替换；再次点击后官方 shutdown 完成且托管子进程消失。该验证同时捕获并修复了 sandboxed ESM preload 未注入 `window.kimiAgent` 的问题。

## 3. 已得到的结论

- 固定 npm 包可以在不修改 PATH 或全局 npm 的前提下启动。
- 随机端口和 bearer token 可以从官方 ready 输出可靠取得。
- Kimi 0.29.0 当前实际健康检查路径是 `/api/v1/healthz`，元数据路径是 `/api/v1/meta`；旧文档里的 `/health` 不应继续作为实现依据。
- Electron Renderer 不需要也不应接触 origin 对应的 bearer token。
- 本机系统 Kimi 0.28.0 不在支持区间，UI 应明确提示并默认使用托管版。

## 4. 尚未满足的通过标准

- [ ] 连续启动/停止 100 次且确认无残留进程、端口或 instance registry 污染。
- [ ] 在打包、签名后的 `.app` 中验证 `ELECTRON_RUN_AS_NODE`、原生依赖和 Kimi Web 静态资源。
- [ ] 验证托管版与系统版对同一官方 Kimi home 的 Session 可见性一致。
- [ ] 模拟 App 强退，验证下次启动发现并安全处理残留实例。
- [ ] 验证 runtime 升级 manifest、固定 hash 与回滚策略。
- [ ] 将 token 日志扫描扩展到崩溃报告和诊断包。

因此 Spike A 当前不能标记为通过，也不能据此冻结发布架构；但已足以继续 Foundation 的 App shell、typed IPC 和 Kimi Adapter 开发。
