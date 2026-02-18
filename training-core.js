import fetch from 'node-fetch';

let getGacha = () => ({ carrots: 0, inventory: [], supportInventory: [] });
let setGacha = () => {};
let umaDb = {};

export function configureTrainingCore(config = {}) {
  if (typeof config.getGacha === 'function') getGacha = config.getGacha;
  if (typeof config.setGacha === 'function') setGacha = config.setGacha;
  if (config.umaDb && typeof config.umaDb === 'object') umaDb = config.umaDb;
}

const MAX_DECK = 6;
const MAX_TURN = 72;
const GOAL_TURNS = [12, 24, 36, 48, 60, 72];
const TRAINING_SCENARIO = 'URA Finale';

const STYLE_LABEL = {
  1: 'Runner',
  2: 'Leader',
  3: 'Betweener',
  4: 'Chaser'
};
const MOOD_ORDER = ['awful', 'bad', 'normal', 'good', 'great'];
const MOOD_LABEL = {
  awful: 'Awful',
  bad: 'Bad',
  normal: 'Normal',
  good: 'Good',
  great: 'Great'
};
const MOOD_TRAINING_MULT = {
  awful: 0.8,
  bad: 0.9,
  normal: 1,
  good: 1.08,
  great: 1.15
};
const MOOD_RACE_MULT = {
  awful: 0.85,
  bad: 0.93,
  normal: 1,
  good: 1.06,
  great: 1.12
};
const SKILL_CATALOG = [
  { id: 'concentration', name: 'Concentration', cost: 90, power: 12 },
  { id: 'cornering', name: 'Cornering Sense', cost: 110, power: 16 },
  { id: 'straightaway', name: 'Straightaway Adept', cost: 110, power: 16 },
  { id: 'good_position', name: 'Good Position', cost: 140, power: 20 },
  { id: 'sprint_gear', name: 'Sprint Gear', cost: 180, power: 26 },
  { id: 'stamina_keeper', name: 'Stamina Keeper', cost: 180, power: 24 }
];

const TRACK_POOL = ['Turf', 'Dirt'];
const DIST_POOL = ['Sprint', 'Mile', 'Medium', 'Long'];
const APT_MULTIPLIER = { S: 1.12, A: 1, B: 0.9, C: 0.8, D: 0.7, E: 0.6, F: 0.5, G: 0.4 };
let characterInfoCache = null;
const supportTrainingMetaCache = new Map();
const characterEventPoolCache = new Map();
const supportEventPoolCache = new Map();

const CONDITION_META = {
  lazy_habit: {
    name: 'Lazy Habit',
    type: 'blue',
    trainMult: 0.9,
    failRateUp: 0.08
  },
  headache: {
    name: 'Headache',
    type: 'blue',
    trainMult: 0.94,
    failRateUp: 0.06
  },
  overweight: {
    name: 'Overweight',
    type: 'blue',
    racePowerMult: 0.92,
    speedMult: 0.94,
    powerMult: 0.94
  },
  sharp: {
    name: 'Sharp',
    type: 'gold',
    trainMult: 1.06,
    racePowerMult: 1.05
  },
  rising_star: {
    name: 'Rising Star',
    type: 'gold',
    trainMult: 1.04,
    racePowerMult: 1.04,
    skillPointMult: 1.2
  }
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMoodTrainingMultiplier(mood) {
  return MOOD_TRAINING_MULT[String(mood || 'normal').toLowerCase()] || 1;
}

function getMoodRaceMultiplier(mood) {
  return MOOD_RACE_MULT[String(mood || 'normal').toLowerCase()] || 1;
}

function shiftMood(current, delta) {
  const idx = MOOD_ORDER.indexOf(String(current || 'normal').toLowerCase());
  const base = idx >= 0 ? idx : 2;
  const next = clamp(base + delta, 0, MOOD_ORDER.length - 1);
  return MOOD_ORDER[next];
}

function ensureConditionState(run) {
  if (!Array.isArray(run.conditions)) run.conditions = [];
}

function hasCondition(run, key) {
  ensureConditionState(run);
  return run.conditions.includes(key);
}

function addCondition(run, key) {
  if (!CONDITION_META[key]) return false;
  ensureConditionState(run);
  if (run.conditions.includes(key)) return false;
  run.conditions.push(key);
  return true;
}

function removeCondition(run, key) {
  ensureConditionState(run);
  const before = run.conditions.length;
  run.conditions = run.conditions.filter((c) => c !== key);
  return run.conditions.length !== before;
}

function listConditionText(run) {
  ensureConditionState(run);
  if (!run.conditions.length) return '-';
  return run.conditions.map((c) => CONDITION_META[c]?.name || c).join(', ');
}

function getConditionTrainingMultiplier(run) {
  ensureConditionState(run);
  return run.conditions.reduce((acc, key) => acc * (CONDITION_META[key]?.trainMult || 1), 1);
}

function getConditionRaceMultiplier(run) {
  ensureConditionState(run);
  return run.conditions.reduce((acc, key) => acc * (CONDITION_META[key]?.racePowerMult || 1), 1);
}

function getConditionFailRateUp(run) {
  ensureConditionState(run);
  return run.conditions.reduce((acc, key) => acc + (CONDITION_META[key]?.failRateUp || 0), 0);
}

function getConditionStatMultiplier(run, statKey) {
  ensureConditionState(run);
  const mapKey = `${statKey}Mult`;
  return run.conditions.reduce((acc, key) => acc * (CONDITION_META[key]?.[mapKey] || 1), 1);
}

function getConditionSkillPointMultiplier(run) {
  ensureConditionState(run);
  return run.conditions.reduce((acc, key) => acc * (CONDITION_META[key]?.skillPointMult || 1), 1);
}

function clampLb(lb) {
  const n = Number(lb);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(4, Math.floor(n));
}

function rarityFactor(rarity) {
  const key = String(rarity || '').toUpperCase();
  if (key === 'SSR') return 1.4;
  if (key === 'SR') return 1.15;
  return 1;
}

function buildDefaultDeckBonus() {
  return {
    speed: 0,
    stamina: 0,
    power: 0,
    guts: 0,
    wisdom: 0,
    friend: 0,
    group: 0,
    trainingEffect: 0,
    friendshipBonus: 0,
    hintRateBonus: 0,
    hintLevelBonus: 0,
    failureRateDown: 0,
    energySave: 0
  };
}

function extractSupportEffectScore(effects, uniqueEffects) {
  let score = 0;

  if (Array.isArray(effects)) {
    for (const row of effects) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const vals = row
        .slice(1)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (vals.length) score += Math.max(...vals);
    }
  }

  if (Array.isArray(uniqueEffects)) {
    for (const eff of uniqueEffects) {
      const val = Number(eff?.value);
      if (Number.isFinite(val) && val > 0) score += val;
    }
  }

  return score;
}

async function fetchSupportTrainingMeta(card) {
  const supportId = Number(card?.id);
  if (!Number.isInteger(supportId) || supportId <= 0) return null;
  if (supportTrainingMetaCache.has(supportId)) return supportTrainingMetaCache.get(supportId);

  let gametora = typeof card?.gametora === 'string' ? card.gametora : null;
  try {
    if (!gametora) {
      const detail = await (await fetch(`https://umapyoi.net/api/v1/support/${supportId}`)).json();
      gametora = typeof detail?.gametora === 'string' ? detail.gametora : null;
    }
  } catch (_) {}

  if (!gametora) {
    supportTrainingMetaCache.set(supportId, null);
    return null;
  }

  try {
    const html = await (await fetch(`https://gametora.com/umamusume/supports/${gametora}`)).text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) {
      supportTrainingMetaCache.set(supportId, null);
      return null;
    }
    const data = JSON.parse(m[1]);
    const itemData = data?.props?.pageProps?.itemData;
    const effectScore = extractSupportEffectScore(itemData?.effects, itemData?.unique?.effects);
    const hintSkillCount = Array.isArray(itemData?.hints?.hint_skills) ? itemData.hints.hint_skills.length : 0;
    const hintOtherCount = Array.isArray(itemData?.hints?.hint_others) ? itemData.hints.hint_others.length : 0;
    const meta = {
      effectScore,
      hintCount: hintSkillCount + hintOtherCount
    };
    supportTrainingMetaCache.set(supportId, meta);
    return meta;
  } catch (_) {
    supportTrainingMetaCache.set(supportId, null);
    return null;
  }
}

