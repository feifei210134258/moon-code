import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import PetApp from './PetApp.vue'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

async function startRenderer(): Promise<void> {
  const petWindow = new URLSearchParams(window.location.search).has('pet-window')
  if (petWindow) document.documentElement.classList.add('pet-window')
  // Windows 用原生 titleBarOverlay 提供窗口控制按钮，顶栏需按平台调整留白
  // （macOS 左侧红绿灯 92px 由 .topbar 默认 padding 承担，Windows 改为右侧让位）。
  if (!petWindow && navigator.userAgent.includes('Windows')) {
    document.documentElement.classList.add('platform-win')
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('settings-fixture')) {
    const { installSettingsApiFixture } = await import('./dev/settingsApiFixture')
    installSettingsApiFixture()
  }
  createApp(petWindow ? PetApp : App).use(createPinia()).mount('#app')
}

void startRenderer()
