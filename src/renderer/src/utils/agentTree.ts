import type { SessionAgentView } from '@shared/contracts'

/** 子 Agent 树：parentAgentId 能在 roster 中命中时归到对应父节点下形成层级，
 *  其余（parentAgentId 缺失、为 null 或指向主 Agent，如快照恢复的 task）作为顶层挂主 Agent 下。 */
export interface AgentTreeNode {
  agent: SessionAgentView
  children: AgentTreeNode[]
}

export interface AgentTreeRow {
  agent: SessionAgentView
  depth: number
}

function sortSiblings(nodes: AgentTreeNode[]): void {
  nodes.sort((left, right) =>
    (left.agent.swarmIndex ?? Number.MAX_SAFE_INTEGER) - (right.agent.swarmIndex ?? Number.MAX_SAFE_INTEGER)
  )
}

export function buildAgentTree(agents: SessionAgentView[]): AgentTreeNode[] {
  const subagents = agents.filter((agent) => agent.role === 'subagent')
  const nodes = new Map(subagents.map((agent) => [agent.id, { agent, children: [] } as AgentTreeNode]))
  const roots: AgentTreeNode[] = []
  for (const agent of subagents) {
    const node = nodes.get(agent.id)!
    const parentId = agent.parentAgentId !== null && agent.parentAgentId !== agent.id && nodes.has(agent.parentAgentId)
      ? agent.parentAgentId
      : null
    if (parentId === null) roots.push(node)
    else nodes.get(parentId)!.children.push(node)
  }
  sortSiblings(roots)
  for (const node of nodes.values()) sortSiblings(node.children)
  return roots
}

/** 前序遍历压平：父节点始终先于子节点渲染；visited 兜底防 parentAgentId 成环。 */
export function flattenAgentTree(agents: SessionAgentView[]): AgentTreeRow[] {
  const rows: AgentTreeRow[] = []
  const visited = new Set<string>()
  const walk = (nodes: AgentTreeNode[], depth: number): void => {
    for (const node of nodes) {
      const id = node.agent.id
      if (visited.has(id)) continue
      visited.add(id)
      rows.push({ agent: node.agent, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(buildAgentTree(agents), 0)
  return rows
}
