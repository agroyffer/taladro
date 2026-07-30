require('./stub.js');
const src = require('fs').readFileSync('/tmp/inline.js','utf8');
const conPos = require('/sessions/friendly-modest-noether/mnt/uploads/trade_xyz_2026-07-29 (2).json');
const flat = JSON.parse(JSON.stringify(conPos));
flat.state.xyz.assetPositions = []; flat.orders.xyz = [];
global.__conPos = conPos; global.__flat = flat;
const extra = [
';(function(){',
'  const g = id => __el(id), chk = (c,m) => console.log((c ? "  ok  " : "  FAIL ") + m);',
'  ingest(__conPos);',
'  chk(/enpos/.test(g("tal").className), "con posicion abierta marca enpos: " + g("tal").className);',
'  chk(!g("cuerpo").innerHTML.includes("q2.8 2.2 5.6 0"), "no duerme: los ojos no estan cerrados");',
'  ingest(__flat);',
'  chk(!/enpos/.test(g("tal").className), "sin posicion, sin enpos");',
'  console.log("");',
'  console.log("  el boton, ciclo completo:");',
'  for (let i = 0; i < TAPAS.length; i++) {',
'    console.log("   " + String(i+1).padStart(2) + ". abrir: " + tapa(i)[0].padEnd(22) + " cerrar: " + tapa(i)[1]);',
'  }',
'  chk(TAPAS.length === 14, "catorce variantes");',
'})();'
].join("\n");
eval(src + extra);
