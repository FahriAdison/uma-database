import fetch from 'node-fetch';

let getGacha = () => ({});
let setGacha = () => {};
let umaDb = {};

export function configureGachaCore(config = {}) {
  if (typeof config.getGacha === 'function') getGacha = config.getGacha;
  if (typeof config.setGacha === 'function') setGacha = config.setGacha;
  if (config.umaDb && typeof config.umaDb === 'object') umaDb = config.umaDb;
}

const CARROT_PRICES = {
  single: 150,
  multi: 1500
};

const DAILY_CARROT = 300;
const SUPPORT_DROP_RATES_MULTI = {
  SSR: 3,
  SR: 18,
  R: 79
};
const SUPPORT_DROP_RATES_SINGLE = {
  SSR: 1,
  SR: 9,
  R: 90
};
const SUPPORT_PITY_THRESHOLD = 100;
const SUPPORT_MAX_LIMIT_BREAK = 4;

const EMOJI = {
  gacha: '\u{1F3B0}',
  carrot: '\u{1F955}',
  daily: '\u{1F381}',
  warning: '\u{26A0}\u{FE0F}',
  new: '\u{1F389}',
  duplicate: '\u{1F501}',
  inventory: '\u{1F4D8}',
  stats: '\u{1F4CA}',
  total: '\u{2728}',
  star: '\u{2B50}',
  support: '\u{1F4D5}',
  ssr: '\u{1F31F}',
  sr: '\u{1F31E}',
  r: '\u{1F539}'
};
const UMA_RARITY_ORDER = ['SS', 'S', 'A'];
const SUPPORT_RARITY_ORDER = ['SSR', 'SR', 'R'];
const UMA_INVENTORY_PAGE_SIZE = 15;
const SUPPORT_INVENTORY_PAGE_SIZE = 12;

let warmupUmaPromise = null;
let warmupSupportPromise = null;
let supportPoolCache = null;
const supportDetailCache = new Map();
const umaImageCache = new Map();

