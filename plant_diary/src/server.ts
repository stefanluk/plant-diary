import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createWriteStream, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { HttpError, PlantService } from './service.js';
import { HaBridge } from './ha.js';
import { NameSearch } from './names.js';
import { toISODate } from './schedule.js';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const PORT = Number(process.env.PORT ?? 8099);
const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, '..', 'public');
const PHOTO_DIR = join(DATA_DIR, 'photos');
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
// The Supervisor proxies ingress traffic from this address.
const INGRESS_IP = '172.30.32.2';

/** Checks the file signature so a renamed non-image is rejected. */
export function isImage(head: Buffer): boolean {
  const ascii = (a: number, b: number) => head.subarray(a, b).toString('latin1');
  return (
    (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
    ascii(0, 8) === '\x89PNG\r\n\x1a\n' ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
    ascii(4, 8) === 'ftyp'
  );
}

async function readHead(stream: NodeJS.ReadableStream, n: number): Promise<{ head: Buffer; rest: AsyncIterable<Buffer> }> {
  const it = (stream as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let len = 0;
  while (len < n) {
    const r = await it.next();
    if (r.done) break;
    chunks.push(r.value);
    len += r.value.length;
  }
  const head = Buffer.concat(chunks);
  async function* rest() {
    yield head;
    for (let r = await it.next(); !r.done; r = await it.next()) yield r.value;
  }
  return { head: head.subarray(0, n), rest: rest() };
}

/** Stores an uploaded image after checking its extension and file signature; returns the stored file name. */
async function savePhoto(file: NodeJS.ReadableStream, filename: string): Promise<string> {
  const ext = extname(filename).toLowerCase();
  if (!PHOTO_EXT.has(ext)) throw new HttpError(400, 'Alleen afbeeldingen toegestaan');
  const { head, rest } = await readHead(file, 12);
  if (!isImage(head)) {
    file.resume();
    throw new HttpError(400, 'Alleen afbeeldingen toegestaan');
  }
  const name = `${randomUUID()}${ext}`;
  await pipeline(rest, createWriteStream(join(PHOTO_DIR, name)));
  return name;
}

export function buildApp(svc: PlantService, ha?: HaBridge, ingressOnly = false, names = new NameSearch()) {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
  app.addHook('onRequest', async (req, reply) => {
    if (!ingressOnly) return;
    const ip = req.ip.replace(/^::ffff:/, '');
    if (ip !== INGRESS_IP && ip !== '127.0.0.1' && ip !== '::1') return reply.code(403).send({ error: 'Alleen via Home Assistant' });
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
    );
  });
  mkdirSync(PHOTO_DIR, { recursive: true });
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
  app.register(fastifyStatic, { root: PUBLIC_DIR });
  app.register(fastifyStatic, { root: resolve(PHOTO_DIR), prefix: '/photos/', decorateReply: false });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    reply.send(err);
  });

  const refresh = <T>(v: T) => (ha?.publish(), v);
  const id = (req: any) => Number(req.params.id);

  app.get('/api/plants', async () => svc.listPlants());
  app.post('/api/plants', async (req, reply) => reply.code(201).send(refresh(svc.createPlant(req.body as any))));
  app.get('/api/plants/:id', async (req) => svc.getPlant(id(req)));
  app.patch('/api/plants/:id', async (req) => refresh(svc.updatePlant(id(req), req.body as any)));

  app.delete('/api/plants/:id', async (req, reply) => {
    svc.deletePlant(id(req));
    ha?.removePlant(id(req));
    return reply.code(204).send();
  });

  app.post('/api/plants/:id/logs', async (req, reply) => {
    let body: Record<string, any>;
    if (req.isMultipart()) {
      body = {};
      for await (const part of req.parts()) {
        if (part.type === 'file') body.photo = await savePhoto(part.file, part.filename);
        else body[part.fieldname] = part.value;
      }
      if (body.photo && !body.type) body.type = 'photo';
    } else body = req.body as any;
    return reply.code(201).send(refresh(svc.addLog(id(req), body)));
  });
  app.patch('/api/plants/:id/logs/:logId', async (req) =>
    refresh(svc.updateLog(id(req), Number((req.params as any).logId), req.body as any)));
  app.delete('/api/plants/:id/logs/:logId', async (req, reply) => {
    svc.deleteLog(id(req), Number((req.params as any).logId));
    return reply.code(204).send();
  });

  app.get('/api/species', async () => svc.listSpecies());
  app.get('/api/names/suggest', async (req) => {
    const q = String((req.query as any).q ?? '');
    const local = svc.searchSpecies(q);
    let hits: any[] = [];
    let offline = false;
    try {
      const have = new Set(local.map((l) => String(l.latin_name ?? '').toLowerCase()));
      hits = (await names.suggest(q)).filter((h) => !have.has(h.latin_name.toLowerCase()));
    } catch {
      offline = true;
    }
    return { local, online: hits, offline };
  });
  app.post('/api/species/resolve', async (req, reply) => {
    const out = svc.resolveSpecies((req.body ?? {}) as any);
    return reply.code(out.created ? 201 : 200).send(out);
  });
  app.post('/api/species', async (req, reply) => reply.code(201).send(svc.upsertSpecies(req.body as any)));
  app.patch('/api/species/:id', async (req) => refresh(svc.upsertSpecies(req.body as any, id(req))));
  app.post('/api/reset', async (_req, reply) => {
    const ids = svc.listPlants().map((p) => p.id);
    svc.resetAll();
    for (const f of readdirSync(PHOTO_DIR)) rmSync(join(PHOTO_DIR, f), { force: true });
    for (const pid of ids) ha?.removePlant(pid);
    return reply.code(204).send();
  });
  app.get('/api/due', async () => svc.dueToday());
  return app;
}

async function main() {
  const db = openDb(join(DATA_DIR, 'plants.db'));
  const svc = new PlantService(db);

  const sup = process.env.SUPERVISOR_TOKEN;
  const ha = new HaBridge(
    {
      mqttUrl: process.env.MQTT_URL,
      mqttUser: process.env.MQTT_USER,
      mqttPassword: process.env.MQTT_PASSWORD,
      notifyService: process.env.NOTIFY_SERVICE,
      supervisorToken: sup,
      haUrl: sup ? 'http://supervisor/core/api' : process.env.HA_URL,
      haWsUrl: sup ? 'ws://supervisor/core/websocket' : undefined,
    },
    svc,
  );
  ha.start();

  const hour = Number(process.env.NOTIFY_HOUR ?? 9);
  setInterval(() => {
    const now = new Date();
    ha.publish();
    if (now.getHours() >= hour) void ha.notifyDue(toISODate(now));
  }, 15 * 60_000);

  await buildApp(svc, ha, process.env.INGRESS_ONLY === 'true').listen({ port: PORT, host: '0.0.0.0' });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
