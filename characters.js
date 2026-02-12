import {
  getCharacterList as fetchCharacterListApi,
  getCharacterById as fetchCharacterByIdApi
} from "./umapyoiApi.js";

function mapApiCharacterToUma(character) {
  const apiId = Number(character?.id);
  const gameId = Number(character?.game_id);

  return {
    id:
      character?.name_en_internal ||
      character?.preferred_url ||
      `chara_${Number.isInteger(gameId) ? gameId : apiId || "unknown"}`,
    name: character?.name_en || character?.name_jp || "Unknown",
    rarity: "A",
    emoji: "⭐⭐⭐",
    apiId: Number.isInteger(apiId) ? apiId : null,
    charaId: Number.isInteger(gameId) ? gameId : null,
    nameJp: character?.name_jp || null,
    preferredUrl: character?.preferred_url || null,
    source: "umapyoi"
  };
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
  const rows = await fetchCharacterListApi(options);
  const mapped = Array.isArray(rows) ? rows.map(mapApiCharacterToUma) : [];

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
  const rows = await fetchCharacterListApi(options);
  return Array.isArray(rows) ? rows.map(mapApiCharacterToUma) : [];
}

export async function getUmaByIdFromApi(charaId, options = {}) {
  const numericId = Number(charaId);
  if (Number.isInteger(numericId) && numericId > 0) {
    const detail = await fetchCharacterByIdApi(numericId, options);
    if (detail && typeof detail === "object") {
      return mapApiCharacterToUma(detail);
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
