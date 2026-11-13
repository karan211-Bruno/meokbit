import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.meokbit.ainote',
  appName: '먹빛',
  webDir: 'dist',
  backgroundColor: '#f4f3ee',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f4f3ee',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#f4f3ee',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 450,
      launchAutoHide: true,
      backgroundColor: '#f4f3ee',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f4f3ee',
    },
  },
};

export default config;