function formatCurrency(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function normText(v) {
  return String(v || '').toLowerCase().trim();
}

async function sendWithImageFallback(sock, remoteJid, imageUrl, caption, quotedMsg) {
  if (!imageUrl) {
    return sock.sendMessage(remoteJid, { text: caption }, { quoted: quotedMsg });
  }

  try {
    return await sock.sendMessage(remoteJid, {
      image: { url: imageUrl },
      caption
    }, { quoted: quotedMsg });
  } catch (err) {
    return sock.sendMessage(remoteJid, { text: caption }, { quoted: quotedMsg });
  }
}

function normalizeUmaRarity(value) {
  if (typeof value !== 'string') return 'A';
  const rarity = value.toUpperCase().trim();
  if (rarity === 'SS' || rarity === 'S' || rarity === 'A') return rarity;
  return 'A';
}

function rarityRank(order, rarity) {
  const idx = order.indexOf(String(rarity || '').toUpperCase());
  return idx >= 0 ? idx : order.length + 1;
}

function parsePageArg(raw, fallback = 1) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function normalizeSupportRarity(value) {
  if (typeof value === 'number') {
    if (value >= 3) return 'SSR';
    if (value === 2) return 'SR';
    return 'R';
  }

  const rarity = String(value || '').toUpperCase().trim();
  if (rarity.includes('SSR') || rarity === '3') return 'SSR';
  if (rarity.includes('SR') || rarity === '2') return 'SR';
  return 'R';
}

function supportEmojiByRarity(rarity) {
  if (rarity === 'SSR') return EMOJI.ssr;
  if (rarity === 'SR') return EMOJI.sr;
  return EMOJI.r;
}

function normalizeSupportType(type) {
  const key = String(type || '').trim().toLowerCase();
  if (!key || key === 'unknown' || key === '-' || key === 'null' || key === 'undefined') return null;
  if (key === 'speed') return 'speed';
  if (key === 'stamina') return 'stamina';
  if (key === 'power') return 'power';
  if (key === 'guts') return 'guts';
  if (key === 'wisdom') return 'wisdom';
  if (key === 'friend') return 'friend';
  if (key === 'group') return 'group';
  return key;
}

function supportMetaText(card) {
  const parts = [];
  if (card?.charName) parts.push(card.charName);
  if (card?.type) parts.push(card.type);
  return parts.length ? ` (${parts.join(' | ')})` : '';
}

function getSupportCardImageUrl(supportId) {
  const id = Number(supportId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return `https://gametora.com/images/umamusume/supports/tex_support_card_${id}.png`;
}

function getUmaCardId(uma) {
  const direct = Number(uma?.cardId ?? uma?.card_id);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const charaId = Number(uma?.charaId ?? uma?.chara_id ?? uma?.apiId ?? uma?.api_id);
  if (!Number.isInteger(charaId) || charaId <= 0) return null;

  return Number(`${charaId}01`);
}

function getUmaImageUrl(uma) {
  const cardId = getUmaCardId(uma);
  const charaId = Number(uma?.charaId ?? uma?.chara_id ?? (Number.isInteger(cardId) ? Math.floor(cardId / 100) : NaN));

  if (!Number.isInteger(cardId) || cardId <= 0) return null;
  if (!Number.isInteger(charaId) || charaId <= 0) return null;

  return `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${charaId}_${cardId}.png`;
}

function getUmaCharaId(uma) {
  const direct = Number(uma?.charaId ?? uma?.chara_id ?? uma?.apiId ?? uma?.api_id);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const cardId = getUmaCardId(uma);
  if (Number.isInteger(cardId) && cardId > 0) {
    const derived = Math.floor(cardId / 100);
    if (Number.isInteger(derived) && derived > 0) return derived;
  }

  return null;
}

function pickPreferredUmaVariant(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return null;

  const byRacewear = variants.find((v) => String(v?.label_en || "").toLowerCase().includes("racewear"));
  if (byRacewear) return byRacewear;

  const byUniform = variants.find((v) => String(v?.label_en || "").toLowerCase().includes("uniform"));
  if (byUniform) return byUniform;

  return variants[0];
}

function pickLatestImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  return images[0];
}

async function fetchUmaImageMetaByCharaId(charaId) {
  const id = Number(charaId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (umaImageCache.has(id)) return umaImageCache.get(id);

  let rows = null;

  try {
    if (typeof umaDb.apiGetCharacterImagesById === 'function') {
      rows = await umaDb.apiGetCharacterImagesById(id);
    }
  } catch (_) {}

  if (!Array.isArray(rows) || rows.length === 0) {
    try {
      const res = await fetch(`https://umapyoi.net/api/v1/character/images/${id}`);
      if (res.ok) rows = await res.json();
    } catch (_) {}
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    umaImageCache.set(id, null);
    return null;
  }

  const variant = pickPreferredUmaVariant(rows);
  const latest = pickLatestImage(variant?.images);
  const meta = latest?.image
    ? {
        imageUrl: latest.image,
        outfitName: variant?.label_en || variant?.label || null
      }
    : null;

  umaImageCache.set(id, meta);
  return meta;
}

function slugToDisplayName(slug) {
  const base = String(slug || '').trim().toLowerCase();
  if (!base) return null;
  const withoutPrefix = base.replace(/^\d+-/, '');
  if (!withoutPrefix) return null;
  return withoutPrefix
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function resolveCharacterName(charaId, gametora) {
  const n = Number(charaId);
  if (Number.isInteger(n) && typeof umaDb.getAllUmas === 'function') {
    const all = umaDb.getAllUmas();
    if (Array.isArray(all)) {
      const hit = all.find((u) => Number(u?.charaId) === n);
      if (hit?.name) return hit.name;
    }
  }
  return slugToDisplayName(gametora);
}

async function fetchSupportDetailById(supportId) {
  const id = Number(supportId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (supportDetailCache.has(id)) return supportDetailCache.get(id);

  let detail = null;
  try {
    if (typeof umaDb.apiGetSupportCardById === 'function') {
      detail = await umaDb.apiGetSupportCardById(id);
    }
  } catch (_) {}

  if (!detail) {
    try {
      const res = await fetch(`https://umapyoi.net/api/v1/support/${id}`);
      if (res.ok) detail = await res.json();
    } catch (_) {}
  }

  if (detail && typeof detail === 'object') {
    supportDetailCache.set(id, detail);
    return detail;
  }
  return null;
}

async function enrichSupportCard(card) {
  if (!card) return null;
  const detail = await fetchSupportDetailById(card.id);
  if (!detail) return card;

  const rarity = normalizeSupportRarity(detail.rarity_string || detail.rarity || card.rarity);
  const type = normalizeSupportType(detail.type || card.type);
  const charId = Number(detail.chara_id ?? card.charId);
  const gametora = detail.gametora || card.gametora || null;
  const charName = resolveCharacterName(charId, gametora) || card.charName || null;
  const name = detail.title_en || detail.title || card.name;

  return {
    ...card,
    id: Number.isInteger(Number(detail.id)) ? Number(detail.id) : card.id,
    name,
    rarity,
    type,
    charId: Number.isInteger(charId) ? charId : null,
    charName,
    gametora,
    typeIconUrl: typeof detail.type_icon_url === 'string' ? detail.type_icon_url : card.typeIconUrl,
    imageUrl: getSupportCardImageUrl(detail.id ?? card.id),
    emoji: supportEmojiByRarity(rarity)
  };
}

function rollSupportRarity(mode = 'multi') {
  const rates = mode === 'single' ? SUPPORT_DROP_RATES_SINGLE : SUPPORT_DROP_RATES_MULTI;
  const roll = Math.random() * 100;
  if (roll < rates.SSR) return 'SSR';
  if (roll < rates.SSR + rates.SR) return 'SR';
  return 'R';
}

function isSupportSSR(card) {
  return !!card && card.rarity === 'SSR';
}

function sanitizeUmaInventory(inventory) {
  if (!Array.isArray(inventory)) return [];

  const catalog = typeof umaDb.getAllUmas === 'function' ? umaDb.getAllUmas() : [];
  const rarityById = new Map();
  if (Array.isArray(catalog)) {
    for (const row of catalog) {
      const idKey = String(row?.id || '').trim().toLowerCase();
      if (!idKey) continue;
      rarityById.set(idKey, normalizeUmaRarity(row?.rarity));
    }
  }

  const merged = new Map();
  for (const item of inventory) {
    if (!item || item.id === undefined || item.id === null) continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;

    const idKey = String(item.id).trim().toLowerCase();
    const levelNum = Number(item.level);
    const countNum = Number(item.count);
    const normalized = {
      id: item.id,
      name,
      rarity: rarityById.get(idKey) || normalizeUmaRarity(item.rarity),
      emoji: typeof item.emoji === 'string' && item.emoji.trim() ? item.emoji : EMOJI.star,
      charaId: Number.isInteger(Number(item.charaId)) ? Number(item.charaId) : null,
      cardId: Number.isInteger(Number(item.cardId)) ? Number(item.cardId) : null,
      outfitName: typeof item.outfitName === 'string' && item.outfitName.trim() ? item.outfitName.trim() : null,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
      pulledAt: Number(item.pulledAt) || Date.now(),
      level: Number.isFinite(levelNum) && levelNum > 0 ? Math.floor(levelNum) : 1,
      count: Number.isFinite(countNum) && countNum > 0 ? Math.floor(countNum) : 1
    };

    if (!merged.has(idKey)) {
      merged.set(idKey, normalized);
      continue;
    }

    const prev = merged.get(idKey);
    prev.count = (Number(prev.count) || 1) + (Number(normalized.count) || 1);
    prev.level = Math.max(Number(prev.level) || 1, Number(normalized.level) || 1);
    prev.pulledAt = Math.max(Number(prev.pulledAt) || 0, Number(normalized.pulledAt) || 0);
    if (!prev.imageUrl && normalized.imageUrl) prev.imageUrl = normalized.imageUrl;
    if (!prev.outfitName && normalized.outfitName) prev.outfitName = normalized.outfitName;
    if (!prev.charaId && normalized.charaId) prev.charaId = normalized.charaId;
    if (!prev.cardId && normalized.cardId) prev.cardId = normalized.cardId;
    prev.rarity = rarityById.get(idKey) || prev.rarity || normalized.rarity;
  }

  return [...merged.values()];
}

function sanitizeSupportInventory(inventory) {
  if (!Array.isArray(inventory)) return [];

  const merged = new Map();
  for (const item of inventory) {
    if (!item || item.id === undefined || item.id === null) continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const rarity = normalizeSupportRarity(item.rarity);
    const levelNum = Number(item.level);
    const countNum = Number(item.count);
    const lbNum = Number(item.limitBreak ?? item.lb);
    const idKey = String(item.id).trim();

    const normalized = {
      id: item.id,
      name,
      rarity,
      type: normalizeSupportType(item.type),
      charId: Number.isInteger(Number(item.charId)) ? Number(item.charId) : null,
      charName: typeof item.charName === 'string' && item.charName.trim() ? item.charName.trim() : null,
      gametora: typeof item.gametora === 'string' ? item.gametora : null,
      typeIconUrl: typeof item.typeIconUrl === 'string' ? item.typeIconUrl : null,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : getSupportCardImageUrl(item.id),
      limitBreak: Number.isFinite(lbNum) && lbNum > 0 ? Math.min(SUPPORT_MAX_LIMIT_BREAK, Math.floor(lbNum)) : 0,
      emoji: typeof item.emoji === 'string' && item.emoji.trim() ? item.emoji : supportEmojiByRarity(rarity),
      pulledAt: Number(item.pulledAt) || Date.now(),
      level: Number.isFinite(levelNum) && levelNum > 0 ? Math.floor(levelNum) : 1,
      count: Number.isFinite(countNum) && countNum > 0 ? Math.floor(countNum) : 1
    };

    if (!merged.has(idKey)) {
      merged.set(idKey, normalized);
      continue;
    }

    const prev = merged.get(idKey);
    prev.count = (Number(prev.count) || 1) + (Number(normalized.count) || 1);
    prev.level = Math.max(Number(prev.level) || 1, Number(normalized.level) || 1);
    prev.limitBreak = Math.max(Number(prev.limitBreak) || 0, Number(normalized.limitBreak) || 0);
    prev.pulledAt = Math.max(Number(prev.pulledAt) || 0, Number(normalized.pulledAt) || 0);
    if (!prev.imageUrl && normalized.imageUrl) prev.imageUrl = normalized.imageUrl;
    if (!prev.charName && normalized.charName) prev.charName = normalized.charName;
    if (!prev.type && normalized.type) prev.type = normalized.type;
    if (!prev.gametora && normalized.gametora) prev.gametora = normalized.gametora;
  }

  return [...merged.values()];
}

async function ensureUmaDataReady() {
  const probe = typeof umaDb.getRandomUma === 'function' ? umaDb.getRandomUma() : null;
  if (probe) return true;

  if (!warmupUmaPromise) {
    warmupUmaPromise = (typeof umaDb.refreshUmaDatabase === 'function' ? umaDb.refreshUmaDatabase() : Promise.resolve(null))
      .catch(() => null)
      .finally(() => {
        warmupUmaPromise = null;
      });
  }

  await warmupUmaPromise;
  return typeof umaDb.getRandomUma === 'function' && !!umaDb.getRandomUma();
}

async function ensureSupportDataReady() {
  const hasRandom = typeof umaDb.getRandomSupportCard === 'function';
  const hasList = typeof umaDb.getAllSupportCards === 'function';
  if (!hasRandom && !hasList) return false;

  if (hasRandom) {
    const probe = umaDb.getRandomSupportCard();
    if (probe) return true;
  }
  if (hasList) {
    const list = umaDb.getAllSupportCards();
    if (Array.isArray(list) && list.length > 0) return true;
  }

  if (!warmupSupportPromise) {
    warmupSupportPromise = (typeof umaDb.refreshSupportCardDatabase === 'function'
      ? umaDb.refreshSupportCardDatabase().then((rows) => {
        supportPoolCache = null;
        return rows;
      })
      : Promise.resolve(null))
      .catch(() => null)
      .finally(() => {
        warmupSupportPromise = null;
      });
  }

  await warmupSupportPromise;
  if (hasRandom && umaDb.getRandomSupportCard()) return true;
  if (hasList) {
    const list = umaDb.getAllSupportCards();
    return Array.isArray(list) && list.length > 0;
  }
  return false;
}

function ensureGachaShape(gachaData) {
  if (!gachaData || typeof gachaData !== 'object') {
    return {
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
  }

  if ((!Number.isFinite(Number(gachaData.carrots)) || Number(gachaData.carrots) <= 0) && Number.isFinite(Number(gachaData.currency))) {
    gachaData.carrots = Number(gachaData.currency);
  }

  if (!gachaData.history || !Array.isArray(gachaData.history)) gachaData.history = [];
  if (!gachaData.fragments || typeof gachaData.fragments !== 'object' || Array.isArray(gachaData.fragments)) gachaData.fragments = {};
  if (!gachaData.supportHistory || !Array.isArray(gachaData.supportHistory)) gachaData.supportHistory = [];
  if (!gachaData.supportFragments || typeof gachaData.supportFragments !== 'object' || Array.isArray(gachaData.supportFragments)) gachaData.supportFragments = {};

  gachaData.inventory = sanitizeUmaInventory(gachaData.inventory);
  gachaData.supportInventory = sanitizeSupportInventory(gachaData.supportInventory);
  gachaData.carrots = Number(gachaData.carrots) || 1000;
  gachaData.pulls = Number(gachaData.pulls) || 0;
  gachaData.supportPulls = Number(gachaData.supportPulls) || 0;
  gachaData.supportPity = Math.max(0, Number(gachaData.supportPity) || 0);
  gachaData.lastDailyTime = Number(gachaData.lastDailyTime) || 0;

  return gachaData;
}

function findOwnedItem(inventory, id) {
  const key = String(id || '').trim().toLowerCase();
  return inventory.find((item) => String(item?.id || '').trim().toLowerCase() === key);
}

function buildSupportCardEntity(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id ?? raw.support_id ?? raw.sid ?? raw.card_id;
  if (id === undefined || id === null) return null;

  const name = raw.name || raw.char_name || raw.name_jp || raw.title;
  if (!name) return null;

  const rarity = normalizeSupportRarity(raw.rarity);
  const type = normalizeSupportType(raw.type || raw.category);
  const charId = Number(raw.chara_id ?? raw.charId);
  const gametora = raw.gametora || raw.url_name || raw.urlName || null;
  const charName =
    raw.charName ||
    raw.char_name ||
    raw.chara_name ||
    resolveCharacterName(charId, gametora) ||
    null;

  return {
    id,
    name,
    rarity,
    type,
    charId: Number.isInteger(charId) ? charId : null,
    charName,
    gametora,
    typeIconUrl: typeof raw.type_icon_url === 'string' ? raw.type_icon_url : null,
    imageUrl: getSupportCardImageUrl(id),
    emoji: supportEmojiByRarity(rarity)
  };
}

function getSupportPoolsByRarity() {
  if (supportPoolCache) return supportPoolCache;

  if (typeof umaDb.getAllSupportCards !== 'function') {
    return null;
  }

  const all = umaDb.getAllSupportCards();
  if (!Array.isArray(all) || all.length === 0) {
    return null;
  }

  const pools = { SSR: [], SR: [], R: [] };
  for (const raw of all) {
    const card = buildSupportCardEntity(raw);
    if (!card) continue;
    pools[card.rarity].push(card);
  }

  supportPoolCache = pools;
  return pools;
}

function pullSupportCardByRate(forceSSR = false, mode = 'multi') {
  const targetRarity = forceSSR ? 'SSR' : rollSupportRarity(mode);
  const pools = getSupportPoolsByRarity();

  if (pools && Array.isArray(pools[targetRarity]) && pools[targetRarity].length > 0) {
    const pool = pools[targetRarity];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  if (typeof umaDb.getRandomSupportCard !== 'function') return null;

  for (let i = 0; i < 40; i++) {
    const card = buildSupportCardEntity(umaDb.getRandomSupportCard());
    if (card && card.rarity === targetRarity) return card;
  }

  return buildSupportCardEntity(umaDb.getRandomSupportCard());
}

async function handle(sock, remoteJid, args, msg) {
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const subcommand = args[0]?.toLowerCase();
  if (['1x', '10x', 'inventory', 'stats'].includes(subcommand)) {
    await ensureUmaDataReady().catch(() => {});
  }

  if (!subcommand) {
    return sock.sendMessage(remoteJid, {
      text:
        `*${EMOJI.gacha} Uma Musume Gacha System ${EMOJI.gacha}*\n` +
        `\nHalo! Selamat datang di gacha kami.\n` +
        `*Uma Subcommand:*\n` +
        `- !gacha daily - Claim reward harian (${DAILY_CARROT} carrots)\n` +
        `- !gacha 1x - Pull 1x gacha uma (${CARROT_PRICES.single} carrots)\n` +
        `- !gacha 10x - Pull 10x gacha uma (${CARROT_PRICES.multi} carrots)\n` +
        `- !gacha inventory [page] - Lihat koleksi uma mu\n` +
        `- !gacha cleanup - Rapikan data inventory/profile\n` +
        `- !gacha stats - Statistik gacha uma\n` +
        `\n*Support Card Subcommand:*\n` +
        `- !gacha support 1x - Pull 1x support card\n` +
        `- !gacha support 10x - Pull 10x support card\n` +
        `- !gacha support inventory [page] - Koleksi support card\n` +
        `- !gacha support stats - Statistik support gacha\n` +
        `\nDrop rate support 1x: SSR ${SUPPORT_DROP_RATES_SINGLE.SSR}% | SR ${SUPPORT_DROP_RATES_SINGLE.SR}% | R ${SUPPORT_DROP_RATES_SINGLE.R}%\n` +
        `Drop rate support 10x: SSR ${SUPPORT_DROP_RATES_MULTI.SSR}% | SR ${SUPPORT_DROP_RATES_MULTI.SR}% | R ${SUPPORT_DROP_RATES_MULTI.R}%\n` +
        `Pity support: SSR dijamin tiap ${SUPPORT_PITY_THRESHOLD} pull tanpa SSR\n`
    }, { quoted: msg });
  }

  const gachaData = ensureGachaShape(getGacha(senderJid));
  setGacha(senderJid, gachaData);

  if (subcommand === 'support' || subcommand === 'sc') {
    return handleSupportCommand(sock, remoteJid, senderJid, args.slice(1), gachaData, msg);
  }

  switch (subcommand) {
    case 'daily':
      return handleDaily(sock, remoteJid, senderJid, gachaData, msg);
    case '1x':
      return handleGachaSingle(sock, remoteJid, senderJid, gachaData, msg);
    case '10x':
      return handleGachaMulti(sock, remoteJid, senderJid, gachaData, msg);
    case 'inventory':
      return handleInventory(sock, remoteJid, senderJid, gachaData, args.slice(1), msg);
    case 'cleanup':
      return handleCleanup(sock, remoteJid, senderJid, gachaData, msg);
    case 'stats':
      return handleStats(sock, remoteJid, senderJid, gachaData, msg);
    default:
      return sock.sendMessage(
        remoteJid,
        { text: 'Subcommand tidak dikenal. Gunakan: daily, 1x, 10x, inventory, cleanup, stats, support' },
        { quoted: msg }
      );
  }
}

async function handleSupportCommand(sock, remoteJid, jid, supportArgs, gachaData, msg) {
  const sub = supportArgs[0]?.toLowerCase();

  if (!sub) {
    return sock.sendMessage(remoteJid, {
      text:
        `*${EMOJI.support} Support Card Gacha ${EMOJI.support}*\n\n` +
        `Subcommand:\n` +
        `- !gacha support 1x\n` +
        `- !gacha support 10x\n` +
        `- !gacha support inventory [page]\n` +
        `- !gacha support stats\n` +
        `\nDrop rate 1x: SSR ${SUPPORT_DROP_RATES_SINGLE.SSR}% | SR ${SUPPORT_DROP_RATES_SINGLE.SR}% | R ${SUPPORT_DROP_RATES_SINGLE.R}%\n` +
        `Drop rate 10x: SSR ${SUPPORT_DROP_RATES_MULTI.SSR}% | SR ${SUPPORT_DROP_RATES_MULTI.SR}% | R ${SUPPORT_DROP_RATES_MULTI.R}%\n` +
        `Pity: SSR dijamin tiap ${SUPPORT_PITY_THRESHOLD} pull tanpa SSR`
    }, { quoted: msg });
  }

  switch (sub) {
    case '1x':
      return handleSupportSingle(sock, remoteJid, jid, gachaData, msg);
    case '10x':
      return handleSupportMulti(sock, remoteJid, jid, gachaData, msg);
    case 'inventory':
      return handleSupportInventory(sock, remoteJid, jid, gachaData, supportArgs.slice(1), msg);
    case 'stats':
      return handleSupportStats(sock, remoteJid, jid, gachaData, msg);
    default:
      return sock.sendMessage(remoteJid, {
        text: 'Subcommand support tidak dikenal. Gunakan: 1x, 10x, inventory, stats'
      }, { quoted: msg });
  }
}

async function handleDaily(sock, remoteJid, jid, gachaData, msg) {
  const now = Date.now();
  const lastDaily = gachaData.lastDailyTime || 0;
  const cooldown = 24 * 60 * 60 * 1000;
  const timeLeft = lastDaily + cooldown - now;

  if (now - lastDaily < cooldown) {
    const hours = Math.ceil(timeLeft / (60 * 60 * 1000));
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Daily Login Cooldown*\n\n` +
        `Kamu sudah claim hari ini!\n` +
        `Bisa claim lagi dalam *${hours} jam*.`
    }, { quoted: msg });
  }

  gachaData.carrots += DAILY_CARROT;
  gachaData.lastDailyTime = now;
  setGacha(jid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `${EMOJI.daily} *Daily Reward Claimed!*\n\n` +
      `+${DAILY_CARROT} ${EMOJI.carrot} Carrots\n` +
      `Total: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}`
  }, { quoted: msg });
}

async function handleGachaSingle(sock, remoteJid, jid, gachaData, msg) {
  const dataReady = await ensureUmaDataReady();
  if (!dataReady) {
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Data Gacha Belum Siap*\n\n` +
        `Data karakter belum berhasil dimuat dari API.\n` +
        `Coba lagi dalam beberapa detik.`
    }, { quoted: msg });
  }

  if (gachaData.carrots < CARROT_PRICES.single) {
    const need = CARROT_PRICES.single - gachaData.carrots;
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Carrots Tidak Cukup*\n\n` +
        `Butuh: ${formatCurrency(CARROT_PRICES.single)} ${EMOJI.carrot}\n` +
        `Punya: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
        `Kurang: ${formatCurrency(need)} ${EMOJI.carrot}`
    }, { quoted: msg });
  }

  const uma = typeof umaDb.getRandomUma === 'function' ? umaDb.getRandomUma() : null;
  if (!uma) {
    return sock.sendMessage(remoteJid, {
      text: `${EMOJI.warning} *Pull Gagal*\n\nTidak ada data karakter untuk ditarik saat ini.`
    }, { quoted: msg });
  }

  gachaData.carrots -= CARROT_PRICES.single;
  const resolvedCharaId = getUmaCharaId(uma);
  const umaImageMeta = resolvedCharaId ? await fetchUmaImageMetaByCharaId(resolvedCharaId) : null;
  const fallbackImageUrl = getUmaImageUrl(uma);
  const finalUmaImageUrl = umaImageMeta?.imageUrl || fallbackImageUrl;
  const outfitText = umaImageMeta?.outfitName ? ` (${umaImageMeta.outfitName})` : '';

  const existing = findOwnedItem(gachaData.inventory, uma.id);
  let resultMsg;

  if (existing) {
    existing.count = (existing.count || 1) + 1;
    gachaData.fragments[uma.id] = (gachaData.fragments[uma.id] || 0) + 1;
    resultMsg = `${EMOJI.duplicate} *Duplicate!* Converted to piece.\n${uma.emoji || EMOJI.star} ${uma.name} Piece +1\n`;
  } else {
    const cardId = getUmaCardId(uma);
    gachaData.inventory.push({
      id: uma.id,
      name: uma.name,
      rarity: normalizeUmaRarity(uma.rarity),
      emoji: uma.emoji || EMOJI.star,
      charaId: Number.isInteger(resolvedCharaId) ? resolvedCharaId : null,
      cardId: Number.isInteger(cardId) ? cardId : null,
      outfitName: umaImageMeta?.outfitName || null,
      imageUrl: finalUmaImageUrl,
      pulledAt: Date.now(),
      level: 1,
      count: 1
    });
    resultMsg = `${EMOJI.new} *New Uma!*\n${uma.emoji || EMOJI.star} *${uma.name}* [${normalizeUmaRarity(uma.rarity)}]${outfitText}\n`;
  }

  gachaData.pulls += 1;
  gachaData.history.push({ uma: uma.id, time: Date.now(), count: 1 });
  setGacha(jid, gachaData);

  const caption =
    `*${EMOJI.gacha} 1x Gacha Pull (Uma) ${EMOJI.gacha}*\n` +
    resultMsg +
    `\n-${CARROT_PRICES.single} ${EMOJI.carrot}\n` +
    `Sisa: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
    `Total Pull: ${gachaData.pulls}`;

  return sendWithImageFallback(sock, remoteJid, finalUmaImageUrl, caption, msg);
}

async function handleGachaMulti(sock, remoteJid, jid, gachaData, msg) {
  const dataReady = await ensureUmaDataReady();
  if (!dataReady) {
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Data Gacha Belum Siap*\n\n` +
        `Data karakter belum berhasil dimuat dari API.\n` +
        `Coba lagi dalam beberapa detik.`
    }, { quoted: msg });
  }

  if (gachaData.carrots < CARROT_PRICES.multi) {
    const need = CARROT_PRICES.multi - gachaData.carrots;
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Carrots Tidak Cukup*\n\n` +
        `Butuh: ${formatCurrency(CARROT_PRICES.multi)} ${EMOJI.carrot}\n` +
        `Punya: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
        `Kurang: ${formatCurrency(need)} ${EMOJI.carrot}`
    }, { quoted: msg });
  }

  gachaData.carrots -= CARROT_PRICES.multi;
  let pullResults = '';
  const newUmas = [];

  for (let i = 0; i < 10; i++) {
    const uma = typeof umaDb.getRandomUma === 'function' ? umaDb.getRandomUma() : null;
    if (!uma) {
      return sock.sendMessage(remoteJid, {
        text: `${EMOJI.warning} *Pull Gagal*\n\nData karakter tidak tersedia saat proses 10x.`
      }, { quoted: msg });
    }

    const existing = findOwnedItem(gachaData.inventory, uma.id);
    const resolvedCharaId = getUmaCharaId(uma);
    const resolvedCardId = getUmaCardId(uma);

    if (existing) {
      existing.count = (existing.count || 1) + 1;
      if (!existing.charaId && Number.isInteger(resolvedCharaId)) existing.charaId = resolvedCharaId;
      if (!existing.cardId && Number.isInteger(resolvedCardId)) existing.cardId = resolvedCardId;
      gachaData.fragments[uma.id] = (gachaData.fragments[uma.id] || 0) + 1;
      pullResults += `${i + 1}. ${uma.emoji || EMOJI.star} ${uma.name} (Piece +1)\n`;
    } else {
      gachaData.inventory.push({
        id: uma.id,
        name: uma.name,
        rarity: normalizeUmaRarity(uma.rarity),
        emoji: uma.emoji || EMOJI.star,
        charaId: Number.isInteger(resolvedCharaId) ? resolvedCharaId : null,
        cardId: Number.isInteger(resolvedCardId) ? resolvedCardId : null,
        imageUrl: getUmaImageUrl(uma),
        pulledAt: Date.now(),
        level: 1,
        count: 1
      });
      newUmas.push(uma);
      pullResults += `${i + 1}. ${uma.emoji || EMOJI.star} *${uma.name}* [${normalizeUmaRarity(uma.rarity)}]\n`;
    }

    gachaData.history.push({ uma: uma.id, time: Date.now(), count: 1 });
  }

  gachaData.pulls += 10;
  setGacha(jid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*${EMOJI.gacha} 10x Gacha Pull (Uma) ${EMOJI.gacha}*\n\n` +
      pullResults +
      `\n-${CARROT_PRICES.multi} ${EMOJI.carrot}\n` +
      `Sisa: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
      `Total Pull: ${gachaData.pulls}\n` +
      `New Umas: ${newUmas.length}`
  }, { quoted: msg });
}