async function bonusByDeck(deckCards) {
  const out = buildDefaultDeckBonus();

  for (const c of deckCards) {
    const t = norm(c?.type);
    const lb = clampLb(c?.limitBreak ?? c?.lb);
    const rf = rarityFactor(c?.rarity);
    const lbFactor = 1 + lb * 0.18;
    const statInc = rf * lbFactor;

    if (t && out[t] !== undefined) out[t] += statInc;

    const meta = await fetchSupportTrainingMeta(c);
    const effectScore = Number(meta?.effectScore) || 0;
    const hintCount = Number(meta?.hintCount) || 0;
    const effectScaled = effectScore / 160;

    out.trainingEffect += (2.5 + effectScaled) * rf * (1 + lb * 0.1);
    out.friendshipBonus += ((t === 'friend' || t === 'group') ? 5 : 2) * rf * (1 + lb * 0.12);
    out.hintRateBonus += (hintCount * 0.6 + lb * 2.2) * rf;
    out.hintLevelBonus += Math.floor(lb / 2);
    out.failureRateDown += ((t === 'wisdom' ? 1.8 : 0.8) + lb * 0.7 + effectScaled * 0.25) * rf;
    out.energySave += ((t === 'friend' ? 2.4 : 0.9) + lb * 0.45) * rf;
  }

  return out;
}

function findOwnedUmaByQuery(inventory, query) {
  const q = norm(query);
  if (!q) return null;

  const byId = inventory.find((u) => String(u.id) === q || String(u.charaId || u.chara_id || '') === q);
  if (byId) return byId;

  return inventory.find((u) => norm(u.name).includes(q));
}

async function resolveUmaIdentity(ownedUma) {
  const direct = Number(ownedUma?.charaId || ownedUma?.chara_id);
  if (Number.isInteger(direct) && direct > 0) return { charaId: direct, source: ownedUma };

  if (typeof umaDb.getAllUmas !== 'function') return { charaId: null, source: ownedUma };

  let all = umaDb.getAllUmas();
  if ((!Array.isArray(all) || all.length === 0) && typeof umaDb.refreshUmaDatabase === 'function') {
    try {
      await umaDb.refreshUmaDatabase();
    } catch (_) {}
    all = umaDb.getAllUmas();
  }

  if (Array.isArray(all) && all.length > 0) {
    const keyName = norm(ownedUma?.name);
    const keyId = norm(ownedUma?.id);
    const hit =
      all.find((u) => norm(u?.name) === keyName || norm(u?.id) === keyId) ||
      all.find((u) => norm(u?.name).includes(keyName) || keyName.includes(norm(u?.name))) ||
      all.find((u) => norm(u?.id).includes(keyId) || keyId.includes(norm(u?.id)));

    const mapped = Number(hit?.charaId);
    if (Number.isInteger(mapped) && mapped > 0) return { charaId: mapped, source: hit };
  }

  const byInfo = await findCharacterInfoByOwnedUma(ownedUma);
  const infoCharaId = Number(byInfo?.game_id);
  if (Number.isInteger(infoCharaId) && infoCharaId > 0) {
    return { charaId: infoCharaId, source: byInfo };
  }

  return { charaId: null, source: ownedUma };
}

async function getCharacterInfoCache() {
  if (Array.isArray(characterInfoCache) && characterInfoCache.length > 0) return characterInfoCache;
  try {
    const res = await fetch('https://umapyoi.net/api/v1/character/info');
    if (!res.ok) return [];
    const rows = await res.json();
    if (Array.isArray(rows)) {
      characterInfoCache = rows;
      return rows;
    }
  } catch (_) {}
  return [];
}

async function findCharacterInfoByOwnedUma(ownedUma) {
  const rows = await getCharacterInfoCache();
  if (!rows.length) return null;

  const keyName = norm(ownedUma?.name);
  const keyId = norm(ownedUma?.id);

  return (
    rows.find((r) => norm(r?.name_en) === keyName || norm(r?.name_jp) === keyName || norm(r?.preferred_url) === keyId) ||
    rows.find((r) => keyName.includes(norm(r?.name_en)) || norm(r?.name_en).includes(keyName)) ||
    rows.find((r) => keyId.includes(norm(r?.preferred_url)) || norm(r?.preferred_url).includes(keyId)) ||
    null
  );
}

function findOwnedSupportByQuery(inventory, query) {
  const q = norm(query);
  if (!q) return null;
  const byId = inventory.find((c) => String(c.id) === q);
  if (byId) return byId;
  return inventory.find((c) => norm(c.name).includes(q));
}

function parseEventDataLocale(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeEventEntries(entries, source, category) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && e.n && Array.isArray(e.c))
    .map((e) => ({
      source,
      category,
      title: String(e.n),
      choices: e.c
        .filter((c) => c && Array.isArray(c.r))
        .map((c, idx) => ({
          index: idx,
          text: String(c.o || `Choice ${idx + 1}`),
          effects: c.r
        }))
        .filter((c) => c.effects.length > 0)
    }))
    .filter((e) => e.choices.length > 0);
}

function parseCharacterEventPool(eventData) {
  const data = parseEventDataLocale(eventData?.en || eventData?.ja || eventData?.ko || eventData?.zh_tw);
  if (!data || typeof data !== 'object') {
    return { normal: [], outing: [], secret: [] };
  }

  const normal = [
    ...normalizeEventEntries(data.wchoice, 'uma', 'wchoice'),
    ...normalizeEventEntries(data.nochoice, 'uma', 'nochoice'),
    ...normalizeEventEntries(data.version, 'uma', 'version')
  ];
  const outing = normalizeEventEntries(data.outings, 'uma', 'outing');
  const secret = normalizeEventEntries(data.secret, 'uma', 'secret');

  return { normal, outing, secret };
}

function parseSupportEventPool(eventData) {
  const data = parseEventDataLocale(eventData?.en || eventData?.ja || eventData?.ko || eventData?.zh_tw);
  if (!data || typeof data !== 'object') return [];
  return [
    ...normalizeEventEntries(data.random, 'support', 'random'),
    ...normalizeEventEntries(data.arrows, 'support', 'chain')
  ];
}

async function fetchCharacterEventPoolByGametora(gametoraPath) {
  const slug = String(gametoraPath || '').trim();
  if (!slug) return { normal: [], outing: [], secret: [] };
  if (characterEventPoolCache.has(slug)) return characterEventPoolCache.get(slug);

  try {
    const html = await (await fetch(`https://gametora.com/umamusume/characters/${slug}`)).text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) {
      const empty = { normal: [], outing: [], secret: [] };
      characterEventPoolCache.set(slug, empty);
      return empty;
    }
    const json = JSON.parse(m[1]);
    const eventData = json?.props?.pageProps?.eventData;
    const pool = parseCharacterEventPool(eventData);
    characterEventPoolCache.set(slug, pool);
    return pool;
  } catch (_) {
    const empty = { normal: [], outing: [], secret: [] };
    characterEventPoolCache.set(slug, empty);
    return empty;
  }
}

async function fetchSupportEventPoolByGametora(gametoraPath) {
  const slug = String(gametoraPath || '').trim();
  if (!slug) return [];
  if (supportEventPoolCache.has(slug)) return supportEventPoolCache.get(slug);

  try {
    const html = await (await fetch(`https://gametora.com/umamusume/supports/${slug}`)).text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) {
      supportEventPoolCache.set(slug, []);
      return [];
    }
    const json = JSON.parse(m[1]);
    const eventData = json?.props?.pageProps?.eventData;
    const pool = parseSupportEventPool(eventData);
    supportEventPoolCache.set(slug, pool);
    return pool;
  } catch (_) {
    supportEventPoolCache.set(slug, []);
    return [];
  }
}

function pickRandomEventChoice(event) {
  const choices = Array.isArray(event?.choices) ? event.choices : [];
  if (!choices.length) return null;
  return pick(choices);
}

