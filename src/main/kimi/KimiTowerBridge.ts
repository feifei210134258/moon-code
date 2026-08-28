import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type { TowerPreferenceState } from '../../shared/contracts.js'
import type { TowerPreferencesStore } from '../runtime/TowerPreferencesStore.js'

/**
 * Tower 实验开关（KIMI_CODE_EXPERIMENTAL_TOWER）的偏好读写与生效状态。
 *
 * 与 Remote Control 不同：Tower 没有本机落盘状态（无 rc.json 等价物），
 * 生效与否完全由 owned Runtime 启动时注入的 env 决定，会话级 tower_mode
 * 经 KimiSessionBridge 的 profile 通道读写。
 */
export class KimiTowerBridge {
  constructor(
    private readonly runtime: KimiRuntimeManager,
    private readonly preferencesStore: Pick<TowerPreferencesStore, 'load' | 'save'>
  ) {}

  async getPreferenceState(): Promise<TowerPreferenceState> {
    const preference = await this.preferencesStore.load()
    const runtime = this.runtime.state
    const ownedRuntime = runtime.mode === 'managed' || runtime.mode === 'system'
    const appliedEnabled = this.runtime.appliedTowerEnabled
    return {
      preference,
      appliedEnabled,
      requiresRestart: ownedRuntime && appliedEnabled !== preference.enabled
    }
  }

  async setPreference(enabled: boolean): Promise<TowerPreferenceState> {
    await this.preferencesStore.save({ enabled })
    return await this.getPreferenceState()
  }
}