async function handleSupportSingle(sock, remoteJid, jid, gachaData, msg) {
  if (typeof umaDb.getRandomSupportCard !== 'function' && typeof umaDb.getAllSupportCards !== 'function') {
    return sock.sendMessage(remoteJid, {
      text: `${EMOJI.warning} *Support API belum tersedia*\n\nUpdate package @fahri/uma-database ke versi terbaru dulu.`
    }, { quoted: msg });
  }

  const dataReady = await ensureSupportDataReady();
  if (!dataReady) {
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Data Support Card Belum Siap*\n\n` +
        `Data support card belum berhasil dimuat dari API.\n` +
        `Coba lagi dalam beberapa detik.`
    }, { quoted: msg });
  }

  if (gachaData.carrots < CARROT_PRICES.single) {
    const need = CARROT_PRICES.single - gachaData.carrots;
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Carrots Tidak Cukup*\n\n` +
        `Butuh: ${formatCurrency(CARROT_PRICES.single)} ${EMOJI.carrot}\n` +
        `Punya: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
        `Kurang: ${formatCurrency(need)} ${EMOJI.carrot}`
    }, { quoted: msg });
  }

  const guaranteedSSR = gachaData.supportPity >= SUPPORT_PITY_THRESHOLD - 1;
  const card = await enrichSupportCard(pullSupportCardByRate(guaranteedSSR, 'single'));
  if (!card) {
    return sock.sendMessage(remoteJid, {
      text: `${EMOJI.warning} *Pull Gagal*\n\nData support card tidak valid.`
    }, { quoted: msg });
  }

  gachaData.carrots -= CARROT_PRICES.single;

  const existing = findOwnedItem(gachaData.supportInventory, card.id);
  let resultMsg;

  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.limitBreak = Math.min(SUPPORT_MAX_LIMIT_BREAK, Number(existing.limitBreak) || 0);
    if (existing.limitBreak < SUPPORT_MAX_LIMIT_BREAK) {
      existing.limitBreak += 1;
      resultMsg = `${EMOJI.duplicate} *Duplicate Support!*\n${card.emoji} ${card.name} Limit Break naik ke LB${existing.limitBreak}\n`;
    } else {
      gachaData.supportFragments[card.id] = (gachaData.supportFragments[card.id] || 0) + 1;
      resultMsg = `${EMOJI.duplicate} *Duplicate Support!* (MLB)\n${card.emoji} ${card.name} Fragment +1\n`;
    }
  } else {
    gachaData.supportInventory.push({
      ...card,
      limitBreak: 0,
      pulledAt: Date.now(),
      level: 1,
      count: 1
    });
    resultMsg = `${EMOJI.new} *New Support Card!*\n${card.emoji} *${card.name}* [${card.rarity}]${supportMetaText(card)} [LB0]\n`;
  }

  if (isSupportSSR(card)) {
    gachaData.supportPity = 0;
  } else {
    gachaData.supportPity += 1;
  }

  gachaData.supportPulls += 1;
  gachaData.supportHistory.push({ card: card.id, time: Date.now(), count: 1 });
  setGacha(jid, gachaData);

  const caption =
    `*${EMOJI.support} 1x Support Gacha ${EMOJI.support}*\n` +
    (guaranteedSSR ? `\n${EMOJI.ssr} *Pity aktif: SSR guaranteed!*\n` : '') +
    resultMsg +
    `\n-${CARROT_PRICES.single} ${EMOJI.carrot}\n` +
    `Sisa: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
    `Total Pull: ${gachaData.supportPulls}\n` +
    `Pity: ${gachaData.supportPity}/${SUPPORT_PITY_THRESHOLD}`;

  const imageUrl = card.imageUrl || getSupportCardImageUrl(card.id);
  return sendWithImageFallback(sock, remoteJid, imageUrl, caption, msg);
}

async function handleSupportMulti(sock, remoteJid, jid, gachaData, msg) {
  if (typeof umaDb.getRandomSupportCard !== 'function' && typeof umaDb.getAllSupportCards !== 'function') {
    return sock.sendMessage(remoteJid, {
      text: `${EMOJI.warning} *Support API belum tersedia*\n\nUpdate package @fahri/uma-database ke versi terbaru dulu.`
    }, { quoted: msg });
  }

  const dataReady = await ensureSupportDataReady();
  if (!dataReady) {
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Data Support Card Belum Siap*\n\n` +
        `Data support card belum berhasil dimuat dari API.\n` +
        `Coba lagi dalam beberapa detik.`
    }, { quoted: msg });
  }

  if (gachaData.carrots < CARROT_PRICES.multi) {
    const need = CARROT_PRICES.multi - gachaData.carrots;
    return sock.sendMessage(remoteJid, {
      text:
        `${EMOJI.warning} *Carrots Tidak Cukup*\n\n` +
        `Butuh: ${formatCurrency(CARROT_PRICES.multi)} ${EMOJI.carrot}\n` +
        `Punya: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
        `Kurang: ${formatCurrency(need)} ${EMOJI.carrot}`
    }, { quoted: msg });
  }

  gachaData.carrots -= CARROT_PRICES.multi;
  let pullResults = '';
  const newCards = [];
  let pityTriggered = 0;

  for (let i = 0; i < 10; i++) {
    const guaranteedSSR = gachaData.supportPity >= SUPPORT_PITY_THRESHOLD - 1;
    const card = pullSupportCardByRate(guaranteedSSR, 'multi');
    if (!card) {
      return sock.sendMessage(remoteJid, {
        text: `${EMOJI.warning} *Pull Gagal*\n\nData support card tidak valid saat proses 10x.`
      }, { quoted: msg });
    }

    const existing = findOwnedItem(gachaData.supportInventory, card.id);

    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.limitBreak = Math.min(SUPPORT_MAX_LIMIT_BREAK, Number(existing.limitBreak) || 0);
      if (existing.limitBreak < SUPPORT_MAX_LIMIT_BREAK) {
        existing.limitBreak += 1;
        pullResults += `${i + 1}. ${card.emoji} ${card.name} [${card.rarity}]${guaranteedSSR ? ' [PITY]' : ''} (LB${existing.limitBreak})\n`;
      } else {
        gachaData.supportFragments[card.id] = (gachaData.supportFragments[card.id] || 0) + 1;
        pullResults += `${i + 1}. ${card.emoji} ${card.name} [${card.rarity}]${guaranteedSSR ? ' [PITY]' : ''} (Fragment)\n`;
      }
    } else {
      gachaData.supportInventory.push({
        ...card,
        limitBreak: 0,
        pulledAt: Date.now(),
        level: 1,
        count: 1
      });
      newCards.push(card);
      pullResults += `${i + 1}. ${card.emoji} *${card.name}* [${card.rarity}]${guaranteedSSR ? ' [PITY]' : ''}${supportMetaText(card)} [LB0]\n`;
    }

    if (guaranteedSSR) pityTriggered += 1;
    if (isSupportSSR(card)) gachaData.supportPity = 0;
    else gachaData.supportPity += 1;

    gachaData.supportHistory.push({ card: card.id, time: Date.now(), count: 1 });
  }

  gachaData.supportPulls += 10;
  setGacha(jid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*${EMOJI.support} 10x Support Gacha ${EMOJI.support}*\n\n` +
      pullResults +
      `\n-${CARROT_PRICES.multi} ${EMOJI.carrot}\n` +
      `Sisa: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
      `Total Pull: ${gachaData.supportPulls}\n` +
      `New Cards: ${newCards.length}\n` +
      `Pity Triggered: ${pityTriggered}x\n` +
      `Pity: ${gachaData.supportPity}/${SUPPORT_PITY_THRESHOLD}`
  }, { quoted: msg });
}

