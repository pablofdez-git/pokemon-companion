// Regenera las capturas de la guía (img/, logros.png y pokedex.png) con el código actual de la extensión.
// Pinta las pestañas reales (media/*.css y media/*.js) en Chrome con una partida de ejemplo.
// Requisitos: `npm run compile` hecho antes, y conexión a internet (sprites de la PokéAPI).
//   node docs/guia/capturas.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { buscarNavegador } = require('./navegador');

const PROJECT = path.resolve(__dirname, '../..');
const OUT = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlcatch-guia-'));

const { buildAchievements } = require(path.join(PROJECT, 'out/game/achievements'));
const { buildPokedex } = require(path.join(PROJECT, 'out/game/pokedex'));
const { BALLS, ballSpriteUrl } = require(path.join(PROJECT, 'out/game/items'));
const { EMPTY_STATS } = require(path.join(PROJECT, 'out/game/stats'));

const url = (file) => pathToFileURL(file).href;

async function descargar(origen, destino) {
  const res = await fetch(origen);
  if (!res.ok) {
    throw new Error(`${res.status} ${origen}`);
  }
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
}

// Colores de un VS Code oscuro, para que las pestañas se vean como en el editor
const THEME = `
  :root {
    --vscode-foreground: #cccccc;
    --vscode-font-family: "Segoe UI", sans-serif;
    --vscode-font-size: 13px;
    --vscode-editor-background: #1f1f1f;
    --vscode-editorWidget-background: #202020;
    --vscode-widget-border: #313131;
    --vscode-focusBorder: #0078d4;
    --vscode-button-background: #0078d4;
    --vscode-button-foreground: #ffffff;
    --vscode-button-border: transparent;
    --vscode-button-secondaryBackground: #313131;
    --vscode-button-secondaryForeground: #cccccc;
    --vscode-button-secondaryHoverBackground: #3c3c3c;
    --vscode-progressBar-background: #0078d4;
    --vscode-badge-background: #616161;
    --vscode-badge-foreground: #f8f8f8;
    --vscode-charts-yellow: #cca700;
  }
  html { background: #1f1f1f; }`;

function pagina(css, js, mensaje) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${THEME}</style>
<link rel="stylesheet" href="${url(path.join(PROJECT, 'media', css))}">
<script>
  window.acquireVsCodeApi = () => ({ postMessage() {}, getState: () => ({}), setState() {} });
  window.addEventListener('load', () => window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(mensaje)} })));
</script></head>
<body style="width:1040px"><div id="root"></div>
<script src="${url(path.join(PROJECT, 'media', js))}"></script></body></html>`;
}

function capturar(htmlFile, png, ancho, alto) {
  execFileSync(
    buscarNavegador(),
    [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
      `--window-size=${ancho},${alto}`, '--virtual-time-budget=20000',
      `--screenshot=${png}`, url(htmlFile),
    ],
    { stdio: 'inherit' }
  );
}

async function main() {
  // Sprites de las balls para la tabla de la guía
  fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
  for (const ball of BALLS) {
    await descargar(ballSpriteUrl(ball), path.join(OUT, 'img', `${ball.id}.png`));
  }

  // Partida de ejemplo: 40 especies, un variocolor y varios logros conseguidos
  const ids = [1, 3, 4, 5, 6, 7, 8, 10, 11, 14, 16, 19, 21, 23, 25, 27, 30, 32, 35, 39, 41, 43, 52, 54, 58, 60,
    63, 66, 72, 74, 79, 84, 90, 92, 95, 108, 129, 133, 147, 152];
  const captured = [];
  for (const id of ids) {
    const json = await (await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)).json();
    const name = json.name.charAt(0).toUpperCase() + json.name.slice(1);
    captured.push({ id, name, spriteUrl: null, captureRate: 120 });
  }
  captured.push({ ...captured.find((c) => c.id === 25) });
  captured.push({ id: 63, name: 'Abra', spriteUrl: null, captureRate: 200, shiny: true });

  const hechos = ['captures-1', 'species-10', 'streak-3', 'chars-2000', 'coins-500', 'encounters-10',
    'throws-50', 'evolutions-1', 'captures-25', 'streak-7', 'gen-2', 'shiny-1'];
  const cobrados = hechos.filter((id) => id !== 'evolutions-1' && id !== 'shiny-1');
  const state = {
    coins: 342, balls: { pokeball: 5, greatball: 3 }, captured, generationsUnlocked: 2, updatedAt: 1,
    stats: { ...EMPTY_STATS, captures: 47, encounters: 92, throws: 131, charsWritten: 18400, coinsEarned: 1260, evolutions: 2, bestStreak: 8, streak: 5, activeDays: 11 },
    achievements: hechos, achievementsClaimed: cobrados,
  };

  const tierBalls = {};
  for (const [nivel, id] of [[1, 'pokeball'], [2, 'greatball'], [3, 'ultraball'], [4, 'masterball']]) {
    tierBalls[nivel] = url(path.join(OUT, 'img', `${id}.png`));
  }

  const logrosHtml = path.join(TMP, 'logros.html');
  fs.writeFileSync(logrosHtml, pagina('achievements.css', 'achievements.js',
    { type: 'update', achievements: buildAchievements(state), tierBalls }));
  const pokedexHtml = path.join(TMP, 'pokedex.html');
  fs.writeFileSync(pokedexHtml, pagina('pokedex.css', 'pokedex.js',
    { type: 'update', pokedex: buildPokedex(state) }));

  // Alturas: cabecera y dos grupos de logros; cabecera y tres filas de la Pokédex
  capturar(logrosHtml, path.join(OUT, 'logros.png'), 1100, 672);
  capturar(pokedexHtml, path.join(OUT, 'pokedex.png'), 1100, 592);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('Capturas regeneradas en', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
