// manifest.config.js
import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Prompto',
  description: 'Refine rough LLM prompts through clarifying questions and generated prompt variations.',
  version: pkg.version,
  icons: { 48: 'public/logo.png', 128: 'public/logo.png' },

  permissions: ['sidePanel', 'storage', 'tabs'],

  background: {
    service_worker: 'src/background/index.js',
    type: 'module',
  },

  host_permissions: [
    '<all_urls>'
  ],

  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/autoOpen.js'],
      run_at: 'document_idle',
    },
  ],

  action: {
    default_icon: { 48: 'public/logo.png' },
    default_title: 'Prompto',
    default_popup: 'src/popup/index.html',
  },

  side_panel: { default_path: 'src/sidepanel/index.html' },

  options_ui: { page: 'src/options/index.html', open_in_tab: false },
})
