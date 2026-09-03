import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 8 shell for the rig (CW-01.9). The built `dist/` is bundled into the app; every
 * scenario runs inside WKWebView and reports device=capacitor-ipad or capacitor-iphone.
 * The bundle id is the rig's own, never the production Creator id.
 */
/**
 * Live development: `CAP_SERVER_URL=http://<mac-ip>:5173 npx cap sync ios` makes the shell load the
 * Mac's dev server instead of the bundled dist/, so web changes need no rebuild of the app and the
 * report collector is same-origin. Unset it and sync again for the bundled build.
 */
const serverUrl = process.env['CAP_SERVER_URL'];

const config: CapacitorConfig = {
  appId: 'com.surfscore.kodable.creatorrig',
  appName: 'Creator Rig',
  webDir: 'dist',
  ...(serverUrl ? { server: { url: serverUrl, cleartext: true } } : {}),
  ios: {
    // The canvas owns the whole screen; no safe-area inset from the web view.
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
    backgroundColor: '#192661',
  },
  plugins: {
    Keyboard: {
      // The web view never resizes for the keyboard; the text-input check shifts the field itself.
      resize: 'none',
      resizeOnFullScreen: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
