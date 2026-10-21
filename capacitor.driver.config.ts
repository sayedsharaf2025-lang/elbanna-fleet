import type { CapacitorConfig } from '@capacitor/cli';

// إعداد تطبيق السائق (APK منفصل عن تطبيق الطلبات). بيتنسخ مكان capacitor.config.ts وقت البناء (شوف .github/workflows/build-driver-apk.yml)
const config: CapacitorConfig = {
  appId: 'com.elbanna.driver',
  appName: 'سائق البنا',
  webDir: 'dist',
  // أندرويد 15+: بيمنع المحتوى من الظهور تحت شريط الحالة وشريط التنقل
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'auto' },
};

export default config;
