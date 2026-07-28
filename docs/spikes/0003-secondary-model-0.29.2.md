# Spike C：Kimi 0.29.2 次主力模型兼容性

状态：已完成兼容性与真实 Runtime 验收
日期：2026-07-27
目标版本：Kimi Code `0.29.2`
关联 PRD：[Moon Code 0.2.0 PRD：次主力模型](../09-v0.2.0-secondary-model-prd.md)

## 1. 验证目标

确认 Kimi Code `0.29.2` 是否具备 `secondary_model` Core 能力，以及 Moon Code 能否通过现有官方 Web REST/WS 接口安全读取和写入该配置。

## 2. 验证方法

- 使用本机系统 CLI `kimi 0.29.2`。
- 使用项目托管依赖 `@moonshot-ai/kimi-code@0.29.2` 复验。
- 以 `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL=1` 启动隔离的 `kimi web --port 0 --no-open`。
- 读取 `/api/v1/meta`、`/api/v1/config`、`/api/v1/models`、`/openapi.json` 和 `/asyncapi.json`。
- 在独立的临时 `KIMI_CODE_HOME` 中测试 `/api/v1/config` 的 secondary merge，不触碰用户现有配置。
- 使用 `KIMI_SECONDARY_MODEL` 和 `KIMI_SECONDARY_EFFORT` 验证环境变量覆盖。

## 3. 结果

### 3.1 Core 能力存在

Kimi `0.29.2` 注册了以下能力：

- `secondaryModel` 配置域，对应 TOML `[secondary_model]`。
- `KIMI_SECONDARY_MODEL` 和 `KIMI_SECONDARY_EFFORT` 环境变量绑定。
- `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL` 实验开关。
- Agent/AgentSwarm 的 `model = "secondary" | "primary"` 选择语义。
- secondary 派生模型、effort 校验和 Session warning。

启用实验开关后，`GET /api/v1/config` 会返回：

```json
{
  "secondary_model": {}
}
```

设置环境变量后会返回有效覆盖值，例如：

```json
{
  "secondary_model": {
    "model": "example/model",
    "defaultEffort": "low"
  }
}
```

### 3.2 REST Config 写入尚未接通

Kimi `0.29.2` 的 Core config schema 接受 `secondaryModel`，但 kap-server 的 `patchConfigRequestSchema` 没有声明 `secondary_model`。因此：

- OpenAPI/AsyncAPI 没有 secondary 配置字段。
- `POST /api/v1/config` 接收包含 `secondary_model` 的请求时，字段会被请求 schema 静默移除。
- 请求返回成功，但再次 GET 仍是原值；客户端不能把 HTTP 200 当成保存成功。
- `{ "secondary_model": {} }` 和 `{ "secondary_model": null }` 同样不能通过当前 REST route 完成清除。

这是上游 Web API 覆盖缺口，不是 Moon Code Adapter 的字段映射问题。

## 4. 本迭代决策

1. Moon Code 托管依赖升级到 `@moonshot-ai/kimi-code@0.29.2`。
2. 最低支持版本调整为 `>=0.29.2`；未来版本不设硬上限，secondary 写入等能力通过公开契约动态探测。
3. Moon Code 自己启动的 managed/system `kimi web` 注入实验环境变量。
4. shared/external Runtime 的实验开关状态标记为未知，不自动重启。
5. Settings 读取并显示 effective secondary 配置、所有 Provider 的候选模型以及 Runtime 状态。
6. `0.29.2` 不通过缺失字段的 REST 请求伪造保存；Moon Code-owned Runtime 改用官方 secondary 环境变量实现模型与 effort 覆盖。
7. 不直接修改 `config.toml`，不 fork 或 patch Kimi Runtime，不建立第二套 Agent 配置事实源。
8. 后续 Kimi 版本把 `secondary_model` 加入 `/config` patch schema 后即可开放 typed 更新；REST 层仍不能把空对象当作删除。
9. Moon Code 的“禁用并恢复继承主模型”使用官方 `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL=0`，只改变 Moon Code 启动的进程行为，不声称删除 Kimi 持久配置。

