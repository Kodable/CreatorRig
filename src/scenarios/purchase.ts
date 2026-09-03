import type Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

/** One sandbox consumable on the rig's own App Store Connect record. */
export const PRODUCT_ID = 'com.surfscore.kodable.creatorrig.coin';

/**
 * Purchase: StoreKit 2 through @capgo/native-purchases inside the Capacitor shell. One tap buys
 * the sandbox consumable; the report carries the transaction id and whether a receipt (legacy
 * and JWS) came back. No backend: the receipt is only shown, not validated. Every handler is
 * attached before the plugin is awaited, so the first tap after a cold launch works.
 */
const purchase: Scenario = {
  id: 'purchase',
  defaultCount: 0,
  create(scene: Phaser.Scene, _params: RigParams): ScenarioHandle {
    const native = Capacitor.isNativePlatform();
    const lines: string[] = [];
    const text = scene.add.text(24, 24, '', { fontSize: '20px', color: '#ffffff', fontFamily: 'ui-monospace, Menlo, monospace', lineSpacing: 6, wordWrap: { width: 980 } });
    const log = (line: string): void => {
      lines.push(`${(performance.now() / 1000).toFixed(1)}s ${line}`);
      text.setText(lines.slice(-16).join('\n'));
    };
    const state = { native, billingSupported: null as boolean | null, productFound: false, priceString: '', taps: 0, transactionId: '', receiptBytes: 0, jwsBytes: 0, elapsedMs: 0, error: '' };

    const button = scene.add
      .text(512, 620, native ? `Buy the test coin (sandbox)` : 'Not inside the shell: purchase unavailable', { fontSize: '26px', color: '#1a2142', backgroundColor: '#ffb40f', padding: { x: 18, y: 12 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    let busy = false;
    // Handler first, plugin later: a tap during plugin setup is queued, never lost.
    button.on('pointerdown', () => {
      state.taps++;
      if (!native || busy) return;
      busy = true;
      const t0 = performance.now();
      void (async () => {
        try {
          const { NativePurchases } = await import('@capgo/native-purchases');
          const tx = await NativePurchases.purchaseProduct({ productIdentifier: PRODUCT_ID, quantity: 1 });
          state.transactionId = tx.transactionId;
          state.receiptBytes = tx.receipt?.length ?? 0;
          state.jwsBytes = (tx as { jwsRepresentation?: string }).jwsRepresentation?.length ?? 0;
          state.elapsedMs = Math.round(performance.now() - t0);
          log(`purchase complete: transaction ${tx.transactionId}, receipt ${state.receiptBytes} bytes, jws ${state.jwsBytes} bytes, ${state.elapsedMs} ms`);
          console.log('RIG_RECEIPT ' + JSON.stringify({ transactionId: tx.transactionId, receipt: tx.receipt ?? null }));
        } catch (err) {
          state.error = String(err);
          log(`purchase failed: ${state.error}`);
        } finally {
          busy = false;
        }
      })();
    });

    if (native) {
      void (async () => {
        try {
          const { NativePurchases } = await import('@capgo/native-purchases');
          const supported = await NativePurchases.isBillingSupported();
          state.billingSupported = supported.isBillingSupported;
          log(`billing supported: ${state.billingSupported}`);
          const products = await NativePurchases.getProducts({ productIdentifiers: [PRODUCT_ID] });
          const p = products.products.find((x) => x.identifier === PRODUCT_ID);
          state.productFound = p !== undefined;
          state.priceString = p?.priceString ?? '';
          log(p ? `product ${p.identifier} ${p.priceString}` : `product ${PRODUCT_ID} not found in App Store Connect / sandbox`);
        } catch (err) {
          state.error = String(err);
          log(`plugin setup failed: ${state.error}`);
        }
      })();
    } else {
      log('open this scenario inside the Capacitor shell on the iPad or iPhone with a sandbox tester signed in');
    }

    return {
      pass(_stats: FrameStats): boolean | null {
        if (!native || state.taps === 0) return null;
        return state.transactionId !== '';
      },
      extra(): Record<string, unknown> {
        return { productId: PRODUCT_ID, ...state, log: lines };
      },
      notes(): string[] {
        if (!native) return ['not inside the shell'];
        if (state.taps === 0) return ['no tap; tap the buy button with a sandbox tester signed in under Settings > App Store > Sandbox Account'];
        return state.error ? [state.error] : [];
      },
    };
  },
};

export default purchase;
