import type Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

/** One auto-renewable subscription on the rig's own App Store Connect record (sandbox: a month renews every 5 minutes). */
export const PRODUCT_ID = 'com.surfscore.kodable.creatorrig.monthly';

/**
 * Purchase: StoreKit 2 subscriptions through @capgo/native-purchases inside the Capacitor shell.
 * One tap subscribes with a sandbox tester; a second button reads the entitlement back
 * (getPurchases after restorePurchases), which is what the product does on every launch. The
 * report carries the transaction id, the subscription state, the expiration date and whether a
 * receipt (legacy and JWS) came back. No backend: nothing is validated. Every handler is attached
 * before the plugin is awaited, so the first tap after a cold launch works.
 */
const purchase: Scenario = {
  id: 'purchase',
  defaultCount: 0,
  create(scene: Phaser.Scene, _params: RigParams): ScenarioHandle {
    const native = Capacitor.isNativePlatform();
    const lines: string[] = [];
    const text = scene.add.text(24, 24, '', { fontSize: '19px', color: '#ffffff', fontFamily: 'ui-monospace, Menlo, monospace', lineSpacing: 6, wordWrap: { width: 980 } });
    const log = (line: string): void => {
      lines.push(`${(performance.now() / 1000).toFixed(1)}s ${line}`);
      text.setText(lines.slice(-18).join('\n'));
    };
    const state = {
      native,
      billingSupported: null as boolean | null,
      productFound: false,
      priceString: '',
      period: '',
      taps: 0,
      transactionId: '',
      subscriptionState: '',
      expirationDate: '',
      isActive: null as boolean | null,
      environment: '',
      receiptBytes: 0,
      jwsBytes: 0,
      purchaseMs: 0,
      restoreChecked: false,
      restoredActive: null as boolean | null,
      restoreMs: 0,
      error: '',
    };

    const buy = scene.add
      .text(340, 620, native ? 'Subscribe (sandbox, monthly)' : 'Not inside the shell', { fontSize: '24px', color: '#1a2142', backgroundColor: '#ffb40f', padding: { x: 18, y: 12 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const check = scene.add
      .text(700, 620, 'Restore and check entitlement', { fontSize: '24px', color: '#1a2142', backgroundColor: '#05aeed', padding: { x: 18, y: 12 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    let busy = false;
    // Handlers first, plugin later: a tap during plugin setup is queued, never lost.
    buy.on('pointerdown', () => {
      state.taps++;
      if (!native || busy) return;
      busy = true;
      const t0 = performance.now();
      void (async () => {
        try {
          const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
          const tx = await NativePurchases.purchaseProduct({ productIdentifier: PRODUCT_ID, productType: PURCHASE_TYPE.SUBS });
          state.transactionId = tx.transactionId;
          state.subscriptionState = tx.subscriptionState ?? '';
          state.expirationDate = tx.expirationDate ?? '';
          state.isActive = tx.isActive ?? null;
          state.environment = tx.environment ?? '';
          state.receiptBytes = tx.receipt?.length ?? 0;
          state.jwsBytes = tx.jwsRepresentation?.length ?? 0;
          state.purchaseMs = Math.round(performance.now() - t0);
          log(`subscribed: transaction ${tx.transactionId}, state ${state.subscriptionState}, active ${String(state.isActive)}, expires ${state.expirationDate}, env ${state.environment}, receipt ${state.receiptBytes} B, jws ${state.jwsBytes} B, ${state.purchaseMs} ms`);
          console.log('RIG_RECEIPT ' + JSON.stringify({ transactionId: tx.transactionId, jws: tx.jwsRepresentation ?? null, receipt: tx.receipt ?? null }));
        } catch (err) {
          state.error = String(err);
          log(`purchase failed: ${state.error}`);
        } finally {
          busy = false;
        }
      })();
    });

    check.on('pointerdown', () => {
      if (!native || busy) return;
      busy = true;
      const t0 = performance.now();
      void (async () => {
        try {
          const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
          await NativePurchases.restorePurchases();
          const owned = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
          const sub = owned.purchases.find((p) => p.productIdentifier === PRODUCT_ID);
          state.restoreChecked = true;
          state.restoredActive = sub ? (sub.isActive ?? sub.subscriptionState === 'subscribed') : false;
          state.restoreMs = Math.round(performance.now() - t0);
          if (sub) {
            state.subscriptionState = sub.subscriptionState ?? state.subscriptionState;
            state.expirationDate = sub.expirationDate ?? state.expirationDate;
          }
          log(sub ? `entitlement: ${sub.productIdentifier} state ${sub.subscriptionState} active ${String(sub.isActive)} expires ${sub.expirationDate} (${state.restoreMs} ms)` : `no subscription found for this tester (${state.restoreMs} ms)`);
        } catch (err) {
          state.error = String(err);
          log(`restore failed: ${state.error}`);
        } finally {
          busy = false;
        }
      })();
    });

    if (native) {
      void (async () => {
        try {
          const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases');
          const supported = await NativePurchases.isBillingSupported();
          state.billingSupported = supported.isBillingSupported;
          log(`billing supported: ${state.billingSupported}`);
          const products = await NativePurchases.getProducts({ productIdentifiers: [PRODUCT_ID], productType: PURCHASE_TYPE.SUBS });
          const p = products.products.find((x) => x.identifier === PRODUCT_ID);
          state.productFound = p !== undefined;
          state.priceString = p?.priceString ?? '';
          // StoreKit reports the unit as a number: 0 day, 1 week, 2 month, 3 year.
          const UNITS = ['day', 'week', 'month', 'year'];
          state.period = p ? `${p.subscriptionPeriod.numberOfUnits} ${UNITS[Number(p.subscriptionPeriod.unit)] ?? String(p.subscriptionPeriod.unit)}` : '';
          log(p ? `product ${p.identifier} ${p.priceString} per ${state.period}, group ${p.subscriptionGroupIdentifier}` : `product ${PRODUCT_ID} not found: create the subscription in App Store Connect and wait a few minutes`);
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
        return state.transactionId !== '' && (state.isActive === true || state.subscriptionState === 'subscribed');
      },
      extra(): Record<string, unknown> {
        return { productId: PRODUCT_ID, ...state, log: lines };
      },
      notes(): string[] {
        if (!native) return ['not inside the shell'];
        if (state.taps === 0) return ['no tap; tap Subscribe with a sandbox tester signed in under Settings > App Store > Sandbox Account'];
        const notes: string[] = [];
        if (state.error) notes.push(state.error);
        if (!state.restoreChecked) notes.push('also tap "Restore and check entitlement": that is the launch-time check the product needs');
        return notes;
      },
    };
  },
};

export default purchase;
