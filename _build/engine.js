/* ===== Motor de reconstrucción de trades y analítica (Hyperliquid / trade.xyz) ===== */

function sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
const EPS = 1e-9;

/* Un fill de Hyperliquid:
   { coin, px, sz, side: 'B'|'A', time, closedPnl, fee, dir, oid, hash, tid }
   Los perps HIP-3 (trade.xyz) llegan con el dex como prefijo: "xyz:AAPL". */
function parseCoin(coin) {
  const i = coin.indexOf(':');
  return i === -1
    ? { dex: 'hyperliquid', symbol: coin }
    : { dex: coin.slice(0, i), symbol: coin.slice(i + 1) };
}

/* ===== Sesiones =====
   El subyacente de estos perps son acciones: el perp opera 24/5 pero el mercado real no.
   Clasificamos por el reloj de Nueva York (maneja el horario de verano solo) y mostramos
   todo en hora de Buenos Aires (UTC-3, sin DST). */
const SESSIONS = {
  asia:    { label: 'Asia / KRX',      art: '21:00 - 03:30' },
  hueco:   { label: 'Hueco nocturno',  art: '03:30 - 05:00' },
  pre:     { label: 'Pre-market US',   art: '05:00 - 10:30' },
  rueda:   { label: 'Rueda US',        art: '10:30 - 17:00' },
  after:   { label: 'After-hours US',  art: '17:00 - 21:00' },
  finde:   { label: 'Fin de semana',   art: 'vie 21:00 - dom 21:00' }
};

