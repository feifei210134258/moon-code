# ADR 0019：次主力模型的 Provider 配置边界

- 状态：Accepted
- 日期：2026-07-28
- 影响范围：Settings / Provider / Model Catalog / Secondary Model / Credentials

## 背景

Kimi Code 的 `secondary_model.model` 不是 Kimi 专属模型字段，而是指向已配置 `[models]` 条目的第二个模型指针。官方允许该模型来自 `kimi`、`openai`、`openai_responses`、`anthropic`、`google-genai`、`vertexai` 等任意 Provider。

第一轮界面只展示已有模型下拉框。虽然数据已经覆盖全部 Provider，但用户无法在次主力设置流程中完成常见的“填写 API Key / Base URL → 获取模型列表 → 选择模型”，容易把该能力误解为只能选择 Kimi 自家模型。

安全与兼容边界继续受 ADR-0005 约束：Moon Code 不直接编辑 `config.toml`，不维护第二份 Provider 凭据，也不能通过全量配置回写伪造 Provider 删除。

## 决策

1. 次主力设置按两个官方实体分层呈现：先连接或选择 Provider，再从 Kimi 模型目录选择 `secondary_model.model`。
2. `managed:kimi-code` 等 Kimi 内置 Provider 作为普通可选来源展示，不要求用户重复输入凭据。
3. 已有自定义 Provider 可直接复用，并通过 Kimi 官方 Provider refresh action 更新模型目录。
4. 新 Provider 表单提供 Provider ID、协议类型、Base URL 和 API Key。提交后只发送单 Provider 的 `/config` merge patch，再由 Kimi 官方 refresh action 获取模型列表。
5. API Key 只在当前表单内短暂存在，通过 typed IPC 进入 Main 并交给 Kimi；成功、失败、关闭设置或组件卸载后均从 Renderer draft 清除。设置快照只返回 `hasCredential`。
6. Moon Code 不从 Renderer 直接访问第三方 `/models`，不为次主力模型建立独立 Provider 存储，不在本地复制 API Key。
7. Provider 连接成功但未返回模型时，界面保留 Provider 并显示可重试的刷新操作，不自动猜测模型 ID。

## 后果

### 正向

- 用户可以在一个连贯流程中使用 Kimi 内置模型或任意 Kimi Code 支持的第三方模型。
- Provider、模型目录和 secondary 指针仍由 Kimi Runtime 作为唯一事实源。
- API Key 不进入长期 Renderer state、设置快照、日志或 Moon Code 自有存储。
- 后续 Kimi 增加 Provider 或模型能力时，可通过契约与目录刷新自然扩展。

### 负向

- 设置界面比单一模型下拉框更复杂，需要处理连接失败、鉴权失败和空目录状态。
- 当前 Kimi Runtime 没有安全的 Provider 删除 REST 接口；误建的 Provider 暂时不能在 Moon Code 中删除。
- Kimi 配置格式当前会持久化 Provider API Key；界面必须明确这是 Kimi 的凭据存储行为，而不是 Moon Code 自建密钥库。

### 中性

- 默认模型的切换行为保持不变：只影响新 Session，已有 Session 保留自己的模型。
- secondary 配置的实验开关、环境变量覆盖和 Runtime 重启语义不变。

## 备选方案

**只展示已有模型下拉框**

- 放弃：功能上可用，但不能完成用户预期的第三方 Provider 接入流程，且会造成 Kimi 专属能力的误解。

**Moon Code 直接调用第三方 `/models` 并自存凭据**

- 放弃：会建立第二份 Provider 与凭据事实源，绕开 Kimi 的协议适配、模型目录和安全边界。

**直接编辑 `config.toml`**

- 放弃：违反项目约束，也可能破坏 Kimi 的 OAuth、遮盖凭据与跨客户端状态。

## 非功能要求

- 安全：远程 Base URL 必须为 HTTPS；HTTP 仅允许 loopback。API Key 不回显、不记录、不进入响应 DTO。
- 可靠性：刷新失败不得覆盖当前已选模型；空目录不得自动生成模型 ID。
- 可维护性：Provider 类型来自共享白名单，新增协议通过 typed contract 扩展。
- 兼容性：能力由 Runtime 契约探测，不设置未来 Kimi 版本上限。

## 参考

- [Kimi Code 配置文件：providers / models / secondary_model](https://moonshotai.github.io/kimi-code/zh/configuration/config-files.html#secondary-model)
- [ADR-0005：Kimi 0.29 v2 Provider 变更边界](./0005-kimi-v2-provider-mutation-boundary.md)
- [Moon Code 0.2.0 PRD：次主力模型](../09-v0.2.0-secondary-model-prd.md)
