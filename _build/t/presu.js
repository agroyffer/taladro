require('./stub.js');
const src=require('fs').readFileSync('/tmp/inline.js','utf8');
const raw=JSON.parse(JSON.stringify(require('/sessions/friendly-modest-noether/mnt/uploads/trade_xyz_2026-07-29 (2).json')));
raw.state.xyz.assetPositions=[]; raw.state.xyz.marginSummary.accountValue='3.42'; raw.orders.xyz=[];
global.__raw=raw;
global.__limpio = h => h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const extra = `
;(function(){
  ingest(__raw);
  const g=id=>__el(id), chk=(c,m)=>console.log((c?'  ok  ':'  FAIL ')+m);
  chk(g('presu').innerHTML.includes('class="ult"'), 'tira de las ultimas 5');
  chk(g('presu').innerHTML.includes('Tus últimas 5'), 'dice de cuantas es la mediana');
  chk(!/undefined|NaN/.test(g('presu').innerHTML), 'sin NaN');
  console.log('');
  console.log('  ' + __limpio(g('presu').innerHTML));
  const barras=(g('presu').innerHTML.match(/<i class/g)||[]).length;
  console.log('  barras dibujadas: ' + barras);
})();
`;
eval(src + extra);
