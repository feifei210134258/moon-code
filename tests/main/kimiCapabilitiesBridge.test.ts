import { describe, expect, it, vi } from 'vitest'
import { KimiCapabilitiesBridge } from '../../src/main/kimi/KimiCapabilitiesBridge.js'
import type { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

describe('KimiCapabilitiesBridge', () => {
  it('projects Skills, Tools and MCP state without creating a second catalog', async () => {
    const client = {
      listSessionSkills: vi.fn(async () => [{
        name: 'review', description: 'Review code', path: '/private/skill.md', source: 'project' as const,
        type: 'prompt', disable_model_invocation: true
      }]),
      listWorkspaceSkills: vi.fn(async () => [{
        name: 'release', description: 'Release notes', path: '/private/release.md', source: 'user' as const
      }]),
      activateSkill: vi.fn(async () => ({ activated: true as const, skill_name: 'review' })),
      listTools: vi.fn(async () => [{
        name: 'mcp__github__search', description: 'Search', input_schema: null,
        source: 'mcp' as const, mcp_server_id: 'github', active: true
      }]),
      listMcpServers: vi.fn(async () => [{
        id: 'github', name: 'github', transport: 'stdio' as const, status: 'connected' as const,
        tool_count: 1
      }]),
      restartMcpServer: vi.fn(async () => ({ restarting: true as const }))
    }
    const runtime = { createRestClient: () => client } as unknown as KimiRuntimeManager
    const bridge = new KimiCapabilitiesBridge(runtime)

    await expect(bridge.listSessionSkills('session-1')).resolves.toEqual([{
      name: 'review', description: 'Review code', source: 'project', type: 'prompt', userInvocableOnly: true
    }])
    expect(JSON.stringify(await bridge.listSessionSkills('session-1'))).not.toContain('/private/skill.md')
    await expect(bridge.listWorkspaceSkills('workspace-1')).resolves.toEqual([
      expect.objectContaining({ name: 'release', source: 'user' })
    ])
    await expect(bridge.activateSkill('session-1', 'review', '--fix')).resolves.toEqual({
      activated: true, skillName: 'review'
    })
    expect(client.activateSkill).toHaveBeenCalledWith('session-1', 'review', '--fix')
    await expect(bridge.listTools('session-1')).resolves.toEqual([
      expect.objectContaining({ name: 'mcp__github__search', mcpServerId: 'github', active: true })
    ])
    await expect(bridge.listMcpServers()).resolves.toEqual([
      expect.objectContaining({ id: 'github', toolCount: 1, lastError: null })
    ])
    await expect(bridge.restartMcpServer('github')).resolves.toEqual({ restarting: true })
  })
})
