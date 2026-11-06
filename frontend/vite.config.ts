import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backendTarget = env.VITE_BACKEND_PROXY_TARGET
  if (mode === 'development' && !backendTarget) {
    throw new Error('Set VITE_BACKEND_PROXY_TARGET in frontend/.env for the local development proxy.')
  }

  return {
    plugins: [react()],
    ...(mode === 'development' && backendTarget
      ? { server: { proxy: { '/api': { target: backendTarget, changeOrigin: true } } } }
      : {}),
  }
})
