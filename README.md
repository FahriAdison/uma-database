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

## Exports
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
```js
import {
  refreshUmaDatabase,
  refreshSupportCardDatabase,
  getRandomUma,
  apiGetSupportCardById
} from "@fahri/uma-database";

await refreshUmaDatabase();
await refreshSupportCardDatabase();

const uma = getRandomUma();
const support = await apiGetSupportCardById(30001);

console.log(uma?.name, support?.title_en || support?.title);
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
- `socialfeed` notifier is not part of this module package. Keep it in your bot app layer (`commands/` + `lib/` in bot repo).