let _etFmt = null;
function etParts(ts) {
  try {
    if (!_etFmt) _etFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      weekday: 'short', hour: '2-digit', minute: '2-digit'
    });
    const p = {};
    for (const x of _etFmt.formatToParts(new Date(ts))) p[x.type] = x.value;
    const dows = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { dow: dows[p.weekday], min: (+p.hour % 24) * 60 + (+p.minute) };
  } catch (e) {
    // sin Intl: caemos a UTC-4 como aproximación
    const d = new Date(ts - 4 * 36e5);
    return { dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
}

function sessionOf(ts) {
  const { dow, min } = etParts(ts);
  // Mercado cerrado en trade.xyz: viernes 20:00 ET -> domingo 20:00 ET
  if (dow === 6 || (dow === 5 && min >= 1200) || (dow === 0 && min < 1200)) return 'finde';
  if (min >= 1200 || min < 150) return 'asia';    // 20:00 - 02:30 ET
  if (min < 240) return 'hueco';                  // 02:30 - 04:00
  if (min < 570) return 'pre';                    // 04:00 - 09:30
  if (min < 960) return 'rueda';                  // 09:30 - 16:00
  return 'after';                                 // 16:00 - 20:00
}

/* ===== Tramos de la rueda americana =====
   La actividad intradiaria tiene forma de U: mucho volumen en la apertura, hueco al
   mediodía y repunte en el cierre por rebalanceo y órdenes al cierre. Los bordes de esos
   tramos son horarios, no pronósticos: son momentos donde el régimen suele cambiar. */
const TRAMOS = [
  { id: 'apertura', label: 'Apertura',     frase: 'la apertura',    art: '10:30 - 11:30', de: 570, a: 630 },
  { id: 'media',    label: 'Media mañana', frase: 'la media mañana', art: '11:30 - 13:00', de: 630, a: 720 },
  { id: 'mediodia', label: 'Mediodía',     frase: 'el mediodía',    art: '13:00 - 15:00', de: 720, a: 840 },
  { id: 'tarde',    label: 'Tarde',        frase: 'la tarde',       art: '15:00 - 16:00', de: 840, a: 900 },
  { id: 'cierre',   label: 'Cierre',       frase: 'el cierre',      art: '16:00 - 17:00', de: 900, a: 960 }
];
function tramoDe(ts) {
  if (sessionOf(ts) !== 'rueda') return null;
  const { min } = etParts(ts);
  const t = TRAMOS.find(x => min >= x.de && min < x.a);
  return t ? t.id : null;
}

/* ===== Calendario y reloj =====
   Solo hechos: los horarios de las sesiones y las fechas del Fed. Ningún pronóstico
   sobre qué va a hacer el precio; las ventanas se usan para etiquetar y después medir. */
const FOMC = ['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-10-28','2026-12-09'];

let _etDia = null;
function etFecha(ts) {
  try {
    if (!_etDia) _etDia = new Intl.DateTimeFormat('en-CA',
      { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return _etDia.format(new Date(ts));
  } catch (e) { return new Date(ts - 4 * 36e5).toISOString().slice(0, 10); }
}

/* Ventana de evento de una operación. Comunicado 14:00 ET, conferencia 14:30 ET. */
function ventanaEvento(ts) {
  const dia = etFecha(ts), { min } = etParts(ts);
  if (FOMC.indexOf(dia) >= 0) {
    if (min < 840) return { id: 'previa',      label: 'Fed · antes del anuncio' };
    if (min < 870) return { id: 'impulso',     label: 'Fed · primera media hora' };
    if (min < 900) return { id: 'conferencia', label: 'Fed · conferencia' };
    return { id: 'post', label: 'Fed · después de la conferencia' };
  }
  const hoy = Date.parse(dia);
  for (const d of FOMC) {
    const dif = Math.round((hoy - Date.parse(d)) / 864e5);
    if (dif === 1) return { id: 'dia1',  label: 'Día después del Fed' };
    if (dif === 2 || dif === 3) return { id: 'dia23', label: 'Dos o tres días después del Fed' };
  }
  return null;
}

/* Próximo cambio estructural del día, en hora de Buenos Aires. */
function relojSesion(now) {
  now = now || Date.now();
  const { dow, min } = etParts(now);
  const seg = Math.floor(now / 1000) % 60;
  const faltan = m => (m - min) * 60000 - seg * 1000;
  const HITOS = [
    [240,  'Abre el pre-market',      '05:00'],
    [570,  'Abre la rueda US',        '10:30'],
    [960,  'Cierra la rueda US',      '17:00'],
    [1200, 'Cierra el perp, abre Asia', '21:00']
  ];
  let prox = null;
  const enRueda = min >= 570 && min < 960;
  if (enRueda) {
    const sig = TRAMOS.find(x => x.de > min);
    if (sig) prox = { label: 'Empieza ' + sig.frase,
      art: sig.art.split(' - ')[0], ms: faltan(sig.de) };
  }
  if (!prox) for (const [m, lab, art] of HITOS) if (m > min) { prox = { label: lab, art, ms: faltan(m) }; break; }
  if (!prox) prox = { label: 'Abre el pre-market', art: '05:00', ms: faltan(240 + 1440) };
  if (dow === 5 && min < 1200) prox = { label: 'Cierra por el fin de semana', art: '21:00', ms: faltan(1200) };

  let evento = null;
  if (FOMC.indexOf(etFecha(now)) >= 0) {
    if (min < 840) evento = { label: 'Comunicado del Fed', art: '15:00', ms: faltan(840) };
    else if (min < 870) evento = { label: 'Conferencia de prensa', art: '15:30', ms: faltan(870) };
    else if (min < 900) evento = { label: 'Termina la conferencia', art: '16:00', ms: faltan(900) };
  }
  return { prox, evento, ventana: ventanaEvento(now), tramo: tramoDe(now) };
}

/* Agrupa fills en trades round-trip: de posición plana a posición plana.
   Maneja adds, reducciones parciales y flips (long -> short en un solo fill). */
function buildTrades(fills) {
  const sorted = fills.slice().sort((a, b) => (a.time - b.time) || ((a.tid || 0) - (b.tid || 0)));
  const byCoin = new Map();
  for (const f of sorted) {
    if (!byCoin.has(f.coin)) byCoin.set(f.coin, []);
    byCoin.get(f.coin).push(f);
  }

  const trades = [];
  for (const [coin, list] of byCoin) {
    const { dex, symbol } = parseCoin(coin);
    let pos = 0, cur = null;

    const start = (t, dir) => ({
      coin, dex, symbol, side: dir > 0 ? 'long' : 'short',
      entryTime: t, exitTime: null,
      entrySz: 0, entryNotional: 0, exitSz: 0, exitNotional: 0,
      gross: 0, fees: 0, funding: 0, peakSz: 0, execs: 0, open: true,
      liquidated: false, liqMarkPx: null, makerEntry: null
    });

    for (const f of list) {
      const px = +f.px, sz = +f.sz, fee = +(f.fee || 0);
      if (!(sz > 0)) continue;
      const dir = f.side === 'B' ? 1 : -1;
      let cpLeft = +(f.closedPnl || 0);
      let left = sz;

      while (left > EPS) {
        if (!cur) { cur = start(f.time, dir); cur.makerEntry = !f.crossed; }
        /* el exchange no lo marca en `dir` (dice "Close Long" igual):
           la liquidación viene en un campo aparte del fill */
        if (f.liquidation) { cur.liquidated = true; cur.liqMarkPx = +f.liquidation.markPx || null; }
        const closing = pos !== 0 && sgn(pos) !== dir;
        const part = closing ? Math.min(left, Math.abs(pos)) : left;
        const frac = part / sz;

        if (closing) {
          cur.exitSz += part;
          cur.exitNotional += part * px;
          cur.gross += cpLeft;   // el closedPnl del fill corresponde entero al tramo que cierra
          cpLeft = 0;
        } else {
          cur.entrySz += part;
          cur.entryNotional += part * px;
          cur.gross += cpLeft;   // normalmente 0 en aperturas
          cpLeft = 0;
        }
        cur.fees += fee * frac;
        cur.execs += 1;

        pos += dir * part;
        cur.peakSz = Math.max(cur.peakSz, Math.abs(pos));
        left -= part;

        if (Math.abs(pos) < EPS) {
          pos = 0;
          cur.exitTime = f.time;
          cur.open = false;
          trades.push(cur);
          cur = null;
        }
      }
    }
    if (cur) trades.push(cur); // posición todavía abierta
  }

  for (const t of trades) finalize(t);
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

function finalize(t) {
  t.session = sessionOf(t.entryTime);
  t.tramo = tramoDe(t.entryTime);
  t.evento = ventanaEvento(t.entryTime);
  t.id = t.coin + '|' + t.entryTime;   // estable entre recargas: sirve de clave para las notas
  t.qty = t.entrySz;
  t.avgEntry = t.entrySz > 0 ? t.entryNotional / t.entrySz : 0;
  t.avgExit = t.exitSz > 0 ? t.exitNotional / t.exitSz : null;
  t.notional = t.entryNotional;
  t.peakNotional = t.peakSz * t.avgEntry;
  t.net = t.gross - t.fees + t.funding;
  t.durationMs = t.exitTime ? t.exitTime - t.entryTime : null;
  t.retPct = t.notional > 0 ? (t.net / t.notional) * 100 : 0;
  return t;
}

/* Atribuye cada pago/cobro de funding al trade abierto en ese momento. */
function attachFunding(trades, fundings) {
  let matched = 0, unmatched = 0;
  for (const fd of fundings || []) {
    const time = fd.time;
    const d = fd.delta || fd;
    const coin = d.coin;
    const usdc = +(d.usdc || 0); // negativo = pagaste funding
    const t = trades.find(x => x.coin === coin && x.entryTime <= time &&
      (x.exitTime === null ? true : time <= x.exitTime));
    if (t) { t.funding += usdc; matched += usdc; } else { unmatched += usdc; }
  }
  for (const t of trades) finalize(t);
  return { matched, unmatched };
}

/* ===== Estadística ===== */
function computeStats(all) {
  const trades = all.filter(t => !t.open);
  const n = trades.length;
  const s = {
    n, nOpen: all.length - n,
    net: 0, gross: 0, fees: 0, funding: 0,
    wins: [], losses: [],
    bySymbol: {}, bySide: { long: { n: 0, net: 0 }, short: { n: 0, net: 0 } },
    byHour: {}, byDow: {}, byDur: {}, bySession: {}, byTramo: {},
    liq: { n: 0, net: 0, trades: [] },
    equity: [], maxDD: 0, maxLossStreak: 0, maxWinStreak: 0
  };
  if (!n) return s;

  const DURB = [
    ['< 5 min', 5 * 6e4], ['5-30 min', 30 * 6e4], ['30 min - 4 h', 4 * 36e5],
    ['4-24 h', 24 * 36e5], ['1-7 días', 7 * 864e5], ['> 7 días', Infinity]
  ];

  let cum = 0, peak = 0, ls = 0, ws = 0;
  for (const t of trades) {
    s.net += t.net; s.gross += t.gross; s.fees += t.fees; s.funding += t.funding;
    (t.net >= 0 ? s.wins : s.losses).push(t);

    const sym = s.bySymbol[t.symbol] || (s.bySymbol[t.symbol] = { n: 0, net: 0, wins: 0, fees: 0 });
    sym.n++; sym.net += t.net; sym.fees += t.fees; if (t.net >= 0) sym.wins++;

    s.bySide[t.side].n++; s.bySide[t.side].net += t.net;

    const d = new Date(t.entryTime);
    const h = d.getHours(), dow = d.getDay();
    (s.byHour[h] || (s.byHour[h] = { n: 0, net: 0 })).n++; s.byHour[h].net += t.net;
    (s.byDow[dow] || (s.byDow[dow] = { n: 0, net: 0 })).n++; s.byDow[dow].net += t.net;

    const bucket = (DURB.find(b => t.durationMs < b[1]) || DURB[DURB.length - 1])[0];
    (s.byDur[bucket] || (s.byDur[bucket] = { n: 0, net: 0 })).n++; s.byDur[bucket].net += t.net;

    const se = s.bySession[t.session] || (s.bySession[t.session] = { n: 0, net: 0, wins: 0 });
    se.n++; se.net += t.net; if (t.net >= 0) se.wins++;

    if (t.tramo) {
      const tr = s.byTramo[t.tramo] || (s.byTramo[t.tramo] = { n: 0, net: 0, wins: 0 });
      tr.n++; tr.net += t.net; if (t.net >= 0) tr.wins++;
    }

    if (t.liquidated) { s.liq.n++; s.liq.net += t.net; s.liq.trades.push(t); }

    cum += t.net;
    peak = Math.max(peak, cum);
    s.maxDD = Math.max(s.maxDD, peak - cum);
    s.equity.push({ time: t.exitTime, cum });

    if (t.net < 0) { ls++; ws = 0; } else { ws++; ls = 0; }
    s.maxLossStreak = Math.max(s.maxLossStreak, ls);
    s.maxWinStreak = Math.max(s.maxWinStreak, ws);
  }

  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
  s.winRate = s.wins.length / n;
  s.sumWins = sum(s.wins, t => t.net);
  s.sumLosses = Math.abs(sum(s.losses, t => t.net));
  s.avgWin = s.wins.length ? s.sumWins / s.wins.length : 0;
  s.avgLoss = s.losses.length ? s.sumLosses / s.losses.length : 0;
  s.payoff = s.avgLoss ? s.avgWin / s.avgLoss : Infinity;
  s.profitFactor = s.sumLosses ? s.sumWins / s.sumLosses : Infinity;
  s.expectancy = s.net / n;
  s.avgDurWin = s.wins.length ? sum(s.wins, t => t.durationMs) / s.wins.length : 0;
  s.avgDurLoss = s.losses.length ? sum(s.losses, t => t.durationMs) / s.losses.length : 0;
  s.avgNotional = sum(trades, t => t.notional) / n;
  s.volume = sum(trades, t => t.entryNotional + t.exitNotional);
  s.best = trades.reduce((a, b) => (b.net > a.net ? b : a), trades[0]);
  s.worst = trades.reduce((a, b) => (b.net < a.net ? b : a), trades[0]);
  s.netExBest = s.net - s.best.net;
  const top3 = trades.slice().sort((a, b) => b.net - a.net).slice(0, 3);
  s.netExTop3 = s.net - sum(top3, t => t.net);

  // Trades abiertos dentro de los 30 min posteriores al cierre de una perdedora
  const byExit = trades.slice().sort((a, b) => a.exitTime - b.exitTime);
  const revenge = [];
  for (const t of trades) {
    const prev = byExit.filter(x => x.exitTime <= t.entryTime).pop();
    if (prev && prev.net < 0 && t.entryTime - prev.exitTime <= 30 * 6e4) revenge.push(t);
  }
  s.revenge = { n: revenge.length, net: sum(revenge, t => t.net) };

  // Tamaño de la apuesta después de ganar vs después de perder
  const afterLoss = [], afterWin = [];
  for (let i = 1; i < trades.length; i++) {
    (trades[i - 1].net < 0 ? afterLoss : afterWin).push(trades[i].notional);
  }
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  s.sizeAfterLoss = avg(afterLoss);
  s.sizeAfterWin = avg(afterWin);

  // Concentración diaria: días con muchos trades vs días tranquilos
  const days = {};
  for (const t of trades) {
    const k = new Date(t.entryTime).toISOString().slice(0, 10);
    (days[k] || (days[k] = { n: 0, net: 0 })).n++; days[k].net += t.net;
  }
  s.days = days;
  const dayArr = Object.values(days);
  s.medianTradesDay = dayArr.length
    ? dayArr.map(d => d.n).sort((a, b) => a - b)[Math.floor(dayArr.length / 2)] : 0;
  const busy = dayArr.filter(d => d.n > s.medianTradesDay);
  const calm = dayArr.filter(d => d.n <= s.medianTradesDay);
  s.netBusyDay = busy.length ? sum(busy, d => d.net) / busy.length : 0;
  s.netCalmDay = calm.length ? sum(calm, d => d.net) / calm.length : 0;
  s.nDays = dayArr.length;
    s.adherence = adherence(trades);
  s.trades = trades;
  s.mitades = mitades(trades);

  // Entradas que siguen a dos o más pérdidas consecutivas
  {
    const sel = [];
    let racha = 0;
    for (const t of trades) {
      if (racha >= 2) sel.push(t);
      racha = t.net < 0 ? racha + 1 : 0;
    }
    const set = new Set(sel), resto = trades.filter(t => !set.has(t));
    const av = a => (a.length ? a.reduce((x, y) => x + y.net, 0) / a.length : 0);
    s.trasRacha = { n: sel.length, avg: av(sel), nResto: resto.length, avgResto: av(resto) };
  }
    s.comparativas = comparativas(trades, s);
  s.presupuesto = presupuesto(trades, s);
  s.tilt = tilt(s);

  return s;
}

/* Primera mitad contra segunda mitad de la muestra, por fecha.
   Es el chequeo más barato para saber si lo que ves describe tu método o tu época. */
function mitades(trades) {
  if (trades.length < 10) return null;
  const o = trades.slice().sort((a, b) => (a.exitTime || a.entryTime) - (b.exitTime || b.entryTime));
  const m = Math.floor(o.length / 2);
  const r = a => {
    const L = a.filter(t => t.net < 0);
    return {
      n: a.length,
      exp: a.reduce((x, y) => x + y.net, 0) / a.length,
      wr: a.filter(t => t.net >= 0).length / a.length,
      avgLoss: L.length ? Math.abs(L.reduce((x, y) => x + y.net, 0) / L.length) : 0,
      desde: o[0] ? a[0].entryTime : null, hasta: a[a.length - 1] ? a[a.length - 1].entryTime : null
    };
  };
  return { vieja: r(o.slice(0, m)), nueva: r(o.slice(m)) };
}

/* Últimas N operaciones contra todo lo anterior: qué estás sosteniendo y qué soltaste. */
function adherence(trades, N) {
  N = N || 20;
  if (trades.length < 8) return null;
  const rec = trades.slice(-N), base = trades.slice(0, -N);
  if (base.length < 4) return null;
  const m = arr => {
    const L = arr.filter(t => t.net < 0), W = arr.filter(t => t.net >= 0);
    const avg = (a, f) => (a.length ? a.reduce((x, y) => x + f(y), 0) / a.length : 0);
    return {
      n: arr.length,
      winRate: W.length / arr.length,
      avgLoss: L.length ? Math.abs(avg(L, t => t.net)) : 0,
      worstLoss: L.length ? Math.abs(Math.min(...L.map(t => t.net))) : 0,
      durLoss: avg(L, t => t.durationMs),
      durWin: avg(W, t => t.durationMs),
      notional: avg(arr, t => t.notional),
      liq: arr.filter(t => t.liquidated).length,
      expectancy: avg(arr, t => t.net)
    };
  };
  return { rec: m(rec), base: m(base) };
}

/* ===== Posiciones abiertas en vivo =====
   Cruza lo que tenés abierto contra las órdenes trigger vigentes. La pregunta que responde
   es una sola: ¿tu stop entra antes que el del exchange? */
function analyzePositions(positions, orders, s) {
  const out = [];
  for (const p of positions || []) {
    const P = p.position || p;
    const szi = +P.szi;
    if (!szi) continue;
    const sz = Math.abs(szi), long = szi > 0;
    const notional = Math.abs(+(P.positionValue || 0));
    const mark = notional && sz ? notional / sz : +(P.entryPx || 0);
    const entry = +(P.entryPx || 0);
    const liqPx = +(P.liquidationPx || 0) || null;
    const lev = P.leverage ? +P.leverage.value : (notional && +P.marginUsed ? notional / +P.marginUsed : null);

    // órdenes trigger de este coin que reducen la posición
    const trig = (orders || []).filter(o => o.coin === P.coin &&
      (o.isTrigger || o.triggerPx) && (o.reduceOnly !== false));
    const px = o => +(o.triggerPx || o.limitPx || 0);
    // para un long, el stop está por debajo del mark; el take profit por encima
    const stops = trig.filter(o => long ? px(o) < mark : px(o) > mark).sort((a, b) => long ? px(b) - px(a) : px(a) - px(b));
    const tps = trig.filter(o => long ? px(o) > mark : px(o) < mark).sort((a, b) => long ? px(a) - px(b) : px(b) - px(a));
    const stopPx = stops.length ? px(stops[0]) : null;
    const tpPx = tps.length ? px(tps[0]) : null;

    const pctFrom = t => t ? Math.abs(mark - t) / mark * 100 : null;
    const r = {
      coin: P.coin, symbol: parseCoin(P.coin).symbol, dex: parseCoin(P.coin).dex,
      side: long ? 'long' : 'short', sz, notional, entry, mark, liqPx, lev,
      uPnl: +(P.unrealizedPnl || 0), margin: +(P.marginUsed || 0),
      stopPx, tpPx, distLiq: pctFrom(liqPx), distStop: pctFrom(stopPx), distTp: pctFrom(tpPx),
      // lo que efectivamente vas a anotar si salta el stop, medido contra la entrada
      pnlAtStop: stopPx ? (stopPx - entry) * szi : null,
      // lo que perdés desde acá (incluye la ganancia no realizada que estás devolviendo)
      riesgo: stopPx ? Math.abs(mark - stopPx) * sz : null,
      alerts: []
    };
    const A = (level, text) => r.alerts.push({ level, text });

    if (!stopPx) {
      A('bad', `Sin stop cargado. La única salida definida es la liquidación` +
        (r.distLiq ? `, a ${r.distLiq.toFixed(2)}% del mark` : '') +
        `. Tus dos peores operaciones históricas terminaron exactamente así.`);
    } else if (r.distLiq && r.distStop >= r.distLiq) {
      A('bad', `Tu stop (${r.distStop.toFixed(2)}%) está más lejos que la liquidación (${r.distLiq.toFixed(2)}%). ` +
        `Nunca se va a ejecutar: te liquidan primero.`);
    } else if (r.distLiq && r.distStop > r.distLiq * 0.6) {
      A('warn', `Stop a ${r.distStop.toFixed(2)}% y liquidación a ${r.distLiq.toFixed(2)}%: poco margen. ` +
        `Un gap o el slippage de un mercado fino se comen la diferencia.`);
    } else {
      A('good', `Stop a ${r.distStop.toFixed(2)}%, liquidación a ${r.distLiq ? r.distLiq.toFixed(2) + '%' : 's/d'}. ` +
        `Salís vos, no el exchange.`);
    }
    if (r.pnlAtStop != null && s && s.adherence) {
      const ref = s.adherence.rec.avgLoss, p = r.pnlAtStop;
      if (p >= 0) {
        A('good', `El stop ya está en ganancia: si salta anotás ${p > 0 ? '+' : ''}US$${p.toFixed(2)}. ` +
          `Esta operación no puede costarte plata.`);
      } else if (ref > 0 && Math.abs(p) > ref * 1.5) {
        A('warn', `Si salta el stop anotás -US$${Math.abs(p).toFixed(2)}: ${(Math.abs(p) / ref).toFixed(1)}x tu ` +
          `pérdida promedio reciente (US$${ref.toFixed(2)}).`);
      } else if (ref > 0) {
        A('good', `Si salta el stop anotás -US$${Math.abs(p).toFixed(2)}, dentro de tu banda habitual (US$${ref.toFixed(2)}).`);
      }
    }
    if (!tpPx) A('info', `Sin objetivo cargado: el ratio objetivo/stop de esta operación queda sin definir.`);
    else if (r.distStop) {
      const rr = r.distTp / r.distStop;
      A(rr >= 2 ? 'good' : 'warn', `Ratio objetivo/stop: ${rr.toFixed(1)}:1.` +
        (rr < 2 ? ` Debajo de 2:1 necesitás más de 50% de acierto para empatar.` : ''));
    }
    const ses = sessionOf(Date.now());
    if ((ses === 'pre' || ses === 'after' || ses === 'finde') && lev && lev >= 10) {
      A('warn', `${lev}x con el subyacente fuera de rueda (${SESSIONS[ses].label}), ` +
        `donde el libro es más fino y las bandas de descubrimiento más anchas.`);
    }
    const order = { bad: 0, warn: 1, good: 2, info: 3 };
    r.alerts.sort((a, b) => order[a.level] - order[b.level]);
    out.push(r);
  }
  return out;
}

/* Comparativas descriptivas: qué rindió cada contexto contra el resto de tus operaciones.
   Sin recomendaciones — solo el promedio por operación de cada grupo y el de su complemento. */
function comparativas(trades, s) {
  const out = [];
  const av = a => (a.length ? a.reduce((x, y) => x + y.net, 0) / a.length : 0);
  /* Partimos la muestra al medio por fecha. Si una diferencia solo aparece en una mitad,
     probablemente esté describiendo una época tuya y no el contexto. */
  const orden = trades.slice().sort((a, b) => (a.exitTime || a.entryTime) - (b.exitTime || b.entryTime));
  const vieja = new Set(orden.slice(0, Math.floor(orden.length / 2)).map(t => t.id));
  const push = (label, sel) => {
    if (sel.length < 3 || sel.length === trades.length) return;
    const set = new Set(sel), resto = trades.filter(t => !set.has(t));
    if (!resto.length) return;
    const difMitad = esVieja => {
      const g = sel.filter(t => vieja.has(t.id) === esVieja);
      const r = resto.filter(t => vieja.has(t.id) === esVieja);
      return (g.length >= 3 && r.length >= 3) ? av(g) - av(r) : null;
    };
    const difA = difMitad(true), difB = difMitad(false);
    out.push({ label, n: sel.length, avg: av(sel), nResto: resto.length, avgResto: av(resto),
      difA, difB, estable: difA != null && difB != null && Math.sign(difA) === Math.sign(difB) });
  };

  const byExit = trades.filter(t => t.exitTime).slice().sort((a, b) => a.exitTime - b.exitTime);
  push('Abiertas dentro de los 30 min de cerrar una pérdida', trades.filter(t => {
    const prev = byExit.filter(x => x.exitTime <= t.entryTime).pop();
    return prev && prev.net < 0 && t.entryTime - prev.exitTime <= 30 * 6e4;
  }));

  const sel = []; let racha = 0;
  for (const t of trades) { if (racha >= 2) sel.push(t); racha = t.net < 0 ? racha + 1 : 0; }
  push('Abiertas después de 2 o más pérdidas seguidas', sel);

  const nProm = trades.reduce((a, t) => a + t.notional, 0) / trades.length;
  push('Con notional mayor a tu promedio', trades.filter(t => t.notional > nProm));

  for (const [k, v] of Object.entries(s.bySession)) {
    if (v.n >= 3) push('En ' + SESSIONS[k].label, trades.filter(t => t.session === k));
  }
  for (const [k, v] of Object.entries(s.byTramo || {})) {
    const tr = TRAMOS.find(x => x.id === k);
    if (v.n >= 3 && tr) push('En ' + tr.frase + ' de la rueda', trades.filter(t => t.tramo === k));
  }
      const evs = [...new Set(trades.map(t => t.evento && t.evento.id).filter(Boolean))];
  for (const k of evs) {
    const lab = (trades.find(t => t.evento && t.evento.id === k).evento).label;
    push(lab, trades.filter(t => t.evento && t.evento.id === k));
  }

  const tesis = [...new Set(trades.map(t => t.tesis).filter(Boolean))];
  for (const k of tesis) push('Tesis: ' + k, trades.filter(t => t.tesis === k));
  const tags = [...new Set(trades.flatMap(t => t.tags || []))];
  for (const k of tags) push('Etiqueta: ' + k, trades.filter(t => (t.tags || []).includes(k)));

  push('Long', trades.filter(t => t.side === 'long'));
  push('Short', trades.filter(t => t.side === 'short'));
    push('Entradas con orden límite', trades.filter(t => t.makerEntry === true));
  push('Cerradas en menos de 5 minutos', trades.filter(t => t.durationMs < 5 * 6e4));
  push('Sostenidas más de 30 minutos', trades.filter(t => t.durationMs > 30 * 6e4));

  return out.sort((a, b) => (a.avg - a.avgResto) - (b.avg - b.avgResto));
}

/* ===== Hábitos =====
   Todo lo que se mide acá es una acción que dependió de vos, no un resultado.
   Las rachas y los hitos son sobre lo que hiciste; el PnL no entra nunca. */
function habitos(all, s) {
  const T = (all || []).filter(t => !t.open);
  if (T.length < 3) return [];
  const ref = (s.adherence ? s.adherence.rec.avgLoss : s.avgLoss) || 0;
  const rec = T.slice(-20);
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const medNot = med(T.map(t => t.notional));

  const test = {
    perdida: t => t.net >= 0 || (ref > 0 && Math.abs(t.net) <= ref * 1.5),
    corte:   t => t.net >= 0 || (t.durationMs != null && t.durationMs <= 30 * 6e4),
    intacto: t => !t.liquidated,
        // consistencia en las dos direcciones: ni el doble ni la mitad de lo tuyo
    tamano:  t => medNot > 0 && t.notional <= medNot * 2 && t.notional >= medNot * 0.5,
    limite:  t => t.makerEntry === true
  };
  const def = [
    ['perdida', 'Pérdida contenida',  'cerrar la perdedora dentro de tu banda'],
    ['corte',   'Corte rápido',       'no sostener una perdedora más de 30 minutos'],
    ['intacto', 'Sin liquidaciones',  'cerrar vos, no el exchange'],
        ['tamano',  'Tamaño consistente', 'entrar con un tamaño parecido al de siempre'],
    ['limite',  'Entrada con límite',  'esperar a que el precio toque tu orden en vez de ir a mercado']
  ];
  const metas = [3, 5, 10, 20, 50, 100, 250];
  const ult = T[T.length - 1];

  return def.map(([id, nombre, accion]) => {
    const ok = test[id];
    let racha = 0;
    for (let i = T.length - 1; i >= 0 && ok(T[i]); i--) racha++;
    let mejor = 0, c = 0;
    for (const t of T) { c = ok(t) ? c + 1 : 0; mejor = Math.max(mejor, c); }
    let rompio = 0;
    if (!ok(ult)) { for (let i = T.length - 2; i >= 0 && ok(T[i]); i--) rompio++; }
        return {
      id, nombre, accion, racha, mejor, rompio, cumple: ok(ult), ult,
      pct: rec.filter(ok).length / rec.length,
      cumplidas: rec.filter(ok).length, deN: rec.length,
      serie: rec.map(t => ({ ok: ok(t), t })),   // últimas 20, en orden
      meta: metas.find(m => m > racha) || null,
      medNot, ref
    };
  });
}

/* ===== La voz de Taladro =====
   Reglas: no habla sin un número, habla poco, festeja antes de marcar, y después de una
   racha perdedora baja el tono. La ironía va en cómo está dicha la frase, nunca colgada
   atrás como remate: una sola oración, sin comentario agregado. */
function taladro(s, pos, td, hab, vistos) {
  const usd = x => (x < 0 ? '-' : '') + 'US$' + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const dur = ms => !ms ? '—' : ms < 36e5 ? Math.round(ms / 6e4) + ' minutos' : (ms / 36e5).toFixed(1) + ' horas';
    const d = (tono, linea, id, mins) => ({ habla: true, tono, linea, id, silencio: (mins || 360) * 6e4 });
  const callado = linea => ({ habla: false, tono: 'silencio', linea: linea || '', id: null });
  pos = pos || []; td = td || { hoy: [], net: 0 }; vistos = vistos || {};
  hab = hab || habitos(s.trades || [], s);

  let racha = 0;
  if (s.trades) for (let i = s.trades.length - 1; i >= 0 && s.trades[i].net < 0; i--) racha++;

  /* 1. Riesgo abierto ahora. Es lo único que interrumpe siempre. */
  const sinStop = pos.find(p => !p.stopPx);
  if (sinStop) return d('alerta', `Estás sin stop, tu plan de salida es que decida el exchange ` +
    `a ${sinStop.distLiq ? sinStop.distLiq.toFixed(1) + '%' : 'una distancia sin dato'} de acá.`,
    'sinstop:' + sinStop.coin, 20);
  const invertido = pos.find(p => p.distLiq && p.distStop >= p.distLiq);
  if (invertido) return d('alerta', `Tu stop está a ${invertido.distStop.toFixed(1)}% y la liquidación a ` +
    `${invertido.distLiq.toFixed(1)}%, así que el que manda es el del exchange.`,
    'stopinv:' + invertido.coin, 20);

  /* 2. Tilt: racha con el proceso rompiéndose. Manda sobre todo lo demás salvo el riesgo abierto,
     y no se va hasta que cierres dos operaciones dentro de tu banda. */
  const tl = s.tilt;
  if (tl && tl.activo) {
    const bn = usdT(tl.banda);   // la banda se dice en positivo: es un límite, no una pérdida
    /* Rota cada dos minutos: la misma frase repetida media hora deja de escucharse.
       Todas apuntan a lo mismo — tamaño y stop, que son tuyos — y ninguna promete
       que esto se termina cuando pase algo. Contar cuánto falta para zafar convierte
       la salida en un premio por resultados, que es justo el pensamiento del tilt. */
    const frases = [
      `${tl.racha} pérdidas seguidas y ${tl.motivos[0]}.`,
      `Respirá, frená y volvé a tu sistema.`,
      `Tamaño de posición y stop. Enfocate en lo que podés controlar vos.`,
      `Bajá un cambio: tu tamaño de siempre es ${usdT(tl.med)}.`,
      `Con tu acierto, ${tl.racha} seguidas entra dentro de lo esperable. El tamaño no.`,
      `La próxima no tiene que recuperar nada. Tiene que cerrar dentro de ${bn}.`
    ];
    return d('alerta', frases[Math.floor(Date.now() / 12e4) % frases.length], 'tilt', 15);
  }

  /* 3. Hitos antes que retos: si hay algo para reconocer, gana. */
  const hito = hab.filter(h => h.racha >= 3 && [3, 5, 10, 20, 50, 100, 250].includes(h.racha)
      && h.racha > (vistos[h.id] || 0)).sort((a, b) => b.racha - a.racha)[0];
  if (hito) {
        const f = {
      perdida: `${hito.racha} seguidas cerrando la pérdida donde dijiste que la ibas a cerrar.`,
      corte:   `${hito.racha} perdedoras cortadas antes de la media hora, al hilo.`,
      tamano:  `${hito.racha} entradas seguidas con el tamaño de siempre.`,
            limite:  `${hito.racha} entradas seguidas esperando a que el precio toque tu orden.`,
      intacto: `${hito.racha} operaciones sin que el exchange cierre por vos.`
    };
        const r = d('ok', f[hito.id], 'hito:' + hito.id + ':' + hito.racha);
    r.hito = { id: hito.id, racha: hito.racha };
    return r;
  }

  /* 4. Racha perdedora: seco, sin ironía, y sin pedirte nada. */
    if (racha >= 3) return dRacha(racha, s, d);

  function dRacha(racha, s, d) { return d('seco', `${racha} pérdidas seguidas contra un récord de ${s.maxLossStreak}` +
    (s.trasRacha && s.trasRacha.n >= 5
      ? `, y lo que abriste después de una racha rindió ${usd(s.trasRacha.avg)} por operación contra ${usd(s.trasRacha.avgResto)} del resto.`
            : '.'), 'racha'); }

  /* 5. Hábito roto, solo si venía de una racha que valía. Se dice una vez y se sigue. */
  const roto = hab.filter(h => h.rompio >= 5).sort((a, b) => b.rompio - a.rompio)[0];
  if (roto) {
    const t = roto.ult;
        const f = {
      perdida: `Venías ${roto.rompio} cerrando dentro de tu banda y esta se fue a ${usd(t.net)}, ` +
        `contra ${usd(-roto.ref)} de referencia.`,
      corte:   `${roto.rompio} perdedoras cortadas a tiempo y a esta la tuviste ${dur(t.durationMs)}.`,
      tamano:  `Tu tamaño de siempre es ${usd(roto.medNot)} y esta la abriste en ${usd(t.notional)}.`,
            limite:  `${roto.rompio} entradas esperando tu orden y a esta la fuiste a buscar a mercado.`,
      intacto: `Cerró el exchange por vos y ahí se cortó una racha de ${roto.rompio}.`
    };
        return d('seco', f[roto.id], 'roto:' + roto.id + ':' + roto.rompio);
  }

    /* 6. La fuga silenciosa: venir usando menos presupuesto del que tu propia regla habilita. */
  const pr = s.presupuesto;
  if (pr && pr.estado === 'corto' && !pos.length) {
        return d('ok', `Tu regla te habilita ${usd(pr.habilitado)} de notional y venís entrando con ${usd(pr.usado)}.`, 'presupuesto');
  }

    /* 7. Silencio, que es el estado normal. El conteo del día vive acá: es contexto,
     no algo por lo que valga la pena interrumpirte. */
  if (td.hoy.length >= 5 && s.medianTradesDay && td.hoy.length > s.medianTradesDay * 2.5)
    return callado(`${td.hoy.length} operaciones hoy, contra una mediana de ${s.medianTradesDay}.`);
  const mejor = hab.filter(h => h.racha > 0).sort((a, b) => b.racha - a.racha)[0];
    if (mejor) return callado(`${mejor.nombre}: ${mejor.racha} al hilo` + (mejor.meta ? `, próximo hito ${mejor.meta}.` : '.'));
  if (pos.length) return callado(`${pos[0].symbol} ${pos[0].side} abierta.`);
    return callado(s.n ? `${s.n} operaciones registradas.` : 'Todavía no hay nada para mirar.');
}

/* ===== Repertorio =====
   Cada vez que le tocás, Taladro dice otra cosa. Tres familias: algo para probar,
   algo que no estás mirando, y algo del proceso. Todo sale de tus propios datos. */
function repertorio(s, pos, td, hab) {
  const usd = x => (x < 0 ? '-' : '') + 'US$' + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  /* Las etiquetas de la tabla son títulos de columna; para decirlas en voz alta
     hay que convertirlas en algo que suene a castellano. */
  const enCriollo = l => l
    .replace(/^En /, 'operar en ')
    .replace(/^Tesis: /, 'las que anotás como ')
    .replace(/^Etiqueta: /, 'las que etiquetás como ')
    .replace(/^Long$/, 'operar en long').replace(/^Short$/, 'operar en short')
    .replace(/^Con notional mayor a tu promedio$/, 'entrar más grande que tu promedio')
    .replace(/^Abiertas /, 'las que abrís ')
    .replace(/^Cerradas /, 'las que cerrás ')
    .replace(/^Sostenidas /, 'las que sostenés ')
    .replace(/^Entradas /, 'las entradas ');
  const pc = x => (x * 100).toFixed(0) + '%';
  const out = [];
  const add = (tipo, linea) => out.push({ tipo, linea });
  hab = hab || habitos(s.trades || [], s);
  const T = s.trades || [];
  if (!T.length) return [{ tipo: 'info', linea: 'Todavía no hay operaciones para mirar.' }];
  const H = id => hab.find(h => h.id === id);

  /* --- para probar --- */
  const conNota = T.filter(t => t.tesis).length;
  if (conNota < 10) {
    add('probar', `Tenés ${conNota} operaciones con la tesis anotada; con diez la tabla ` +
      `te dice si te rinde más seguir tendencia o buscar reversión.`);
    out[out.length - 1].accion = { id: 'anotar', texto: 'Anotar la última' };
  }
  const lim = H('limite');
  if (lim && lim.pct < 0.5) add('probar', `De tus últimas ${lim.deN} entradas, ${lim.cumplidas} esperaron ` +
    `a que el precio tocara tu orden. Con cinco seguidas llegás al primer hito.`);
  if (s.presupuesto && s.presupuesto.stopTipico) {
    const st = s.presupuesto.stopTipico;
    add('probar', `Con tu stop típico de ${st.toFixed(2)}%, un objetivo al doble queda a ${(st * 2).toFixed(2)}%.`);
  }
  if (s.presupuesto && s.presupuesto.estado === 'corto')
    add('probar', `Tu regla habilita ${usd(s.presupuesto.habilitado)} de notional y venís entrando con ${usd(s.presupuesto.usado)}.`);
  const symS = Object.entries(s.bySymbol).sort((a, b) => b[1].n - a[1].n);
  if (symS.length > 1 && symS[0][1].n / s.n > 0.5)
    add('probar', `Operás casi siempre ${symS[0][0]}: ${symS[0][1].n} de tus ${s.n} operaciones, ` +
      `y entre los otros ${symS.length - 1} símbolos juntan ${s.n - symS[0][1].n}.`);
  /* Tramos: el que nunca tocaste y el que te viene rindiendo distinto */
  const trOps = TRAMOS.map(tr => ({ tr, v: (s.byTramo || {})[tr.id] }));
  const sinTocar = trOps.filter(x => !x.v || x.v.n === 0);
  const conOps = trOps.filter(x => x.v && x.v.n >= 2).sort((a, b) => (b.v.net / b.v.n) - (a.v.net / a.v.n));
  if (sinTocar.length && conOps.length) {
    add('probar', `Nunca operaste en ${sinTocar[0].tr.frase} de la rueda (${sinTocar[0].tr.art}), ` +
      `y en ${conOps[conOps.length - 1].tr.frase} llevás ${usd(conOps[conOps.length - 1].v.net)} en ` +
      `${conOps[conOps.length - 1].v.n} operaciones.`);
  }
  if (conOps.length >= 2) {
    const b = conOps[0], w = conOps[conOps.length - 1];
    add('mirar', `Dentro de la rueda, en ${b.tr.frase} promediás ${usd(b.v.net / b.v.n)} por operación ` +
      `y en ${w.tr.frase} ${usd(w.v.net / w.v.n)}.`);
  }

  /* Qué hacen entre sí los símbolos que operás el mismo día */
  {
    const porDia = {};
    for (const t of T) {
      const k = new Date(t.entryTime).toDateString();
      (porDia[k] || (porDia[k] = {}))[t.symbol] = ((porDia[k][t.symbol]) || 0) + t.net;
    }
    const dias = Object.values(porDia).filter(d => Object.keys(d).length >= 2);
    if (dias.length >= 3) {
      let juntos = 0, cruzados = 0;
      for (const d of dias) {
        const v = Object.values(d);
        const pos = v.filter(x => x > 0).length, neg = v.filter(x => x < 0).length;
        if (pos && neg) cruzados++; else juntos++;
      }
      add('mirar', `En los ${dias.length} días que tocaste más de un símbolo, en ${cruzados} uno te dio ` +
        `verde y otro rojo el mismo día, y en ${juntos} fueron todos para el mismo lado.`);
    }
  }

  const vHoy = ventanaEvento(Date.now());
  if (vHoy && !T.some(t => t.evento && t.evento.id === vHoy.id))
    add('probar', `No tenés ninguna operación etiquetada en “${vHoy.label}”, y estás justo en esa ventana.`);

  /* --- lo que no estás mirando --- */
  const durs = Object.entries(s.byDur).filter(([, v]) => v.n >= 3);
  if (durs.length >= 2) {
    const b = durs.reduce((a, c) => (c[1].net / c[1].n > a[1].net / a[1].n ? c : a));
    const w = durs.reduce((a, c) => (c[1].net / c[1].n < a[1].net / a[1].n ? c : a));
    add('mirar', `Cuando la operación te dura ${b[0]} promediás ${usd(b[1].net / b[1].n)}, ` +
      `y cuando te dura ${w[0]} promediás ${usd(w[1].net / w[1].n)}.`);
  }
  const est = (s.comparativas || []).filter(c => c.estable)
    .sort((a, b) => Math.abs(b.avg - b.avgResto) - Math.abs(a.avg - a.avgResto));
  if (est.length) {
    const c = est[0], dif = c.avg - c.avgResto;
    add('mirar', `Lo que más te cambia el resultado es ${enCriollo(c.label)}: ${usd(c.avg)} por operación ` +
      `contra ${usd(c.avgResto)} del resto, y se repite igual en la primera y en la segunda mitad de tu historial.`);
  }
  if (s.volume > 0) add('mirar', `Llevás ${usd(s.volume)} operados y pagaste ${usd(s.fees)} de comisiones, ` +
    `que es el ${(s.fees / s.volume * 100).toFixed(3)}% del volumen.`);
  const r = rachasEsperadas(s, 100);
  if (r) add('mirar', `Tu peor racha fue de ${r.real} y la racha larga típica con tu acierto es de ${r.tipica}.`);
  if (s.liq.n) add('mirar', `Sin tus ${s.liq.n} liquidaciones tu neto sería ${usd(s.net - s.liq.net)} en vez de ${usd(s.net)}.`);
  const ses = Object.entries(s.bySession).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].net / b[1].n - a[1].net / a[1].n);
  if (ses.length >= 2) add('mirar', `Operando en ${SESSIONS[ses[0][0]].label} promediás ` +
    `${usd(ses[0][1].net / ses[0][1].n)} por operación, y en ${SESSIONS[ses[ses.length - 1][0]].label}, ` +
    `${usd(ses[ses.length - 1][1].net / ses[ses.length - 1][1].n)}.`);
  const mk = T.filter(t => t.makerEntry === true).length;
  add('mirar', `De tus ${T.length} entradas, ${T.length - mk} las tomaste a mercado y en ${mk} esperaste ` +
    `a que el precio tocara tu orden.`);

  /* --- proceso --- */
  if (s.adherence) {
    const r = s.adherence.rec, b = s.adherence.base;
    if (b.avgLoss > 0 && r.avgLoss / b.avgLoss > 1.25)
      add('proceso', `Se te está agrandando la pérdida promedio: ${usd(r.avgLoss)} en las últimas ${r.n} ` +
        `contra ${usd(b.avgLoss)} antes.`);
    else if (b.avgLoss > 0 && r.avgLoss / b.avgLoss < 0.8)
      add('proceso', `Achicaste la pérdida promedio de ${usd(b.avgLoss)} a ${usd(r.avgLoss)}, ` +
        `y eso es lo que movió tu expectativa de ${usd(b.expectancy)} a ${usd(r.expectancy)}.`);
  }
  if (s.adherence) add('proceso', `Tu pérdida promedio de las últimas ${s.adherence.rec.n} es ` +
    `${usd(s.adherence.rec.avgLoss)} y la peor de esa serie fue ${usd(s.adherence.rec.worstLoss)}.`);
  const mejorH = hab.filter(h => h.racha > 0).sort((a, b) => b.racha - a.racha)[0];
  if (mejorH) add('proceso', `${mejorH.nombre} lleva ${mejorH.racha} al hilo con un récord de ${mejorH.mejor}.`);
  const peorH = hab.slice().sort((a, b) => a.pct - b.pct)[0];
  if (peorH) add('proceso', `El hábito con más lugar para mejorar es ${peorH.nombre.toLowerCase()}: ` +
    `lo cumpliste en ${peorH.cumplidas} de tus últimas ${peorH.deN} operaciones.`);

  return out;
}

/* ===== Lo que dice al pasar por encima =====
   La fila ya muestra los números; acá va la regla, que es lo que no se ve. */
function explica(tipo, dato, s) {
  const usd = x => (x < 0 ? '-' : '') + 'US$' + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  if (tipo === 'habito') {
    const h = dato;
    const reglas = {
      perdida: `Suma cuando la pérdida no supera ${usd(h.ref * 1.5)}, que es una vez y media tu banda.`,
      corte:   `Suma cuando la perdedora se cierra antes de los 30 minutos.`,
      intacto: `Suma cuando la posición la cerraste vos y no el exchange.`,
      tamano:  `Suma cuando el notional queda entre ${usd(h.medNot * 0.5)} y ${usd(h.medNot * 2)}, ` +
               `alrededor de tu mediana de ${usd(h.medNot)}.`,
      limite:  `Suma cuando dejaste la orden puesta y el precio vino a tocarla, sin ir vos a mercado.`
    };
    return reglas[h.id] || h.accion;
  }
  if (tipo === 'racha') {
    const r = dato;
    return `Una racha de ${r.k} o más aparece en el ${(r.p * 100).toFixed(0)}% de las series de 100 operaciones ` +
      `con tu acierto de ${(s.winRate * 100).toFixed(1)}%.`;
  }
  if (tipo === 'presupuesto') {
    const p = dato;
    return `Tu banda de ${usd(p.banda)} con un stop de ${p.stopTipico.toFixed(2)}% habilita ${usd(p.habilitado)} de notional.`;
  }
  if (tipo === 'posicion') {
    const r = dato;
    return r.stopPx
      ? `Tu stop está a ${r.distStop.toFixed(2)}% y la liquidación a ${r.distLiq ? r.distLiq.toFixed(2) + '%' : 's/d'}.`
      : `No hay stop cargado en esta posición.`;
  }
  return '';
}

/* ===== Modo tilt =====
   Una racha perdedora sola no es tilt: es varianza, y la app misma dice que es normal.
   Tilt es la racha MÁS señales de que el proceso se rompió. Y se sale por proceso,
   nunca por ganar: dos operaciones seguidas dentro de tu banda y con tu tamaño. */
function tilt(s) {
  const T = (s.trades || []);
  const off = { activo: false, racha: 0, motivos: [], limpias: 0, faltan: 0 };
  if (T.length < 5) return off;
  const banda = (s.adherence ? s.adherence.rec.avgLoss : s.avgLoss) || 0;
  const med = (() => { const a = T.map(t => t.notional).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; })();
  if (!banda || !med) return off;

  const limpia = t => (t.net >= 0 || Math.abs(t.net) <= banda * 1.5) && t.notional <= med * 2 && !t.liquidated;

  let racha = 0;
  for (let i = T.length - 1; i >= 0 && T[i].net < 0; i--) racha++;

  const vent = T.slice(-6);
  const motivos = [];
  const peor = vent.filter(t => t.net < 0).sort((a, b) => a.net - b.net)[0];
  if (vent.some(t => t.liquidated)) motivos.push('te liquidaron una');
  if (peor && Math.abs(peor.net) > banda * 1.5)
    motivos.push(`una pérdida de ${usdT(peor.net)} contra una banda de ${usdT(-banda)}`);
  const grande = vent.filter(t => t.notional > med * 2).sort((a, b) => b.notional - a.notional)[0];
  if (grande) motivos.push(`una entrada de ${usdT(grande.notional)} contra tu tamaño de ${usdT(med)}`);
  let rapidas = 0;
  for (let i = 1; i < vent.length; i++)
    if (vent[i - 1].exitTime && vent[i].entryTime - vent[i - 1].exitTime < 5 * 6e4) rapidas++;
  if (rapidas >= 3) motivos.push(`${rapidas} entradas a menos de cinco minutos de cerrar la anterior`);

  let limpias = 0;
  for (let i = T.length - 1; i >= 0 && limpia(T[i]); i--) limpias++;

  const activo = racha >= 3 && motivos.length > 0 && limpias < 2;
  return { activo, racha, motivos, limpias, faltan: Math.max(0, 2 - limpias), banda, med };
}
function usdT(x) { return (x < 0 ? '-' : '') + 'US$' + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 2 }); }

