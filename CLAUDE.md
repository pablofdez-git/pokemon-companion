# CLAUDE.md

Guía del proyecto para Claude Code (y para cualquiera que se incorpore).

## Qué es

**Ctrl+Catch** (id interno `pokemon-companion`) es una extensión de VS Code (TypeScript, sin dependencias de ejecución) que convierte programar en un pequeño juego de Pokémon:

- Al **guardar** un archivo con texto nuevo escrito, ganas **monedas** 🪙.
- Tras un guardado que da monedas, a veces aparece un **Pokémon salvaje** en el panel *Encuentro* de la barra lateral. Le lanzas balls para capturarlo (o huyes, o se cansa y se va).
- Con las monedas compras **balls** en la **tienda** (clic en el contador de monedas de la barra de estado).
- La **Mochila** (vista de árbol) muestra tus balls, tus Pokémon, tus logros y el progreso de generaciones. Los **repetidos** se pueden vender y los Pokémon se pueden **evolucionar**.
- Los **logros** dan como recompensa un encuentro con un Pokémon más raro cuanto más difícil sea el logro.
- Capturar suficientes especies distintas **desbloquea la siguiente generación** (Kanto → … → Paldea).
- Hay **variocolores** (shiny, 1/50) con destellos, bonus de monedas, y que no se pueden vender.
- El juego se puede **pausar** y la partida se **sincroniza entre ordenadores** con un archivo JSON (por defecto en OneDrive).

