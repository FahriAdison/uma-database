import {
  getCharacterList as fetchCharacterListApi,
  getCharacterById as fetchCharacterByIdApi,
  getCharacterInfoList as fetchCharacterInfoListApi,
  getOutfitList as fetchOutfitListApi
} from "./umapyoiApi.js";

function mapApiCharacterToUma(character, meta = {}) {
  const apiId = Number(character?.id);
  const gameId = Number(character?.game_id ?? character?.chara_game_id);

  return {
    id:
      character?.name_en_internal ||
      character?.preferred_url ||
      `chara_${Number.isInteger(gameId) ? gameId : apiId || "unknown"}`,
    name: character?.name_en || character?.name_jp || "Unknown",
    rarity: "A",
    emoji: "\u2B50",
    apiId: Number.isInteger(apiId) ? apiId : null,
    charaId: Number.isInteger(gameId) ? gameId : null,
    nameJp: character?.name_jp || null,
    preferredUrl: character?.preferred_url || null,
    categoryValue: character?.category_value || null,
    playable: !!meta.playable,
    source: "umapyoi"
  };
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function buildOutfitSet(rows) {
  const set = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const gameId = toInt(row?.chara_game_id);
    if (gameId && gameId > 0) set.add(gameId);
  }
  return set;
}

function isUmaCategory(row) {
  const en = String(row?.category_label_en || "").trim().toLowerCase();
  if (en === "umamusume") return true;
  return String(row?.category_value || "") === "\u30a6\u30de\u5a18";
}

function toPlayableRows(infoRows, listRows, outfitSet) {
  const byGameId = new Map();
  const byPreferred = new Map();

  for (const row of Array.isArray(listRows) ? listRows : []) {
    const gameId = toInt(row?.game_id);
    if (gameId) byGameId.set(gameId, row);
    const preferred = String(row?.preferred_url || "").trim().toLowerCase();
    if (preferred) byPreferred.set(preferred, row);
  }

  const out = [];
  for (const row of Array.isArray(infoRows) ? infoRows : []) {
    if (!isUmaCategory(row)) continue;
    const gameId = toInt(row?.game_id);
    if (!gameId || !outfitSet.has(gameId)) continue;

    const preferred = String(row?.preferred_url || "").trim().toLowerCase();
    const enrich = byGameId.get(gameId) || byPreferred.get(preferred) || {};
    out.push({
      ...row,
      ...enrich,
      game_id: gameId
    });
  }

  return out;
}

function resetStats(stats, list) {
  stats.total = list.length;
  stats.ss = list.filter((u) => u.rarity === "SS").length;
  stats.s = list.filter((u) => u.rarity === "S").length;
  stats.a = list.filter((u) => u.rarity === "A").length;
}

export const umaDatabase = [];

export const umaRarityStats = {
  total: 0,
  ss: 0,
  s: 0,
  a: 0
};

export async function refreshUmaDatabase(options = {}) {
  const [infoRows, listRows, outfitRows] = await Promise.all([
    fetchCharacterInfoListApi(options).catch(() => []),
    fetchCharacterListApi(options).catch(() => []),
    fetchOutfitListApi(options).catch(() => [])
  ]);

  const outfitSet = buildOutfitSet(outfitRows);
  const playableRows = toPlayableRows(infoRows, listRows, outfitSet);
  const fallbackRows = Array.isArray(listRows)
    ? listRows.filter((row) => isUmaCategory(row))
    : [];
  const selectedRows = playableRows.length ? playableRows : fallbackRows;
  const mapped = selectedRows.map((row) => mapApiCharacterToUma(row, { playable: playableRows.length > 0 }));

  umaDatabase.length = 0;
  umaDatabase.push(...mapped);
  resetStats(umaRarityStats, umaDatabase);

  return umaDatabase;
}

export function getRandomUma() {
  if (!umaDatabase.length) return null;
  return umaDatabase[Math.floor(Math.random() * umaDatabase.length)];
}

export function getSSRarityUmas() {
  return umaDatabase.filter((u) => u.rarity === "SS");
}

export function getUmaById(id) {
  const key = String(id || "").trim().toLowerCase();
  return (
    umaDatabase.find((u) => {
      return (
        String(u.id).toLowerCase() === key ||
        String(u.apiId || "").toLowerCase() === key ||
        String(u.charaId || "").toLowerCase() === key
      );
    }) || null
  );
}

export function getAllUmas() {
  return umaDatabase;
}

export async function getAllUmasFromApi(options = {}) {
  const [infoRows, listRows, outfitRows] = await Promise.all([
    fetchCharacterInfoListApi(options).catch(() => []),
    fetchCharacterListApi(options).catch(() => []),
    fetchOutfitListApi(options).catch(() => [])
  ]);

  const outfitSet = buildOutfitSet(outfitRows);
  const playableRows = toPlayableRows(infoRows, listRows, outfitSet);
  const fallbackRows = Array.isArray(listRows)
    ? listRows.filter((row) => isUmaCategory(row))
    : [];
  const selectedRows = playableRows.length ? playableRows : fallbackRows;
  return selectedRows.map((row) => mapApiCharacterToUma(row, { playable: playableRows.length > 0 }));
}

export async function getUmaByIdFromApi(charaId, options = {}) {
  const numericId = Number(charaId);
  if (Number.isInteger(numericId) && numericId > 0) {
    const detail = await fetchCharacterByIdApi(numericId, options);
    if (detail && typeof detail === "object") {
      const gameId = toInt(detail?.game_id);
      if (isUmaCategory(detail) && gameId && gameId > 0) {
        const outfits = await fetchOutfitListApi(options).catch(() => []);
        const outfitSet = buildOutfitSet(outfits);
        if (outfitSet.has(gameId)) return mapApiCharacterToUma(detail, { playable: true });
      }
    }
  }

  const list = await getAllUmasFromApi(options);
  const key = String(charaId || "").trim().toLowerCase();

  return (
    list.find((u) => {
      return (
        String(u.id).toLowerCase() === key ||
        String(u.apiId || "").toLowerCase() === key ||
        String(u.charaId || "").toLowerCase() === key
      );
    }) || null
  );
}

export async function getRandomUmaFromApi(options = {}) {
  const list = await getAllUmasFromApi(options);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

refreshUmaDatabase().catch(() => {
  // Keep module usable even when API is unreachable at startup.
});
