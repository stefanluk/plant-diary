import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createWriteStream, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { HttpError, PlantService } from './service.js';
import { HaBridge } from './ha.js';
import { seedIfEmpty } from './seed.js';
import { toISODate } from './schedule.js';

const DATA_DIR = process.env.DATA_DIR ?? './data';
const PORT = Number(process.env.PORT ?? 8099);
const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, '..', 'public');
const PHOTO_DIR = join(DATA_DIR, 'photos');
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

export function buildApp(svc: PlantService, ha?: HaBridge) {
  const app = Fastify({ logger: true });
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

  app.post('/api/plants/:id/logs', async (req, reply) => {
    let body: Record<string, any>;
    if (req.isMultipart()) {
      body = {};
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const ext = extname(part.filename).toLowerCase();
          if (!PHOTO_EXT.has(ext)) throw new HttpError(400, 'Alleen afbeeldingen toegestaan');
          const name = `${randomUUID()}${ext}`;
          await pipeline(part.file, createWriteStream(join(PHOTO_DIR, name)));
          body.photo = name;
        } else body[part.fieldname] = part.value;
      }
      if (body.photo && !body.type) body.type = 'photo';
    } else body = req.body as any;
    return reply.code(201).send(refresh(svc.addLog(id(req), body)));
  });
  app.delete('/api/plants/:id/logs/:logId', async (req, reply) => {
    svc.deleteLog(id(req), Number((req.params as any).logId));
    return reply.code(204).send();
  });

  app.get('/api/species', async () => svc.listSpecies());
  app.post('/api/species', async (req, reply) => reply.code(201).send(svc.upsertSpecies(req.body as any)));
  app.patch('/api/species/:id', async (req) => refresh(svc.upsertSpecies(req.body as any, id(req))));
  app.get('/api/due', async () => svc.dueToday());
  return app;
}

async function main() {
  const db = openDb(join(DATA_DIR, 'plants.db'));
  const svc = new PlantService(db);
  if ((process.env.SEED ?? 'true') === 'true' && seedIfEmpty(db, svc)) console.log('Seeded starter plants');

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

  await buildApp(svc, ha).listen({ port: PORT, host: '0.0.0.0' });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
