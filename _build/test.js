const { buildTrades, attachFunding, computeStats, buildInsights, parseCoin } = require('./engine.js');

let pass = 0, fail = 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
function ok(cond, msg) { cond ? (pass++, console.log('  ok  ' + msg)) : (fail++, console.log('  FAIL ' + msg)); }
function eq(a, b, msg) { ok(near(a, b), `${msg}  (esperado ${b}, obtenido ${a})`); }

const MIN = 6e4, H = 36e5;
const f = (coin, side, px, sz, time, closedPnl = 0, fee = 0) =>
  ({ coin, side, px: String(px), sz: String(sz), time, closedPnl: String(closedPnl), fee: String(fee) });

/* --- 1. Round trip long simple --- */
console.log('\n1. Long simple');
let t = buildTrades([
  f('xyz:AAPL', 'B', 100, 1, 1000, 0, 0.05),
  f('xyz:AAPL', 'A', 110, 1, 1000 + H, 10, 0.055)
]);
eq(t.length, 1, 'un solo trade');
ok(t[0].side === 'long', 'side = long');
eq(t[0].avgEntry, 100, 'entrada promedio');
eq(t[0].avgExit, 110, 'salida promedio');
eq(t[0].gross, 10, 'PnL bruto');
eq(t[0].fees, 0.105, 'fees');
eq(t[0].net, 9.895, 'PnL neto');
eq(t[0].durationMs, H, 'duración');
ok(t[0].open === false, 'trade cerrado');
ok(t[0].dex === 'xyz' && t[0].symbol === 'AAPL', 'parseo HIP-3 del coin');

/* --- 2. Scale-in y salidas parciales --- */
console.log('\n2. Scale-in y salida parcial');
t = buildTrades([
  f('BTC', 'B', 100, 1, 1000),
  f('BTC', 'B', 90, 1, 2000),          // promedia a la baja -> avg 95
  f('BTC', 'A', 105, 1, 3000, 10),
  f('BTC', 'A', 100, 1, 4000, 5)
]);
eq(t.length, 1, 'sigue siendo un trade (nunca tocó cero en el medio)');
eq(t[0].qty, 2, 'tamaño total abierto');
eq(t[0].avgEntry, 95, 'entrada promedio ponderada');
eq(t[0].avgExit, 102.5, 'salida promedio ponderada');
eq(t[0].gross, 15, 'bruto = suma de closedPnl');
eq(t[0].peakSz, 2, 'tamaño pico');

/* --- 3. Flip long -> short en un solo fill --- */
console.log('\n3. Flip en un fill');
t = buildTrades([
  f('ETH', 'B', 100, 1, 1000, 0, 0.1),
  f('ETH', 'A', 110, 2, 2000, 10, 0.2),   // cierra 1 long (+10) y abre 1 short
  f('ETH', 'B', 105, 1, 3000, 5, 0.1)     // cierra el short (+5)
]);
eq(t.length, 2, 'dos trades');
ok(t[0].side === 'long' && t[1].side === 'short', 'long y después short');
eq(t[0].gross, 10, 'bruto del long');
eq(t[1].gross, 5, 'bruto del short');
eq(t[0].fees, 0.1 + 0.1, 'fees del long (mitad del fill de flip)');
eq(t[1].fees, 0.1 + 0.1, 'fees del short (la otra mitad + cierre)');
eq(t[1].avgEntry, 110, 'entrada del short al precio del flip');
eq(t[1].avgExit, 105, 'salida del short');

/* --- 4. Trade todavía abierto --- */
console.log('\n4. Posición abierta');
t = buildTrades([
  f('SOL', 'B', 100, 1, 1000),
  f('SOL', 'A', 110, 0.5, 2000, 5)
]);
eq(t.length, 1, 'un trade');
ok(t[0].open === true, 'marcado como abierto');
ok(t[0].exitTime === null, 'sin fecha de salida');
let st = computeStats(t);
eq(st.n, 0, 'los abiertos no entran en la estadística');
eq(st.nOpen, 1, 'contados aparte');

