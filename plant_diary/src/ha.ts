import mqtt, { type MqttClient } from 'mqtt';
import WebSocket from 'ws';
import { t } from './i18n.js';
import type { Row } from './db.js';
import type { PlantService } from './service.js';

const PREFIX = 'plant_diary';

export interface HaConfig {
  mqttUrl?: string;
  mqttUser?: string;
  mqttPassword?: string;
  notifyService?: string; // e.g. notify.mobile_app_pixel
  supervisorToken?: string;
  haUrl?: string; // REST base, e.g. http://supervisor/core/api
  haWsUrl?: string;
}

export class HaBridge {
  private mqtt?: MqttClient;
  private ws?: WebSocket;

  constructor(private cfg: HaConfig, private svc: PlantService, private log = console) {}

  start(): void {
    if (this.cfg.mqttUrl) {
      this.mqtt = mqtt.connect(this.cfg.mqttUrl, {
        username: this.cfg.mqttUser || undefined,
        password: this.cfg.mqttPassword || undefined,
      });
      this.mqtt.on('error', (e) => this.log.error('MQTT', e.message));
      this.mqtt.on('connect', () => {
        this.mqtt!.subscribe(`${PREFIX}/+/water/set`);
        this.publish();
      });
      this.mqtt.on('message', (topic) => {
        const m = topic.match(new RegExp(`^${PREFIX}/(\\d+)/water/set$`));
        if (m) this.markWatered(Number(m[1]));
      });
    }
    if (this.cfg.supervisorToken && this.cfg.haWsUrl && this.cfg.notifyService) this.connectWs();
  }

  stop(): void {
    this.mqtt?.end();
    this.ws?.close();
  }

  markWatered(plantId: number): void {
    try {
      this.svc.addLog(plantId, { type: 'water' });
      this.publish();
    } catch (e) {
      this.log.error('water failed', (e as Error).message);
    }
  }

  /** Remove a plant's entities from HA by clearing its retained discovery configs. */
  removePlant(plantId: number): void {
    if (!this.mqtt?.connected) return;
    const base = `${PREFIX}/${plantId}`;
    for (const t of [`homeassistant/sensor/${PREFIX}_${plantId}_next/config`, `homeassistant/button/${PREFIX}_${plantId}_water/config`, `${base}/state`])
      this.mqtt.publish(t, '', { retain: true });
    this.publish();
  }

  /** Publish MQTT discovery configs + state for every plant, plus a summary sensor. */
  publish(): void {
    if (!this.mqtt?.connected) return;
    const plants = this.svc.listPlants();
    const device = { identifiers: [PREFIX], name: 'Plant Diary' };
    const pub = (topic: string, payload: unknown, retain = true) =>
      this.mqtt!.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), { retain });

    for (const p of plants) {
      const base = `${PREFIX}/${p.id}`;
      pub(`homeassistant/sensor/${PREFIX}_${p.id}_next/config`, {
        name: t('{name} next watering', { name: p.name }),
        unique_id: `${PREFIX}_${p.id}_next`,
        state_topic: `${base}/state`,
        value_template: '{{ value_json.next_water }}',
        json_attributes_topic: `${base}/state`,
        device_class: 'date',
        device,
      });
      pub(`homeassistant/button/${PREFIX}_${p.id}_water/config`, {
        name: t('{name} watered', { name: p.name }),
        unique_id: `${PREFIX}_${p.id}_water`,
        command_topic: `${base}/water/set`,
        device,
      });
      pub(`${base}/state`, {
        next_water: p.next_water,
        days_overdue: p.days_overdue,
        last_watered: p.last_watered,
        room: p.room,
        toxic: !!p.toxic,
      });
    }
    const due = this.svc.dueToday();
    pub(`homeassistant/sensor/${PREFIX}_due/config`, {
      name: t('Plants needing water'),
      unique_id: `${PREFIX}_due`,
      state_topic: `${PREFIX}/due`,
      value_template: '{{ value_json.count }}',
      json_attributes_topic: `${PREFIX}/due`,
      icon: 'mdi:watering-can',
      device,
    });
    pub(`${PREFIX}/due`, { count: due.length, plants: due.map((p) => p.name) });
  }

  /** Sends one summary push per day listing the plants that need water. */
  async notifyDue(today: string): Promise<void> {
    if (!this.cfg.notifyService || !this.cfg.supervisorToken || !this.cfg.haUrl) return;
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(this.cfg.notifyService)) return this.log.error('Invalid notify_service');
    if (this.svc.getMeta('notified_on') === today) return;
    const due = this.svc.dueToday();
    if (!due.length) return;
    this.svc.setMeta('notified_on', today);
    const [domain, service] = this.cfg.notifyService.split('.');
    const names = due.map((p) => p.name);
    const shown = names.length > 8 ? [...names.slice(0, 8), t('and {n} more', { n: names.length - 8 })] : names;
    await fetch(`${this.cfg.haUrl}/services/${domain}/${service}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.supervisorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: due.length === 1 ? t('1 plant needs water') : t('{n} plants need water', { n: due.length }),
        message: shown.join(', '),
        data: { tag: `${PREFIX}_due` },
      }),
    }).catch((e) => this.log.error('notify failed', e.message));
  }

  private connectWs(): void {
    const ws = new WebSocket(this.cfg.haWsUrl!);
    this.ws = ws;
    ws.on('message', (raw) => {
      const msg: Row = JSON.parse(String(raw));
      if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: this.cfg.supervisorToken }));
      else if (msg.type === 'auth_ok')
        ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'mobile_app_notification_action' }));
      else if (msg.type === 'event') {
        const m = String(msg.event?.data?.action ?? '').match(/^PLANT_WATER_(\d+)$/);
        if (m) this.markWatered(Number(m[1]));
      }
    });
    ws.on('close', () => setTimeout(() => this.connectWs(), 10_000));
    ws.on('error', (e) => this.log.error('WS', e.message));
  }
}
