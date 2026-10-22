import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.siegeworks.app',
  appName: 'Siegeworks',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  ios: { contentInset: 'never' },
};

export default config;
