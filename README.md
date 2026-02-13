# @fahri/uma-database
Uma Musume data and command cores for Node.js / WhatsApp bot projects.

<p align="center">
  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStsyWjFo9JUe-FnQ_YGlzuMm7CU4FxmfEvsMlfEZEkxQ&s=10" alt="Papah-Chan Icon" width="140" />
</p>
<p align="center">
  <marquee behavior="alternate" scrollamount="6">this module database made by Papah-Chan</marquee>
</p>

## What This Package Contains
- Character cache + helper queries.
- Support card cache + helper queries.
- Umapyoi live API wrappers.
- `training-core` command module (large training system logic).
- `gacha-core` command module (uma/support gacha logic).

This package is designed so your bot repo can keep command files thin while heavy game logic lives here.

## Quick Start
```js
import {
  refreshUmaDatabase,
  refreshSupportCardDatabase,
  getRandomUma,
  getRandomSupportCard
} from "@fahri/uma-database";

await refreshUmaDatabase();
await refreshSupportCardDatabase();

console.log("Random Uma:", getRandomUma()?.name);
console.log("Random Support:", getRandomSupportCard()?.name);
```

## Installation
Use `#main` if you want the latest commit from the main branch.

### npm
```bash
npm install github:FahriAdison/uma-database#main
```

### pnpm
```bash
pnpm add github:FahriAdison/uma-database#main
```

### yarn
```bash
yarn add github:FahriAdison/uma-database#main
```

### package.json
```json
{
  "dependencies": {
    "@fahri/uma-database": "github:FahriAdison/uma-database#main"
  }
}
```

## Exports
## API Reference
### Character API
| Export | Type | Description |
|---|---|---|
| `refreshUmaDatabase()` | `async function` | Refresh character cache from remote source. |
| `getRandomUma()` | `function` | Get random character from cache. |
| `getSSRarityUmas()` | `function` | Get SSR rarity characters from cache. |
| `getUmaById(id)` | `function` | Find character by ID from cache. |
| `getAllUmas()` | `function` | Return all cached characters. |
| `getAllUmasFromApi()` | `async function` | Fetch all characters directly from API. |
| `getUmaByIdFromApi(charaId)` | `async function` | Fetch character by ID from API. |
| `getRandomUmaFromApi()` | `async function` | Fetch random character from API source. |

### Support API
| Export | Type | Description |
|---|---|---|
| `refreshSupportCardDatabase()` | `async function` | Refresh support cache from remote source. |
| `getAllSupportCards()` | `function` | Return all cached support cards. |
| `getRandomSupportCard()` | `function` | Get random support card from cache. |
| `getSupportCardById(supportId)` | `function` | Find support card by ID from cache. |
| `getSupportCardByUrlName(urlName)` | `function` | Find support by GameTora URL slug. |
| `getSupportCardsByType(type)` | `function` | Filter supports by type. |
| `getSupportCardsByCharacter(query)` | `function` | Filter supports by related character. |
| `getLatestSupportCards(limit)` | `function` | Get latest supports by release date. |
| `getRarityLabel(rarityCode)` | `function` | Convert rarity code to readable label. |
| `getAllSupportCardsFromApi()` | `async function` | Fetch all supports directly from API. |
| `getSupportCardByIdFromApi(supportId)` | `async function` | Fetch support by ID from API. |
| `getSupportCardsByCharacterFromApi(charaId)` | `async function` | Fetch supports by character ID from API. |

### Umapyoi Wrapper API
| Export | Type | Description |
|---|---|---|
| `createUmapyoiClient({ baseUrl, timeoutMs })` | `function` | Create custom API client instance. |
| `apiGetSupportCards()` | `async function` | Get support list from Umapyoi. |
| `apiGetSupportCardById(supportId)` | `async function` | Get support detail by ID. |
| `apiGetSupportCardsByCharacter(charaId)` | `async function` | Get supports by character ID. |
| `apiGetCharacters()` | `async function` | Get character list. |
| `apiGetCharacterInfoList()` | `async function` | Get character info list. |
| `apiGetCharacterList()` | `async function` | Get character list endpoint alias. |
| `apiGetCharacterById(charaId)` | `async function` | Get character detail by ID. |
| `apiGetCharacterImagesById(charaId)` | `async function` | Get character images by ID. |
| `apiGetCharacterMoviesById(charaId)` | `async function` | Get character movies by ID. |
| `apiGetCurrentBirthdays()` | `async function` | Get current birthday entries. |
| `getSupportGameToraEndpoint(supportId)` | `function` | Build GameTora support URL endpoint. |

