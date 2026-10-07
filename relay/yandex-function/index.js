/* Приём заявок с сайта power-car.ru → Telegram и MAX.
   Работает как Yandex Cloud Function (Node.js 18+). Секреты хранятся ТОЛЬКО в переменных окружения функции,
   в репозитории их нет. Переменные описаны в relay/README.md. */
'use strict';

const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://power-car.ru,https://www.power-car.ru')
  .split(',').map(s => s.trim()).filter(Boolean);
const CHANNELS = ['call', 'telegram', 'max', 'whatsapp'];
const LABEL = { call: 'Звонок', telegram: 'Telegram', max: 'MAX', whatsapp: 'WhatsApp' };
const MAX_API = process.env.MAX_API_BASE || 'https://platform-api.max.ru';

// грубая защита от спама в пределах живого экземпляра функции: 6 заявок в минуту с одного IP
const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 500) hits.clear();
  return arr.length > 6;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, n);
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const header = (h, k) => { h = h || {}; const key = Object.keys(h).find(x => x.toLowerCase() === k); return key ? h[key] : ''; };

async function post(url, init, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

async function sendTelegram(text) {
  const token = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await post(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    return r.ok;
  } catch (e) { console.error('telegram failed', e.message); return false; }
}

async function sendMax(text) {
  const token = process.env.MAX_BOT_TOKEN, chat = process.env.MAX_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await post(`${MAX_API}/messages?chat_id=${encodeURIComponent(chat)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ text })
    });
    if (!r.ok) console.error('max status', r.status);
    return r.ok;
  } catch (e) { console.error('max failed', e.message); return false; }
}

// Диагностика: GET ?diag=<DIAG_KEY> покажет, какие чаты видит MAX-бот (чтобы найти MAX_CHAT_ID). Не светит токены.
async function diag() {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) return { error: 'MAX_BOT_TOKEN не задан' };
  try {
    const r = await post(`${MAX_API}/chats`, { headers: { Authorization: token } });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, chats: (j.chats || []).map(c => ({ chat_id: c.chat_id, title: c.title, type: c.type })) };
  } catch (e) { return { error: e.message }; }
}

module.exports.handler = async (event) => {
  const origin = header(event.headers, 'origin');
  const okOrigin = ALLOWED.includes(origin);
  const cors = {
    'Access-Control-Allow-Origin': okOrigin ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
  const reply = (code, obj) => ({ statusCode: code, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(obj) });

  const method = event.httpMethod || event.requestContext?.http?.method || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  if (method === 'GET') {
    const q = event.queryStringParameters || {};
    if (process.env.DIAG_KEY && q.diag === process.env.DIAG_KEY) return reply(200, await diag());
    return reply(200, { ok: true, service: 'power-car lead relay' });
  }
  if (method !== 'POST') return reply(405, { ok: false });
  if (!okOrigin) return reply(403, { ok: false });

  let data;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    data = JSON.parse(raw);
  } catch (e) { return reply(400, { ok: false }); }

  const ip = header(event.headers, 'x-forwarded-for').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return reply(429, { ok: false });
  if (data.hp) return reply(200, { ok: true });           // бот заполнил скрытое поле — молча «успех»
  if (data.consent !== true) return reply(400, { ok: false, error: 'consent' });

  const name = clip(data.name, 80) || 'не указано';
  const contact = clip(data.contact, 80);
  const channel = CHANNELS.includes(data.channel) ? data.channel : 'call';
  const page = clip(data.page, 200);
  if (contact.length < 4) return reply(400, { ok: false, error: 'contact' });

  const when = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tomsk' });
  const plain = ['НОВАЯ ЗАЯВКА — POWER Car', '', `Имя: ${name}`, `Контакт: ${contact}`, `Способ связи: ${LABEL[channel]}`,
    'Согласие на обработку данных: да', '', `${when} (Томск)`, page].filter((x, i) => x !== '' || i).join('\n');
  const html = ['🚗 <b>НОВАЯ ЗАЯВКА — POWER Car</b>', '', `👤 <b>Имя:</b> ${escHtml(name)}`, `📞 <b>Контакт:</b> ${escHtml(contact)}`,
    `💬 <b>Способ связи:</b> ${LABEL[channel]}`, '✅ Согласие на обработку данных: да', '', `🕒 ${when} (Томск)`, `🔗 ${escHtml(page)}`].join('\n');

  const [tg, mx] = await Promise.all([sendTelegram(html), sendMax(plain)]);
  console.log(JSON.stringify({ lead: true, tg, max: mx }));
  if (!tg && !mx) return reply(502, { ok: false });
  return reply(200, { ok: true });
};
