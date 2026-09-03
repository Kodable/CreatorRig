import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

/**
 * PWA: reports how the page is running. Launched from the Home Screen icon it is standalone and
 * controlled by the service worker that caches the app shell. Pass is null in a browser tab.
 */
const pwa: Scenario = {
  id: 'pwa',
  defaultCount: 0,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    const swSupported = 'serviceWorker' in navigator;
    let swState = 'unsupported';
    let swControlled = false;
    let swScope = '';
    if (swSupported) {
      swControlled = navigator.serviceWorker.controller !== null;
      const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
      swState = reg ? (reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'registered') : 'none';
      swScope = reg?.scope ?? '';
    }
    let cacheEntries = 0;
    let cacheNames: string[] = [];
    try {
      cacheNames = await caches.keys();
      for (const name of cacheNames) cacheEntries += (await (await caches.open(name)).keys()).length;
    } catch {
      // No Cache API (insecure context).
    }
    const info = {
      standalone,
      launchedFromIcon: params.extra['source'] === 'pwa',
      displayMode: ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find((m) => window.matchMedia(`(display-mode: ${m})`).matches) ?? 'unknown',
      swSupported,
      swState,
      swControlled,
      swScope,
      cacheNames,
      cacheEntries,
      secureContext: window.isSecureContext,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${screen.width}x${screen.height}`,
      ua: navigator.userAgent,
    };
    scene.add.text(40, 60, Object.entries(info).filter(([k]) => k !== 'ua').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('\n'), { fontSize: '22px', color: '#ffffff', fontFamily: 'ui-monospace, Menlo, monospace', lineSpacing: 8 });
    return {
      pass(_stats: FrameStats): boolean | null {
        if (!standalone) return null;
        return swControlled;
      },
      extra(): Record<string, unknown> {
        return info;
      },
      notes(): string[] {
        if (!standalone) return ['running in a browser tab; on the iPad use Share > Add to Home Screen on the deployed URL, then open the icon and run this scenario'];
        return [];
      },
    };
  },
};

export default pwa;
