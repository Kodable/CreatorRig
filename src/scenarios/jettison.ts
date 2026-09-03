import type Phaser from 'phaser';
import type { RigParams } from '../params';
import { readHeapMB, type FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

const DB = 'rig-jettison';
const STORE = 'envelope';

interface Envelope {
  phase: 'allocating' | 'done';
  startedAt: string;
  allocatedMB: number;
  heapMB: number | null;
  device: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readEnvelope(db: IDBDatabase): Promise<Envelope | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
    req.onsuccess = () => resolve(req.result as Envelope | undefined);
    req.onerror = () => reject(req.error);
  });
}

function writeEnvelope(db: IDBDatabase, e: Envelope | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = e ? store.put(e, 'current') : store.delete('current');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Jettison: how much memory the content process gets before iOS kills it, and whether the app
 * recovers. The scenario writes a recovery envelope to IndexedDB, then allocates typed arrays,
 * one chunk per frame, updating the envelope as it goes, until the process dies. The shell (or
 * Safari) reloads the view; the scenario then finds the envelope and reports recovered=true with
 * the last allocation as the content-process budget for that device.
 */
const jettison: Scenario = {
  id: 'jettison',
  defaultCount: 0,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const chunkMB = Number(params.extra['chunk'] ?? 32) || 32;
    const maxMB = Number(params.extra['maxMB'] ?? 3000) || 3000;
    const db = await openDb();
    const previous = await readEnvelope(db);
    const text = scene.add.text(40, 60, '', { fontSize: '24px', color: '#ffffff', fontFamily: 'ui-monospace, Menlo, monospace', lineSpacing: 8 });

    if (previous && previous.phase === 'allocating') {
      // Recovered after a kill: report and clear.
      await writeEnvelope(db, null);
      text.setText(`RECOVERED after a kill\nprevious run allocated ${previous.allocatedMB} MB\nheap at last write ${previous.heapMB ?? 'n/a'} MB\nstarted ${previous.startedAt}`);
      return {
        pass(_stats: FrameStats): boolean | null {
          return true;
        },
        extra(): Record<string, unknown> {
          return { recovered: true, killedAtMB: previous.allocatedMB, heapAtKillMB: previous.heapMB, previousStartedAt: previous.startedAt, chunkMB };
        },
        notes(): string[] {
          return [`the content process died after about ${previous.allocatedMB} MB of typed arrays; that is this device's budget`];
        },
      };
    }

    const envelope: Envelope = { phase: 'allocating', startedAt: new Date().toISOString(), allocatedMB: 0, heapMB: readHeapMB(), device: params.device };
    await writeEnvelope(db, envelope);
    const hoard: Uint8Array[] = [];
    let writing = false;
    let stopped = false;
    return {
      update(): void {
        if (stopped) return;
        if (envelope.allocatedMB >= maxMB) {
          stopped = true;
          text.setText(`survived ${envelope.allocatedMB} MB without a kill (cap ${maxMB} MB)`);
          return;
        }
        const chunk = new Uint8Array(chunkMB * 1048576);
        // Touch every page so the memory is really committed, not just reserved.
        for (let i = 0; i < chunk.length; i += 4096) chunk[i] = 1;
        hoard.push(chunk);
        envelope.allocatedMB += chunkMB;
        envelope.heapMB = readHeapMB();
        text.setText(`allocating: ${envelope.allocatedMB} MB in ${hoard.length} chunks\nheap ${envelope.heapMB ?? 'n/a'} MB\nwaiting for iOS to kill the content process...`);
        if (!writing) {
          writing = true;
          void writeEnvelope(db, envelope).finally(() => (writing = false));
        }
      },
      pass(_stats: FrameStats): boolean | null {
        // Still alive at the end of the window: no verdict; the kill (and the recovery) is the result.
        return null;
      },
      extra(): Record<string, unknown> {
        return { recovered: false, allocatedMB: envelope.allocatedMB, heapMB: envelope.heapMB, chunkMB, maxMB, survived: stopped };
      },
      notes(): string[] {
        return [stopped ? `no kill up to ${maxMB} MB; raise ?maxMB=` : `still allocating when the window ended (${envelope.allocatedMB} MB); raise ?duration= or wait for the kill and the reload`];
      },
    };
  },
};

export default jettison;
