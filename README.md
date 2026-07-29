# Taladro

Un tracker de hábitos para gente que opera en **Hyperliquid** y **trade.xyz**.

Mira lo que hacés, no lo que ganás: sostiene lo que ya te sale bien y te avisa antes de las que se pagan caro. No da consejos de mercado ni dice qué comprar.

## Cómo se usa

1. Abrí la página.
2. Pegá la dirección de tu wallet (la misma con la que operás).
3. Apretá **Analizar**.

Listo. A partir de ahí se actualiza solo cada 20 segundos.

## Qué necesita y qué no

- **No pide clave privada.** No puede operar, no puede mover fondos, no puede firmar nada.
- Solo lee tus operaciones de la blockchain, que son públicas para cualquiera que tenga tu dirección.
- **Todo se procesa en tu navegador.** No hay servidor: nada de lo tuyo sale de tu máquina.
- Las notas y las rachas se guardan en tu navegador. Con el botón **Vincular archivo** podés además guardarlas en un `.json` tuyo, en tu disco.

## Qué mide

Cinco hábitos, todos acciones que dependieron de vos:

| Hábito | Suma cuando |
|---|---|
| Pérdida contenida | la pérdida no supera vez y media tu banda habitual |
| Corte rápido | la perdedora se cierra antes de los 30 minutos |
| Sin liquidaciones | la posición la cerraste vos y no el exchange |
| Tamaño consistente | el notional queda cerca de tu mediana |
| Esperar tu precio | la entrada no cruzó el spread |

El resultado no entra en ningún hábito. Se puede perder plata con la técnica impecable y ganarla haciendo cualquier cosa, y por eso lo que se mide es la acción.

## Dos modos

- **Sin posición abierta**: una sola cosa para hacer mejor que la anterior, y una calculadora que convierte tu banda de pérdida en un tamaño.
- **Con posición abierta**: qué asegura tu stop, a qué distancia está la liquidación, y cuánto anotás si salta.

Atrás de *Ver los números* está todo lo demás: rachas esperadas, qué rindió cada contexto, comparación entre la primera y la segunda mitad de tu historial, gráficos y la tabla de operaciones con notas.

## Límites

- Reconstruye las operaciones desde los fills on-chain. Si operaste desde otra wallet, esas no aparecen.
- Con menos de 30 operaciones casi nada de lo que muestra es distinguible de la suerte, y la app te lo dice.
- No es asesoramiento financiero. Es un registro de lo que hiciste.

## Licencia

MIT. Hacé lo que quieras con esto.
