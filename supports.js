import {
  getSupportCards as fetchSupportCardsApi,
  getSupportCardById as fetchSupportCardByIdApi,
  getSupportCardsByCharacter as fetchSupportCardsByCharacterApi
} from "./umapyoiApi.js";

const rarityCodeToLabel = {
  1: "R",
  2: "SR",
  3: "SSR"
};

function toIsoDateFromUnix(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isInteger(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function mapSupportType(type) {
  const key = String(type || "").trim().toLowerCase();
  if (key === "speed") return "speed";
  if (key === "stamina") return "stamina";
  if (key === "power") return "power";
  if (key === "guts") return "guts";
  if (key === "wisdom") return "wisdom";
  if (key === "friend") return "friend";
  if (key === "group") return "group";
  return key || "unknown";
}

function mapApiSupportToSupportCard(item) {
  const supportId = Number(item?.id);
  const charId = Number(item?.chara_id);
  const rarity = Number(item?.rarity);
  const startDateUnix = Number(item?.start_date);

  return {
    title: item?.title_en || item?.title || null,
    urlName: item?.gametora || null,
    url_name: item?.gametora || null,
    profileUrlName: null,
    profile_url_name: null,
    tid: null,
    supportId,
    support_id: supportId,
    charId,
    char_id: charId,
    charName: null,
    char_name: null,
    nameJp: null,
    name_jp: null,
    nameKo: null,
    name_ko: null,
    nameTw: null,
    name_tw: null,
    rarity,
    rarityString: item?.rarity_string || rarityCodeToLabel[rarity] || "Unknown",
    type: mapSupportType(item?.type),
    obtained: "unknown",
    release: toIsoDateFromUnix(startDateUnix),
    startDateUnix: Number.isInteger(startDateUnix) ? startDateUnix : null,
    effects: [],
    hints: {
      hint_skills: [],
      hint_others: []
    },
    eventSkills: [],
    event_skills: [],
    unique: null,
    events: {},
    isLevelDependent: false,
    isLevelDependand: false,
    source: "umapyoi",
    isPartial: true
  };
}

function toReleaseTime(card) {
  const parsed = Date.parse(card?.release || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeType(type) {
  return String(type || "").trim().toLowerCase();
}

export const supportCardDatabase = [];

export const supportCardStats = {
  total: 0,
  r: 0,
  sr: 0,
  ssr: 0
};

function refreshSupportStats() {
  supportCardStats.total = supportCardDatabase.length;
  supportCardStats.r = supportCardDatabase.filter((card) => card.rarity === 1).length;
  supportCardStats.sr = supportCardDatabase.filter((card) => card.rarity === 2).length;
  supportCardStats.ssr = supportCardDatabase.filter((card) => card.rarity === 3).length;
}

export async function refreshSupportCardDatabase(options = {}) {
  const rows = await fetchSupportCardsApi(options);
  const mapped = Array.isArray(rows) ? rows.map(mapApiSupportToSupportCard) : [];

  supportCardDatabase.length = 0;
  supportCardDatabase.push(...mapped);
  refreshSupportStats();

  return supportCardDatabase;
}

export function getAllSupportCards() {
  return supportCardDatabase;
}

export function getRandomSupportCard() {
  if (!supportCardDatabase.length) return null;
  return supportCardDatabase[Math.floor(Math.random() * supportCardDatabase.length)];
}

export function getSupportCardById(supportId) {
  const id = Number(supportId);
  return supportCardDatabase.find((card) => card.supportId === id) || null;
}

export function getSupportCardByUrlName(urlName) {
  const key = String(urlName || "").trim().toLowerCase();
  return (
    supportCardDatabase.find((card) => String(card.urlName || "").toLowerCase() === key) || null
  );
}

export function getSupportCardsByType(type) {
  const key = normalizeType(type);
  return supportCardDatabase.filter((card) => normalizeType(card.type) === key);
}

export function getSupportCardsByCharacter(query) {
  if (query === undefined || query === null) return [];

  const numericQuery = Number(query);
  if (Number.isInteger(numericQuery) && numericQuery > 0) {
    return supportCardDatabase.filter((card) => card.charId === numericQuery);
  }

  const key = String(query).trim().toLowerCase();
  return supportCardDatabase.filter((card) => {
    return (
      String(card.charName || "").toLowerCase().includes(key) ||
      String(card.profileUrlName || "").toLowerCase().includes(key) ||
      String(card.urlName || "").toLowerCase().includes(key)
    );
  });
}

export function getLatestSupportCards(limit = 5) {
  const n = Math.max(0, Number(limit) || 0);
  return [...supportCardDatabase]
    .sort((a, b) => toReleaseTime(b) - toReleaseTime(a))
    .slice(0, n);
}

export function getRarityLabel(rarityCode) {
  return rarityCodeToLabel[Number(rarityCode)] || "Unknown";
}

export async function getAllSupportCardsFromApi(options = {}) {
  const rows = await fetchSupportCardsApi(options);
  return Array.isArray(rows) ? rows.map(mapApiSupportToSupportCard) : [];
}

export async function getSupportCardByIdFromApi(supportId, options = {}) {
  const detail = await fetchSupportCardByIdApi(supportId, options);
  if (!detail || typeof detail !== "object") return null;
  return mapApiSupportToSupportCard(detail);
}

export async function getSupportCardsByCharacterFromApi(charaId, options = {}) {
  const rows = await fetchSupportCardsByCharacterApi(charaId, options);
  return Array.isArray(rows) ? rows.map(mapApiSupportToSupportCard) : [];
}

refreshSupportCardDatabase().catch(() => {
  // Keep module usable even when API is unreachable at startup.
});