function handleInventory(sock, remoteJid, jid, gachaData, args, msg) {
  const cleanedInventory = sanitizeUmaInventory(gachaData.inventory);
  if (cleanedInventory.length !== gachaData.inventory.length) {
    gachaData.inventory = cleanedInventory;
    setGacha(jid, gachaData);
  }

  if (cleanedInventory.length === 0) {
    return sock.sendMessage(remoteJid, { text: `${EMOJI.inventory} Inventorimu kosong! Lakukan gacha dulu.` }, { quoted: msg });
  }

  const sorted = [...cleanedInventory].sort((a, b) => {
    const rankGap = rarityRank(UMA_RARITY_ORDER, a?.rarity) - rarityRank(UMA_RARITY_ORDER, b?.rarity);
    if (rankGap !== 0) return rankGap;
    return normText(a?.name).localeCompare(normText(b?.name));
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / UMA_INVENTORY_PAGE_SIZE));
  const requested = parsePageArg(args?.[0], 1);
  const page = Math.max(1, Math.min(requested, totalPages));
  const start = (page - 1) * UMA_INVENTORY_PAGE_SIZE;
  const slice = sorted.slice(start, start + UMA_INVENTORY_PAGE_SIZE);

  let inv =
    `*${EMOJI.inventory} Koleksi Umamu ${EMOJI.inventory}*\n` +
    `Page ${page}/${totalPages}\n\n`;
  slice.forEach((u, idx) => {
    const frag = gachaData.fragments[u.id] || 0;
    inv += `${start + idx + 1}. ${u.emoji} ${u.name} [${u.rarity}] Lv${u.level}${frag > 0 ? ` +${frag}P` : ''}\n`;
  });
  inv += `\n*${EMOJI.total} Total: ${cleanedInventory.length} unique umas*\n`;
  inv += `Ketik: !gacha inventory <page>`;
  return sock.sendMessage(remoteJid, { text: inv }, { quoted: msg });
}

