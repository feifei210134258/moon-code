import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  KimiManagedMcpServer,
  KimiMcpAuthBeginResult,
  KimiMcpConfig,
  KimiMcpServer,
  KimiMcpServerInspection,
  KimiMcpServerTestResult,
  KimiSkill,
  KimiSkillActivationResult,
  KimiTool
} from '../../shared/contracts.js'
import type {
  McpAuthBeginResult,
  McpManagedServer,
  McpServer,
  McpServerConfig,
  McpServerInspection,
  SkillDescriptor,
  ToolDescriptor
} from '../../../packages/kimi-adapter/src/wire/schemas.js'

const MAX_CAPABILITY_DESCRIPTION = 4_000

export class KimiCapabilitiesBridge {
  constructor(private readonly runtime: KimiRuntimeManager) {}

  async listSessionSkills(sessionId: string): Promise<KimiSkill[]> {
    const skills = await this.runtime.createRestClient().listSessionSkills(sessionId)
    return skills.map(mapSkill)
  }

  async listWorkspaceSkills(workspaceId: string): Promise<KimiSkill[]> {
    const skills = await this.runtime.createRestClient().listWorkspaceSkills(workspaceId)
    return skills.map(mapSkill)
  }

  async activateSkill(
    sessionId: string,
    skillName: string,
    args?: string
  ): Promise<KimiSkillActivationResult> {
    const result = await this.runtime.createRestClient().activateSkill(sessionId, skillName, args)
    return { activated: result.activated, skillName: result.skill_name }
  }

  async listTools(sessionId?: string): Promise<KimiTool[]> {
    const tools = await this.runtime.createRestClient().listTools(sessionId)
    return tools.map(mapTool)
  }

  async listMcpServers(): Promise<KimiMcpServer[]> {
    const servers = await this.runtime.createRestClient().listMcpServers()
    return servers.map(mapMcpServer)
  }

  async restartMcpServer(serverId: string): Promise<{ restarting: true }> {
    return await this.runtime.createRestClient().restartMcpServer(serverId)
  }

  /* ---- kimi 0.39 MCP v2 管理面 ---- */

  async listManagedMcpServers(): Promise<KimiManagedMcpServer[]> {
    const servers = await this.runtime.createRestClient().listManagedMcpServers()
    return servers.map(mapManagedMcpServer)
  }

  async addManagedMcpServer(input: { name: string; config: KimiMcpConfig }): Promise<KimiManagedMcpServer[]> {
    const servers = await this.runtime.createRestClient().addManagedMcpServer({
      name: input.name,
      ...mapConfigInput(input.config)
    })
    return servers.map(mapManagedMcpServer)
  }

  async replaceManagedMcpServer(name: string, config: KimiMcpConfig): Promise<KimiManagedMcpServer[]> {
    const servers = await this.runtime.createRestClient().replaceManagedMcpServer(name, mapConfigInput(config))
    return servers.map(mapManagedMcpServer)
  }

  async deleteManagedMcpServer(name: string): Promise<KimiManagedMcpServer[]> {
    const servers = await this.runtime.createRestClient().deleteManagedMcpServer(name)
    return servers.map(mapManagedMcpServer)
  }

  async testMcpServer(input: { name?: string; config?: KimiMcpConfig }): Promise<KimiMcpServerTestResult> {
    return await this.runtime.createRestClient().testMcpServer({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.config === undefined ? {} : { server: mapConfigInput(input.config) })
    })
  }

  async inspectMcpServers(): Promise<KimiMcpServerInspection[]> {
    const inspections = await this.runtime.createRestClient().inspectMcpServers()
    return inspections.map(mapInspection)
  }

  async beginMcpAuth(name: string): Promise<KimiMcpAuthBeginResult> {
    return await this.runtime.createRestClient().beginMcpAuth({ source: 'global', name })
  }

  async completeMcpAuth(flowId: string): Promise<null> {
    return await this.runtime.createRestClient().completeMcpAuth({ flowId })
  }

  async cancelMcpAuth(flowId: string): Promise<null> {
    return await this.runtime.createRestClient().cancelMcpAuth(flowId)
  }

  async resetMcpAuth(name: string): Promise<null> {
    return await this.runtime.createRestClient().resetMcpAuth({ source: 'global', name })
  }
}

function mapSkill(skill: SkillDescriptor): KimiSkill {
  return {
    name: skill.name,
    description: boundedDescription(skill.description),
    source: skill.source,
    type: skill.type ?? null,
    userInvocableOnly: skill.disable_model_invocation === true
  }
}

function mapTool(tool: ToolDescriptor): KimiTool {
  return {
    name: tool.name,
    description: boundedDescription(tool.description),
    source: tool.source,
    mcpServerId: tool.mcp_server_id ?? null,
    active: tool.active !== false
  }
}

function mapMcpServer(server: McpServer): KimiMcpServer {
  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    status: server.status,
    lastError: server.last_error === undefined ? null : boundedDescription(server.last_error),
    toolCount: server.tool_count
  }
}

function mapManagedMcpServer(server: McpManagedServer): KimiManagedMcpServer {
  return {
    name: server.name,
    config: mapConfigOutput(server.config),
    source: server.source,
    origin: server.origin ?? server.source,
    mutable: server.mutable,
    plugin: server.plugin === undefined ? null : { id: server.plugin.id, name: server.plugin.name }
  }
}

function mapInspection(item: McpServerInspection): KimiMcpServerInspection {
  return {
    serverId: item.serverId,
    name: item.locator.source === 'global' ? item.locator.name : item.locator.serverName,
    origin: item.origin,
    runtimeName: item.runtimeName.length > 0 ? item.runtimeName : null,
    canonicalUrl: item.canonicalUrl ?? null,
    config: item.config === undefined ? null : mapConfigOutput(item.config),
    enabled: item.enabled ?? null,
    editable: item.editable ?? null,
    authStatus: item.authStatus ?? null,
    checkedAt: item.checkedAt ?? null,
    error: item.error ?? null
  }
}

/* wire 与共享契约的字段结构一致（snake→camel 的差异已在 REST schema 解析层
   完成），配置对象直接透传，避免逐字段复制引入漂移。 */
function mapConfigOutput(config: McpServerConfig): KimiMcpConfig {
  return config as unknown as KimiMcpConfig
}

function mapConfigInput(config: KimiMcpConfig): McpServerConfig {
  return config as unknown as McpServerConfig
}

function boundedDescription(value: string): string {
  return value.length > MAX_CAPABILITY_DESCRIPTION
    ? `${value.slice(0, MAX_CAPABILITY_DESCRIPTION)}…`
    : value
}
