# Ctrl+Catch

**Guarda tu código, captura Pokémon.** Un pequeño juego de fans que vive en VS Code mientras programas.

> Proyecto de fans, no oficial y gratuito. No está afiliado ni respaldado por Nintendo, Game Freak ni The Pokémon Company. Pokémon y sus imágenes son marcas y material de sus respectivos propietarios. Los datos y sprites se cargan desde [PokéAPI](https://pokeapi.co) y no vienen incluidos en la extensión.

| ¡Aparece un Pokémon salvaje! | Lanzas una ball… | ¡Capturado! |
|:---:|:---:|:---:|
| ![Un Kabuto salvaje aparece en el panel Encuentro](media/screenshots/encuentro.png) | ![La Quick Ball se sacude con el Pokémon dentro](media/screenshots/lanzamiento.png) | ![Kabuto capturado: +26 monedas](media/screenshots/capturado.png) |

## Cómo se juega

1. **Programa y guarda.** Cada vez que guardas un archivo con texto nuevo escrito por ti, ganas monedas 🪙 (1 por cada 15 caracteres, sin contar espacios ni saltos de línea; hacen falta al menos 20). Mantener una tecla pulsada no sirve: solo cuentan las primeras repeticiones.
2. **Aparece un Pokémon salvaje.** A veces, al guardar, sale uno en el panel *Encuentro* de la barra lateral. Tienes 45 segundos para decidir.
3. **Lanza una ball.** Elige cuál: cada botón muestra la probabilidad de captura de ese lanzamiento. Si falla, puede que el Pokémon siga ahí… o que huya.
4. **Compra más balls.** Pulsa el contador de monedas de la barra de estado para abrir la tienda.
5. **Completa tu colección.** Captura suficientes especies distintas para desbloquear la siguiente generación, de Kanto a Paldea.

Si ves un Pokémon con destellos ★, es un **variocolor** (1 de cada 50): da 50 monedas extra y no se puede vender.

## Balls

| Ball | Precio | Efecto |
|---|---|---|
| Poké Ball | 10 | ×1 |
| Premier Ball | Regalo | ×1.25. No se vende: 1 gratis por cada 10 Poké Balls de una compra |
| Super Ball | 30 | ×1.5 |
| Dusk Ball | 40 | ×3 de noche (20:00–06:00) |
| Ultra Ball | 70 | ×2 |
| Quick Ball | 80 | ×5 en el primer lanzamiento |
| Master Ball | 1000 | Captura segura |

## Objetos

También en la tienda. Los que tienes salen en la sección *Objetos* de la Mochila; el Incienso y la Pokéflauta se usan con el botón de su línea.

| Objeto | Precio | Efecto |
|---|---|---|
| Incienso | 60 | Durante 10 min, el doble de probabilidad de encuentro |
| Pokéflauta | 80 | Vuelve a llamar al último Pokémon que huyó (hasta 10 min después) |
| Moneda Amuleto | 1500 | +10 % de monedas al guardar, para siempre. Solo una |
| Piedras evolutivas | 100 | Fuego, Agua, Trueno, Hoja, Lunar, Solar, Día, Noche, Alba y Hielo. Hacen evolucionar a los que lo necesitan, en lugar de pagar monedas |

A veces un Pokémon capturado lleva una piedra (5 %): la de su tipo o, si no tiene, una al azar.

## Mochila

En la barra de actividad, el icono de Ctrl+Catch abre la *Mochila*, con:

- El progreso hacia la siguiente generación.
- Tus balls y tus objetos.
- Tus estadísticas: tu **racha** de días seguidos programando, caracteres escritos, monedas ganadas y gastadas, encuentros, porcentaje de captura…
- Tus Pokémon capturados. Los repetidos tienen un botón para **venderlos** y recuperar monedas, y los que pueden evolucionar, otro para **evolucionarlos** (una flecha hacia arriba).

## Guardería

Los repetidos tienen otro uso además de venderlos. Pulsa la línea **Guardería** de la *Mochila* (o el comando *Ctrl+Catch: Abrir guardería*) y deja una pareja:

- **Dos copias del mismo Pokémon**, o **cualquier Pokémon con un Ditto** (aunque solo tengas una copia).
- Cada guardado que da monedas hace avanzar el huevo. Cuando está listo, **nace un Pokémon que no tienes**.
- Sale de la **misma categoría** que los padres: de unos Pokémon comunes sale otro común, y de unos legendarios, otro legendario. Cuanto más raros, más tarda:

| Categoría de los padres | Guardados con monedas |
|---|---|
| Común | 50 |
| Poco común | 80 |
| Raro | 150 |
| Legendario | 300 |

- Los padres **no se pierden**: siguen en tu mochila (con la etiqueta *en la guardería*), pero no puedes venderlos ni evolucionarlos hasta que nazca el huevo.
- Hace falta conexión para ver qué nace; si no la hay, el huevo espera. Si no queda ninguna especie nueva de esa categoría, nace otro de la especie de los padres.
- Puedes sacar a los Pokémon antes de tiempo, pero entonces se pierde el huevo.

## Pokémon favorito

Elige uno de tus Pokémon como **favorito** (clic derecho sobre él en la *Mochila* → *Elegir como favorito*, o el comando *Ctrl+Catch: Elegir Pokémon favorito*). Su **tipo** te da un pequeño efecto mientras lo tengas:

| Tipos | Efecto |
|---|---|
| Eléctrico, acero, normal | +5 % de monedas al guardar |
| Tierra, roca, dragón | +20 % de monedas al capturar |
| Fuego, volador, bicho | +15 % de probabilidad de encuentro |
| Lucha, siniestro, veneno | +10 % de probabilidad de captura |
| Psíquico, hada, fantasma | ×1,5 de probabilidad de variocolor |
| Planta, agua, hielo | el doble de probabilidad de que un capturado lleve una piedra |

La línea **Favorito** de la Mochila te recuerda cuál es y qué efecto tiene. Si su última copia evoluciona, él evoluciona también y toma el efecto de su nuevo tipo. Los efectos se suman a los de los objetos (por ejemplo, la Moneda Amuleto).

## Logros

Pulsa el botón del trofeo de la cabecera de la *Mochila* (junto al de la Pokédex), o la línea **Logros**, para abrir una pestaña con todos los retos (capturas, especies distintas, días seguidos, código escrito, evoluciones, variocolores, generaciones…) con lo que te falta para cada uno. Al conseguir uno aparece un **Pokémon de recompensa**: cuanto más difícil el logro, más raro es (común, poco común, raro o legendario). No huye si fallas, y si lo dejas escapar sigue esperándote en el siguiente guardado. Necesitas tener alguna ball.

## Evoluciones

Los Pokémon de la *Mochila* que pueden evolucionar muestran un botón con una flecha hacia arriba (tarda un momento en aparecer la primera vez, mientras consulta la PokéAPI). Púlsalo para evolucionarlo pagando monedas (de 30 a 150, según lo difícil que sea la evolución). Los que en los juegos evolucionan con una piedra (Pikachu, Vulpix, Eevee…) necesitan esa piedra en lugar de monedas. Si tiene varias (como Eevee), eliges cuál. Se gasta una copia, el variocolor se conserva, y solo puedes evolucionar a Pokémon de generaciones ya desbloqueadas.

## Pokédex

Pulsa el botón del libro de la cabecera de la *Mochila* (o el comando *Ctrl+Catch: Abrir Pokédex*) para ver tu colección en grande:

- Las especies que has capturado aparecen en color, con cuántas tienes y una ★ si tienes su variocolor.
- Las que te faltan se ven solo como silueta.
- Progreso total y por generación, con filtros *Todos*, *Capturados* y *Me faltan*.
- **Pulsa un Pokémon capturado para ver su ficha**: su sprite (y el variocolor, si lo tienes), sus tipos, la categoría y la descripción de la Pokédex de los juegos, cuántas veces lo has capturado y la fecha de la primera captura. Se cierra con la X, con *Esc* o pulsando fuera. La descripción necesita conexión; la fecha solo existe en los Pokémon que captures a partir de esta versión.

## Comandos

- **Ctrl+Catch: Abrir Pokédex**
- **Ctrl+Catch: Abrir tienda**
- **Ctrl+Catch: Pausar o reanudar**: sin monedas ni encuentros mientras está en pausa (también con el botón ⏸ de la barra de estado).
- **Ctrl+Catch: Sincronizar partida ahora**
- **Ctrl+Catch: Reiniciar progreso**

## Ajustes

- **`pokemonCompanion.encounterChance`**: probabilidad de encuentro tras un guardado que da monedas (de 0.05 a 1; por defecto 0.25).
- **`pokemonCompanion.encounterCooldownSeconds`**: segundos mínimos entre encuentros (de 10 a 3600; por defecto 60).
- **`pokemonCompanion.syncFolder`**: carpeta de sincronización (ver abajo).

## Jugar en varios ordenadores

La partida se guarda en un archivo `partida.json` dentro de una carpeta compartida:

- Por defecto, `OneDrive/PokemonCompanion`.
- O la carpeta que indiques en el ajuste **`pokemonCompanion.syncFolder`** (Dropbox, Google Drive, una carpeta de red…).

Se sincroniza al abrir VS Code, al volver a la ventana, unos segundos después de cada cambio y al cerrar. Si la partida ha cambiado en dos ordenadores a la vez, puedes **combinarlas**: se juntan las capturas de los dos, se suman las monedas y balls ganadas o gastadas en cada uno, y se quitan los repetidos que vendiste. También puedes quedarte con una de las dos.

## Privacidad

- No hay telemetría.
- Solo se conecta a `pokeapi.co` y a `raw.githubusercontent.com` para descargar los datos y sprites de los Pokémon.
- No se lee el contenido de tus archivos: solo se cuenta cuántos caracteres añades.

## Licencia

Código bajo licencia [MIT](LICENSE).
