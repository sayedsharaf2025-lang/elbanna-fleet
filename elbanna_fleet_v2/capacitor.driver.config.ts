import type { CapacitorConfig } from '@capacitor/cli';

// إعداد تطبيق السائق (APK منفصل عن تطبيق الطلبات). بيتنسخ مكان capacitor.config.ts وقت البناء (شوف .github/workflows/build-driver-apk.yml)
const config: CapacitorConfig = {
  appId: 'com.elbanna.driver',
  appName: 'سائق البنا',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