/* --- 5. Conservación: suma de brutos == suma de closedPnl --- */
console.log('\n5. Conservación del PnL sobre datos aleatorios');
let fills = [], pos = {}, time = 1e12, rnd = 42;
const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 400; i++) {
  const coin = ['xyz:AAPL', 'xyz:NVDA', 'BTC'][Math.floor(rand() * 3)];
  const side = rand() > 0.5 ? 'B' : 'A';
  const sz = Math.round(rand() * 30 + 1) / 10;
  const px = 50 + Math.round(rand() * 1000) / 10;
  const cur = pos[coin] || 0;
  const dir = side === 'B' ? 1 : -1;
  const closes = cur !== 0 && Math.sign(cur) !== dir;
  const cp = closes ? Math.round((rand() - 0.5) * 2000) / 10 : 0;
  time += Math.round(rand() * 1e7);
  fills.push(f(coin, side, px, sz, time, cp, Math.round(px * sz * 0.0004 * 100) / 100));
  pos[coin] = cur + dir * sz;
}
t = buildTrades(fills);
const sumGross = t.reduce((a, x) => a + x.gross, 0);
const sumCp = fills.reduce((a, x) => a + +x.closedPnl, 0);
eq(sumGross, sumCp, 'brutos conservados');
const sumFees = t.reduce((a, x) => a + x.fees, 0);
eq(sumFees, fills.reduce((a, x) => a + +x.fee, 0), 'fees conservados');
ok(t.every(x => x.entrySz > 0), 'todo trade tiene entrada');
ok(t.filter(x => x.open).length <= 3, 'a lo sumo un trade abierto por símbolo');
ok(t.every(x => x.open || near(x.entrySz, x.exitSz)), 'los cerrados tienen entrada = salida');

/* --- 6. Funding --- */
console.log('\n6. Atribución de funding');
t = buildTrades([
  f('xyz:AAPL', 'B', 100, 1, 1000),
  f('xyz:AAPL', 'A', 110, 1, 1000 + 10 * H, 10)
]);
attachFunding(t, [
  { time: 1000 + 2 * H, delta: { coin: 'xyz:AAPL', usdc: '-1.5' } },
  { time: 1000 + 5 * H, delta: { coin: 'xyz:AAPL', usdc: '-2.0' } },
  { time: 1000 + 99 * H, delta: { coin: 'xyz:AAPL', usdc: '-9.0' } }   // fuera del trade
]);
eq(t[0].funding, -3.5, 'funding dentro de la ventana del trade');
eq(t[0].net, 10 - 3.5, 'neto ajustado por funding');

/* --- 7. Estadística e insights de punta a punta --- */
console.log('\n7. Estadística e insights');
const trades = [];
let now = Date.parse('2026-03-02T14:00:00Z');
for (let i = 0; i < 40; i++) {
  const win = i % 3 !== 0;                        // 66% de acierto
  const dursHrs = win ? 1 : 6;                    // aguanta perdedoras 6x más
  const px = 100;
  const sz = 1;
  const pnl = win ? 8 : -20;                      // payoff malo
  trades.push(
    f('xyz:NVDA', 'B', px, sz, now, 0, 0.2),
    f('xyz:NVDA', 'A', px + pnl, sz, now + dursHrs * H, pnl, 0.2)
  );
  now += 30 * H;
}
const T = buildTrades(trades);
const S = computeStats(T);
eq(S.n, 40, '40 trades cerrados');
eq(S.wins.length, 26, 'ganadoras (14 de 40 son múltiplos de 3)');
ok(near(S.winRate, 26 / 40), 'win rate 65%');
ok(S.avgDurLoss / S.avgDurWin > 5, 'detecta que las perdedoras duran mucho más');
ok(S.net < 0, 'neto negativo pese al win rate alto');
const I = buildInsights(S);
const titulos = I.map(x => x.title);
ok(titulos.some(x => /disposición/i.test(x)), 'dispara el insight de efecto disposición');
ok(titulos.some(x => /Acertás seguido y perdés plata/i.test(x)), 'dispara el insight de win rate vs payoff');
ok(I.every(x => !/undefined|NaN/.test(x.text)), 'ningún insight con NaN o undefined');
ok(I.length >= 4, `generó ${I.length} insights`);

/* --- 8. Robustez con datos vacíos o raros --- */
console.log('\n8. Bordes');
ok(buildTrades([]).length === 0, 'sin fills no rompe');
ok(computeStats([]).n === 0, 'stats vacías no rompen');
ok(buildInsights(computeStats([])).length === 0, 'insights vacíos no rompen');
ok(buildTrades([f('BTC', 'B', 100, 0, 1000)]).length === 0, 'ignora fills de tamaño cero');
ok(parseCoin('BTC').dex === 'hyperliquid', 'coin sin prefijo = hyperliquid nativo');

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
