import { defineConfig } from 'eslint/config'
import security from 'eslint-plugin-security'
import baseConfig from './eslint.config.js'

export default defineConfig([
  ...baseConfig,
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx}'],
    extends: [security.configs.recommended],
  },
])