/* ===== Presupuesto de riesgo =====
   Mide la fuga que ningún journal ve: entrar con menos de lo que tu propia regla te habilita.
   Pasarse se paga en la cuenta; quedarse corto se paga en repeticiones que no hiciste. */
function presupuesto(all, s) {
  const T = (all || []).filter(t => !t.open);
  if (T.length < 8) return null;
  const banda = (s.adherence ? s.adherence.rec.avgLoss : s.avgLoss) || 0;
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

  /* El stop típico sale de tus perdedoras recientes, no de todo el historial:
     si cambiaste la técnica, la referencia tiene que cambiar con vos. */
  const ult20 = T.slice(-20);
  let perd = ult20.filter(t => t.net < 0 && t.notional > 0).map(t => Math.abs(t.retPct));
  if (perd.length < 4) perd = T.filter(t => t.net < 0 && t.notional > 0).map(t => Math.abs(t.retPct));
  if (!banda || perd.length < 4) return null;
  const stopTipico = med(perd);
  if (!(stopTipico > 0)) return null;

  const habilitado = banda / (stopTipico / 100);
  /* Ventana corta a propósito: con diez, cambiar tres operaciones no movía la mediana
     y parecía que la barra estaba rota. Con cinco, un cambio de conducta se ve enseguida. */
  const VENT = 5;
  const rec = T.slice(-VENT);
  const usado = med(rec.map(t => t.notional));
  const uso = habilitado > 0 ? usado / habilitado : null;
  const estado = uso == null ? null : uso < 0.6 ? 'corto' : uso > 1.5 ? 'pasado' : 'en banda';
  return { banda, stopTipico, habilitado, usado, uso, estado, n: rec.length,
    ventana: VENT, ultimos: rec.map(t => t.notional), nPerd: perd.length };
}

