# CLAUDE.md

Guía del proyecto para Claude Code (y para cualquiera que se incorpore).

## Qué es

**Ctrl+Catch** (id interno `pokemon-companion`) es una extensión de VS Code (TypeScript, sin dependencias de ejecución) que convierte programar en un pequeño juego de Pokémon:

- Al **guardar** un archivo con texto nuevo escrito, ganas **monedas** 🪙.
- Tras un guardado que da monedas, a veces aparece un **Pokémon salvaje** en el panel *Encuentro* de la barra lateral. Le lanzas balls para capturarlo (o huyes, o se cansa y se va).
- Con las monedas compras **balls** en la **tienda** (clic en el contador de monedas de la barra de estado).
- La **Mochila** (vista de árbol) muestra tus balls, tus Pokémon y el progreso de generaciones. Los **repetidos** se pueden vender.
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
- VS Code mínimo: `^1.138.0`. Node con `fetch` global (se usa directamente, sin librerías HTTP).
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
    items.ts              Catálogo de balls (precio, regla, multiplicador según contexto)
    pokedex.ts            buildPokedex(): agrupa capturas por especie y generación (siluetas, shiny)
    shop.ts               buyBall / sellDuplicate
    stats.ts              GameStats (contadores) y racha de días: recordActivity, currentStreak
    syncRules.ts          decideSync(): push / pull / conflict / none
    syncMerge.ts          mergeStates(): combina dos partidas en un conflicto (con o sin base)
  ui/                     Todo lo que toca la interfaz de VS Code
    statusBar.ts          Contador de monedas (abre la tienda)
    pauseToggle.ts        Botón de pausa + context key `pokemonCompanion.paused`
    shop.ts               Tienda con QuickPick + InputBox
    backpackView.ts       TreeDataProvider de la Mochila
    encounterPanel.ts     WebviewViewProvider del panel Encuentro (protocolo de mensajes)
    encounterView.ts      runEncounter(): bucle de un encuentro completo
    pokedexPanel.ts       WebviewPanel de la Pokédex (pestaña del editor, se refresca con onDidChange)
media/
  encounter.js / .css     Código del webview del encuentro (JS plano, sin bundler) y estilos
  pokedex.js / .css       Webview de la Pokédex (cuadrícula, filtros; recuerda el filtro con vscode.setState)
  sidebar.svg, sell-*.svg   Iconos (sidebar = barra de actividad; icon.png = icono de la tienda)
  screenshots/              Capturas para el README (no se empaquetan)
