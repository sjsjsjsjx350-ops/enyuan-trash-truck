import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client, middleware } from '@line/bot-sdk';

const app = express();
const port = Number(process.env.PORT || 4173);
const subscribersFile = path.resolve('subscribers.json');
const API = 'https://customer-tw.eupfin.com/Eup_Servlet_Nuser_SOAP/Eup_Servlet_Nuser_SOAP';
const CUST_ID = 5037937;
const TEAM_ID = 5036344;
const GISX = 120.603795;
const GISY = 24.008176;
const RANGE = 300;

const channelConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};
const lineClient = channelConfig.channelAccessToken ? new Client(channelConfig) : null;

async function readSubscribers() {
  try {
    return JSON.parse(await fs.readFile(subscribersFile, 'utf8'));
  } catch {
    return [];
  }
}

async function writeSubscribers(ids) {
  await fs.writeFile(subscribersFile, JSON.stringify([...new Set(ids)], null, 2));
}

function verifyLineSignature(rawBody, signature) {
  if (!channelConfig.channelSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', channelConfig.channelSecret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

app.post('/line/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!verifyLineSignature(req.body, req.headers['x-line-signature'])) {
    res.status(401).send('Invalid signature');
    return;
  }

  const body = JSON.parse(req.body.toString());
  const ids = await readSubscribers();

  for (const event of body.events || []) {
    if (event.type === 'follow' && event.source?.userId) {
      ids.push(event.source.userId);
    }
    if (event.type === 'unfollow' && event.source?.userId) {
      const index = ids.indexOf(event.source.userId);
      if (index >= 0) ids.splice(index, 1);
    }
  }

  await writeSubscribers(ids);
  res.status(200).json({ ok: true });
});

app.use(express.json());
app.get('/health', (req, res) => res.status(200).json({ ok: true }));
app.use(express.static('.'));

async function postParam(methodName, extra = {}) {
  const body = new URLSearchParams({ Param: JSON.stringify({ MethodName: methodName, ...extra }) });
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const radians = value => value * Math.PI / 180;
  const earthRadius = 6371000;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.get('/api/status', async (req, res) => {
  try {
    const [carsData, pointsData] = await Promise.all([
      postParam('GetCarStatusGarbage', { Cust_ID: CUST_ID, Team_ID: TEAM_ID }),
      postParam('GetRecommandPoint', { Cust_ID: String(CUST_ID), Time: 0, RemovalType: 0, GISX, GISY, Range: RANGE })
    ]);

    const cars = (Array.isArray(carsData.result) ? carsData.result : []).map(car => ({
      ...car,
      distance: haversineMeters(GISY, GISX, Number(car.Log_GISY), Number(car.Log_GISX))
    })).filter(car => Number.isFinite(car.distance)).sort((a, b) => a.distance - b.distance);

    res.json({
      address: '彰化縣芬園鄉進芬村大彰路四段578巷6號',
      range: RANGE,
      updatedAt: new Date().toISOString(),
      nearby: cars.filter(car => car.distance <= RANGE).slice(0, 8),
      nearest: cars[0] || null,
      points: Array.isArray(pointsData.result) ? pointsData.result.slice(0, 8) : []
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

let lastSignature = '';

async function checkAndNotify() {
  if (!lineClient) return;
  try {
    const data = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
    const nearest = data.nearby?.[0];
    if (!nearest) {
      lastSignature = '';
      return;
    }

    const signature = `${nearest.Car_Unicode}-${nearest.Log_DTime}`;
    if (signature === lastSignature) return;
    lastSignature = signature;

    const ids = await readSubscribers();
    for (const userId of ids) {
      await lineClient.pushMessage(userId, {
        type: 'text',
        text: `垃圾車已接近指定地點\n地址：彰化縣芬園鄉進芬村大彰路四段578巷6號\n車輛：${nearest.Car_Number || nearest.Car_Style}\n距離：約 ${Math.round(nearest.distance)} 公尺\n回報：${nearest.Log_DTime}`
      });
    }
  } catch (error) {
    console.error('LINE notify check failed:', error.message);
  }
}

app.listen(port, '0.0.0.0', () => {
  console.log(`PWA running at http://localhost:${port}`);
  console.log(`LINE webhook: http://localhost:${port}/line/webhook`);
  setInterval(checkAndNotify, 30000);
});
