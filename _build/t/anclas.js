require('./stub.js');
const src=require('fs').readFileSync('/tmp/inline.js','utf8');
global.__raw=require('/sessions/friendly-modest-noether/mnt/uploads/trade_xyz_2026-07-29 (2).json');
const T='`';
const extra = T + `
;(function(){
  ingest(__raw);
  const g=id=>__el(id), chk=(c,m)=>console.log((c?'  ok  ':'  FAIL ')+m);
  const h=g('enAncla').innerHTML;
  chk(!/undefined|NaN/.test(h), 'sin NaN ni undefined');
  chk(!/no dice nada/.test(h), 'la frase confusa ya no esta');
  chk(/minutos|horas|dias|días/.test(h), 'la duracion trae unidad');
  console.log('');
  console.log('  ANCLAS:');
  h.split('</div>').filter(x=>x.trim()).forEach(x=>
    console.log('   . ' + x.replace(/<[^>]+>/g,'').replace(/[ \\t]+/g,' ').trim()));
})();
` + T;
eval(src + eval(extra));