```

## Cómo funciona

### Estado (`data/state.ts`)
- Todo el progreso es un único objeto `GameState` guardado en `context.globalState` con la clave `pokemonCompanion.state`:
  `coins`, `balls` (id → cantidad), `captured` (lista de `CapturedPokemon`, con repetidos), `generationsUnlocked`, `updatedAt`.
- **Siempre se modifica con `state.update(s => { ... })`**: hace copia profunda, aplica el cambio, pone `updatedAt = Date.now()`, guarda y dispara `onDidChange`. La UI (barra de estado, mochila) y la sincronización se suscriben a ese evento.
- `get()` normaliza partidas antiguas (campos que faltan, capturas guardadas en formato viejo). Los campos nuevos del estado deben ser opcionales o tener un valor por defecto aquí, para no romper partidas existentes ni las sincronizadas.
- `replaceWith()` aplica una partida remota **sin tocar** `updatedAt`.

### Monedas (`events/activityTracker.ts` + `game/economy.ts`)
- `ActivityTracker` escucha `onDidChangeTextDocument` y solo cuenta **caracteres añadidos** en archivos `file:`; ignora borrados, deshacer y rehacer.
- Un limitador (ráfaga de 200 caracteres, recarga a 8 car/s) evita que pegar o autocompletar en bucle dé monedas sin fin.
- Al guardar: `peek()` → `rewardForSave()` (1 moneda cada 20 caracteres, mínimo 20). Solo si se ganan monedas se hace `consume()`; así lo escrito sigue acumulándose hasta llegar al mínimo. En pausa, se descarta lo escrito.

### Encuentros (`game/encounter.ts`, `ui/encounterView.ts`, `ui/encounterPanel.ts`)
1. Tras un guardado con recompensa, `rollEncounter(chance)`. `EncounterGate` impide encuentros simultáneos y aplica el cooldown. Ambos valores salen de los ajustes `pokemonCompanion.encounterChance` y `encounterCooldownSeconds` (scope `application`), leídos en cada uso en `extension.ts` y limitados con `clampEncounterChance` / `cooldownMsFromSeconds`; `ENCOUNTER_CHANCE` y `ENCOUNTER_COOLDOWN_MS` son los valores por defecto. Si cambias los límites, hazlo también en `package.json`.
2. Se elige un id aleatorio entre 1 y `maxPokemonId(generationsUnlocked)`, se pide a la PokéAPI y se decide si es shiny.
3. `runEncounter()` hace un bucle: muestra las balls disponibles con su multiplicador y probabilidad → espera la elección (45 s de límite) → gasta la ball → tira la captura → anima el lanzamiento → captura (recompensa + posible desbloqueo de generación) o fallo (30 % de que huya).
4. Probabilidad: `min(1, captureRate/255 × multiplicador_de_la_ball)`. El multiplicador depende de un `CatchContext` (número de lanzamiento, si ya tienes la especie, hora local), así funcionan Quick/Dusk/Repeat/Timer Ball.
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

### Generaciones (`game/generations.ts`)
- Para desbloquear la siguiente hay que tener `ceil(maxPokemonId(actual) × UNLOCK_FRACTION)` especies **distintas** (los repetidos no cuentan). Puede subir más de una de golpe.

### Tienda y venta (`game/shop.ts`, `ui/shop.ts`)
- `buyBall` comprueba cantidad y monedas. `sellDuplicate` solo vende si queda al menos una copia **normal** (los shiny no se venden ni cuentan como copia). Precio de venta: 60 % de la recompensa de captura.
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
- Comandos: `resetProgress`, `togglePause`, `openShop`, `openPokedex` (botón en la cabecera de la Mochila), `sellDuplicate` (oculto en la paleta; botón en línea en la mochila cuando `viewItem == duplicatePokemon`), `syncNow`.
- Contenedor en la barra de actividad `pokemonCompanion` con las vistas `pokemonCompanion.encounter` (webview) y `pokemonCompanion.backpack` (árbol).
- Ajustes: `pokemonCompanion.syncFolder` (scope `machine`), `encounterChance` y `encounterCooldownSeconds` (scope `application`).

## Convenciones
- Código, comentarios, mensajes y nombres visibles **en español**; identificadores en inglés.
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
- Sin publicar: ajustes de equilibrio (probabilidad y cooldown de encuentros).

**Próximos pasos (en este orden):**
1. **Evoluciones**:
   - Evolucionar un Pokémon capturado, juntando varias copias o pagando monedas (por decidir).
   - Usa `pokemon-species/{id}` → `evolution_chain.url` de la PokéAPI.
   - Tiene que encajar con la Pokédex (la especie evolucionada cuenta como capturada), las estadísticas y `mergeStates`.
2. **Traducción al inglés** (opcional): `vscode.l10n`, `package.nls.json` y `package.nls.es.json`. Todos los textos están escritos a mano en español en `src/` y `media/*.js`.

**Cómo se trabaja cada novedad:**
1. Implementar con su test. La lógica pura va en `game/`.
2. Probar con F5. No instalar el `.vsix` local si tiene la misma versión que la de la tienda.
3. Añadirla a `## [Sin publicar]` en el CHANGELOG y al README.
4. Hacer commit y push, y esperar a que pase el CI.
5. Para publicar: subir `version`, renombrar `## [Sin publicar]` a `## [x.y.z] - fecha`, hacer commit y `git tag vx.y.z && git push origin main vx.y.z`. El CI crea la Release.
6. El usuario sube el `.vsix` al Marketplace a mano (*Update* en marketplace.visualstudio.com/manage).
