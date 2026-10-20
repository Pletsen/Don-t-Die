import type { CapacitorConfig } from '@capacitor/cli';

// The Capacitor settings for the DON'T DIE iPhone app. Not active yet: when
// the iOS build starts, copy this file to the repo root (store/ios-plan.md).
const config: CapacitorConfig = {
  // Decide before the first upload: it can never change after release (and
  // the web view's save lives under it).
  appId: 'dk.dontdie.game',
  appName: "DON'T DIE",
  webDir: 'dist',
  // The game's background, so no white flash between launch screen and game.
  backgroundColor: '#05070a',
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
    // Status bar hidden for the whole game (Capacitor 8's built-in SystemBars).
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
