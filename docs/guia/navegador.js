// Busca un Chrome, Edge o Chromium instalado: se usa para sacar las capturas y generar el PDF
const fs = require('fs');

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function buscarNavegador() {
  const found = CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('No se ha encontrado Chrome, Edge ni Chromium. Instala uno de ellos.');
  }
  return found;
}

module.exports = { buscarNavegador };
