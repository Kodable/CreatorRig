import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { reportFileName } from '../src/report';

/** Longest report body accepted, in bytes. Reports are a few KB. */
const MAX_BODY = 1_000_000;
/** A hidden tab throttles requestAnimationFrame to about 1 Hz; such a run has almost no frames. */
export const MIN_FRAMES = 30;

export interface SaveResult {
  status: number;
  body: { saved?: string; error?: string };
}

/** Validates a posted report and returns the file name it should get. Pure, so it is testable. */
export function saveReport(raw: string, resultsDir: string, write: (path: string, data: string) => void = writeFileSync): SaveResult {
  let report: unknown;
  try {
    report = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: 'body is not JSON' } };
  }
  const r = report as Partial<{ rig: string; scenario: string; adapter: string; device: string; params: Record<string, string | number>; frames: number }>;
  if (r.rig !== 'kodable-creator-rig' || typeof r.scenario !== 'string' || typeof r.device !== 'string' || typeof r.params !== 'object' || r.params === null) {
    return { status: 400, body: { error: 'not a rig report' } };
  }
  if (typeof r.frames === 'number' && r.frames < MIN_FRAMES) {
    return { status: 422, body: { error: `only ${r.frames} frames: the tab was hidden during the run; not saved` } };
  }
  const name = reportFileName({ scenario: r.scenario, adapter: r.adapter ?? 'none', device: r.device, params: r.params });
  write(join(resultsDir, name), JSON.stringify(report, null, 2));
  return { status: 200, body: { saved: name } };
}

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

function collectorMiddleware(resultsDir: string): Middleware {
  return (req, res, next) => {
    if (req.url?.split('?')[0] !== '/report') return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS' || req.method === 'HEAD') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method === 'GET') {
      mkdirSync(resultsDir, { recursive: true });
      const files = readdirSync(resultsDir).filter((f) => f.endsWith('.json') && f !== 'playwright.json');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ results: files }, null, 2));
      return;
    }
    if (req.method !== 'POST') return next();
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
      if (raw.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      mkdirSync(resultsDir, { recursive: true });
      const result = saveReport(raw, resultsDir);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
      if (result.body.saved) console.log(`[rig] saved results/${result.body.saved}`);
    });
  };
}

/**
 * Vite plugin: the dev server and the preview server accept device reports at POST /report and
 * write them to results/. Devices open the rig from the Mac's LAN URL and tap "Send" (or run
 * with ?send=1). GET /report lists the saved files.
 */
export function reportCollector(resultsDir = join(process.cwd(), 'results')): Plugin {
  return {
    name: 'rig-report-collector',
    configureServer(server) {
      server.middlewares.use(collectorMiddleware(resultsDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(collectorMiddleware(resultsDir));
    },
  };
}