function handleCleanup(sock, remoteJid, jid, gachaData, msg) {
  const beforeUma = Array.isArray(gachaData.inventory) ? gachaData.inventory.length : 0;
  const beforeSupport = Array.isArray(gachaData.supportInventory) ? gachaData.supportInventory.length : 0;
  const beforeFrag = Object.keys(gachaData.fragments || {}).length;
  const beforeSupportFrag = Object.keys(gachaData.supportFragments || {}).length;

  gachaData.inventory = sanitizeUmaInventory(gachaData.inventory);
  gachaData.supportInventory = sanitizeSupportInventory(gachaData.supportInventory);
  gachaData.fragments = Object.fromEntries(
    Object.entries(gachaData.fragments || {})
      .map(([k, v]) => [String(k), Math.max(0, Math.floor(Number(v) || 0))])
      .filter(([, v]) => v > 0)
  );
  gachaData.supportFragments = Object.fromEntries(
    Object.entries(gachaData.supportFragments || {})
      .map(([k, v]) => [String(k), Math.max(0, Math.floor(Number(v) || 0))])
      .filter(([, v]) => v > 0)
  );

  setGacha(jid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      '*Cleanup Gacha Selesai*\n' +
      `Uma inventory: ${beforeUma} -> ${gachaData.inventory.length}\n` +
      `Support inventory: ${beforeSupport} -> ${gachaData.supportInventory.length}\n` +
      `Uma piece slots: ${beforeFrag} -> ${Object.keys(gachaData.fragments).length}\n` +
      `Support fragment slots: ${beforeSupportFrag} -> ${Object.keys(gachaData.supportFragments).length}`
  }, { quoted: msg });
}

