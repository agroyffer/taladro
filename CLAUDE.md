# Talastrat

Personal trainer de trading para Hyperliquid y trade.xyz. Una sola página HTML, sin servidor, publicada en <https://agroyffer.github.io/taladro/>. El repo es `agroyffer/taladro`. La mascota que habla adentro se llama **Taladro**.

El usuario es Adrián, argentino, opera con colateral chico y apalancamiento alto en perps HIP-3. Escribile en castellano rioplatense.

---

## Lo que no se negocia

Estas reglas salieron de discusiones con él y varias se ganaron corrigiéndome. Antes de agregar cualquier cosa, pasala por acá.

**Se miden acciones, no resultados.** Se puede perder plata con la técnica impecable y ganarla haciendo cualquier cosa. Ningún hábito, ninguna barra y ninguna felicitación se calcula sobre el PnL. Si una métrica premia ganar, está mal diseñada.

**Descriptivo, nunca prescriptivo.** La app muestra lo que hizo, no le dice qué hacer. No da consejos de mercado, no sugiere activos, no opina sobre dirección. Mejora por práctica, no por reglas estrictas.

**Cuidar sin joder, alentar sin forzar.** Nada de frases de relleno, nada de autoayuda. El humor es irónico y va *adentro* de la oración, nunca pegado al final como chiste aparte.

**Nada de contadores hacia la redención.** "Te faltan 2 limpias y se termina" está prohibido: convierte la salida en un premio y reproduce el pensamiento del tilt. Las frases apuntan a lo controlable — tamaño de posición y stop.

**El peligro más grande es la parálisis, no la pérdida.** Poner plata en riesgo no es malo en sí. El paper trading y las rachas forzadas de no operar son falsa sensación de control por inacción, y refuerzan la hoja en blanco. Sí se puede sugerir no operar el fin de semana, pero como priorizar la vida, no como disciplina.

**Pensamientos positivos → acciones positivas → hábitos.** Evitar el autocastigo. Los drawdowns largos son normales incluso haciendo todo bien, y la app tiene que decirlo con la probabilidad exacta al lado.

**Se refuerza a lo largo del tiempo, no de una vez.** Un dato aislado no es un hallazgo.

**Nunca pide clave privada.** No puede operar ni mover fondos. Todo se procesa en el navegador. Ningún archivo con una wallet real va al repo.

---

## Cómo hablarle a él

Corto y directo. Le sirve que le discutan: si un dato no sostiene lo que dice, decíselo con el número. Ya pasó varias veces y siempre fue mejor que asentir.

Si te corrige y tiene razón, concedelo explícito y seguí. Sin disculpas largas.

Tres veces me equivoqué por afirmar antes de mirar:

- Dije que no había liquidaciones porque busqué en el campo `dir`. Estaban en el campo `liquidation`. La hipótesis era correcta, el lugar no.
- Dije que las reentradas calientes eran una fuga. Sus datos daban +US$0,21 por operación *mejor* que el resto y aguantaba el split-half.
- Dije que el apalancamiento nunca se gana. Con US$3,42 de colateral y órdenes mínimas de US$10, el apalancamiento es la entrada, no una decisión de riesgo. La variable real es la **holgura**: distancia al stop contra distancia a la liquidación.

---

## Arquitectura

Dos fuentes, un solo archivo de salida.

| Archivo | Qué es |
|---|---|
| `_build/engine.js` | toda la lógica, sin DOM. Se testea en node. |
| `_build/shell.html` | estilos, HTML, el SVG del taladro y el render. Tiene `/*__ENGINE__*/` donde se inyecta el motor. |
| `_build/build.py` | junta los dos, sella la versión, y verifica |
| `_build/test.js` | 50 tests del motor |
| `_build/t/*.js` | pruebas de vista con un stub de DOM |
| `index.html` | **generado. No editar nunca.** |

```
python3 _build/build.py     # compila
node _build/test.js         # tests
```

El build corta si: quedan marcas sin reemplazar, aparece una dirección `0x…` en el HTML, o algún `<script>` no compila (`node --check`).