后续实施已进一步把版本门禁改为最低版本 `>=0.29.2`，并加入 OpenAPI 动态探测。typed 更新链路和 Settings 表单已经就绪：REST 声明字段时使用 REST；在 Moon Code-owned `0.29.2` Runtime 中，模型和 effort 使用官方环境变量保存为下一次启动偏好。

## 5. 已落地验证

- 新的 `0.29.2` OpenAPI/AsyncAPI 契约快照已捕获。
- 契约捕获脚本已改为从已安装包动态读取版本，不再硬编码 `0.29.0`。
- Runtime 启动环境变量已有单元测试。
- Config schema、Settings Bridge、Runtime 环境覆盖和 Renderer 的 secondary 控制已有类型检查和定向测试。
- 本地偏好区分 `inherit / configured / disabled`，文件权限为 `0600`。
- 保存/禁用后会显示待重启状态；shared/external Runtime 不会被 Moon Code 自动重启或改写环境。
- `pnpm test:secondary-runtime` 使用临时 Kimi Home、临时 Workspace 和本地假 OpenAI 兼容端点运行真实 Kimi `0.29.2`：
  - `Agent` 默认子 Agent 请求使用 `secondary-upstream`；
  - `Agent` 传入 `model = "primary"` 后请求使用 `primary-upstream`；
  - `AgentSwarm` 的两个新 worker 均使用 `secondary-upstream`；
  - `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL=0` 后子 Agent 恢复 `primary-upstream`；
  - `KIMI_SECONDARY_EFFORT=high` 实际进入 secondary 请求；
  - 无效模型和 effort 分别产生 `secondary-model-invalid`、`secondary-model-effort-not-listed` Session warning。
  - 使用无效模型实际派生 Agent 时，工具错误保留 `[secondary_model].model / KIMI_SECONDARY_MODEL` 配置来源。
- 真实验收不读取用户配置、凭据或 Session，不访问真实计费模型。

## 6. 后续门禁

开放写入前必须同时满足：

- `POST /api/v1/config` 的公开请求 schema 声明 `secondary_model`。
- 写入后 GET 返回相同值。
- 如要在 Kimi 持久配置层提供“删除”，公开 API 仍需 section replace/delete：Core 的 `set()` 是深合并，`{ secondary_model: {} }` 不会删除已有字段，`null` 也不符合当前 schema。
- `event.config.changed` 能触发其他客户端权威重读。
- 真实 Agent/AgentSwarm 测试已证明 secondary/primary 选择和 warning 行为一致；该项作为后续 Kimi 升级的显式回归门禁保留。

## 7. 2026-07-27 官方实现复核

- 配置覆盖文档明确说明 `KIMI_SECONDARY_MODEL` / `KIMI_SECONDARY_EFFORT` 的空白值会被忽略，不能用空环境变量清除文件中的 `[secondary_model]`。
- npm `0.29.2` 的 FlagService 使用布尔环境变量解析器，明确把 `0` / `false` / `no` / `off` 解析为假值；因此 `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL=0` 会关闭 secondary 功能，而不是因为变量“存在”就被视为开启。
- 同一实现也表明 `KIMI_CODE_EXPERIMENTAL_FLAG=1`（master flag）的优先级高于 feature-specific flag。禁用模式必须停止继承父进程的 master flag，否则它会重新启用 secondary；这也意味着该 Moon Code-owned Runtime 中仅靠 master flag 开启的其他实验功能会同时停止，Kimi 配置中逐项开启的功能不受影响。
- 官方仓库当前主分支的 `rest-config.ts` 已将 `secondary_model` 加入 `patchConfigRequestSchema`；这说明“设置/更新”链路正在上游修复，但 npm `0.29.2` 尚未包含该 schema 变化。
- 官方主分支的 `/config` 路由仍调用 Core `IConfigService.set(domain, patch)`；Core 的 `set` 对 section 做深合并，只有 `replace` 才能删除整段。当前公开路由没有 replace/delete action。
- 结论：未来上游版本可以解决 REST 的“设置/更新”；Kimi 持久配置的“删除”仍需要官方新增 replace/delete 语义。但用户侧“在 Moon Code 中禁用 secondary 并恢复主模型继承”可由官方实验开关的假值语义解决，Moon Code 无需也不会绕过 API 直接改文件。
