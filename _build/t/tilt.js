require('./stub.js');
const src = require('fs').readFileSync('/tmp/inline.js','utf8');
const raw = JSON.parse(JSON.stringify(require('/sessions/friendly-modest-noether/mnt/uploads/trade_xyz_2026-07-29 (2).json')));
raw.state.xyz.assetPositions = []; raw.orders.xyz = [];
global.__raw = raw;
const extra = [
';(function(){',
'  const g = id => __el(id), chk = (c,m) => console.log((c ? "  ok  " : "  FAIL ") + m);',
'  ingest(__raw);',
'  chk(document.body.classList.contains("tiltpage"), "la pantalla entera entra en tilt");',
'  chk(document.body.style._v["--tf"] !== undefined, "intensidad segun la racha: --tf = " + document.body.style._v["--tf"]);',
'  chk(g("franja").innerHTML.includes("plata"), "el numero de la franja queda tapado");',
'  chk(g("resumen").innerHTML.includes("plata"), "el neto de hoy queda tapado");',
'  chk(g("tiltSpec").innerHTML.includes("Tamaño máximo"), "especificacion de la proxima");',
'  chk(!/undefined|NaN/.test(g("tiltSpec").innerHTML), "sin NaN");',
'  console.log("");',
'  console.log("  SPEC: " + g("tiltSpec").innerHTML.replace(/<[^>]+>/g," ").replace(/[ ]+/g," ").trim());',
'  g("destapar").onclick();',
'  chk(document.body.classList.contains("destapado"), "se pueden destapar a mano");',
'  chk(g("destapar").textContent === "Volver a taparlos", "y volver a taparlos");',
'})();'
].join("\n");
eval(src + extra);
