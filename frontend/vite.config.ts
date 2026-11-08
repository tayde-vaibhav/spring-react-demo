import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { developmentSecurityHeaders } from './security-headers.ts'

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backendTarget = env.VITE_BACKEND_PROXY_TARGET
  if (mode === 'development' && !backendTarget) {
    throw new Error('Set VITE_BACKEND_PROXY_TARGET in frontend/.env for the local development proxy.')
  }
  const headers = developmentSecurityHeaders({ mode, command, isPreview }, react.preambleCode)

  return {
    plugins: [react()],
    ...(mode === 'development' && backendTarget
      ? { server: { proxy: { '/api': { target: backendTarget, changeOrigin: true } }, ...(headers ? { headers } : {}) } }
      : {}),
  }
})
