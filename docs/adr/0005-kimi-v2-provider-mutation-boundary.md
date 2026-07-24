# ADR 0005：Kimi 0.29 v2 Provider 变更边界

- 状态：Accepted（上游能力边界）
- 日期：2026-07-23
- 影响范围：Model / Provider / Config / OAuth 设置

## 背景

锁定版 Kimi Code `0.29.0` v2 暴露了 Model、Provider、Config 与 OAuth 的读取和操作接口，包括模型/Provider 列表、默认模型、模型目录刷新、device-code 登录、登出及 `/config` merge。真实 OpenAPI 与服务端路由没有 Provider 删除 REST 操作；内部 Core RPC 虽有 `removeKimiProvider`，但第三方客户端不能通过受支持的 Server API 调用。

`GET /config` 会遮盖凭据，只返回 `has_api_key`。客户端若读取该响应、删掉一个 Provider 再把整个对象写回，可能破坏无法回读的 API Key，因此不能用“读—改—全量回写”伪造删除能力，也不能绕过 Kimi Server 直接编辑用户的 `config.toml`。

## 决策

- Model、Provider、Auth 和 Config 的事实源全部使用 Kimi REST；Renderer 不读取配置文件。
- 默认模型使用官方 `POST /models/{id}:set_default`；模型刷新使用官方 Provider action。
- 新增 Provider 使用 `POST /config` 的深度 merge，只提交一个经过校验的新 Provider patch；API Key 仅穿过 typed IPC 提交给 Kimi，响应和 Renderer state 只保留 `hasCredential`。
- Provider ID、类型、Base URL 和 API Key 在 Main 校验。远程 Base URL 必须是 HTTPS；HTTP 只允许 loopback 开发端点。
- OAuth 使用官方 device-code start/poll/cancel/logout，授权页只允许 HTTPS 外部打开。
- Kimi `0.29.0` v2 下 Provider 删除在 UI 中明确标为不可用，不提供危险的文件编辑或全量配置回写降级。
- Renderer 只能更新 telemetry、默认 Permission、默认 Plan 与 Skill merge 等显式白名单字段；不暴露通用 raw config IPC。

## 后果与退出条件

当前客户端可以安全完成账号登录、模型选择、模型目录刷新、Provider 添加和常用全局设置，但锁定版 Runtime 无法安全删除自定义 Provider。上游加入受支持的删除路由并通过“删除 Provider → 清理所属模型 → 处理默认模型/Provider → 保留其他凭据”的真实 Runtime 测试后，才启用删除按钮并更新本 ADR。
