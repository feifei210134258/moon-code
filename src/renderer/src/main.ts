import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import PetApp from './PetApp.vue'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

async function startRenderer(): Promise<void> {
  const petWindow = new URLSearchParams(window.location.search).has('pet-window')
  if (petWindow) document.documentElement.classList.add('pet-window')
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('settings-fixture')) {
    const { installSettingsApiFixture } = await import('./dev/settingsApiFixture')
    installSettingsApiFixture()
  }
  createApp(petWindow ? PetApp : App).use(createPinia()).mount('#app')
}

void startRenderer()
