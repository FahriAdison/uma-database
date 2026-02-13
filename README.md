# @fahri/uma-database
Uma Musume data and command cores for Node.js / WhatsApp bot projects.

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
- Data source: Umapyoi (`https://umapyoi.net/api/v1`).
- This package does not manage your bot local DB by default; pass adapters with `configureTrainingCore` / `configureGachaCore`.
- Social feed notifier (`socialfeed`) is part of your bot app layer, not this package core.
