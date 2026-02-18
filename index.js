import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_USERS = {};
const DEFAULT_CHATS = {};
const DEFAULT_GACHA = {};
const DEFAULT_GACHA_PROFILE = {
  carrots: 1000,
  pulls: 0,
  lastDailyTime: 0,
  inventory: [],
  fragments: {},
  history: [],
  supportPulls: 0,
  supportPity: 0,
  supportInventory: [],
  supportFragments: {},
  supportHistory: []
};

function normalizeUserJidKey(jid) {
  const raw = String(jid || '').trim();
  if (!raw) return raw;
  if (!raw.includes('@')) return raw;
  const [userRaw, serverRaw] = raw.split('@');
  const user = String(userRaw || '').split(':')[0].trim().toLowerCase();
  const server = String(serverRaw || '').trim().toLowerCase() || 's.whatsapp.net';
  return user && server ? `${user}@${server}` : raw;
}

function normalizeMapJidKey(mapObj, jid) {
  const key = normalizeUserJidKey(jid);
  if (!mapObj || typeof mapObj !== 'object') return key;
  if (!key) return key;

  if (mapObj[key] !== undefined) return key;
  if (mapObj[jid] !== undefined && key !== jid) {
    mapObj[key] = mapObj[jid];
    delete mapObj[jid];
    return key;
  }

  return key;
}

function mergeByNormalizedKey(mapObj, mergeFn) {
  if (!mapObj || typeof mapObj !== 'object') return false;
  let changed = false;
  const keys = Object.keys(mapObj);
  const buckets = new Map();

  for (const key of keys) {
    const norm = normalizeUserJidKey(key);
    if (!norm) continue;
    if (!buckets.has(norm)) buckets.set(norm, []);
    buckets.get(norm).push(key);
  }

  for (const [norm, variants] of buckets.entries()) {
    if (variants.length <= 1) {
      if (variants[0] !== norm) {
        mapObj[norm] = mapObj[variants[0]];
        delete mapObj[variants[0]];
        changed = true;
      }
      continue;
    }

    const merged = variants
      .map((k) => mapObj[k])
      .reduce((acc, cur) => mergeFn(acc, cur), {});

    mapObj[norm] = merged;
    for (const oldKey of variants) {
      if (oldKey !== norm) delete mapObj[oldKey];
    }
    changed = true;
  }

  return changed;
}

function mergeUserProfile(a, b) {
  return { ...(a || {}), ...(b || {}) };
}