/* ===== Qué tan normal es una mala racha =====
   Probabilidad exacta de que aparezca al menos una racha de k pérdidas en n operaciones,
   dado tu propio win rate. Sirve para separar "me está yendo mal" de "esto tenía que pasar". */
function probRacha(n, q, k) {
  if (!(n > 0) || !(q > 0) || !(k > 0)) return 0;
  let dp = new Array(k).fill(0); dp[0] = 1;
  for (let i = 0; i < n; i++) {
    const nd = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      if (!dp[j]) continue;
      nd[0] += dp[j] * (1 - q);
      if (j + 1 < k) nd[j + 1] += dp[j] * q;
    }
    dp = nd;
  }
  return 1 - dp.reduce((a, b) => a + b, 0);
}

/* Tabla de rachas esperadas con tus números, más la racha larga típica en n operaciones. */
function rachasEsperadas(s, n) {
  if (!s.n) return null;
  n = n || 100;
  const q = 1 - s.winRate;
  const filas = [3, 5, 8, 11].map(k => ({ k, p: probRacha(n, q, k) }));
  let tipica = 1;
  for (let k = 1; k <= 30; k++) if (probRacha(n, q, k) >= 0.5) tipica = k;
  return { n, q, filas, tipica, winRate: s.winRate, real: s.maxLossStreak };
}

