# Cambios

## [0.6.0] - 2026-10-22

- Interfaz sin emojis (salvo la moneda 🪙): iconos propios de VS Code y SVG en las pestañas.
- Logros: 32 retos (capturas, especies, rachas, código escrito, monedas, evoluciones, variocolores, generaciones…) en una pestaña propia (botón del trofeo junto a la Pokédex) con su progreso, agrupados y con el color de su dificultad. Cada logro da como recompensa un encuentro con un Pokémon más raro cuanto más difícil sea; si lo dejas escapar, sigue pendiente.
- El botón de evolucionar de la Mochila solo aparece en los Pokémon que pueden evolucionar ahora, y su descripción lo indica.

## [0.5.0] - 2026-10-22

- Evoluciones: botón con una flecha hacia arriba en la Mochila para evolucionar un Pokémon pagando monedas. Si tiene varias evoluciones, eliges. Se cuentan en las estadísticas.
- Ajustes de equilibrio: `pokemonCompanion.encounterChance` (probabilidad de encuentro) y `pokemonCompanion.encounterCooldownSeconds` (tiempo mínimo entre encuentros).

## [0.4.0] - 2026-10-22

- Combinar partidas: si la partida ha cambiado en dos ordenadores a la vez, ahora puedes juntar las dos (capturas, monedas, balls y estadísticas) en lugar de quedarte con una y perder la otra.

## [0.3.0] - 2026-10-22

- Estadísticas en la Mochila: racha de días programando, días y caracteres escritos, monedas ganadas y gastadas, encuentros, capturas (con porcentaje), huidas, balls lanzadas y variocolores. Se cuentan desde esta versión.

## [0.2.0] - 2026-10-22

- Pokédex visual: cuadrícula por generación con siluetas de los que faltan, variocolores, repetidos y filtros. Se abre desde la cabecera de la Mochila.

## [0.1.0] - 2026-10-22

Primera versión preparada para el Marketplace, con el nombre **Ctrl+Catch**.

- Nuevo nombre visible e icono propio.
- Reiniciar el progreso pide confirmación.
- Recargar un archivo abierto desde el disco (`git checkout`, `git pull`…) ya no da monedas.
- Sin conexión con la PokéAPI, el encuentro se cancela con un aviso y no gasta el tiempo de espera entre encuentros.
- El contador de monedas se puede ocultar desde el menú de la barra de estado.
- Funciona desde VS Code 1.90.
- Tests de la lógica del juego y de la sincronización.

## [0.0.5] - 2026-10-14

- Pokémon variocolor (1 de cada 50): destellos, +50 monedas y no se pueden vender.
- Botón para pausar el juego.

## [0.0.4] - 2026-10-10

- Panel visual del encuentro: sprites animados, animación del lanzamiento y barra de tiempo.
- Sincronización de la partida entre ordenadores mediante OneDrive (o una carpeta propia).
- Las monedas se cuentan por caracteres nuevos escritos, sin pagar deshacer, rehacer ni borrar.

## [0.0.3] - 2026-10-09

- Generaciones desbloqueables al capturar suficientes Pokémon distintos.
- Monedas por capturar y venta de repetidos.
- Tooltips con sprites grandes en la mochila.

## [0.0.1] - 2026-10-08

- Primera versión: monedas al guardar, encuentros, tienda de balls y mochila.