Los datos y sprites vienen de la [PokéAPI](https://pokeapi.co). Todo el texto de la interfaz y los comentarios del código están **en español**.

## Comandos de desarrollo

```bash
npm install
npm run compile   # tsc -p ./  → genera out/
npm run watch     # compilación incremental
npm run lint      # eslint src
npm test          # compile + lint + vscode-test (abre un VS Code de prueba)
npm run package  # genera pokemon-companion-<versión>.vsix (vsce, con out/ limpio)
```

### CI y versiones
- `.github/workflows/ci.yml`: en cada push a `main` y en cada PR pasa lint, tests (con `xvfb-run`) y empaqueta. El `.vsix` queda como artefacto del run.
- **Sacar una versión:**
  1. Sube `version` en `package.json`.
  2. Añade su sección `## [x.y.z] - fecha` al `CHANGELOG.md`.
  3. Haz commit y luego `git tag vx.y.z && git push origin main vx.y.z`.

  El CI comprueba que la etiqueta coincide con la versión y crea la Release de GitHub con el `.vsix` adjunto; las notas salen de la sección del CHANGELOG.
- La publicación en el Marketplace se hace a mano: se sube el `.vsix` en marketplace.visualstudio.com/manage, publisher `pablofdez`.

- Para probar: **F5** en VS Code (`.vscode/launch.json`) abre una ventana *Extension Development Host*.
- Entrada: `out/extension.js` (compilado desde `src/extension.ts`). Activación: `onStartupFinished`.
- VS Code mínimo: `^1.90.0` (campo `engines.vscode` de `package.json`). Node con `fetch` global (se usa directamente, sin librerías HTTP).
- Tests en `src/test/*.test.ts` (Mocha, estilo `suite`/`test`), uno por módulo de `game/` y `data/syncFile.ts`. Se ejecutan dentro de un VS Code de prueba con `npm test`. Para lo que usa `StateManager`, se usa `FakeMemento` (`src/test/fakeMemento.ts`).

## Estructura

```
src/
  extension.ts            Punto de entrada: crea todos los servicios, registra vistas y comandos,
                          y engancha onDidSaveTextDocument (monedas + posible encuentro)
  data/                   Persistencia y datos externos
    state.ts              GameState + StateManager (globalState, evento onDidChange)
    pokeapi.ts            fetchPokemon(id): /pokemon + /pokemon-species, con caché en memoria
    syncFile.ts           Ruta del archivo de sincronización, lectura/escritura atómica (.tmp + rename)
    syncService.ts        Servicio de sincronización (cola serializada, push con retardo, conflictos)
  events/
    activityTracker.ts    Cuenta caracteres añadidos por archivo, con limitador tipo "token bucket"
  game/                   Lógica pura del juego (sin UI; casi todo sin dependencia de vscode)
    economy.ts            Monedas por guardar, por capturar y precio de venta
    encounter.ts          Probabilidades de encuentro, captura, huida, shiny; EncounterGate (cooldown)
    generations.ts        Tabla de generaciones y reglas de desbloqueo
    favorite.ts           Pokémon favorito: efecto pasivo según su tipo (PERK_BY_TYPE), elegir/quitar
    items.ts              Catálogo de balls (precio, regla, multiplicador según contexto)
    objects.ts            Catálogo de objetos (Incienso, Pokéflauta, Moneda Amuleto, piedras) y sus efectos
    pokedex.ts            buildPokedex(): agrupa capturas por especie y generación (siluetas, shiny)
    shop.ts               buyBall / sellDuplicate
    stats.ts              GameStats (contadores) y racha de días: recordActivity, currentStreak
    typing.ts             Qué cuenta al escribir: sin espacios (countableChars) y sin teclas mantenidas (RepeatFilter)
    syncRules.ts          decideSync(): push / pull / conflict / none
    evolution.ts          nextEvolutions(), evolutionCost(), evolvePokemon()
    achievements.ts       Lista de logros, comprobación, recompensas pendientes y pickRewardPokemon()
    syncMerge.ts          mergeStates(): combina dos partidas en un conflicto (con o sin base)
  ui/                     Todo lo que toca la interfaz de VS Code
    statusBar.ts          Contador de monedas (abre la tienda)
    pauseToggle.ts        Botón de pausa + context key `pokemonCompanion.paused`
    shop.ts               Tienda con QuickPick + InputBox
    backpackView.ts       TreeDataProvider de la Mochila
    encounterPanel.ts     WebviewViewProvider del panel Encuentro (protocolo de mensajes)
    encounterView.ts      runEncounter(): bucle de un encuentro completo
    evolution.ts          evolveFromBackpack(): QuickPick de evoluciones
    favorite.ts           chooseFavorite() / setFavoriteFor(): QuickPick y elección con el tipo
    pokedexPanel.ts       WebviewPanel de la Pokédex (pestaña del editor, se refresca con onDidChange)
    achievementsPanel.ts  WebviewPanel de los Logros (misma estructura que la Pokédex)
docs/guia/                Guía del entrenador en PDF (código fuente, ver más abajo)
media/
  encounter.js / .css     Código del webview del encuentro (JS plano, sin bundler) y estilos
  pokedex.js / .css       Webview de la Pokédex (cuadrícula, filtros; recuerda el filtro con vscode.setState)
  achievements.js / .css  Webview de los Logros (cabecera con pokéball en CSS, tarjetas por grupo con el color del nivel)
  sidebar.svg, sell-*.svg   Iconos (sidebar = barra de actividad; icon.png = icono de la tienda)
  screenshots/              Capturas para el README (no se empaquetan)
```

## Cómo funciona

### Estado (`data/state.ts`)
- Todo el progreso es un único objeto `GameState` guardado en `context.globalState` con la clave `pokemonCompanion.state`:
  `coins`, `balls` (id → cantidad), `items` (objetos: id → cantidad), `incenseUntil` (ms; 0 = apagado), `captured` (lista de `CapturedPokemon`, con repetidos; las nuevas guardan `types`), `generationsUnlocked`, `updatedAt`, `stats`, `achievements`, `achievementsClaimed` y `favorite` (opcional).
- **Siempre se modifica con `state.update(s => { ... })`**: hace copia profunda, aplica el cambio, pone `updatedAt = Date.now()`, guarda y dispara `onDidChange`. La UI (barra de estado, mochila) y la sincronización se suscriben a ese evento.
- `get()` normaliza partidas antiguas (campos que faltan, capturas guardadas en formato viejo). Los campos nuevos del estado deben ser opcionales o tener un valor por defecto aquí, para no romper partidas existentes ni las sincronizadas.
- `replaceWith()` aplica una partida remota **sin tocar** `updatedAt`.

### Monedas (`events/activityTracker.ts` + `game/economy.ts`)
- `ActivityTracker` escucha `onDidChangeTextDocument` y solo cuenta **caracteres añadidos** en archivos `file:`; ignora borrados, deshacer y rehacer.
- Antes del limitador pasa por `RepeatFilter` (`game/typing.ts`):
  - No cuenta espacios, tabuladores ni saltos de línea.
  - Si un archivo recibe el mismo texto varias veces seguidas, como al mantener una tecla (o `()` que se cierra solo), solo cuentan las `MAX_IDENTICAL_INSERTS` primeras (2).
  - Las inserciones vacías (borrados) no cortan la racha de repeticiones; así no vale alternar con Retroceso.
- Un limitador (ráfaga de 200 caracteres, recarga a 8 car/s) evita que pegar o autocompletar en bucle dé monedas sin fin.
- Al guardar: `peek()` → `rewardForSave()` (1 moneda cada 15 caracteres, mínimo 20). Solo si se ganan monedas se hace `consume()`; así lo escrito sigue acumulándose hasta llegar al mínimo. En pausa, se descarta lo escrito.

### Encuentros (`game/encounter.ts`, `ui/encounterView.ts`, `ui/encounterPanel.ts`)
1. Tras un guardado con recompensa, `rollEncounter(chance)`. `EncounterGate` impide encuentros simultáneos y aplica el cooldown. Ambos valores salen de los ajustes `pokemonCompanion.encounterChance` y `encounterCooldownSeconds` (scope `application`), leídos en cada uso en `extension.ts` y limitados con `clampEncounterChance` / `cooldownMsFromSeconds`; `ENCOUNTER_CHANCE` y `ENCOUNTER_COOLDOWN_MS` son los valores por defecto. Si cambias los límites, hazlo también en `package.json`.
2. Se elige un id aleatorio entre 1 y `maxPokemonId(generationsUnlocked)`, se pide a la PokéAPI y se decide si es shiny.
3. `runEncounter()` hace un bucle: muestra las balls disponibles con su multiplicador y probabilidad → espera la elección (45 s de límite) → gasta la ball → tira la captura → anima el lanzamiento → captura (recompensa + posible desbloqueo de generación) o fallo (30 % de que huya).
4. Probabilidad: `min(1, captureRate/255 × multiplicador_de_la_ball)`. El multiplicador depende de un `CatchContext` (número de lanzamiento, hora local), así funcionan la Quick Ball y la Dusk Ball.
- El encuentro se lanza con `void startEncounter()` (sin `await`) para no bloquear el guardado.

**Protocolo del webview** (`encounterPanel.ts` ↔ `media/encounter.js`, con `postMessage`):
- Extensión → panel: `idle`, `encounter` (pokemon, mensaje, balls, `deadline`, `timeoutMs`), `playThrow` (sprite, sacudidas, capturado), `ended`.
- Panel → extensión: `ready`, `throw` (ballId), `flee`, `throwDone`.
- El panel guarda `lastMessage` y lo reenvía en `ready` o al volver a hacerse visible. La vista se registra con `retainContextWhenHidden`.
- `reveal()` abre la vista sin robar el foco del editor. `abort()` corta el encuentro al pausar.
- El HTML usa CSP con nonce; `encounter.js` crea el DOM con `textContent` (nada de `innerHTML`). Imágenes solo `https:`/`data:`.
- Sprites animados de Black/White (solo hasta el #649), escalados por un entero para que se vean nítidos; si fallan se usa el estático.

### Pokédex (`game/pokedex.ts`, `ui/pokedexPanel.ts`, `media/pokedex.*`)
- `buildPokedex(state)` es pura y testeada: una entrada por especie de las generaciones desbloqueadas; las no capturadas llevan `name: null` y el sprite genérico de `speciesSpriteUrl(id)`, que el CSS pinta como silueta (`filter: brightness(0)`).
- Panel único: `show()` lo crea o lo trae al frente. Protocolo: panel → `ready`; extensión → `update` con el `PokedexData` completo (también en cada `state.onDidChange`).
- Se abre con `pokemonCompanion.openPokedex` (botón `$(book)` en `view/title` de la Mochila).

### Estadísticas (`game/stats.ts`)
- `GameState.stats` guarda contadores acumulados. Se apuntan donde ocurre cada cosa:
  - `rewardForSave`: monedas, caracteres y día activo.
  - `rewardForCapture`: capturas y monedas.
  - `buyBall` y `sellDuplicate`: monedas gastadas y ganadas.
  - `runEncounter`: encuentros y huidas; `playEncounter` cuenta los lanzamientos.
- Racha: `recordActivity` cuenta un día cuando un guardado da monedas, con `dayKey` en hora local. `currentStreak` devuelve 0 si el último día activo no fue hoy ni ayer.
- `StateManager.get()` rellena con `EMPTY_STATS` los contadores que falten, así que añadir uno nuevo es compatible con partidas antiguas.
- Se muestran en la sección "Estadísticas" de la Mochila. Tiene id fijo (`section-stats`) para que VS Code recuerde si está plegada.

### Evoluciones (`game/evolution.ts`, `ui/evolution.ts`)
- Botón en línea (`$(arrow-circle-up)`) → comando oculto `pokemonCompanion.evolve`. Solo sale en los Pokémon con `evolvable` en su `contextValue` (que es una lista de palabras: `duplicatePokemon`/`singlePokemon` + `evolvable`; los `when` de `package.json` usan `=~`).
- La mochila es síncrona, así que `BackpackProvider.prefetchEvolutions()` consulta en segundo plano (de una en una) las especies que no están en la caché de `cachedEvolutionIds()` y refresca el árbol al terminar. Si falla, no reintenta hasta pasado 1 min. Sin conexión, el botón no sale.
- `fetchEvolutions(id)` (`data/pokeapi.ts`): `pokemon-species/{id}` → `evolution_chain.url`, y `nextEvolutions()` (pura) saca del árbol las evoluciones directas, cada una con la piedra que necesita (`{ id, stone }`). Con caché. Las ramificadas (Eevee) se eligen en un QuickPick.
- `evolvePokemon()` cambia **una copia** (normal o variocolor, la que se elija) por la evolución y cobra `evolutionCost(captureRate de la evolución)`: 30–150 monedas. Se puede evolucionar la única copia (la base deja de estar capturada). El variocolor se conserva.
- Solo se ofrecen evoluciones de generaciones ya desbloqueadas (`availableEvolutions`; la Pokédex solo muestra esas). Las que en la API se hacen con una piedra de la tienda necesitan esa piedra en lugar de monedas (ver Objetos); las demás condiciones (nivel, intercambio, otros objetos) no se comprueban y se pagan con monedas.
- Cuenta en `stats.evolutions` (sumable en `mergeStates`) y `coinsSpent`; puede desbloquear generaciones como una captura.

### Logros (`game/achievements.ts`)
- Cada logro es un contador con objetivo (`progress(state) >= target`) y un nivel de dificultad (`tier` 1–4). Se apuntan en `state.achievements` (ids); la recompensa cobrada va en `achievementsClaimed`. Pendientes = conseguidos − cobrados (`pendingRewards`).
- Se comprueban con `unlockAchievements()`, encadenado en una cola (`checkAchievements` en `extension.ts`) y llamado en cada `state.onDidChange`, así que cualquier cosa (guardar, capturar, evolucionar…) puede completar uno. Un logro nuevo avisa con una notificación (resumida si son más de 3).
- **Recompensa**: un encuentro especial (`startEncounter(reward)`) con un Pokémon elegido por `pickRewardPokemon(tier, ...)`: pide tandas de ids al azar y acepta el primero cuyo `captureRate` cae en `TIER_CAPTURE_RATES[tier]` (común → legendario); si ninguno encaja, el más cercano. No tiene cooldown, no huye tras un fallo (`runEncounter(..., { rewardFor })`) y solo se da por cobrada al **capturarlo** (`claimReward`); si lo dejas escapar sigue pendiente.
- Cuándo sale: justo después de un guardado con recompensa (antes que la tirada de encuentro aleatorio) o 4 s después de una captura que haya dado un logro nuevo. Solo si tienes alguna ball y el juego no está en pausa.
- Para añadir un logro: una entrada en `ACHIEVEMENTS` con id **estable** (se guarda en las partidas). Se combinan en `mergeStates` por unión.
- **Pestaña de Logros** (`ui/achievementsPanel.ts`, `media/achievements.*`, como la Pokédex): se abre con `pokemonCompanion.openAchievements` (botón `$(trophy)` junto al de la Pokédex en la cabecera de la Mochila, o la línea "Logros" de la Mochila). `buildAchievements(state)` (pura, testeada) agrupa los logros (`ACHIEVEMENT_GROUPS`) con su progreso; protocolo igual que la Pokédex: panel → `ready`; extensión → `update` con `achievements` y `tierBalls` (URL de la ball de cada nivel: Poké, Super, Ultra y Master). Filtros Todos / Conseguidos / Por conseguir, recordados con `vscode.setState`.
- Cada logro lleva `group` (uno de `ACHIEVEMENT_GROUPS`).

### Guía del entrenador en PDF (`docs/guia/`)
- Guía para usuarios (instalación, primera partida, mochila, balls, Pokédex, logros, evoluciones, ajustes y problemas frecuentes). El PDF final es `Ctrl-Catch-Guia-del-Entrenador.pdf` en la raíz (fuera de git y del `.vsix`; `docs/**` y `*.pdf` están en `.vscodeignore`).
- Se escribe en `docs/guia/guia.html` (A4, una `<section class="page">` por página, con cabecera y pie dentro de cada una: **cada página tiene alto fijo y lo que sobra se recorta**, así que hay que mirar el PDF después de tocar el texto). El número de página sale de un contador CSS; si se mueve contenido, revisar las referencias del tipo "ver página 10".
- Para generarla hace falta Chrome, Edge o Chromium (`navegador.js` lo busca):
  - `npm run compile` y `node docs/guia/capturas.js`: regenera `logros.png`, `pokedex.png` e `img/` (sprites de las balls) pintando las pestañas reales (`media/*.css` y `*.js`) con una partida de ejemplo. Necesita internet (PokéAPI).
  - `node docs/guia/construir.js`: genera el PDF en la raíz.
- Las capturas de la Mochila y el Encuentro son reales y salen de `media/screenshots/` (las mismas del README); no se pueden generar desde el código, así que hay que sustituirlas a mano si cambia mucho la interfaz (la de la Mochila no incluye todavía las líneas Logros y Estadísticas).
- **Hay que actualizarla en cada versión que cambie algo visible** (instalación, pantallas, precios, ajustes, comandos). Los datos que cita salen del código: precios de `game/items.ts` y `game/objects.ts`, umbrales de `game/generations.ts` y `game/achievements.ts`, probabilidades de `game/encounter.ts`, versión mínima de `package.json`. Sin emojis, como el resto del proyecto (la moneda de la guía es un SVG dibujado).

### Objetos (`game/objects.ts`, sección Objetos de `ui/backpackView.ts`)
- Catálogo `OBJECTS` (como `BALLS`): `id`, `price`, `rule`, `spriteSlug` (sprite de PokéAPI), `kind` y `unique`. Los ids de las piedras son los nombres de la PokéAPI (`fire-stone`…), para casarlos con la cadena evolutiva.
- Se compran con `buyObject` (`game/shop.ts`); la tienda tiene dos apartados (separadores del QuickPick). Los `unique` (Moneda Amuleto) no preguntan cantidad y solo se tiene uno; `normalizeState()` lo limita a 1 (al combinar partidas podrían salir dos).
- **Incienso**: `useIncense()` pone `incenseUntil`; mientras dure, `encounterChanceWithIncense()` multiplica la probabilidad de encuentro (el cooldown sigue). En `mergeStates` se toma el máximo. La Mochila se refresca sola al apagarse.
- **Moneda Amuleto**: `amuletBonus()` → `coinsForChanges(chars, bonus)`. El bonus se aplica a los caracteres antes de redondear (si no, en guardados pequeños no daría nada); el mínimo de caracteres se mira sin bonus.
- **Piedras**: `nextEvolutions()` (`game/evolution.ts`) devuelve `{ id, stone }`; `stone` sale de `evolution_details` (`trigger: use-item` con una piedra de `STONE_IDS`). Esas evoluciones gastan la piedra en lugar de monedas (`evolvePokemon(..., stone)`). Al capturar, `rollStoneDrop(types)` (5 %) da la piedra de su tipo (`STONE_BY_TYPE`) o una al azar; por eso `PokemonData` lleva `types`.
- **Pokéflauta**: el último Pokémon que huyó de un encuentro normal (`lastFled` en `extension.ts`, solo en memoria, no se sincroniza) se puede llamar durante `FLUTE_WINDOW_MINUTES` con `startEncounter({ kind: 'recall' })`: sin cooldown y con el mismo variocolor. La flauta solo se gasta si el encuentro empieza, y a cada Pokémon solo se le llama una vez.
- El botón de usar (comando oculto `pokemonCompanion.useObject`, `$(play)`) sale en las líneas con `contextValue == usableObject`: el Incienso si no hay uno encendido y la Pokéflauta si hay a quién llamar.

### Pokémon favorito (`game/favorite.ts`, `ui/favorite.ts`)
- Solo cambia números, no pone nada en pantalla. `state.favorite = { id, shiny, type }` apunta a una de tus capturas y **guarda su primer tipo**: las capturas nuevas llevan `types` (de `PokemonData`), y para las antiguas `setFavoriteFor()` lo pide a la PokéAPI al elegirlo (necesita conexión solo en ese momento).
- `PERK_BY_TYPE` da un efecto a cada uno de los 18 tipos, tres tipos por efecto: monedas al guardar +5 % (eléctrico, acero, normal), monedas al capturar +20 % (tierra, roca, dragón), probabilidad de encuentro +15 % (fuego, volador, bicho), de captura +10 % (lucha, siniestro, veneno), de variocolor ×1,5 (psíquico, hada, fantasma) y de que un capturado lleve piedra ×2 (planta, agua, hielo). Los valores son constantes `FAVORITE_*` arriba del archivo.
- `perkValue(state, kind)` devuelve el valor si ese efecto es el activo y el neutro si no (0 para los que se suman, 1 para los que multiplican), así que los puntos de uso no necesitan comprobar nada: `rewardForSave` (suma al bonus de la Moneda Amuleto), `rewardForCapture`, `currentEncounterChance()` en `extension.ts` (junto al Incienso), `CatchContext.captureBonus` en `catchProbability`, `rollShiny(…, multiplier)` y `rollStoneDrop(…, multiplier)`.
- Si ya no tienes al favorito (por ejemplo, tras sincronizar), `findFavorite()` no lo encuentra y no da efecto. Si evoluciona su **última copia**, `evolvePokemon` lo mueve a la evolución y actualiza su tipo; si quedan copias se queda. Vender no necesita regla extra: solo se venden repetidos normales, y el variocolor no se vende.
- Se elige con clic derecho en un Pokémon de la Mochila (`setFavorite`, oculto en la paleta) o con `chooseFavorite` (QuickPick); `clearFavorite` lo quita (también desde el clic derecho en la línea Favorito). La Mochila tiene una línea "Favorito" (`$(heart)`, `contextValue` `favorite` / `noFavorite`) con su efecto, y el Pokémon elegido lleva "favorito" en la descripción.
- En `mergeStates` gana el lado que cambió de favorito desde la base; si cambiaron los dos, el de `updatedAt` más reciente.

### Generaciones (`game/generations.ts`)
- Para desbloquear la siguiente hay que tener `ceil(maxPokemonId(actual) × UNLOCK_FRACTION)` especies **distintas** (los repetidos no cuentan). Puede subir más de una de golpe.

### Tienda y venta (`game/shop.ts`, `ui/shop.ts`)
- `buyBall` comprueba cantidad y monedas. Las balls con `price: null` (Premier) no se venden: la Premier se regala, 1 por cada `PREMIER_EVERY` Poké Balls de una misma compra.
- Balls retiradas (`RETIRED_BALLS` en `game/items.ts`: Repeat y Timer): `normalizeState()` las quita y devuelve su precio en monedas (sin sumarlo a `coinsEarned`). Para retirar otra, añádela ahí.
- `sellDuplicate` solo vende si queda al menos una copia **normal** (los shiny no se venden ni cuentan como copia). Precio de venta: 60 % de la recompensa de captura.
- Recompensa de captura: de 5 a 30 monedas según la dificultad (`captureRate`), +50 si es shiny.

### Pausa (`ui/pauseToggle.ts`)
- Se guarda en `globalState` (`pokemonCompanion.paused`), **no se sincroniza**. Pone la context key `pokemonCompanion.paused`, que oculta las vistas (`when` en `package.json`); oculta también el contador de monedas.

### Sincronización (`data/syncFile.ts`, `data/syncService.ts`, `game/syncRules.ts`)
- Archivo: `<pokemonCompanion.syncFolder>/partida.json` o, si el ajuste está vacío, `%OneDrive%/PokemonCompanion/partida.json`. Sin carpeta → desactivada.
- Formato: `{ version: 1, savedAt, state }`. Escritura atómica (`.tmp` + `rename`). Si el archivo existe pero no es válido se lanza error y **nunca se sobrescribe**.
- `decideSync(localUpdatedAt, remoteSavedAt, lastSyncedAt)` compara tres marcas de tiempo; `lastSyncedAt` se guarda en `globalState`. Ambos cambiados → conflicto: diálogo modal para elegir qué partida conservar.
- Cuándo se sincroniza: al arrancar, al recuperar el foco la ventana, 3 s después de cada cambio, con el comando *Sincronizar partida ahora* y al cerrar (`deactivate` → `flush()`, solo push y sin preguntar).
- Todas las operaciones pasan por una cola (`enqueue`) para que no se pisen.
- **Combinar en un conflicto** (`game/syncMerge.ts`):
  - En cada push y pull se guarda en `globalState` la partida sincronizada (`pokemonCompanion.lastSyncedState`), que sirve de **base**.
  - Con base, `mergeStates` suma los cambios de cada lado: `local + remoto − base`, sin bajar de 0. Así se calculan las monedas, las balls, las copias de cada especie (la normal y la variocolor por separado) y los contadores de estadísticas.
  - Sin base (primer conflicto tras actualizar) toma el máximo de cada cosa.
  - La racha y los días activos no se suman: se toma el lado con el último día activo y el máximo de `activeDays` y `bestStreak`.
  - Las generaciones se recalculan con la colección combinada.
  - `normalizeState()` (`data/state.ts`) prepara las partidas remota y base antes de combinarlas.

## Contribuciones en `package.json`
- Comandos: `chooseFavorite` y `clearFavorite` (paleta), `setFavorite` (oculto; menú contextual de los Pokémon de la Mochila), `useObject` (oculto; botón en línea en los objetos usables de la Mochila), `resetProgress`, `togglePause`, `openShop`, `openPokedex` y `openAchievements` (botones en la cabecera de la Mochila), `evolve` (oculto en la paleta; botón en línea en cada Pokémon de la mochila), `sellDuplicate` (oculto en la paleta; botón en línea en la mochila cuando el `contextValue` contiene `duplicatePokemon`), `syncNow`.
- Contenedor en la barra de actividad `pokemonCompanion` con las vistas `pokemonCompanion.encounter` (webview) y `pokemonCompanion.backpack` (árbol).
- Ajustes: `pokemonCompanion.syncFolder` (scope `machine`), `encounterChance` y `encounterCooldownSeconds` (scope `application`).

## Convenciones
- Código, comentarios, mensajes y nombres visibles **en español**; identificadores en inglés.
- **Sin emojis** (los pictogramas de colores del teclado de emojis, como trofeos, regalos o cohetes) en ninguna parte: ni en la interfaz, ni en mensajes, ni en el código, ni en README, CHANGELOG o CLAUDE.md. No encajan con el aspecto de VS Code. En su lugar:
  - Barra de estado, QuickPick, botones y vistas de árbol: iconos de VS Code (codicons): `$(nombre)` en textos que los admiten, `vscode.ThemeIcon` en `TreeItem.iconPath` y `"icon": "$(nombre)"` en `package.json`.
  - Webviews: iconos **SVG en línea** que usan `currentColor` (ver `ICONS` y `icon()` en `media/achievements.js`, y `.icon` en el CSS). Sin librerías de iconos ni fuentes.
  - Notificaciones, tooltips y mensajes (no admiten iconos): texto plano.
  - **Excepción:** la moneda 🪙 se mantiene tal cual, como símbolo de las monedas (contador de la barra de estado, tienda, precios y recompensas). Es el único emoji permitido.
  - Se permiten los símbolos tipográficos normales (`★` para el variocolor y la dificultad, `·`, `×`, `−`, `…`), que no son emojis.
  - Antes de dar algo por terminado, buscar emojis en los archivos tocados.
- Comentarios cortos que explican el *porqué*. Mantener esa densidad.
- La lógica del juego va en `game/` como funciones puras con las constantes de equilibrio exportadas arriba del archivo ("Ajusta estos valores a tu gusto"). La UI en `ui/`; el acceso a datos en `data/`.
- Resultados de operaciones que pueden fallar como uniones discriminadas (`{ ok: true, ... } | { ok: false, reason }`), no excepciones.
- Todo lo que crea suscripciones o recursos implementa `vscode.Disposable` y se añade a `context.subscriptions` en `extension.ts`.
- TypeScript `strict`, módulo `Node16`, target `ES2022`. Estilo: comillas simples, punto y coma, 2 espacios.
- Al añadir un campo al estado: hacerlo opcional o darle valor por defecto en `normalizeState()` (`data/state.ts`), por compatibilidad con partidas antiguas y con otros ordenadores que aún tengan la versión anterior.

## Notas / cosas a vigilar
- Valores de equilibrio por defecto: `ENCOUNTER_CHANCE = 0.25`, `ENCOUNTER_COOLDOWN_MS` = 1 min, `UNLOCK_FRACTION = 0.25`. Si se cambian, actualizar también su comentario y el `default` en `package.json`.
- Los iconos de la mochila y de la tienda se cargan desde URLs remotas (GitHub raw de PokeAPI/sprites); sin conexión no se ven, y sin conexión no puede haber encuentros (falla `fetchPokemon` y el panel vuelve a reposo).
- Los `.vsix` generados están en la raíz y se ignoran en git.

## Hoja de ruta

Publicada en el Marketplace como `pablofdez.pokemon-companion`; la versión actual se ve en `package.json`.

**Hecho:**
- 0.1.0: arreglos, tests, nombre Ctrl+Catch, iconos propios, README de tienda y CI con Releases automáticas.
- 0.2.0: Pokédex visual.
- 0.3.0: estadísticas en la Mochila.
- 0.4.0: combinar partidas en un conflicto de sincronización.
- 0.5.0: ajustes de equilibrio (probabilidad y cooldown de encuentros) y evoluciones.
- 0.6.0: el botón de evolucionar solo en los que evolucionan, logros con recompensa y la interfaz sin emojis.
- 0.6.1: mantener una tecla pulsada ya no da monedas ni encuentros, los espacios no cuentan y 1 moneda cada 15 caracteres.

**Próximos pasos (en este orden, de uno en uno):**
1. **[Hecho, sin publicar] Balls:** quitar la Repeat Ball y la Timer Ball (las que tenga una partida se devuelven en monedas). Añadir la **Premier Ball**: no se vende, se regala 1 por cada 10 Poké Balls de una misma compra. Captura ×1.25, entre la Poké Ball y la Super Ball.
2. **[Hecho, sin publicar] Zona de Objetos** (sección nueva en la Mochila y en la tienda): Incienso, Moneda Amuleto, piedras evolutivas y Pokéflauta. Incienso 60 (×2 encuentros, 10 min), Pokéflauta 80 (llama al último que huyó, hasta 10 min), Moneda Amuleto 1500 (+10 % al guardar, única), piedras 100 (sustituyen a las monedas en las evoluciones con piedra; 5 % de que un capturado lleve una).
3. **[Hecho, sin publicar] Pokémon favorito:** eliges uno de tus Pokémon y su tipo da un efecto pasivo pequeño (monedas, encuentros, captura, variocolor o piedras). Sin nada en pantalla que moleste: el efecto se ve en una línea de la Mochila.
4. **Pokédex con más detalle:** tipos, descripción y fecha de captura de cada especie.
5. **Guardería:** dejas dos repetidos y con el tiempo sale un huevo. Da otro uso a los repetidos, además de venderlos.
6. **Traducción al inglés** (opcional): `vscode.l10n`, `package.nls.json` y `package.nls.es.json`. Todos los textos están escritos a mano en español en `src/` y `media/*.js`.

**Descartado:** el *compañero Pokémon* (uno de los capturados visible en la barra de estado y en un panel lateral, con reacciones). Se implementó y se quitó por resultar un incordio; no hace falta volver a proponerlo.

**Cómo se trabaja cada novedad:**
1. Implementar con su test. La lógica pura va en `game/`.
2. Probar con F5. No instalar el `.vsix` local si tiene la misma versión que la de la tienda.
3. Añadirla a `## [Sin publicar]` en el CHANGELOG y al README, y a la guía (`docs/guia/guia.html`) si cambia algo que ve el usuario.
4. Hacer commit y push, y esperar a que pase el CI.
5. Para publicar: actualizar la versión de la guía (portada, y el nombre del `.vsix` de la instalación), regenerar el PDF, subir `version`, renombrar `## [Sin publicar]` a `## [x.y.z] - fecha`, hacer commit y `git tag vx.y.z && git push origin main vx.y.z`. El CI crea la Release.
6. El usuario sube el `.vsix` al Marketplace a mano (*Update* en marketplace.visualstudio.com/manage).
