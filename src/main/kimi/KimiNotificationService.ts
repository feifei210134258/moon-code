import type { KimiUsagePreferences, KimiPlanUsageWindow } from '../../shared/contracts.js'
import type { TurnCompletionNotice } from './KimiUsageService.js'

export interface DesktopNotificationAdapter {
  isSupported(): boolean
  show(input: { title: string; body: string }): void
  beep(): void
}

export class KimiNotificationService {
  constructor(private readonly adapter: DesktopNotificationAdapter) {}

  notifyUsageThreshold(input: { window: KimiPlanUsageWindow; threshold: number }, preferences: KimiUsagePreferences): void {
    const percent = Math.round(input.threshold * 100)
    const used = Math.round((input.window.ratio ?? input.threshold) * 100)
    const isEnglish = preferences.locale === 'en-US'
    this.#show(
      isEnglish ? `Kimi plan usage reached ${percent}%` : `Kimi 套餐用量已达 ${percent}%`,
      isEnglish
        ? `${input.window.label} is ${used}% used${input.window.resetHint === null ? '' : ` · ${input.window.resetHint}`}`
        : `${input.window.label}已使用 ${used}%${input.window.resetHint === null ? '' : ` · ${input.window.resetHint}`}`,
      preferences
    )
  }

  notifyTurnCompletion(notice: TurnCompletionNotice, preferences: KimiUsagePreferences): void {
    const isEnglish = preferences.locale === 'en-US'
    this.#show(
      isEnglish
        ? (notice.failed ? `Kimi task needs attention: ${notice.title}` : `Kimi task completed: ${notice.title}`)
        : (notice.failed ? `Kimi 任务需要处理：${notice.title}` : `Kimi 任务已完成：${notice.title}`),
      isEnglish
        ? (notice.failed ? 'The turn ended with an error. Open the task for details.' : 'The latest turn has finished.')
        : (notice.failed ? '本轮以错误结束，请打开任务查看详情。' : '最新一轮已完成。'),
      preferences
    )
  }

  #show(title: string, body: string, preferences: KimiUsagePreferences): void {
    if (!this.adapter.isSupported()) return
    if (preferences.notificationSound !== false) this.adapter.beep()
    this.adapter.show({ title, body })
  }
}