### Command Core API
| Export | Type | Description |
|---|---|---|
| `trainingCommand` | `object` | Ready-to-use training command object. |
| `configureTrainingCore(config)` | `function` | Inject adapters (`getGacha`, `setGacha`, etc). |
| `gachaCommand` | `object` | Ready-to-use gacha command object. |
| `configureGachaCore(config)` | `function` | Inject adapters (`getGacha`, `setGacha`, etc). |

## Export List
### Character
- `refreshUmaDatabase()`
- `getRandomUma()`
- `getSSRarityUmas()`
- `getUmaById(id)`
- `getAllUmas()`
- `getAllUmasFromApi()`
- `getUmaByIdFromApi(charaId)`
- `getRandomUmaFromApi()`

### Support Card
- `refreshSupportCardDatabase()`
- `getAllSupportCards()`
- `getRandomSupportCard()`
- `getSupportCardById(supportId)`
- `getSupportCardByUrlName(urlName)`
- `getSupportCardsByType(type)`
- `getSupportCardsByCharacter(query)`
- `getLatestSupportCards(limit)`
- `getRarityLabel(rarityCode)`
- `getAllSupportCardsFromApi()`
- `getSupportCardByIdFromApi(supportId)`
- `getSupportCardsByCharacterFromApi(charaId)`

### Umapyoi API Wrapper
- `createUmapyoiClient({ baseUrl, timeoutMs })`
- `apiGetSupportCards()`
- `apiGetSupportCardById(supportId)`
- `apiGetSupportCardsByCharacter(charaId)`
- `apiGetCharacters()`
- `apiGetCharacterInfoList()`
- `apiGetCharacterList()`
- `apiGetCharacterById(charaId)`
- `apiGetCharacterImagesById(charaId)`
- `apiGetCharacterMoviesById(charaId)`
- `apiGetCurrentBirthdays()`
- `getSupportGameToraEndpoint(supportId)`

### Command Cores
- `trainingCommand`
- `configureTrainingCore(config)`
- `gachaCommand`
- `configureGachaCore(config)`

## Basic Usage
### Character + Support cache
```js
import {
  refreshUmaDatabase,
  refreshSupportCardDatabase,
  getRandomUma,
  getUmaById,
  getAllUmas,
  getAllSupportCards,
  getSupportCardsByType,
  getSupportCardById
} from "@fahri/uma-database";

await refreshUmaDatabase();
await refreshSupportCardDatabase();

const uma = getRandomUma();
const oneUma = getUmaById(1001);
const allUmas = getAllUmas();
const speedSupports = getSupportCardsByType("speed");
const oneSupport = getSupportCardById(30001);
const allSupports = getAllSupportCards();

console.log(uma?.name);
console.log(oneUma?.name, allUmas.length);
console.log(speedSupports.length, oneSupport?.name, allSupports.length);
```

### Umapyoi API wrapper
```js
import {
  apiGetSupportCardById,
  apiGetSupportCardsByCharacter,
  apiGetCharacters,
  apiGetCharacterById,
  apiGetCharacterImagesById
} from "@fahri/uma-database";

const support = await apiGetSupportCardById(30001);
const charSupports = await apiGetSupportCardsByCharacter(1001);
const chars = await apiGetCharacters();
const chara = await apiGetCharacterById(1001);
const images = await apiGetCharacterImagesById(1001);

console.log(support?.title_en || support?.title);
console.log(charSupports.length, chars.length, chara?.name_en, images?.length || 0);
```

### Custom API client
```js
import { createUmapyoiClient } from "@fahri/uma-database";

const client = createUmapyoiClient({
  baseUrl: "https://umapyoi.net/api/v1",
  timeoutMs: 20000
});

const info = await client.get("/character/1001");
console.log(info?.name_en || info?.name_jp);
```

## Using Command Cores In Bot Repo
Example bridge command file in your bot project:

```js
import { getGacha, setGacha } from '../../database/index.js';
import { trainingCommand, configureTrainingCore } from '@fahri/uma-database';

configureTrainingCore({ getGacha, setGacha });

export default {
  ...trainingCommand
};
```

Do the same pattern for `gachaCommand`.

## Notes
- Data source:
  - Umapyoi API (`https://umapyoi.net/api/v1`)
  - GameTora web data (fetched/scraped from page payload/HTML in command core flows)
- This package does not manage your bot local DB by default; pass adapters with `configureTrainingCore` / `configureGachaCore`.
