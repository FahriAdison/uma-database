import https from "https";

const DEFAULT_BASE_URL = "https://umapyoi.net/api/v1";
const DEFAULT_TIMEOUT_MS = 15000;

function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  return String(baseUrl).replace(/\/+$/, "");
}

function buildUrl(pathname, baseUrl = DEFAULT_BASE_URL) {
  const cleanBase = normalizeBaseUrl(baseUrl);
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

function requestWithHttps(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode || 500;

        if (status < 200 || status >= 300) {
          reject(new Error(`Umapyoi API error ${status}: ${raw.slice(0, 200)}`));
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error(`Invalid JSON response from Umapyoi API: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => reject(error));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Umapyoi API timeout after ${timeoutMs}ms`));
    });
  });
}

async function requestJson(pathname, options = {}) {
  const { baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = buildUrl(pathname, baseUrl);

  if (typeof fetch === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Umapyoi API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return requestWithHttps(url, timeoutMs);
}

export const umapyoiConfig = {
  baseUrl: DEFAULT_BASE_URL,
  timeoutMs: DEFAULT_TIMEOUT_MS
};

export function createUmapyoiClient(config = {}) {
  const options = {
    baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    timeoutMs: Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS
  };

  return {
    getSupportCards: () => getSupportCards(options),
    getSupportCardById: (supportId) => getSupportCardById(supportId, options),
    getSupportCardsByCharacter: (charaId) => getSupportCardsByCharacter(charaId, options),
    getSupportGameToraEndpoint: (supportId) => getSupportGameToraEndpoint(supportId, options.baseUrl),
    getCharacters: () => getCharacters(options),
    getCharacterInfoList: () => getCharacterInfoList(options),
    getCharacterList: () => getCharacterList(options),
    getCharacterById: (charaId) => getCharacterById(charaId, options),
    getCharacterImagesById: (charaId) => getCharacterImagesById(charaId, options),
    getCharacterMoviesById: (charaId) => getCharacterMoviesById(charaId, options),
    getCurrentBirthdays: () => getCurrentBirthdays(options)
  };
}

export function getSupportGameToraEndpoint(supportId, baseUrl = DEFAULT_BASE_URL) {
  const id = Number(supportId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("supportId must be a positive integer");
  }
  return buildUrl(`support/${id}/gametora`, baseUrl);
}

export async function getSupportCards(options = {}) {
  return requestJson("support", options);
}

export async function getSupportCardById(supportId, options = {}) {
  const id = Number(supportId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("supportId must be a positive integer");
  }
  return requestJson(`support/${id}`, options);
}

export async function getSupportCardsByCharacter(charaId, options = {}) {
  const id = Number(charaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("charaId must be a positive integer");
  }
  return requestJson(`support/character/${id}`, options);
}

export async function getCharacters(options = {}) {
  return requestJson("character", options);
}

export async function getCharacterInfoList(options = {}) {
  return requestJson("character/info", options);
}

export async function getCharacterList(options = {}) {
  return requestJson("character/list", options);
}

export async function getCharacterById(charaId, options = {}) {
  const id = Number(charaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("charaId must be a positive integer");
  }
  return requestJson(`character/${id}`, options);
}

export async function getCharacterImagesById(charaId, options = {}) {
  const id = Number(charaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("charaId must be a positive integer");
  }
  return requestJson(`character/images/${id}`, options);
}

export async function getCharacterMoviesById(charaId, options = {}) {
  const id = Number(charaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("charaId must be a positive integer");
  }
  return requestJson(`character/movies/${id}`, options);
}

export async function getCurrentBirthdays(options = {}) {
  return requestJson("character/currentbirthdays", options);
}