function handleSupportInventory(sock, remoteJid, jid, gachaData, args, msg) {
  const cleanedInventory = sanitizeSupportInventory(gachaData.supportInventory);
  if (cleanedInventory.length !== gachaData.supportInventory.length) {
    gachaData.supportInventory = cleanedInventory;
    setGacha(jid, gachaData);
  }

  if (cleanedInventory.length === 0) {
    return sock.sendMessage(remoteJid, { text: `${EMOJI.support} Inventory support card kosong! Pull dulu.` }, { quoted: msg });
  }

  const sorted = [...cleanedInventory].sort((a, b) => {
    const rankGap = rarityRank(SUPPORT_RARITY_ORDER, a?.rarity) - rarityRank(SUPPORT_RARITY_ORDER, b?.rarity);
    if (rankGap !== 0) return rankGap;
    return normText(a?.name).localeCompare(normText(b?.name));
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / SUPPORT_INVENTORY_PAGE_SIZE));
  const requested = parsePageArg(args?.[0], 1);
  const page = Math.max(1, Math.min(requested, totalPages));
  const start = (page - 1) * SUPPORT_INVENTORY_PAGE_SIZE;
  const slice = sorted.slice(start, start + SUPPORT_INVENTORY_PAGE_SIZE);

  let inv =
    `*${EMOJI.support} Koleksi Support Card ${EMOJI.support}*\n` +
    `Page ${page}/${totalPages}\n\n`;
  slice.forEach((c, idx) => {
    const frag = gachaData.supportFragments[c.id] || 0;
    const lb = Math.min(SUPPORT_MAX_LIMIT_BREAK, Number(c.limitBreak) || 0);
    inv += `${start + idx + 1}. ${c.emoji} ${c.name}${supportMetaText(c)} [${c.rarity}] Lv${c.level} LB${lb}${frag > 0 ? ` +${frag}F` : ''}\n`;
  });
  inv += `\n*${EMOJI.total} Total: ${cleanedInventory.length} unique support cards*\n`;
  inv += `Ketik: !gacha support inventory <page>`;
  return sock.sendMessage(remoteJid, { text: inv }, { quoted: msg });
}

