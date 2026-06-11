import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'WebPulse',
    description: 'The heartbeat of your browsing — advanced web activity analytics',
    version: '0.1.0',
    permissions: ['tabs', 'activeTab', 'storage', 'idle', 'alarms', 'notifications', 'offscreen'],
    host_permissions: ['<all_urls>'],
    options_page: 'dashboard.html',
  },
});
