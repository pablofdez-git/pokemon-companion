// Genera el PDF de la guía a partir de guia.html (necesita Chrome, Edge o Chromium)
//   node docs/guia/construir.js
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { buscarNavegador } = require('./navegador');

const html = path.join(__dirname, 'guia.html');
const pdf = path.resolve(__dirname, '../../Ctrl-Catch-Guia-del-Entrenador.pdf');

execFileSync(
  buscarNavegador(),
  ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href],
  { stdio: 'inherit' }
);
console.log(`Guía generada: ${pdf}`);