function handleStats(sock, remoteJid, jid, gachaData, msg) {
  const cleanedInventory = sanitizeUmaInventory(gachaData.inventory);
  if (cleanedInventory.length !== gachaData.inventory.length) {
    gachaData.inventory = cleanedInventory;
    setGacha(jid, gachaData);
  }

  const totalPulls = gachaData.pulls;
  const totalUnique = cleanedInventory.length;
  const avgPerUma = totalUnique > 0 ? (totalPulls / totalUnique).toFixed(2) : '0.00';
  const totalFragments = Object.values(gachaData.fragments).reduce((a, b) => a + b, 0);

  return sock.sendMessage(remoteJid, {
    text:
      `*${EMOJI.stats} Statistik Gacha Uma ${EMOJI.stats}*\n\n` +
      `${EMOJI.carrot} Carrots Saat Ini: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
      `${EMOJI.gacha} Total Pulls: ${totalPulls}\n` +
      `${EMOJI.inventory} Unique Umas: ${totalUnique}\n` +
      `${EMOJI.stats} Avg Pull/Uma: ${avgPerUma}\n` +
      `${EMOJI.duplicate} Total Pieces: ${totalFragments}`
  }, { quoted: msg });
}

function handleSupportStats(sock, remoteJid, jid, gachaData, msg) {
  const cleanedInventory = sanitizeSupportInventory(gachaData.supportInventory);
  if (cleanedInventory.length !== gachaData.supportInventory.length) {
    gachaData.supportInventory = cleanedInventory;
    setGacha(jid, gachaData);
  }

  const totalPulls = gachaData.supportPulls;
  const totalUnique = cleanedInventory.length;
  const avgPerCard = totalUnique > 0 ? (totalPulls / totalUnique).toFixed(2) : '0.00';
  const totalFragments = Object.values(gachaData.supportFragments).reduce((a, b) => a + b, 0);

  return sock.sendMessage(remoteJid, {
    text:
      `*${EMOJI.stats} Statistik Support Gacha ${EMOJI.stats}*\n\n` +
      `${EMOJI.carrot} Carrots Saat Ini: ${formatCurrency(gachaData.carrots)} ${EMOJI.carrot}\n` +
      `${EMOJI.support} Total Pulls: ${totalPulls}\n` +
      `${EMOJI.inventory} Unique Support Cards: ${totalUnique}\n` +
      `${EMOJI.stats} Avg Pull/Card: ${avgPerCard}\n` +
      `${EMOJI.duplicate} Total Fragments: ${totalFragments}\n` +
      `${EMOJI.ssr} Pity Progress: ${gachaData.supportPity}/${SUPPORT_PITY_THRESHOLD}`
  }, { quoted: msg });
}

export default {
  name: 'gacha',
  aliases: ['gacha'],
  category: 'game',
  run: handle
};

