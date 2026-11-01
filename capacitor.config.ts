import type { CapacitorConfig } from '@capacitor/cli';

// The Capacitor settings for the DUCKWISE app (Android now, iOS later).
// `npm run android` builds the web game into dist/ and copies it into the
// Android project (android/); store/android-plan.md has the whole route.
const config: CapacitorConfig = {
  // The app's id on Google Play (and later the App Store). Decide before the
  // first upload: it can never change after that (and the save lives under it).
  appId: 'dk.vangr.duckwise',
  appName: 'DUCKWISE',
  webDir: 'dist',
  // The game's background, so no white flash between launch screen and game.
  backgroundColor: '#05070a',
  android: {
    backgroundColor: '#05070a',
    // Release builds can't be inspected from a desktop browser.
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
  },
  ios: {
    // Edge to edge: the game itself keeps clear of the notch, the Dynamic
    // Island and the home indicator (env(safe-area-inset-*), game/display.ts).
    contentInset: 'never',
    backgroundColor: '#05070a',
    scrollEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Status and navigation bars hidden for the whole game (Capacitor 8's
    // built-in SystemBars).
    SystemBars: { hidden: true, style: 'DARK', animation: 'NONE' },
    // Keep the launch artwork up while WebGL starts, then fade into the menu.
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#05070a',
      showSpinner: false,
    },
  },
};

export default config;
