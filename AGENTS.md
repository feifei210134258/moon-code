# Moon Code 项目指南

## 架构与数据边界

- Electron + Vue 3 + TypeScript，使用 `pnpm` / `electron-vite`。
- 唯一 Agent 内核是 Kimi Code CLI：`Renderer → preload → main IPC → KimiSessionBridge → SessionSyncController → kimi web REST/WebSocket`。
- Kimi Workspace / Session / Transcript 是唯一数据源。不另建聊天库，不绕过官方接口修改凭据、配置或 Session 文件。
- 实时同步顺序是 `snapshot → cursor → subscribe`；durable event 按 `seq/epoch`，volatile delta 按 `offset`。WS 必须串行解码，缺帧/乱序必须 snapshot resync，高频视图更新在 `SessionSyncController` 合并后再跨 IPC。

## 代码地图

| 区域 | 入口/职责 |
| --- | --- |
| Runtime | `src/main/runtime/KimiRuntimeManager.ts`：发现、启停、连接 Kimi CLI |
| Main bridge | `src/main/kimi/KimiSessionBridge.ts`、`src/main/ipc.ts` |
| Kimi adapter | `packages/kimi-adapter/src/`：REST/WS、schema、cursor、projector、sync controller |
| IPC contract | `src/shared/contracts.ts` → `src/preload/index.ts` |
| Renderer | `src/renderer/src/composables/useRuntimeBridge.ts` → `src/renderer/src/stores/workbench.ts` → `src/renderer/src/App.vue` |
| Protocol baseline | `packages/kimi-adapter/upstream.json` 和 `packages/kimi-adapter/contracts/` |
| Tests | `tests/kimi` 覆盖协议/同步，`tests/main`、`tests/renderer`、`tests/runtime` 与源码分层对应 |

## 工作流程

- 先运行 `git status -sb`，保留用户未提交改动。执行 `rm` 或其他删除操作前必须先征得用户同意。
- 若根目录存在 `.codegraph/`，理解/定位代码时先用 CodeGraph；不存在则直接用 `rg`。
- 先跑相关 Vitest，推送前必须跑 `pnpm check`（typecheck + tests + production build）。真实 Kimi Runtime 集成测试必须显式 opt-in。
- 公开仓库为 `feifei210134258/moon-code`，`origin/main` 是默认发布分支。不提交 `.impeccable/`、`.kimi/`、`.env`、token、OAuth 凭据或本地应用状态。

## 常用命令与发布

- 开发：`pnpm dev`；测试：`pnpm test`；全量验证：`pnpm check`。
- macOS 打包：`pnpm package:mac`，配置见 `electron-builder.yml`，产物在 `release/`。只生成 DMG，不生成 ZIP/其他归档。
- Windows 打包：`pnpm package:win`（NSIS，仅 x64，不支持 ARM64）。macOS 上可交叉打包：`scripts/package-win.mjs` 把 win32 Electron dist 缓存到 `node_modules/.cache/electron-dist/` 后用 `-c.electronDist` 覆盖 yml 里的 mac 路径。yml 中 win 目标带 `signAndEditExecutable: false`（免 wine），在 Windows/CI 上出正式包时可移除以恢复 exe 图标与版本元数据。
- 项目为 MIT License；第三方归属见 `THIRD_PARTY_NOTICES.md`。