/* Serie de valor de cuenta que devuelve el endpoint `portfolio`.
   A diferencia del PnL acumulado, incluye depósitos y retiros: es lo que realmente tuviste. */
function serieCuenta(portfolio) {
  if (!portfolio) return [];
  const listas = [];
  const recorrer = p => {
    if (!p) return;
    if (Array.isArray(p)) {
      for (const e of p) {
        if (Array.isArray(e) && e.length === 2 && e[1] && Array.isArray(e[1].accountValueHistory)) {
          listas.push({ clave: String(e[0]), h: e[1].accountValueHistory });
        } else recorrer(e);
      }
    } else if (typeof p === 'object') Object.values(p).forEach(recorrer);
  };
  recorrer(portfolio);
  if (!listas.length) return [];
  const pref = listas.find(x => /allTime/i.test(x.clave)) ||
    listas.sort((a, b) => b.h.length - a.h.length)[0];
  return pref.h.map(x => ({ time: +x[0], v: +x[1] })).filter(x => isFinite(x.time) && isFinite(x.v));
}

/* Operaciones de hoy agrupadas por sesión. */
function todayBySession(trades, now) {
  now = now || Date.now();
  const key = new Date(now).toDateString();
  const hoy = trades.filter(t => !t.open && new Date(t.entryTime).toDateString() === key);
  const by = {};
  for (const t of hoy) {
    const b = by[t.session] || (by[t.session] = { n: 0, net: 0, wins: 0 });
    b.n++; b.net += t.net; if (t.net >= 0) b.wins++;
  }
  return { hoy, by, net: hoy.reduce((a, t) => a + t.net, 0) };
}

