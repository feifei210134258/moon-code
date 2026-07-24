import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  KimiMcpServer,
  KimiSkill,
  KimiSkillActivationResult,
  KimiTool
} from '../../shared/contracts.js'
import type {
  McpServer,
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

function boundedDescription(value: string): string {
  return value.length > MAX_CAPABILITY_DESCRIPTION
    ? `${value.slice(0, MAX_CAPABILITY_DESCRIPTION)}…`
    : value
}