function uniqById(rows) {
  const out = [];
  const seen = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(r?.id || '').trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

function mergeGachaProfile(a, b) {
  const x = a || {};
  const y = b || {};
  const out = { ...x, ...y };

  out.carrots = Math.max(Number(x.carrots) || 0, Number(y.carrots) || 0);
  out.pulls = Math.max(Number(x.pulls) || 0, Number(y.pulls) || 0);
  out.lastDailyTime = Math.max(Number(x.lastDailyTime) || 0, Number(y.lastDailyTime) || 0);
  out.supportPulls = Math.max(Number(x.supportPulls) || 0, Number(y.supportPulls) || 0);
  out.supportPity = Math.max(Number(x.supportPity) || 0, Number(y.supportPity) || 0);

  out.inventory = uniqById([...(Array.isArray(x.inventory) ? x.inventory : []), ...(Array.isArray(y.inventory) ? y.inventory : [])]);
  out.supportInventory = uniqById([...(Array.isArray(x.supportInventory) ? x.supportInventory : []), ...(Array.isArray(y.supportInventory) ? y.supportInventory : [])]);

  out.fragments = { ...(x.fragments || {}), ...(y.fragments || {}) };
  out.supportFragments = { ...(x.supportFragments || {}), ...(y.supportFragments || {}) };

  out.history = [...(Array.isArray(x.history) ? x.history : []), ...(Array.isArray(y.history) ? y.history : [])];
  out.supportHistory = [...(Array.isArray(x.supportHistory) ? x.supportHistory : []), ...(Array.isArray(y.supportHistory) ? y.supportHistory : [])];

  return out;
}

function loadJSON(filename, defaultValue = {}) {
  try {
    const filepath = path.join(__dirname, filename);
    if (!fs.existsSync(filepath)) {
      saveJSON(filename, defaultValue);
      return defaultValue;
    }

    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[DB] Error loading ${filename}:`, err.message);
    return defaultValue;
  }
}

function saveJSON(filename, data) {
  try {
    const filepath = path.join(__dirname, filename);
    const tempFile = `${filepath}.tmp`;

    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    fs.renameSync(tempFile, filepath);
  } catch (err) {
    console.error(`[DB] Error saving ${filename}:`, err.message);
  }
}

export const database = {
  users: loadJSON('users.json', DEFAULT_USERS),
  chats: loadJSON('chats.json', DEFAULT_CHATS),
  gacha: loadJSON('gacha.json', DEFAULT_GACHA)
};

{
  const usersChanged = mergeByNormalizedKey(database.users, mergeUserProfile);
  const gachaChanged = mergeByNormalizedKey(database.gacha, mergeGachaProfile);
  if (usersChanged) saveJSON('users.json', database.users);
  if (gachaChanged) saveJSON('gacha.json', database.gacha);
}

export function saveUsers() {
  saveJSON('users.json', database.users);
}

export function saveChats() {
  saveJSON('chats.json', database.chats);
}

export function saveGacha() {
  saveJSON('gacha.json', database.gacha);
}

export function saveAll() {
  saveUsers();
  saveChats();
  saveGacha();
}

export function getUser(jid) {
  const key = normalizeMapJidKey(database.users, jid);
  if (!database.users[key]) {
    database.users[key] = {};
    saveUsers();
  }
  return database.users[key];
}

export function setUser(jid, data) {
  const key = normalizeMapJidKey(database.users, jid);
  database.users[key] = { ...database.users[key], ...data };
  saveUsers();
}

export function getChat(jid) {
  if (!database.chats[jid]) {
    database.chats[jid] = { isBanned: false };
    saveChats();
  }
  return database.chats[jid];
}

export function setChat(jid, data) {
  database.chats[jid] = { ...database.chats[jid], ...data };
  saveChats();
}

export function getGacha(jid) {
  const key = normalizeMapJidKey(database.gacha, jid);
  if (!database.gacha[key]) {
    database.gacha[key] = { ...DEFAULT_GACHA_PROFILE };
    saveGacha();
    return database.gacha[key];
  }

  const profile = database.gacha[key];
  let changed = false;

  if ((typeof profile.carrots !== 'number' || Number.isNaN(profile.carrots)) && Number.isFinite(Number(profile.currency))) {
    profile.carrots = Number(profile.currency);
    changed = true;
  }

  if (typeof profile.carrots !== 'number' || Number.isNaN(profile.carrots)) {
    profile.carrots = 1000;
    changed = true;
  }
  if (typeof profile.pulls !== 'number' || Number.isNaN(profile.pulls)) {
    profile.pulls = 0;
    changed = true;
  }
  if (typeof profile.lastDailyTime !== 'number' || Number.isNaN(profile.lastDailyTime)) {
    profile.lastDailyTime = 0;
    changed = true;
  }
  if (!Array.isArray(profile.inventory)) {
    profile.inventory = [];
    changed = true;
  }
  if (!profile.fragments || typeof profile.fragments !== 'object' || Array.isArray(profile.fragments)) {
    profile.fragments = {};
    changed = true;
  }
  if (!Array.isArray(profile.history)) {
    profile.history = [];
    changed = true;
  }

  if (typeof profile.supportPulls !== 'number' || Number.isNaN(profile.supportPulls)) {
    profile.supportPulls = 0;
    changed = true;
  }
  if (typeof profile.supportPity !== 'number' || Number.isNaN(profile.supportPity)) {
    profile.supportPity = 0;
    changed = true;
  }
  if (!Array.isArray(profile.supportInventory)) {
    profile.supportInventory = [];
    changed = true;
  }
  if (!profile.supportFragments || typeof profile.supportFragments !== 'object' || Array.isArray(profile.supportFragments)) {
    profile.supportFragments = {};
    changed = true;
  }
  if (!Array.isArray(profile.supportHistory)) {
    profile.supportHistory = [];
    changed = true;
  }

  if (changed) saveGacha();
  return profile;
}

export function setGacha(jid, data) {
  const key = normalizeMapJidKey(database.gacha, jid);
  database.gacha[key] = { ...database.gacha[key], ...data };
  saveGacha();
}