/* ===== Preparación del día: alertas de contexto sobre las operaciones recientes ===== */
function buildDayPlan(s, now) {
  now = now || Date.now();
  const out = { session: sessionOf(now), sessions: SESSIONS, alerts: [], rules: [] };
  if (!s.n) return out;
  const usd = x => (x < 0 ? '-' : '') + 'US$' + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const A = (level, title, text) => out.alerts.push({ level, title, text });
  const T = s.trades, last = T[T.length - 1];

  // Sesión actual y tu historial en ella
  const cur = s.bySession[out.session];
  const lab = SESSIONS[out.session].label;
  if (out.session === 'finde') {
    A('bad', 'Mercado cerrado', `El subyacente no opera entre viernes 21:00 y domingo 21:00 de Buenos Aires. Cualquier precio acá es descubrimiento del perp, sin referencia.`);
  } else if (!cur || cur.n < 3) {
    A('info', `Estás en ${lab}`, `Casi no tenés historia en esta franja: ${cur ? cur.n : 0} operaciones.`);
  } else if (cur.net < 0) {
    A('warn', `${lab} es una franja que te cuesta plata`,
      `${cur.n} operaciones, ${usd(cur.net)}, ${((cur.wins / cur.n) * 100).toFixed(0)}% de acierto, ` +
      `${usd(cur.net / cur.n)} por operación contra ${usd(s.expectancy)} de tu promedio general.`);
  } else {
    A('good', `${lab} es tu mejor franja`,
      `${cur.n} operaciones, ${usd(cur.net)}, ${((cur.wins / cur.n) * 100).toFixed(0)}% de acierto.`);
  }

  // Racha reciente
  let streak = 0;
  for (let i = T.length - 1; i >= 0 && T[i].net < 0; i--) streak++;
  if (streak >= 2) {
    A('bad', `Venís de ${streak} pérdidas seguidas`,
      `Tu racha peor histórica fue de ${s.maxLossStreak}.` +
      (s.trasRacha && s.trasRacha.n >= 3
        ? ` Tus entradas después de dos o más pérdidas seguidas rindieron ${usd(s.trasRacha.avg)} por operación ` +
          `contra ${usd(s.trasRacha.avgResto)} del resto, sobre ${s.trasRacha.n} casos.`
        : ` Todavía no hay casos suficientes para medir qué rinden tus entradas después de una racha.`));
  }

  // Escalada de tamaño
  if (s.sizeAfterWin > 0 && s.sizeAfterLoss / s.sizeAfterWin > 1.25) {
    A('warn', 'Histórico: agrandás después de perder',
      `Notional promedio tras pérdida ${usd(s.sizeAfterLoss)} contra ${usd(s.sizeAfterWin)} tras ganancia: ` +
      `${(s.sizeAfterLoss / s.sizeAfterWin).toFixed(1)}x.`);
  }

  // Liquidaciones
  if (s.liq.n) {
    A('bad', `${s.liq.n} ${s.liq.n > 1 ? 'liquidaciones' : 'liquidación'} en tu historial`,
      `Costaron ${usd(s.liq.net)}. Neto sin ellas: ${usd(s.net - s.liq.net)}. ` +
      `En todas, la distancia al stop era mayor que la distancia a la liquidación.`);
  }

  // Deriva de técnica
  const ad = s.adherence;
  if (ad) {
    const r = ad.rec, b = ad.base;
    if (b.avgLoss > 0 && r.avgLoss / b.avgLoss < 0.7) {
      A('good', 'Estás sosteniendo el stop corto',
        `Pérdida promedio de las últimas ${r.n}: ${usd(r.avgLoss)} contra ${usd(b.avgLoss)} antes. ` +
        `En el mismo período la expectativa pasó de ${usd(b.expectancy)} a ${usd(r.expectancy)} por operación.`);
    } else if (b.avgLoss > 0 && r.avgLoss / b.avgLoss > 1.3) {
      A('bad', 'Se te está agrandando la pérdida promedio',
        `Últimas ${r.n}: ${usd(r.avgLoss)} contra ${usd(b.avgLoss)} antes. El stop se está corriendo.`);
    }
    if (r.durLoss > 0 && r.durWin > 0 && r.durLoss / r.durWin > 1.3) {
      A('warn', 'Volviste a aguantar las perdedoras',
        `En las últimas ${r.n} tus perdedoras duran ${(r.durLoss / r.durWin).toFixed(1)}x más que las ganadoras.`);
    }
    if (b.notional > 0 && r.notional / b.notional > 1.4) {
      A('warn', 'Subiste el tamaño',
        `Notional promedio ${usd(r.notional)} contra ${usd(b.notional)} antes: +${(((r.notional / b.notional) - 1) * 100).toFixed(0)}%. ` +
        `Tu pérdida promedio actual es ${usd(r.avgLoss)} y escala en la misma proporción.`);
    }
  }

  // Sobreoperación del día en curso
  const hoy = T.filter(t => new Date(t.entryTime).toDateString() === new Date(now).toDateString());
  if (hoy.length) {
    const neto = hoy.reduce((a, t) => a + t.net, 0);
    A(hoy.length > s.medianTradesDay * 2 ? 'warn' : 'info', `Hoy llevás ${hoy.length} ${hoy.length === 1 ? 'operación' : 'operaciones'}`,
      `${usd(neto)} en el día. Tu mediana diaria es ${s.medianTradesDay}.` +
      (s.netBusyDay < s.netCalmDay
        ? ` Tus días de mucha actividad promedian ${usd(s.netBusyDay)} contra ${usd(s.netCalmDay)} de los tranquilos.` : ''));
  }

  // Última operación fuera de rango
  if (last && last.net < 0 && s.avgLoss > 0 && Math.abs(last.net) > s.avgLoss * 2) {
    A('warn', 'Tu última pérdida fue el doble de lo normal',
      `${usd(last.net)} en ${last.symbol} contra una pérdida promedio de ${usd(s.avgLoss)}: ` +
      `${(Math.abs(last.net) / s.avgLoss).toFixed(1)}x.`);
  }

  // Reglas derivadas de sus propios datos
  const syms = Object.entries(s.bySymbol).sort((a, b) => b[1].net - a[1].net);
  const sess = Object.entries(s.bySession).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].net - a[1].net);
  if (syms.length) out.rules.push(`Instrumento: ${syms[0][0]} suma ${usd(syms[0][1].net)} en ${syms[0][1].n} operaciones.` +
    (syms.length > 1 && syms[syms.length - 1][1].net < 0 ? ` ${syms[syms.length - 1][0]} resta ${usd(syms[syms.length - 1][1].net)}.` : ''));
  if (sess.length) out.rules.push(`Franja: mejor en ${SESSIONS[sess[0][0]].label} (${SESSIONS[sess[0][0]].art}), ${usd(sess[0][1].net)}.` +
    (sess[sess.length - 1][1].net < 0 ? ` Peor en ${SESSIONS[sess[sess.length - 1][0]].label}, ${usd(sess[sess.length - 1][1].net)}.` : ''));
  const L = s.bySide.long, S2 = s.bySide.short;
  if (L.n >= 3 && S2.n >= 3) out.rules.push(`Lado: longs ${usd(L.net)} en ${L.n}, shorts ${usd(S2.net)} en ${S2.n}.`);
  out.rules.push(`Pérdida: tu promedio reciente es ${usd(ad ? ad.rec.avgLoss : s.avgLoss)}; la peor de esa serie, ${usd(ad ? ad.rec.worstLoss : 0)}.`);
  const durs = Object.entries(s.byDur).filter(([, v]) => v.n >= 3).sort((a, b) => (b[1].net / b[1].n) - (a[1].net / a[1].n));
  if (durs.length) out.rules.push(`Horizonte: tu mejor tramo es ${durs[0][0]} (${usd(durs[0][1].net / durs[0][1].n)} por operación).`);

  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  out.alerts.sort((a, b) => order[a.level] - order[b.level]);
  return out;
}