**Ese último chequeo existe por un bug real.** El build recortaba `engine.js` en `module.exports` para sacar código de node. Pero eso vive adentro de un `if (typeof module !== 'undefined') { … }`, así que el corte se comía la llave de cierre y el script entero quedaba roto. Los tests pasaban — corren `engine.js` suelto — y el build informaba éxito publicando una página muerta. El `if` ya protegía al navegador solo: no había nada que recortar.

### Publicar

No hay automatización. Se compila acá y se sube `index.html` (y lo que se haya tocado) por la web de GitHub: `https://github.com/agroyffer/taladro/upload/main`. Después `Ctrl+Shift+R` y verificar el sello de versión abajo de todo.

Al arrastrar desde Windows, a veces sube el nombre corto de DOS (`SHELL~1.HTM`). Hay que renombrarlo en GitHub.

---

## Datos

API pública de Hyperliquid, `POST https://api.hyperliquid.xyz/info`. Se usan `userFillsByTime`, `userFunding`, `clearinghouseState`, `frontendOpenOrders`, `portfolio`, `webData2`.

Los perps HIP-3 vienen con el prefijo del dex en el coin: `xyz:DRAM`. Para `clearinghouseState` de esos mercados hace falta mandar `dex`, y el código prueba tres variantes con fallback.

**Las liquidaciones se detectan por el campo `liquidation` del fill**, no por `dir`, que dice "Close Long" idéntico a un cierre voluntario.

Los trades se arman de posición plana a posición plana: un scale-in es una sola operación.

El margen de mantenimiento es la mitad del margen inicial al apalancamiento *máximo* del activo. DRAM y SPCX llegan a 20x → 2,5%. MU, SKHY y SNDK a 10x → 5%.

### Tiempo

Las sesiones se clasifican por el reloj de Nueva York y se muestran en hora de Buenos Aires (UTC−3). Todo lo que ve el usuario, incluido el CSV, es hora local.

```
asia 21:00–03:30 · hueco 03:30–05:00 · pre 05:00–10:30 · rueda 10:30–17:00 · after 17:00–21:00
```

La rueda está partida en tramos porque él identificó cambios de régimen adentro: apertura, media mañana, mediodía, tarde y cierre. Son momentos para prestar atención, jamás señales.

---

## Piezas del motor

`buildTrades` reconstruye. `computeStats` resume. `habitos` mide cinco acciones controlables con conteos (`3 de tus últimas 20`, nunca porcentajes sobre 20 — "nadie se olvida la bolsa del supermercado 15% de las veces"). `mitades` parte la muestra para separar método de época. `probRacha` calcula con programación dinámica exacta cuán normal es una racha dada su tasa de acierto. `presupuesto` usa la mediana de las últimas **5** operaciones, no 10: con 10 la barra no reaccionaba y parecía rota.

`tilt` es la pieza más importante. Se activa con racha ≥ 3 **más** señales de proceso roto, nunca solo por perder. Cuando se activa: la pantalla entera se tiñe de rojo con intensidad proporcional a la racha, los números de plata se difuminan (con botón para destapar a mano), y aparece la especificación de la próxima operación. Se sale con dos operaciones limpias, donde limpia es conducta: una perdedora dentro de la banda cuenta, una ganadora al doble del tamaño no.

`repertorio` tira ideas para probar, rotando entre tres familias — probar, mirar, proceso — y reforzando lo que ya funciona con el número que lo demuestra.

`taladro` decide qué dice la mascota. Prioridad: sinStop → stopInvertido → tilt → hito → racha → hábito roto → presupuesto corto → silencio. Callarse es una opción válida y frecuente.

---

## Pendientes

- Canal de feedback para los testers (compañeros de UTN y amigos). No existe.
- Aviso de muestra mínima para usuarios nuevos con menos de 5 operaciones.
- Renombrar el repo a `talastrat`. GitHub redirige la URL vieja.
- Rotación sectorial (semis contra software). Él la mencionó; quedó afuera a propósito porque no tiene reloj y es otra cosa que la estructura horaria.
