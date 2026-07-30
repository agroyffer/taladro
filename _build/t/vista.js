require('./stub.js');
const src=require('fs').readFileSync('/tmp/inline.js','utf8');
const raw=JSON.parse(JSON.stringify(require('/sessions/friendly-modest-noether/mnt/uploads/trade_xyz_2026-07-29 (2).json')));
raw.state.xyz.assetPositions=[]; raw.state.xyz.marginSummary.accountValue='3.42'; raw.orders.xyz=[];
global.__raw=raw;
__setRect('cuerpo',{left:1300,top:710,width:86,height:66});
global.__limpio = h => h.replace(/<[^>]+>/g,' | ').replace(/\s+/g,' ').replace(/\| \|/g,'|').trim();
const extra = `
;(function(){
  ingest(__raw);
  const g=id=>__el(id), chk=(c,m)=>console.log((c?'  ok  ':'  FAIL ')+m);
  chk(g('franja').innerHTML.includes('class="big mono'), 'franja con el numero grande');
  chk(g('resumen').innerHTML.includes('class="tira"'), 'tira densa');
  chk(!/undefined|NaN/.test(g('franja').innerHTML+g('resumen').innerHTML+g('mejorar').innerHTML), 'sin NaN');
  console.log('');
  console.log('  FRANJA: ' + __limpio(g('franja').innerHTML));
  console.log('');
  console.log('  TIRA:   ' + __limpio(g('resumen').innerHTML));
  console.log('');
  console.log('  OBJETIVO nivel 1: ' + __limpio(g('mejorar').innerHTML));
  DATOS.objetivo = { id: DATOS.objetivo.id, ops: 0 };
  render();
  console.log('');
  console.log('  OBJETIVO nivel 3: ' + __limpio(g('mejorar').innerHTML));
  chk(g('mejorar').innerHTML.includes('mcomp'), 'aparece el boton de compromiso');
  chk(g('mejorar').innerHTML.includes('n3'), 'nivel 3 marcado');
})();
`;
eval(src + extra);