function applyEventEffects(run, effects) {
  const appliedLines = [];
  for (const eff of effects) {
    const t = String(eff?.t || '').toLowerCase();
    const v = Number(eff?.v);

    if (t === 'sp' && Number.isFinite(v)) {
      run.stats.speed += Math.round(v);
      appliedLines.push(`SPD ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (t === 'st' && Number.isFinite(v)) {
      run.stats.stamina += Math.round(v);
      appliedLines.push(`STA ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (t === 'po' && Number.isFinite(v)) {
      run.stats.power += Math.round(v);
      appliedLines.push(`POW ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (t === 'gu' && Number.isFinite(v)) {
      run.stats.guts += Math.round(v);
      appliedLines.push(`GUT ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (t === 'in' && Number.isFinite(v)) {
      run.stats.wisdom += Math.round(v);
      appliedLines.push(`WIT ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (t === 'en' && Number.isFinite(v)) {
      run.energy = clamp(run.energy + Math.round(v), 0, 100);
      appliedLines.push(`Energy ${v >= 0 ? '+' : ''}${Math.round(v)}`);
    } else if (t === 'mo' && Number.isFinite(v)) {
      const prev = run.mood;
      run.mood = shiftMood(run.mood, Math.round(v));
      if (prev !== run.mood) appliedLines.push(`Mood ${MOOD_LABEL[prev]} -> ${MOOD_LABEL[run.mood]}`);
    } else if (t === 'pt' && Number.isFinite(v)) {
      const scaled = Math.max(1, Math.round(v * getConditionSkillPointMultiplier(run)));
      run.skillPoints = Number(run.skillPoints || 0) + scaled;
      appliedLines.push(`Skill Pt +${scaled}`);
    } else if (t === 'sk') {
      const hintPt = Number.isFinite(v) ? Math.max(1, Math.round(v * 18)) : 15;
      run.skillPoints = Number(run.skillPoints || 0) + hintPt;
      appliedLines.push(`Skill Hint +${hintPt} Pt`);
    } else if (t === 'bo' && Number.isFinite(v)) {
      const bonusPt = Math.max(1, Math.round(v * 2));
      run.skillPoints = Number(run.skillPoints || 0) + bonusPt;
      appliedLines.push(`Bond bonus +${bonusPt} Pt`);
    }
  }
  return appliedLines;
}

async function fetchOutfitsByCharaId(charaId) {
  const id = Number(charaId);
  if (!Number.isInteger(id) || id <= 0) return [];
  try {
    const res = await fetch(`https://umapyoi.net/api/v1/outfit/character/${id}`);
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

function chooseOutfit(outfits) {
  if (!Array.isArray(outfits) || outfits.length === 0) return null;
  const withEn = outfits.filter((o) => o && o.title_en);
  if (withEn.length) return pick(withEn);
  return pick(outfits);
}

function chooseStableOutfit(outfits) {
  if (!Array.isArray(outfits) || outfits.length === 0) return null;
  const withEn = outfits.filter((o) => o && o.title_en);
  if (withEn.length) return withEn[0];
  return outfits[0];
}

function mapDistanceLabel(meter) {
  const m = Number(meter);
  if (!Number.isFinite(m)) return pick(DIST_POOL);
  if (m <= 1400) return 'Sprint';
  if (m <= 1800) return 'Mile';
  if (m <= 2400) return 'Medium';
  return 'Long';
}

function mapTrackLabel(race) {
  const terrain = Number(race?.terrain);
  if (terrain === 2) return 'Dirt';
  return 'Turf';
}

function parseAptitudes(aptitudeRaw) {
  if (!Array.isArray(aptitudeRaw) || aptitudeRaw.length < 10) return null;
  return {
    track: { Turf: String(aptitudeRaw[0] || 'A'), Dirt: String(aptitudeRaw[1] || 'G') },
    distance: {
      Sprint: String(aptitudeRaw[2] || 'A'),
      Mile: String(aptitudeRaw[3] || 'A'),
      Medium: String(aptitudeRaw[4] || 'A'),
      Long: String(aptitudeRaw[5] || 'A')
    },
    style: {
      Runner: String(aptitudeRaw[6] || 'A'),
      Leader: String(aptitudeRaw[7] || 'A'),
      Betweener: String(aptitudeRaw[8] || 'A'),
      Chaser: String(aptitudeRaw[9] || 'A')
    }
  };
}

function getAptMultiplier(letter) {
  const key = String(letter || 'A').toUpperCase().trim();
  return APT_MULTIPLIER[key] || 1;
}

async function fetchGametoaPageData(gametoraPath) {
  const slug = String(gametoraPath || '').trim();
  if (!slug) return { objectives: [], aptitudes: null };

  try {
    const res = await fetch(`https://gametora.com/umamusume/characters/${slug}`);
    if (!res.ok) return { objectives: [], aptitudes: null };
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return { objectives: [], aptitudes: null };
    const data = JSON.parse(match[1]);
    const rows = data?.props?.pageProps?.objectiveData;
    const objectives = Array.isArray(rows) ? rows : [];
    const aptitudes = parseAptitudes(data?.props?.pageProps?.itemData?.aptitude);
    return { objectives, aptitudes };
  } catch (_) {
    return { objectives: [], aptitudes: null };
  }
}

async function buildGoalsFromObjectiveData(styleNum, gametoraPath) {
  const { objectives, aptitudes } = await fetchGametoaPageData(gametoraPath);
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return { goals: buildGoals(styleNum), source: 'simulated', aptitudes };
  }

  const realGoals = objectives
    .map((o) => {
      const firstRace = Array.isArray(o?.races) && o.races.length ? o.races[0] : null;
      const condType = Number(o?.cond_type);
      const condValue = Number(o?.cond_value);
      const isFanGoal = !firstRace && condType === 3 && Number.isFinite(condValue) && condValue > 0;
      const isParticipationGoal = !!firstRace && (condType === 1 || !Number.isFinite(condValue) || condValue <= 0);
      const rankNeed = isParticipationGoal ? 18 : (Number.isFinite(condValue) && condValue > 0 ? condValue : 5);
      const raceName = firstRace?.name_en || firstRace?.name_jp || 'Target Race';
      const noFailOnLose = isParticipationGoal || /debut/i.test(String(raceName || ''));
      return {
        turn: Number(o?.turn) || 0,
        goalType: isFanGoal ? 'fans' : 'race',
        track: firstRace ? mapTrackLabel(firstRace) : null,
        distance: firstRace ? mapDistanceLabel(firstRace?.distance) : null,
        rankNeed: isFanGoal ? null : clamp(rankNeed, 1, 18),
        fansRequired: isFanGoal ? Math.max(0, Math.floor(condValue)) : null,
        fansGained: Number(firstRace?.fans_gained) || 0,
        fansNeededToEnter: Number(firstRace?.fans_needed) || 0,
        noFailOnLose,
        style: STYLE_LABEL[styleNum] || 'Leader',
        raceName
      };
    })
    .filter((g) => Number.isFinite(g.turn) && g.turn > 0 && g.turn <= MAX_TURN)
    .sort((a, b) => a.turn - b.turn);

  if (!realGoals.length) {
    return { goals: buildGoals(styleNum), source: 'simulated', aptitudes };
  }

  return { goals: realGoals, source: 'gametora', aptitudes };
}

function buildGoals(styleNum) {
  const style = STYLE_LABEL[styleNum] || 'Leader';
  return GOAL_TURNS.map((turn, i) => ({
    turn,
    goalType: 'race',
    track: i % 2 === 0 ? 'Turf' : pick(TRACK_POOL),
    distance: i >= 4 ? pick(['Medium', 'Long']) : pick(DIST_POOL),
    rankNeed: i < 2 ? 5 : i < 4 ? 3 : 1,
    fansRequired: null,
    fansGained: 350 + i * 80,
    fansNeededToEnter: 0,
    noFailOnLose: i === 0,
    style
  }));
}

function calcFansGain(baseFans, rank, isGoalRace = false) {
  const base = Math.max(120, Number(baseFans) || 300);
  if (rank <= 1) return Math.round(base * (isGoalRace ? 1.35 : 1.2));
  if (rank <= 3) return Math.round(base * 1.0);
  if (rank <= 5) return Math.round(base * 0.75);
  if (rank <= 9) return Math.round(base * 0.5);
  return Math.round(base * 0.25);
}

function checkFanGoalProgress(run) {
  const goal = nextGoal(run);
  if (!goal || goal.goalType !== 'fans') return null;
  if (Number(run.fans || 0) >= Number(goal.fansRequired || 0)) {
    goal.cleared = true;
    goal.attempted = true;
    return `Fan Goal Clear: ${formatNum(goal.fansRequired)} fans tercapai.`;
  }
  return null;
}

function resolveGoalRaceOutcome(run, gachaData, goal, rr) {
  goal.attempted = true;
  const fansGain = calcFansGain(goal.fansGained, rr.rank, true);
  run.fans = Number(run.fans || 0) + fansGain;

  if (rr.passed) {
    goal.cleared = true;
    gachaData.carrots = Number(gachaData.carrots || 0) + 120;
    return `\nGoal Race: rank ${rr.rank} (PASS) | Fans +${formatNum(fansGain)}`;
  }

  goal.cleared = false;
  if (goal.noFailOnLose) {
    return `\nGoal Race: rank ${rr.rank} (FAILED, target <= ${goal.rankNeed}) | Fans +${formatNum(fansGain)}\nBoleh lanjut, objective ini bisa dicoba lagi via !training race.`;
  }

  run.failed = true;
  run.failedReason = goal.raceName || `Goal turn ${goal.turn}`;
  return `\nGoal Race: rank ${rr.rank} (FAILED, target <= ${goal.rankNeed}) | Fans +${formatNum(fansGain)}\nTraining gagal karena objective race tidak tercapai.`;
}

function calcRacePower(run, goal) {
  const s = run.stats;
  let base = 0;
  base += s.speed * 0.34;
  base += s.stamina * (goal.distance === 'Long' ? 0.33 : 0.24);
  base += s.power * 0.2;
  base += s.guts * 0.1;
  base += s.wisdom * 0.13;
  base += run.energy * 0.8;

  const apt = run.aptitudes || null;
  const trackMul = getAptMultiplier(apt?.track?.[goal.track]);
  const distMul = getAptMultiplier(apt?.distance?.[goal.distance]);
  const styleMul = getAptMultiplier(apt?.style?.[goal.style || run.style]);
  base *= trackMul * distMul * styleMul;

  const styleBonus = run.style === goal.style ? 1.03 : 0.98;
  base *= styleBonus;
  base *= getMoodRaceMultiplier(run.mood);
  base *= getConditionRaceMultiplier(run);
  base += Number(run.skillPower || 0);

  return base;
}

function simRace(run, goal) {
  const power = calcRacePower(run, goal);
  const strictPenalty = (Math.max(1, 6 - Number(goal.rankNeed || 5)) * 10);
  const eraPenalty = Number(goal.turn || 1) >= 50 ? 12 : Number(goal.turn || 1) >= 36 ? 6 : 0;
  const adjustedPower = power - strictPenalty - eraPenalty;
  const variance = randomInt(-90, 90);
  const score = adjustedPower + variance;
  let rank = 18;
  if (score >= 320) rank = randomInt(1, 2);
  else if (score >= 285) rank = randomInt(1, 4);
  else if (score >= 250) rank = randomInt(3, 7);
  else if (score >= 220) rank = randomInt(6, 10);
  else if (score >= 190) rank = randomInt(9, 13);
  else rank = randomInt(12, 18);

  const passed = rank <= goal.rankNeed;
  return { rank, passed, score: Math.round(score) };
}

function applyTraining(run, kind) {
  const b = run.deckBonus;
  const e = run.energy;
  const lowEnergyPenalty = e < 35 ? 0.7 : 1;
  const failChance = clamp(
    ((35 - e) / 60) -
      ((b.failureRateDown || 0) / 100) +
      getConditionFailRateUp(run),
    0,
    0.55
  );
  const failed = Math.random() < failChance;
  const m = failed ? 0.45 : 1;
  const moodMul = getMoodTrainingMultiplier(run.mood);
  const trainingMul = 1 + ((b.trainingEffect || 0) / 100);
  const friendshipMul = 1 + ((b.friendshipBonus || 0) / 100);
  const conditionTrainMul = getConditionTrainingMultiplier(run);

  let cost = 16;
  if (kind === 'rest') cost = -30;
  if (kind === 'wit') cost = 8;
  cost = Math.max(4, Math.round(cost * (1 - ((b.energySave || 0) / 100))));
  run.energy = clamp(run.energy - cost, 0, 100);

  let restRecovery = 0;
  if (kind === 'rest') {
    const roll = Math.random();
    if (roll < 0.2) restRecovery = 30;
    else if (roll < 0.8) restRecovery = 50;
    else restRecovery = 70;
    run.energy = clamp(e + restRecovery, 0, 100);
    if (restRecovery >= 70) run.mood = shiftMood(run.mood, 1);
    else if (restRecovery <= 30 && Math.random() < 0.35) run.mood = shiftMood(run.mood, -1);
  }

  const gain = (base, bonus = 0, stat = null) => {
    const conditionStatMul = stat ? getConditionStatMultiplier(run, stat) : 1;
    return Math.max(
      1,
      Math.floor(
        (base + bonus) *
          trainingMul *
          friendshipMul *
          conditionTrainMul *
          conditionStatMul *
          moodMul *
          lowEnergyPenalty *
          m
      )
    );
  };

  if (kind === 'speed') {
    run.stats.speed += gain(randomInt(10, 18), b.speed * 4 + b.friend * 2, 'speed');
    run.stats.power += gain(randomInt(2, 6), b.power, 'power');
  } else if (kind === 'stamina') {
    run.stats.stamina += gain(randomInt(10, 18), b.stamina * 4 + b.friend * 2, 'stamina');
    run.stats.guts += gain(randomInt(2, 6), b.guts, 'guts');
  } else if (kind === 'power') {
    run.stats.power += gain(randomInt(10, 18), b.power * 4 + b.friend * 2, 'power');
    run.stats.speed += gain(randomInt(2, 6), b.speed, 'speed');
  } else if (kind === 'guts') {
    run.stats.guts += gain(randomInt(10, 18), b.guts * 4 + b.friend * 2, 'guts');
    run.stats.stamina += gain(randomInt(2, 5), b.stamina, 'stamina');
  } else if (kind === 'wit') {
    run.stats.wisdom += gain(randomInt(12, 20), b.wisdom * 4 + b.friend * 2, 'wisdom');
    run.energy = clamp(run.energy + randomInt(3, 7), 0, 100);
  } else if (kind === 'rest') {
    run.stats.wisdom += randomInt(1, 3);
  }

  let hintTriggered = false;
  let skillPointGain = 0;
  if (kind !== 'rest') {
    const hintProcChance = clamp(0.07 + ((b.hintRateBonus || 0) / 100), 0.07, 0.8);
    if (Math.random() < hintProcChance) {
      hintTriggered = true;
      const rawGain = 3 + randomInt(1, 3) + Math.max(0, Math.floor(b.hintLevelBonus || 0) * 2);
      skillPointGain = Math.max(1, Math.round(rawGain * getConditionSkillPointMultiplier(run)));
      run.skillPoints = Number(run.skillPoints || 0) + skillPointGain;
    }
  }

  return { failed, hintTriggered, skillPointGain, restRecovery };
}

function maybeAddRandomCondition(run, kind = 'train') {
  const roll = Math.random();
  const badChance = kind === 'rest' ? 0.005 : kind === 'outing' ? 0.004 : 0.05;
  const goodThreshold = kind === 'rest' ? 0.985 : kind === 'outing' ? 0.99 : 0.93;

  if (roll < badChance) {
    const added = addCondition(run, pick(['lazy_habit', 'headache', 'overweight']));
    if (added) return `Condition added: ${CONDITION_META[run.conditions[run.conditions.length - 1]].name}`;
  } else if (roll > goodThreshold) {
    const added = addCondition(run, pick(['sharp', 'rising_star']));
    if (added) return `Condition gained: ${CONDITION_META[run.conditions[run.conditions.length - 1]].name}`;
  }
  return null;
}

function maybeRecoverCondition(run, kind) {
  ensureConditionState(run);
  const blueList = run.conditions.filter((c) => CONDITION_META[c]?.type === 'blue');
  if (!blueList.length) return null;
  const chance = kind === 'rest' ? 0.28 : kind === 'outing' ? 0.38 : 0.08;
  if (Math.random() >= chance) return null;
  const target = pick(blueList);
  removeCondition(run, target);
  return `Condition recovered: ${CONDITION_META[target]?.name || target}`;
}

async function maybeTriggerTurnEvent(run) {
  const eventLines = [];

  let triggered = null;
  const supportChance = clamp(0.12 + ((run.deckBonus?.hintRateBonus || 0) / 300), 0.12, 0.42);
  const umaChance = 0.12;

  const supportCandidates = Array.isArray(run.supportEvents)
    ? run.supportEvents.filter((s) => Array.isArray(s.events) && s.events.length > 0)
    : [];
  const umaCandidates = Array.isArray(run.umaEvents?.normal) ? run.umaEvents.normal : [];

  if (supportCandidates.length > 0 && Math.random() < supportChance) {
    const fromCard = pick(supportCandidates);
    const event = pick(fromCard.events);
    const choice = pickRandomEventChoice(event);
    if (!choice) return eventLines;
    const effects = applyEventEffects(run, choice.effects);
    triggered = `Support Event (${fromCard.name}): ${event.title}`;
    eventLines.push(`Choice: ${choice.text}`);
    if (effects.length) eventLines.push(`Effect: ${effects.join(', ')}`);
  } else if (umaCandidates.length > 0 && Math.random() < umaChance) {
    const event = pick(umaCandidates);
    const choice = pickRandomEventChoice(event);
    if (!choice) return eventLines;
    const effects = applyEventEffects(run, choice.effects);
    triggered = `Uma Event (${run.umaName}): ${event.title}`;
    eventLines.push(`Choice: ${choice.text}`);
    if (effects.length) eventLines.push(`Effect: ${effects.join(', ')}`);
  }

  if (triggered) eventLines.unshift(triggered);
  return eventLines;
}

function nextGoal(run) {
  return run.goals.find((g) => !g.cleared) || null;
}

function rankFromStats(s) {
  const total = s.speed + s.stamina + s.power + s.guts + s.wisdom;
  if (total >= 3300) return 'S';
  if (total >= 2800) return 'A';
  if (total >= 2300) return 'B';
  if (total >= 1800) return 'C';
  return 'D';
}

function getOrInitTraining(gachaData) {
  if (!gachaData.training || typeof gachaData.training !== 'object') {
    gachaData.training = { deck: [], activeRun: null };
  }
  if (!Array.isArray(gachaData.training.deck)) gachaData.training.deck = [];
  return gachaData.training;
}

async function showHelp(sock, jid, msg) {
  const text =
    '*Uma Training Mode*\n\n' +
    `Scenario: ${TRAINING_SCENARIO}\n` +
    `Max Turn: ${MAX_TURN}\n\n` +
    'Commands:\n' +
    '- !training help\n' +
    '- !training deck show\n' +
    '- !training deck add <support id|name>\n' +
    '- !training deck remove <support id>\n' +
    '- !training deck clear\n' +
    '- !training deck auto\n' +
    '- !training start <uma id|name>\n' +
    '- !training goals <uma id|name>\n' +
    '- !training status\n' +
    '- !training train <speed|stamina|power|guts|wit|rest>\n' +
    '- !training outing\n' +
    '- !training race (goal race)\n' +
    '- !training race free (non-goal race, farm fans)\n' +
    '- !training skills\n' +
    '- !training buy <skill id|name>\n' +
    '- !training finish\n\n' +
    'Note: Race goals and event pool use GameTora data if available. Event choice full RNG.';
  return sock.sendMessage(jid, { text }, { quoted: msg });
}

function formatGoalRows(goals, includeState = false) {
  return goals.map((g, i) => {
    const state = includeState ? `${g.cleared ? '[OK] ' : '[..] '}` : '';
    if (g.goalType === 'fans') {
      return `${state}${i + 1}. T${g.turn} | Fans >= ${formatNum(g.fansRequired || 0)}`;
    }
    return `${state}${i + 1}. T${g.turn} | ${g.raceName ? `${g.raceName} | ` : ''}${g.track} ${g.distance} | rank <= ${g.rankNeed}`;
  });
}

async function showGoals(sock, remoteJid, gachaData, args, msg) {
  const training = getOrInitTraining(gachaData);
  const run = training.activeRun;
  const q = args.join(' ').trim();

  if (!q && run) {
    const rows = formatGoalRows(run.goals, true);
    return sock.sendMessage(remoteJid, {
      text:
        `*Training Goals (Active Run)*\n` +
        `Uma: ${run.umaName}\n` +
        `Scenario: ${TRAINING_SCENARIO}\n` +
        `Source: ${run.goalSource}\n` +
        rows.join('\n')
    }, { quoted: msg });
  }

  if (!q) {
    return sock.sendMessage(remoteJid, {
      text: 'Format: !training goals <uma id|name>\nAtau jalankan saat training aktif tanpa argumen.'
    }, { quoted: msg });
  }

  const umas = Array.isArray(gachaData.inventory) ? gachaData.inventory : [];
  const selected = findOwnedUmaByQuery(umas, q);
  if (!selected) return sock.sendMessage(remoteJid, { text: 'Uma tidak ditemukan di inventory kamu.' }, { quoted: msg });

  const resolved = await resolveUmaIdentity(selected);
  const charaId = Number(resolved.charaId || 0);
  if (!Number.isInteger(charaId) || charaId <= 0) {
    return sock.sendMessage(remoteJid, {
      text: 'Data charaId Uma ini belum ada. Coba pull Uma baru atau refresh data karakter dulu.'
    }, { quoted: msg });
  }
  const outfits = await fetchOutfitsByCharaId(charaId);
  const outfit = chooseStableOutfit(outfits);
  const styleNum = Number(outfit?.running_style) || 2;
  const { goals, source } = await buildGoalsFromObjectiveData(styleNum, outfit?.gametora);
  const rows = formatGoalRows(goals, false);

  return sock.sendMessage(remoteJid, {
    text:
      `*Training Goals Preview*\n` +
      `Uma: ${selected.name}\n` +
      `Outfit: ${outfit?.title_en || outfit?.title || '-'}\n` +
      `Scenario: ${TRAINING_SCENARIO}\n` +
      `Source: ${source}\n` +
      rows.join('\n')
  }, { quoted: msg });
}

async function handleDeck(sock, remoteJid, senderJid, gachaData, args, msg) {
  const training = getOrInitTraining(gachaData);
  const action = norm(args[0] || 'show');
  const supports = Array.isArray(gachaData.supportInventory) ? gachaData.supportInventory : [];

  if (action === 'show') {
    if (!training.deck.length) {
      return sock.sendMessage(remoteJid, { text: 'Deck kosong. Tambahkan support dulu.' }, { quoted: msg });
    }
    const rows = training.deck.map((id, i) => {
      const c = supports.find((x) => String(x.id) === String(id));
      return `${i + 1}. ${c ? `${c.name} [${c.rarity}] (${c.type || '-'}) LB${clampLb(c.limitBreak)}` : `Unknown (${id})`}`;
    });
    return sock.sendMessage(remoteJid, { text: `*Deck Support (${training.deck.length}/${MAX_DECK})*\n` + rows.join('\n') }, { quoted: msg });
  }

  if (action === 'clear') {
    training.deck = [];
    setGacha(senderJid, gachaData);
    return sock.sendMessage(remoteJid, { text: 'Deck support dibersihkan.' }, { quoted: msg });
  }

  if (action === 'auto') {
    const sorted = [...supports].sort((a, b) => {
      const r = { SSR: 3, SR: 2, R: 1 };
      return (r[b.rarity] || 0) - (r[a.rarity] || 0);
    });
    training.deck = sorted.slice(0, MAX_DECK).map((c) => c.id);
    setGacha(senderJid, gachaData);
    return sock.sendMessage(remoteJid, { text: `Deck auto-set: ${training.deck.length}/${MAX_DECK} kartu.` }, { quoted: msg });
  }

  if (action === 'add') {
    const q = args.slice(1).join(' ').trim();
    if (!q) return sock.sendMessage(remoteJid, { text: 'Format: !training deck add <support id|name>' }, { quoted: msg });
    if (training.deck.length >= MAX_DECK) return sock.sendMessage(remoteJid, { text: `Deck penuh (max ${MAX_DECK}).` }, { quoted: msg });
    const card = findOwnedSupportByQuery(supports, q);
    if (!card) return sock.sendMessage(remoteJid, { text: 'Support tidak ditemukan di inventory.' }, { quoted: msg });
    if (training.deck.includes(card.id)) return sock.sendMessage(remoteJid, { text: 'Support itu sudah ada di deck.' }, { quoted: msg });
    training.deck.push(card.id);
    setGacha(senderJid, gachaData);
    return sock.sendMessage(remoteJid, { text: `Masuk deck: ${card.name} [${card.rarity}]` }, { quoted: msg });
  }

  if (action === 'remove') {
    const id = String(args[1] || '').trim();
    if (!id) return sock.sendMessage(remoteJid, { text: 'Format: !training deck remove <support id>' }, { quoted: msg });
    const before = training.deck.length;
    training.deck = training.deck.filter((x) => String(x) !== id);
    if (training.deck.length === before) return sock.sendMessage(remoteJid, { text: 'Support ID itu tidak ada di deck.' }, { quoted: msg });
    setGacha(senderJid, gachaData);
    return sock.sendMessage(remoteJid, { text: `Support ${id} dihapus dari deck.` }, { quoted: msg });
  }

  return sock.sendMessage(remoteJid, { text: 'Subcommand deck: show/add/remove/clear/auto' }, { quoted: msg });
}

async function startRun(sock, remoteJid, senderJid, gachaData, args, msg) {
  const training = getOrInitTraining(gachaData);
  if (training.activeRun) {
    return sock.sendMessage(remoteJid, { text: 'Masih ada training aktif. Pakai !training finish dulu.' }, { quoted: msg });
  }
  if (!training.deck.length) {
    return sock.sendMessage(remoteJid, { text: 'Deck support masih kosong. Set dulu pakai !training deck auto atau add.' }, { quoted: msg });
  }

  const q = args.join(' ').trim();
  if (!q) return sock.sendMessage(remoteJid, { text: 'Format: !training start <uma id|name>' }, { quoted: msg });

  const umas = Array.isArray(gachaData.inventory) ? gachaData.inventory : [];
  const selected = findOwnedUmaByQuery(umas, q);
  if (!selected) return sock.sendMessage(remoteJid, { text: 'Uma tidak ditemukan di inventory kamu.' }, { quoted: msg });

  const resolved = await resolveUmaIdentity(selected);
  const charaId = Number(resolved.charaId || 0);
  if (!Number.isInteger(charaId) || charaId <= 0) {
    return sock.sendMessage(remoteJid, {
      text: 'Data charaId Uma belum ditemukan, jadi goal asli belum bisa diambil.'
    }, { quoted: msg });
  }
  const outfits = await fetchOutfitsByCharaId(charaId);
  const outfit = chooseOutfit(outfits);
  const styleNum = Number(outfit?.running_style) || 2;
  const { goals, source: goalSource, aptitudes } = await buildGoalsFromObjectiveData(styleNum, outfit?.gametora);
  const umaEvents = await fetchCharacterEventPoolByGametora(outfit?.gametora);

  const deckCards = training.deck
    .map((id) => (gachaData.supportInventory || []).find((c) => String(c.id) === String(id)))
    .filter(Boolean);
  const deckB = await bonusByDeck(deckCards);
  const supportEvents = await Promise.all(
    deckCards.map(async (card) => ({
      id: card.id,
      name: card.name,
      events: await fetchSupportEventPoolByGametora(card.gametora)
    }))
  );

  const baseStats = {
    speed: Math.round(120 + (Number(outfit?.talent_speed) || 0) * 2 + deckB.speed * 5),
    stamina: Math.round(120 + (Number(outfit?.talent_stamina) || 0) * 2 + deckB.stamina * 5),
    power: Math.round(120 + (Number(outfit?.talent_pow) || 0) * 2 + deckB.power * 5),
    guts: Math.round(120 + (Number(outfit?.talent_guts) || 0) * 2 + deckB.guts * 5),
    wisdom: Math.round(120 + (Number(outfit?.talent_wiz) || 0) * 2 + deckB.wisdom * 5)
  };

  const run = {
    startedAt: Date.now(),
    turn: 1,
    energy: 100,
    umaId: selected.id,
    umaName: selected.name,
    outfitId: outfit?.id || null,
    outfitName: outfit?.title_en || outfit?.title || null,
    styleNum,
    style: STYLE_LABEL[styleNum] || 'Leader',
    stats: baseStats,
    deck: [...training.deck],
    deckBonus: deckB,
    goals,
    goalSource,
    aptitudes,
    umaEvents,
    supportEvents,
    mood: 'normal',
    conditions: [],
    skills: [],
    skillPower: 0,
    failed: false,
    failedReason: null,
    skillPoints: 0,
    outingCount: 0,
    fans: 0,
    raceLog: []
  };

  training.activeRun = run;
  setGacha(senderJid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*Training Dimulai*\n` +
      `Uma: ${run.umaName}\n` +
      `Outfit: ${run.outfitName || '-'}\n` +
      `Scenario: ${TRAINING_SCENARIO}\n` +
      `Style: ${run.style}\n` +
      `Mood: ${MOOD_LABEL[run.mood]}\n` +
      `Condition: ${listConditionText(run)}\n` +
      `Fans: ${formatNum(run.fans)}\n` +
      `Goal Source: ${run.goalSource}\n` +
      `Deck: ${run.deck.length}/${MAX_DECK}\n` +
      `Stats awal - SPD ${run.stats.speed} | STA ${run.stats.stamina} | POW ${run.stats.power} | GUT ${run.stats.guts} | WIT ${run.stats.wisdom}\n` +
      `Gunakan: !training train <speed|stamina|power|guts|wit|rest>`
  }, { quoted: msg });
}

async function showStatus(sock, remoteJid, gachaData, msg) {
  const run = getOrInitTraining(gachaData).activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Belum ada training aktif. Pakai !training start dulu.' }, { quoted: msg });

  if (run.failed) {
    return sock.sendMessage(remoteJid, {
      text:
        `*Training Status*\n` +
        `Uma: ${run.umaName} (${run.style})\n` +
        `Scenario: ${TRAINING_SCENARIO}\n` +
        `Status: GAGAL (${run.failedReason || 'Objective race gagal'})\n` +
        `Turn: ${run.turn}/${MAX_TURN}\n` +
        `Mood: ${MOOD_LABEL[run.mood]}\n` +
        `Condition: ${listConditionText(run)}\n` +
        `Fans: ${formatNum(run.fans || 0)}\n` +
        `SPD ${formatNum(run.stats.speed)} | STA ${formatNum(run.stats.stamina)} | POW ${formatNum(run.stats.power)} | GUT ${formatNum(run.stats.guts)} | WIT ${formatNum(run.stats.wisdom)}\n` +
        `Gunakan !training finish untuk menutup run.`
    }, { quoted: msg });
  }

  const goal = nextGoal(run);
  const goalText = goal
    ? (goal.goalType === 'fans'
      ? `Turn ${goal.turn}: Fans >= ${formatNum(goal.fansRequired || 0)} (sekarang ${formatNum(run.fans || 0)})`
      : `Turn ${goal.turn}: ${goal.raceName ? `${goal.raceName} | ` : ''}${goal.track} ${goal.distance} (target rank <= ${goal.rankNeed})`)
    : 'Semua goal selesai.';

  return sock.sendMessage(remoteJid, {
    text:
      `*Training Status*\n` +
      `Uma: ${run.umaName} (${run.style})\n` +
      `Scenario: ${TRAINING_SCENARIO}\n` +
      `Turn: ${run.turn}/${MAX_TURN}\n` +
      `Energy: ${run.energy}/100\n` +
      `Mood: ${MOOD_LABEL[run.mood]}\n` +
      `Condition: ${listConditionText(run)}\n` +
      `Fans: ${formatNum(run.fans || 0)}\n` +
      `Skill Pt: ${formatNum(run.skillPoints || 0)}\n` +
      `SPD ${formatNum(run.stats.speed)} | STA ${formatNum(run.stats.stamina)} | POW ${formatNum(run.stats.power)} | GUT ${formatNum(run.stats.guts)} | WIT ${formatNum(run.stats.wisdom)}\n` +
      `Next Goal: ${goalText}`
  }, { quoted: msg });
}

async function doTrain(sock, remoteJid, senderJid, gachaData, args, msg) {
  const training = getOrInitTraining(gachaData);
  const run = training.activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Belum ada training aktif.' }, { quoted: msg });
  if (run.failed) return sock.sendMessage(remoteJid, { text: 'Run ini sudah gagal. Pakai !training finish untuk menutup run.' }, { quoted: msg });
  if (run.turn > MAX_TURN) return sock.sendMessage(remoteJid, { text: 'Turn training sudah habis. Pakai !training finish.' }, { quoted: msg });

  const type = norm(args[0]);
  const valid = ['speed', 'stamina', 'power', 'guts', 'wit', 'rest'];
  if (!valid.includes(type)) {
    return sock.sendMessage(remoteJid, { text: 'Format: !training train <speed|stamina|power|guts|wit|rest>' }, { quoted: msg });
  }

  const before = { ...run.stats };
  const { failed, hintTriggered, skillPointGain, restRecovery } = applyTraining(run, type);
  const delta = {
    speed: run.stats.speed - before.speed,
    stamina: run.stats.stamina - before.stamina,
    power: run.stats.power - before.power,
    guts: run.stats.guts - before.guts,
    wisdom: run.stats.wisdom - before.wisdom
  };

  let raceLine = '';
  const eventLines = [];
  const conditionRecovered = maybeRecoverCondition(run, type);
  if (conditionRecovered) eventLines.push(conditionRecovered);

  const randomCondition = maybeAddRandomCondition(run, type);
  if (randomCondition) eventLines.push(randomCondition);

  const triggeredEvents = await maybeTriggerTurnEvent(run);
  if (triggeredEvents.length > 0) eventLines.push(...triggeredEvents);

  const fanGoalLine = checkFanGoalProgress(run);
  if (fanGoalLine) eventLines.push(fanGoalLine);

  const goal = nextGoal(run);
  if (goal && goal.goalType === 'fans' && run.turn >= goal.turn && !goal.cleared) {
    run.failed = true;
    run.failedReason = `Fans ${formatNum(run.fans || 0)}/${formatNum(goal.fansRequired || 0)} di turn ${goal.turn}`;
    raceLine = '\nTraining gagal karena target fans objective belum tercapai.';
  } else if (goal && goal.goalType === 'race' && run.turn === goal.turn && !goal.attempted) {
    const rr = simRace(run, goal);
    run.raceLog.push({ ...goal, ...rr, turn: run.turn, time: Date.now() });
    raceLine = resolveGoalRaceOutcome(run, gachaData, goal, rr);
  }

  run.turn += 1;
  setGacha(senderJid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*Turn ${run.turn - 1} - ${type.toUpperCase()}*${failed ? ' (bad training)' : ''}\n` +
      `+SPD ${delta.speed} | +STA ${delta.stamina} | +POW ${delta.power} | +GUT ${delta.guts} | +WIT ${delta.wisdom}\n` +
      `Energy: ${run.energy}/100${type === 'rest' ? ` (Recovery +${restRecovery})` : ''}\n` +
      `Mood: ${MOOD_LABEL[run.mood]}\n` +
      `Condition: ${listConditionText(run)}` +
      `${hintTriggered ? `\nHint proc! Skill Pt +${skillPointGain}` : ''}` +
      `${eventLines.length ? `\n${eventLines.join('\n')}` : ''}` +
      `${raceLine}`
  }, { quoted: msg });
}

async function doOuting(sock, remoteJid, senderJid, gachaData, msg) {
  const training = getOrInitTraining(gachaData);
  const run = training.activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Belum ada training aktif.' }, { quoted: msg });
  if (run.failed) return sock.sendMessage(remoteJid, { text: 'Run ini sudah gagal. Pakai !training finish untuk menutup run.' }, { quoted: msg });

  const beforeMood = run.mood;
  const energyGain = randomInt(20, 36);
  run.energy = clamp(run.energy + energyGain, 0, 100);
  run.mood = shiftMood(run.mood, Math.random() < 0.7 ? 1 : 0);
  const spGain = randomInt(3, 7);
  run.skillPoints = Number(run.skillPoints || 0) + spGain;
  const extraLines = [];

  const outingPool = Array.isArray(run.umaEvents?.outing) ? run.umaEvents.outing : [];
  if (outingPool.length > 0) {
    const event = pick(outingPool);
    const choice = pickRandomEventChoice(event);
    if (choice) {
      const effects = applyEventEffects(run, choice.effects);
      extraLines.push(`Outing Event: ${event.title}`);
      extraLines.push(`Choice: ${choice.text}`);
      if (effects.length) extraLines.push(`Effect: ${effects.join(', ')}`);
    }
  }

  const recovered = maybeRecoverCondition(run, 'outing');
  if (recovered) extraLines.push(recovered);

  const conditionLine = maybeAddRandomCondition(run, 'outing');
  if (conditionLine) extraLines.push(conditionLine);
  const fanGoalLine = checkFanGoalProgress(run);
  if (fanGoalLine) extraLines.push(fanGoalLine);
  const currentGoal = nextGoal(run);
  if (!fanGoalLine && currentGoal && currentGoal.goalType === 'fans' && run.turn >= currentGoal.turn && !currentGoal.cleared) {
    run.failed = true;
    run.failedReason = `Fans ${formatNum(run.fans || 0)}/${formatNum(currentGoal.fansRequired || 0)} di turn ${currentGoal.turn}`;
    extraLines.push('Training gagal karena target fans objective belum tercapai.');
  }

  run.outingCount = Number(run.outingCount || 0) + 1;
  run.turn += 1;
  setGacha(senderJid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*Outing*\n` +
      `Energy +${energyGain}\n` +
      `Skill Pt +${spGain}\n` +
      `Mood: ${MOOD_LABEL[beforeMood]} -> ${MOOD_LABEL[run.mood]}\n` +
      `Fans: ${formatNum(run.fans || 0)}\n` +
      `Condition: ${listConditionText(run)}\n` +
      `${extraLines.length ? `${extraLines.join('\n')}\n` : ''}` +
      `Turn sekarang: ${run.turn}/${MAX_TURN}`
  }, { quoted: msg });
}

async function showSkills(sock, remoteJid, gachaData, msg) {
  const run = getOrInitTraining(gachaData).activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Belum ada training aktif.' }, { quoted: msg });

  const owned = new Set(Array.isArray(run.skills) ? run.skills : []);
  const rows = SKILL_CATALOG.map((s) => {
    const mark = owned.has(s.id) ? '[OWNED]' : (Number(run.skillPoints || 0) >= s.cost ? '[CAN BUY]' : '[LOCKED]');
    return `- ${s.id} | ${s.name} | Cost ${s.cost} | Power +${s.power} ${mark}`;
  });

  return sock.sendMessage(remoteJid, {
    text:
      `*Skill Shop*\n` +
      `Skill Pt: ${formatNum(run.skillPoints || 0)}\n` +
      rows.join('\n')
  }, { quoted: msg });
}

async function buySkill(sock, remoteJid, senderJid, gachaData, args, msg) {
  const run = getOrInitTraining(gachaData).activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Belum ada training aktif.' }, { quoted: msg });

  const q = norm(args.join(' '));
  if (!q) return sock.sendMessage(remoteJid, { text: 'Format: !training buy <skill id|name>' }, { quoted: msg });
  const skill = SKILL_CATALOG.find((s) => norm(s.id) === q || norm(s.name).includes(q));
  if (!skill) return sock.sendMessage(remoteJid, { text: 'Skill tidak ditemukan.' }, { quoted: msg });

  if (!Array.isArray(run.skills)) run.skills = [];
  if (run.skills.includes(skill.id)) return sock.sendMessage(remoteJid, { text: 'Skill itu sudah dibeli.' }, { quoted: msg });

  const sp = Number(run.skillPoints || 0);
  if (sp < skill.cost) return sock.sendMessage(remoteJid, { text: `Skill Pt tidak cukup. Butuh ${skill.cost}, punya ${sp}.` }, { quoted: msg });

  run.skillPoints = sp - skill.cost;
  run.skills.push(skill.id);
  run.skillPower = Number(run.skillPower || 0) + Number(skill.power || 0);
  setGacha(senderJid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `Skill dibeli: ${skill.name}\n` +
      `Cost: ${skill.cost}\n` +
      `Race Power +${skill.power}\n` +
      `Sisa Skill Pt: ${run.skillPoints}`
  }, { quoted: msg });
}

async function doRace(sock, remoteJid, senderJid, gachaData, args, msg) {
  const training = getOrInitTraining(gachaData);
  const run = training.activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Belum ada training aktif.' }, { quoted: msg });
  if (run.failed) return sock.sendMessage(remoteJid, { text: 'Run ini sudah gagal. Pakai !training finish untuk menutup run.' }, { quoted: msg });

  const mode = norm(args[0] || '');
  if (mode === 'free' || mode === 'nongoal') {
    const raceTemplate = {
      track: pick(TRACK_POOL),
      distance: pick(DIST_POOL),
      rankNeed: 5,
      style: run.style,
      turn: run.turn,
      raceName: 'Free Race',
      goalType: 'race',
      fansGained: randomInt(700, 1800),
      noFailOnLose: true
    };
    const rr = simRace(run, raceTemplate);
    const fansGain = calcFansGain(raceTemplate.fansGained, rr.rank, false);
    run.fans = Number(run.fans || 0) + fansGain;
    run.energy = clamp(run.energy - 12, 0, 100);
    const fanGoalLine = checkFanGoalProgress(run);
    setGacha(senderJid, gachaData);

    return sock.sendMessage(remoteJid, {
      text:
        `*Free Race*\n` +
        `${raceTemplate.track} ${raceTemplate.distance}\n` +
        `Hasil rank: ${rr.rank}\n` +
        `Fans +${formatNum(fansGain)} (Total ${formatNum(run.fans || 0)})\n` +
        `${fanGoalLine ? `${fanGoalLine}\n` : ''}` +
        `Energy: ${run.energy}/100\n` +
        `Mood: ${MOOD_LABEL[run.mood]}\n` +
        `Condition: ${listConditionText(run)}`
    }, { quoted: msg });
  }

  const goal = nextGoal(run);
  if (!goal) return sock.sendMessage(remoteJid, { text: 'Semua goal race sudah selesai.' }, { quoted: msg });
  if (goal.goalType !== 'race') {
    return sock.sendMessage(remoteJid, {
      text: `Goal aktif saat ini adalah fans (${formatNum(goal.fansRequired || 0)}). Pakai !training race free untuk farming fans.`
    }, { quoted: msg });
  }
  if (run.turn < goal.turn) return sock.sendMessage(remoteJid, { text: `Goal ini terbuka di turn ${goal.turn}. Sekarang turn ${run.turn}.` }, { quoted: msg });

  const rr = simRace(run, goal);
  run.raceLog.push({ ...goal, ...rr, turn: run.turn, time: Date.now() });
  const resultLine = resolveGoalRaceOutcome(run, gachaData, goal, rr);
  const fanGoalLine = checkFanGoalProgress(run);
  run.energy = clamp(run.energy - 12, 0, 100);
  setGacha(senderJid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*Manual Race*\n` +
      `${goal.track} ${goal.distance} | target <= ${goal.rankNeed}\n` +
      `Hasil rank: ${rr.rank} (${rr.passed ? 'PASS' : 'FAIL'})\n` +
      `${resultLine.trim()}\n` +
      `${fanGoalLine ? `${fanGoalLine}\n` : ''}` +
      `Energy: ${run.energy}/100\n` +
      `Mood: ${MOOD_LABEL[run.mood]}\n` +
      `Condition: ${listConditionText(run)}`
  }, { quoted: msg });
}

async function finishRun(sock, remoteJid, senderJid, gachaData, msg) {
  const training = getOrInitTraining(gachaData);
  const run = training.activeRun;
  if (!run) return sock.sendMessage(remoteJid, { text: 'Tidak ada training aktif.' }, { quoted: msg });

  const cleared = run.goals.filter((g) => g.cleared).length;
  const rank = rankFromStats(run.stats);
  const baseReward = 200 + cleared * 150;
  const rankBonus = { S: 500, A: 350, B: 250, C: 150, D: 80 }[rank] || 80;
  const failPenalty = run.failed ? 0.7 : 1;
  const reward = Math.floor((baseReward + rankBonus) * failPenalty);
  gachaData.carrots = Number(gachaData.carrots || 0) + reward;

  training.activeRun = null;
  setGacha(senderJid, gachaData);

  return sock.sendMessage(remoteJid, {
    text:
      `*Training Selesai*\n` +
      `Uma: ${run.umaName}\n` +
      `Rank Simulasi: ${rank}\n` +
      `Status: ${run.failed ? `GAGAL (${run.failedReason || '-'})` : 'LULUS'}\n` +
      `Goal Cleared: ${cleared}/${run.goals.length}\n` +
      `Mood akhir: ${MOOD_LABEL[run.mood]}\n` +
      `Condition akhir: ${listConditionText(run)}\n` +
      `Fans akhir: ${formatNum(run.fans || 0)}\n` +
      `Skill dibeli: ${Array.isArray(run.skills) ? run.skills.length : 0}\n` +
      `Skill Pt: ${formatNum(run.skillPoints || 0)}\n` +
      `Final Stats - SPD ${run.stats.speed} | STA ${run.stats.stamina} | POW ${run.stats.power} | GUT ${run.stats.guts} | WIT ${run.stats.wisdom}\n` +
      `Reward: +${reward} carrots`
  }, { quoted: msg });
}

async function handle(sock, remoteJid, args, msg) {
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const gachaData = getGacha(senderJid) || { carrots: 0, inventory: [], supportInventory: [] };
  const sub = norm(args[0] || 'help');

  if (['speed', 'stamina', 'power', 'guts', 'wit', 'rest'].includes(sub)) {
    return doTrain(sock, remoteJid, senderJid, gachaData, [sub], msg);
  }

  if (sub === 'help') return showHelp(sock, remoteJid, msg);
  if (sub === 'deck') return handleDeck(sock, remoteJid, senderJid, gachaData, args.slice(1), msg);
  if (sub === 'start') return startRun(sock, remoteJid, senderJid, gachaData, args.slice(1), msg);
  if (sub === 'goals') return showGoals(sock, remoteJid, gachaData, args.slice(1), msg);
  if (sub === 'status') return showStatus(sock, remoteJid, gachaData, msg);
  if (sub === 'train') return doTrain(sock, remoteJid, senderJid, gachaData, args.slice(1), msg);
  if (sub === 'outing') return doOuting(sock, remoteJid, senderJid, gachaData, msg);
  if (sub === 'race') return doRace(sock, remoteJid, senderJid, gachaData, args.slice(1), msg);
  if (sub === 'skills') return showSkills(sock, remoteJid, gachaData, msg);
  if (sub === 'buy') return buySkill(sock, remoteJid, senderJid, gachaData, args.slice(1), msg);
  if (sub === 'finish') return finishRun(sock, remoteJid, senderJid, gachaData, msg);

  return sock.sendMessage(remoteJid, { text: 'Subcommand training tidak dikenal. Coba: help, deck, start, goals, status, train, outing, skills, buy, race, finish' }, { quoted: msg });
}

export default {
  name: 'training',
  aliases: ['race', 'train'],
  category: 'game',
  run: handle
};
