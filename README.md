# uma-database
Database Uma Musume Game for WhatsApp bot using JavaScript.

## Available API

Character API (cache in-memory, refreshed from Umapyoi at startup):
- `getRandomUma()`
- `getUmaById(id)`
- `getAllUmas()`
- `getSSRarityUmas()`
- `refreshUmaDatabase()`

Support Card API (cache in-memory, refreshed from Umapyoi at startup):
- `getAllSupportCards()`
- `getSupportCardById(supportId)`
- `getSupportCardByUrlName(urlName)`
- `getSupportCardsByType(type)`
- `getSupportCardsByCharacter(query)`
- `getLatestSupportCards(limit)`
- `refreshSupportCardDatabase()`

This repository now includes the first support card entry:
- `30286-matikanefukukitaru` (SSR Speed, release `2026-01-30`)

## Umapyoi Live API (Recommended)

This package now includes async wrappers for the official Umapyoi API docs:
- Docs: `https://umapyoi.net/docs/index.html`
- Base URL: `https://umapyoi.net/api/v1`

Support endpoints:
- `apiGetSupportCards()`
- `apiGetSupportCardById(supportId)`
- `apiGetSupportCardsByCharacter(charaId)`
- `getSupportGameToraEndpoint(supportId)`

Character endpoints:
- `apiGetCharacters()`
- `apiGetCharacterInfoList()`
- `apiGetCharacterList()`
- `apiGetCharacterById(charaId)`
- `apiGetCharacterImagesById(charaId)`
- `apiGetCharacterMoviesById(charaId)`
- `apiGetCurrentBirthdays()`

Client factory:
- `createUmapyoiClient({ baseUrl, timeoutMs })`

Example:
```js
import { apiGetSupportCardById, apiGetSupportCardsByCharacter } from "@fahri/uma-database";

const card = await apiGetSupportCardById(30286);
const fukukitaruSupports = await apiGetSupportCardsByCharacter(1056);

console.log(card);
console.log(fukukitaruSupports.length);
```
