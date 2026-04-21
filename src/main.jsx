import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

const isNativeApp = typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()
const isLocalDevHost = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const shouldDisablePwaRuntime = isNativeApp || import.meta.env.DEV || isLocalDevHost

async function prepareRuntime() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) {
    return
  }

  if (shouldDisablePwaRuntime) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    } catch (error) {
      console.warn('No se pudieron limpiar los service workers locales:', error)
    }

    if ('caches' in window) {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      } catch (error) {
          console.warn('No se pudieron limpiar las caches locales:', error)
      }
    }

    return
  }

  registerSW({ immediate: true })
}

prepareRuntime().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
