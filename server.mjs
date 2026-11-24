import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { capture } from './capture.mjs';

const { APP_PASSWORD, TWILIO_AUTH_TOKEN, SMS_FROM, GOOGLE_VOICE_SECRET, PUBLIC_URL, PORT = '3000', DATA_DIR = './data' } = process.env;
const webhook = PUBLIC_URL ? new URL('/sms', PUBLIC_URL).href : '';
if (PUBLIC_URL && (!APP_PASSWORD || !webhook.startsWith('https://'))) {
  throw new Error('Set APP_PASSWORD and an HTTPS PUBLIC_URL for hosting.');
}
if (GOOGLE_VOICE_SECRET && GOOGLE_VOICE_SECRET.length < 32) {
  throw new Error('GOOGLE_VOICE_SECRET must contain at least 32 characters.');
}
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DATA_DIR + '/brain-dump.sqlite');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS received (id TEXT PRIMARY KEY);');
const insert = db.prepare('INSERT INTO cards VALUES (?, ?, ?)');
const digest = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));
const staticFiles = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css']
};

function saveIncoming(id, text) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('INSERT OR IGNORE INTO received VALUES (?)').run(id).changes) {
      const card = capture(text);
      insert.run(randomUUID(), JSON.stringify(card), card.created);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new RangeError('Capture is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.url === '/sms' && req.method === 'POST') {
      if (!(webhook && SMS_FROM && TWILIO_AUTH_TOKEN)) return send(503, { error: 'SMS is not configured' });
      const fields = new URLSearchParams(await bodyOf(req));
      const signed = webhook + [...new Set(fields.keys())].sort().map(key =>
        [...new Set(fields.getAll(key))].sort().map(value => key + value).join('')).join('');
      const signature = createHmac('sha1', TWILIO_AUTH_TOKEN).update(signed).digest('base64');
      if (!equal(signature, req.headers['x-twilio-signature'] || '') || fields.get('From') !== SMS_FROM) {
        return send(403, { error: 'Sender or signature rejected' });
      }
      const sid = fields.get('MessageSid');
      const text = fields.get('Body')?.trim();
      if (!sid || !text) return send(400, { error: 'A message ID and text are required' });
      saveIncoming(sid, text);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end('<Response/>');
    }
    if (req.url === '/google-voice' && req.method === 'POST') {
      if (!GOOGLE_VOICE_SECRET || !webhook) return send(503, { error: 'Google Voice import is not configured' });
      if (!equal(req.headers.authorization || '', 'Bearer ' + GOOGLE_VOICE_SECRET)) {
        return send(403, { error: 'Import authorization failed' });
      }
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
        return send(415, { error: 'JSON required' });
      }
      const { id, text } = JSON.parse(await bodyOf(req));
      if (typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(id) ||
          typeof text !== 'string' || !text.trim() || text.length > 16000) {
        return send(400, { error: 'Invalid message ID or text' });
      }
      saveIncoming('gmail:' + id, text.trim());
      return send(200, { ok: true });
    }
    if (APP_PASSWORD && !equal(req.headers.authorization || '', 'Basic ' + Buffer.from('brain:' + APP_PASSWORD).toString('base64'))) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Brain Dump", charset="UTF-8"');
      return send(401, { error: 'Sign in with username brain' });
    }
    const file = Object.hasOwn(staticFiles, req.url) && staticFiles[req.url];
    if (file && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' });
      return res.end(readFileSync(new URL('./' + file[0], import.meta.url)));
    }
    if (req.url === '/api/cards' && req.method === 'GET') {
      const cards = db.prepare('SELECT * FROM cards ORDER BY created DESC, rowid DESC').all();
      return send(200, cards.map(row => ({ ...JSON.parse(row.payload), id: row.id })));
    }
    if (req.url?.startsWith('/api/') && req.method === 'POST' && req.headers['content-type'] !== 'application/json') {
      return send(415, { error: 'JSON required' });
    }
    if (req.url === '/api/cards' && req.method === 'POST') {
      const { text, title, type } = JSON.parse(await bodyOf(req));
      if (typeof text !== 'string' || !text.trim() || text.length > 20000) return send(400, { error: 'Enter 1–20,000 characters.' });
      const card = capture(text.trim(), typeof title === 'string' ? title : '', type);
      const id = randomUUID();
      insert.run(id, JSON.stringify(card), card.created);
      return send(201, { ...card, id });
    }
    const match = req.url?.match(/^\/api\/cards\/([a-f0-9-]+)\/items\/(\d+)$/);
    if (match && req.method === 'POST') {
      const { done } = JSON.parse(await bodyOf(req));
      const [, id, index] = match;
      const row = db.prepare('SELECT payload FROM cards WHERE id=?').get(id);
      const card = row && JSON.parse(row.payload);
      if (!card?.items[index] || typeof done !== 'boolean') return send(400, { error: 'Invalid checklist update' });
      card.items[index].done = done;
      db.prepare('UPDATE cards SET payload=? WHERE id=?').run(JSON.stringify(card), id);
      return send(200, { ...card, id });
    }
    return send(404, { error: 'Page not found' });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return send(400, { error: 'Invalid request' });
    console.error(error.code || error.name);
    return send(500, { error: 'Something went wrong. Try again.' });
  }
}).listen(Number(PORT), PUBLIC_URL ? '0.0.0.0' : '127.0.0.1', () => console.log('Brain Dump listening on port ' + PORT));
