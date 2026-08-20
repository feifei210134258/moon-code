// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SessionManagerPanel from '../../src/renderer/src/components/SessionManagerPanel.vue'
import type {
  KimiAgentDesktopApi,
  KimiSessionManagerItem,
  KimiSessionManagerListInput
} from '../../src/shared/contracts.js'

const now = Date.now()

function item(overrides: Partial<KimiSessionManagerItem>): KimiSessionManagerItem {
  return {
    id: 'session-a',
    workspaceId: 'workspace-a',
    workspaceName: 'Kimi Agent',
    title: '实现 Session 生命周期',
    lastPrompt: '首个 prompt',
    status: 'running',
    createdAt: now - 10 * 60 * 1_000,
    updatedAt: now - 2 * 60 * 1_000,
    archived: false,
    archivedAt: null,
    ...overrides
  }
}

const items: KimiSessionManagerItem[] = [
  item({}),
  item({
    id: 'session-b',
    workspaceId: 'workspace-b',
    workspaceName: 'Website',
    title: 'Landing Page',
    status: 'idle',
    archived: true,
    archivedAt: now - 60 * 1_000
  })
]

function installApi(overrides: Record<string, unknown> = {}) {
  const getBootstrapState = vi.fn(async () => ({
    appVersion: '0.1.0',
    platform: 'darwin',
    runtime: {
      status: 'running' as const,
      mode: 'managed' as const,
      version: '0.37.2',
      serverId: 'server-1',
      origin: 'http://127.0.0.1:1234',
      error: null
    },
    discovery: null
  }))
  const listSessionManagerPage = vi.fn(async (_input: KimiSessionManagerListInput) => ({ items, total: 2, hasMore: false }))
  const archiveSessions = vi.fn(async (_ids: string[]) => ({
    results: [{ id: 'session-a', ok: true, error: null }],
    succeeded: 1,
    failed: 0
  }))
  const restoreSessions = vi.fn(async (_ids: string[]) => ({
    results: [{ id: 'session-b', ok: true, error: null }],
    succeeded: 1,
    failed: 0
  }))
  const getWorkspaceTreePage = vi.fn(async () => ({
    workspaces: [{ id: 'workspace-a', name: 'Kimi Agent', root: '/a', sessions: [] }],
    hasMoreSessions: false,
    nextBeforeId: null
  }))
  const api = {
    getBootstrapState,
    onRuntimeStateChanged: vi.fn(() => () => {}),
    onSessionStateChanged: vi.fn(() => () => {}),
    onKimiGlobalStateChanged: vi.fn(() => () => {}),
    getWorkspaceTreePage,
    listSessionManagerPage,
    archiveSessions,
    restoreSessions,
    ...overrides
  } as unknown as KimiAgentDesktopApi
  window.kimiAgent = api
  return { api, getBootstrapState, listSessionManagerPage, archiveSessions, restoreSessions, getWorkspaceTreePage }
}

function mountPanel() {
  return mount(SessionManagerPanel, {
    attachTo: document.body,
    props: { }
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  delete window.kimiAgent
})

describe('SessionManagerPanel', () => {
  it('renders sessions across workspaces with status chips and archive badges', async () => {
    installApi()
    const wrapper = mountPanel()
    await flushPromises()
    const rows = wrapper.findAll('.session-manager-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('实现 Session 生命周期')
    expect(rows[0]!.text()).toContain('Kimi Agent')
    expect(rows[0]!.find('.session-manager-status.is-running').exists()).toBe(true)
    expect(rows[1]!.find('.session-manager-status.is-idle').exists()).toBe(true)
    expect(rows[1]!.find('.session-manager-archived').exists()).toBe(true)
    wrapper.unmount()
  })

  it('re-fetches when a filter changes, passing the workspace and time window upstream', async () => {
    const api = installApi()
    const wrapper = mountPanel()
    await flushPromises()
    const selects = wrapper.findAll('.session-manager-filter select')
    await selects[0]!.setValue('workspace-b')
    await flushPromises()
    expect(api.listSessionManagerPage).toHaveBeenLastCalledWith(expect.objectContaining({
      workspaceId: 'workspace-b'
    }))
    wrapper.unmount()
  })

  it('batch-archives selected active sessions and refreshes the workspace tree', async () => {
    const api = installApi()
    const wrapper = mountPanel()
    await flushPromises()
    const activeCheckbox = wrapper.findAll('.session-manager-row input')[0]!
    await activeCheckbox.trigger('change')
    await nextTick()
    expect(wrapper.get('.session-manager-actions .is-danger-action').attributes('disabled')).toBeUndefined()
    await wrapper.get('.session-manager-actions .is-danger-action').trigger('click')
    await flushPromises()
    expect(api.archiveSessions).toHaveBeenCalledWith(['session-a'])
    // After a successful batch, main-side tree refresh is triggered and the list reloads.
    expect(api.getWorkspaceTreePage).toHaveBeenCalled()
    expect(api.listSessionManagerPage.mock.calls.length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })

  it('batch-restores selected archived sessions', async () => {
    const api = installApi()
    const wrapper = mountPanel()
    await flushPromises()
    const archivedCheckbox = wrapper.findAll('.session-manager-row input')[1]!
    await archivedCheckbox.trigger('change')
    await nextTick()
    await wrapper.get('.session-manager-actions .secondary-button').trigger('click')
    await flushPromises()
    expect(api.restoreSessions).toHaveBeenCalledWith(['session-b'])
    wrapper.unmount()
  })
})