/* ===== Motor de insights ===== */
function buildInsights(s) {
  const out = [];
  if (!s.n) return out;
  const usd = x => (x < 0 ? '-' : '') + 'US$' + Math.abs(x).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const dur = ms => {
    if (!isFinite(ms) || ms <= 0) return '0 min';
    const m = ms / 6e4;
    if (m < 60) return m.toFixed(0) + ' min';
    if (m < 1440) return (m / 60).toFixed(1) + ' h';
    return (m / 1440).toFixed(1) + ' días';
  };
  const add = (level, title, text) => out.push({ level, title, text });
  const racha = n => `${n} pérdida${n === 1 ? '' : 's'} consecutiva${n === 1 ? '' : 's'}`;

  if (s.n < 30) {
    add('info', 'Muestra chica',
      `${s.n} trades cerrados. Debajo de ~30 operaciones casi nada de lo que sigue es estadísticamente ` +
      `distinguible de la suerte. Tomalo como hipótesis a verificar, no como diagnóstico.`);
  }

  // 0. Liquidaciones — lo más caro y lo único totalmente evitable
  if (s.liq.n) {
    const det = s.liq.trades.map(t => `${t.symbol} ${new Date(t.entryTime).toLocaleDateString('es-AR')} (${usd(t.net)})`).join(', ');
    add('bad', `${s.liq.n} ${s.liq.n > 1 ? 'liquidaciones' : 'liquidación'}: ${usd(s.liq.net)}`,
      `${det}. En todas el cierre lo ejecutó el exchange a mercado, no vos. ` +
      `Neto con ellas: ${usd(s.net)}. Sin ellas: ${usd(s.net - s.liq.net)}. ` +
      `En todas, la distancia al stop era mayor que la distancia a la liquidación.`);
  }

  // 0b. Sesiones
  const ses = Object.entries(s.bySession).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].net - a[1].net);
  if (ses.length >= 2) {
    const [bk, bv] = ses[0], [wk, wv] = ses[ses.length - 1];
    if (bv.net > 0 && wv.net < 0) {
      add('info', 'Tenés una franja horaria que funciona y otra que no',
        `${SESSIONS[bk].label} (${SESSIONS[bk].art} de Buenos Aires): ${usd(bv.net)} en ${bv.n} operaciones. ` +
        `${SESSIONS[wk].label} (${SESSIONS[wk].art}): ${usd(wv.net)} en ${wv.n}. ` +
        `Por operación: ${usd(bv.net / bv.n)} contra ${usd(wv.net / wv.n)}.`);
    }
  }

  // 1. Costos
  const costos = s.fees - Math.min(s.funding, 0);
  const bruto = Math.max(s.gross, 0);
  if (bruto > 0 && costos / bruto > 0.15) {
    add('bad', 'Los costos se están comiendo el resultado',
      `Pagaste ${usd(s.fees)} de fees${s.funding < 0 ? ` y ${usd(-s.funding)} de funding` : ''}, ` +
      `contra ${usd(s.gross)} de PnL bruto: ${((costos / bruto) * 100).toFixed(1)}% de lo que ganaste operando ` +
      `se fue en costos. Con ${s.n} trades y ${usd(s.volume)} de volumen, cada operación de más te cuesta ` +
      `${usd(s.fees / s.n)} promedio antes de tener razón.`);
  }

  // 2. Efecto disposición
  if (s.avgDurWin > 0 && s.avgDurLoss / s.avgDurWin > 1.3) {
    add('bad', 'Efecto disposición: cortás las ganadoras y aguantás las perdedoras',
      `Tus perdedoras duran ${dur(s.avgDurLoss)} en promedio y tus ganadoras ${dur(s.avgDurWin)} — ` +
      `${(s.avgDurLoss / s.avgDurWin).toFixed(1)}x más tiempo aguantando lo que no funciona. ` +
      `Es el patrón mejor documentado en trading minorista. En tu muestra, cada perdedora estuvo ` +
      `abierta ${dur(s.avgDurLoss - s.avgDurWin)} más que una ganadora promedio.`);
  } else if (s.avgDurLoss > 0 && s.avgDurWin / s.avgDurLoss > 1.3) {
    add('good', 'Dejás correr las ganadoras',
      `Ganadoras ${dur(s.avgDurWin)} vs perdedoras ${dur(s.avgDurLoss)}. Estás sosteniendo lo que funciona ` +
      `y soltando rápido lo que no — la relación correcta, y la menos común.`);
  }

  // 3. Win rate vs payoff
  if (s.winRate > 0.5 && s.payoff < 1) {
    add('bad', 'Acertás seguido y perdés plata igual',
      `Ganás el ${(s.winRate * 100).toFixed(0)}% de las veces, pero tu pérdida promedio (${usd(s.avgLoss)}) ` +
      `es ${(1 / s.payoff).toFixed(1)}x tu ganancia promedio (${usd(s.avgWin)}). ${s.wins.length} aciertos ` +
      `suman ${usd(s.sumWins)} y ${s.losses.length} errores restan ${usd(-s.sumLosses)}.`);
  } else if (s.winRate < 0.45 && s.payoff > 1.8) {
    add('good', 'Perfil de asimetría',
      `Acertás solo el ${(s.winRate * 100).toFixed(0)}% pero cobrás ${s.payoff.toFixed(1)}x más en cada acierto. ` +
      `Ese perfil requiere atravesar rachas largas sin cambiar el método: la tuya llegó a ${s.maxLossStreak} pérdidas seguidas.`);
  }

  // 4. Profit factor / expectativa
  add(s.expectancy >= 0 ? 'good' : 'bad', 'Expectativa por trade',
    `${usd(s.expectancy)} por operación, profit factor ${isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}. ` +
    (s.expectancy >= 0
      ? `Sobre ${s.n} operaciones, el conjunto suma ${usd(s.net)}.`
      : `Valor esperado negativo: a más operaciones, más pérdida acumulada. Sobre ${s.n} operaciones, ${usd(s.net)}.`));

  // 5. Revenge trading
  if (s.revenge.n >= 3) {
    const dif = s.revenge.net / s.revenge.n - s.expectancy;
    add(dif < 0 ? 'bad' : 'info', 'Trades abiertos en caliente',
      `${s.revenge.n} operaciones (${((s.revenge.n / s.n) * 100).toFixed(0)}% del total) las abriste dentro de ` +
      `los 30 minutos de cerrar una perdedora. Resultado: ${usd(s.revenge.net)}, o sea ${usd(s.revenge.net / s.revenge.n)} ` +
      `por operación, contra ${usd(s.expectancy)} de tu promedio general` +
      (dif < 0 ? `. Diferencia: ${usd(dif)} por operación.` : `.`));
  }

  // 6. Escalada de tamaño
  if (s.sizeAfterWin > 0 && s.sizeAfterLoss / s.sizeAfterWin > 1.25) {
    add('bad', 'Agrandás la apuesta después de perder',
      `Notional promedio después de una pérdida: ${usd(s.sizeAfterLoss)}. Después de una ganancia: ` +
      `${usd(s.sizeAfterWin)}. Ratio ${(s.sizeAfterLoss / s.sizeAfterWin).toFixed(1)}x. ` +
      `Tu racha perdedora más larga fue de ${racha(s.maxLossStreak)}.`);
  }

  // 7. Concentración del resultado
  if (s.net > 0 && s.netExBest < 0) {
    add('bad', 'Todo el resultado es un solo trade',
      `Neto ${usd(s.net)}. Sin ${s.best.symbol} (${usd(s.best.net)}): ${usd(s.netExBest)}. ` +
      `El resultado de ${s.n} operaciones depende de una.`);
  } else if (s.net > 0 && s.netExTop3 < 0) {
    add('warn', 'El resultado vive en tres trades',
      `Sin tus 3 mejores operaciones el neto es ${usd(s.netExTop3)}. Las otras ${s.n - 3} en conjunto restan.`);
  }

  // 8. Long vs short
  const L = s.bySide.long, S = s.bySide.short;
  if (L.n >= 5 && S.n >= 5 && sgn(L.net) !== sgn(S.net)) {
    const mal = L.net < S.net ? 'long' : 'short';
    const malN = Math.min(L.net, S.net), bienN = Math.max(L.net, S.net);
    add('info', `Los dos lados dan resultados opuestos`,
      `Longs: ${usd(L.net)} en ${L.n} operaciones. Shorts: ${usd(S.net)} en ${S.n}. ` +
      `Solo el lado positivo suma ${usd(bienN)} contra ${usd(s.net)} del total; el lado ${mal} resta ${usd(malN)}.`);
  }

  // 9. Símbolo que arrastra
  const syms = Object.entries(s.bySymbol).sort((a, b) => a[1].net - b[1].net);
  if (syms.length > 2) {
    const [peorSym, peor] = syms[0];
    if (peor.net < 0 && Math.abs(peor.net) > Math.abs(s.net) * 0.3 && peor.n >= 3) {
      add('warn', `${peorSym}: ${usd(peor.net)} en ${peor.n} operaciones`,
        `${usd(peor.net)} en ${peor.n} operaciones (${((peor.wins / peor.n) * 100).toFixed(0)}% de acierto). ` +
        `Sin ese símbolo tu neto sería ${usd(s.net - peor.net)}.`);
    }
    const [mejorSym, mejor] = syms[syms.length - 1];
    if (mejor.net > 0 && mejor.n >= 3) {
      add('good', `${mejorSym}: ${usd(mejor.net)} en ${mejor.n} operaciones`,
        `${((mejor.wins / mejor.n) * 100).toFixed(0)}% de acierto, ${usd(mejor.net / mejor.n)} por operación ` +
        `contra ${usd(s.expectancy)} de tu promedio general.`);
    }
  }

  // 10. Sobreoperación
  if (s.nDays >= 10 && s.netBusyDay < s.netCalmDay) {
    add('warn', 'Los días de mucha actividad te rinden peor',
      `Días con más de ${s.medianTradesDay} operaciones: ${usd(s.netBusyDay)} promedio. Días tranquilos: ` +
      `${usd(s.netCalmDay)}. Diferencia por día: ${usd(s.netBusyDay - s.netCalmDay)}.`);
  }

  // 11. Duración óptima
  const durs = Object.entries(s.byDur).filter(([, v]) => v.n >= 5);
  if (durs.length >= 2) {
    const best = durs.reduce((a, b) => (b[1].net / b[1].n > a[1].net / a[1].n ? b : a));
    const worst = durs.reduce((a, b) => (b[1].net / b[1].n < a[1].net / a[1].n ? b : a));
    if (best[0] !== worst[0]) {
      add('info', 'Tu horizonte rentable',
        `Mejor tramo: ${best[0]} (${usd(best[1].net / best[1].n)} por trade, ${best[1].n} operaciones). ` +
        `Peor: ${worst[0]} (${usd(worst[1].net / worst[1].n)}, ${worst[1].n}). ` +
        `Diferencia por operación: ${usd(best[1].net / best[1].n - worst[1].net / worst[1].n)}.`);
    }
  }

  // 12. Drawdown
  if (s.maxDD > 0) {
    add('info', 'Peor racha',
      `Drawdown máximo de ${usd(s.maxDD)} sobre el PnL acumulado, y ${racha(s.maxLossStreak)}. ` +
      (s.net > 0 ? `Contra una ganancia total de ${usd(s.net)}: ratio ${(s.maxDD / s.net).toFixed(1)}x.` : ``));
  }

  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

if (typeof module !== 'undefined') {
  module.exports = { buildTrades, attachFunding, computeStats, buildInsights, parseCoin,
    sessionOf, tramoDe, TRAMOS, buildDayPlan, analyzePositions, todayBySession, comparativas, taladro, habitos, mitades, serieCuenta, probRacha, rachasEsperadas, presupuesto, tilt, explica, repertorio, relojSesion, ventanaEvento, FOMC, SESSIONS };
}
