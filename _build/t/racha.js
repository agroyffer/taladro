require('./stub.js');
const src = require('fs').readFileSync('/tmp/inline.js','utf8');
const base = require('/sessions/friendly-modest-noether/mnt/uploads/trade_xyz_2026-07-29 (2).json');
const raw = JSON.parse(JSON.stringify(base));
raw.state.xyz.assetPositions = []; raw.orders.xyz = [];
global.__raw = raw;
const extra = [
';(function(){',
'  const g = id => __el(id);',
'  ingest(__raw);',
'  const S = computeStats(filtered(true));',
'  const casos = [',
'    ["ninguna operacion", []],',
'    ["ultima ganadora sola", [{net:-1},{net:0.5}]],',
'    ["ultima perdedora sola", [{net:0.5},{net:-0.2}]],',
'    ["dos perdidas", [{net:0.5},{net:-0.2},{net:-0.3}]],',
'    ["cinco perdidas", [{net:0.5},{net:-1},{net:-1},{net:-1},{net:-1},{net:-1}]],',
'    ["tres ganadas", [{net:-1},{net:0.2},{net:0.3},{net:0.4}]]',
'  ];',
'  console.log("  celda RACHA en cada caso:");',
'  for (const c of casos) {',
'    const S2 = Object.assign({}, S, { trades: c[1] });',
'    renderTira(S2, { hoy: [], net: 0 });',
'    const h = g("resumen").innerHTML;',
'    const m = h.match(/Racha<\\/div>\\s*<div class="v mono ([a-z]+)">([^<]*)<\\/div>\\s*<div class="n">([^<]*)</);',
'    console.log("   " + c[0].padEnd(22) + " -> " + (m ? m[2].padEnd(8) + " " + m[3] + "  (" + m[1] + ")" : "?"));',
'  }',
'})();'
].join("\n");
eval(src + extra);
