require('/tmp/stub.js');
const src = require('fs').readFileSync('/tmp/inline.js','utf8');
const append = `
;(function(){
  const H=36e5, f=(coin,side,px,sz,time,cp=0,fee=0)=>({coin,side,px:String(px),sz:String(sz),time,closedPnl:String(cp),fee:String(fee)});
  let now = Date.parse('2026-04-01T13:30:00Z'), fills=[];
  for(let i=0;i<50;i++){
    const win = i%3!==0, sym = ['xyz:NVDA','xyz:AAPL','BTC'][i%3];
    const pnl = win?12:-25, dur = win?1:5;
    fills.push(f(sym,'B',100,1,now,0,0.2), f(sym,'A',100+pnl,1,now+dur*H,pnl,0.2));
    now += 26*H;
  }
  fills.push(f('xyz:TSLA','B',400,2,now,0,0.5)); // posición abierta
  const funding = [{time: Date.parse('2026-04-02T13:30:00Z'), delta:{coin:'xyz:NVDA', usdc:'-0.8'}}];
  ingest({user:'0x0000000000000000000000000000000000000001', fills, funding, state:null, pulledAt:Date.now()});
  const g = id => __el(id);
  const chk = (c,m)=>console.log((c?'  ok  ':'  FAIL ')+m);
  chk(TRADES.length===51, 'trades reconstruidos: '+TRADES.length);
  chk(!g('app').classList.contains('hide'), 'panel principal visible');
  chk(g('kpis').innerHTML.includes('PnL neto'), 'KPIs renderizados');
  chk(g('insights').innerHTML.includes('ins '), 'insights renderizados');
  chk(!/undefined|NaN/.test(g('insights').innerHTML), 'insights sin NaN/undefined');
  chk(!/undefined|NaN/.test(g('kpis').innerHTML), 'KPIs sin NaN/undefined');
  chk(g('tTrades').innerHTML.includes('<tbody>'), 'tabla de trades renderizada');
  chk(!/undefined|NaN/.test(g('tTrades').innerHTML), 'tabla sin NaN/undefined');
  chk(!g('openPanel').classList.contains('hide'), 'panel de posiciones abiertas visible');
  chk(g('tOpen').innerHTML.includes('TSLA'), 'la posición abierta aparece');
  chk(__charts===5, 'gráficos creados: '+__charts);
  chk(g('fDex').innerHTML.includes('xyz'), 'filtro de dex poblado');
  chk(g('fFrom').value==='2026-04-01'||g('fFrom').value==='2026-03-31', 'rango de fechas inicial: '+g('fFrom').value);
  chk(g('count').textContent.includes('50 cerradas'), 'contador: '+g('count').textContent);
  // filtrar por dex y re-renderizar
  g('fDex').value='xyz'; syncSyms(); render();
  chk(g('count').textContent.includes('34 cerradas'), 'filtro por dex xyz (17 NVDA + 17 AAPL): '+g('count').textContent);
  g('fSide').value='short'; render();
  chk(g('kpis').innerHTML.includes('Sin datos'), 'filtro sin resultados no rompe');
  g('fSide').value=''; g('fDex').value=''; syncSyms(); render();
  console.log('\\n  status: '+g('status').textContent);
  console.log('\\n--- muestra de insights ---');
  const S = computeStats(filtered());
  buildInsights(S).forEach(i=>console.log('['+i.level+'] '+i.title+'\\n   '+i.text.replace(/\\s+/g,' ').slice(0,220)+'…\\n'));
})();
`;
eval(src + append);
