# Talastrat

**Tu personal trainer de trading**, para Hyperliquid y trade.xyz.

Un entrenador no te promete que ganes la carrera: te corrige la técnica y te sostiene la constancia. Esto hace lo mismo. Mira lo que hacés, no lo que ganás — sostiene lo que ya te sale bien y te avisa antes de las que se pagan caro. No da consejos de mercado ni dice qué comprar.

El que te habla adentro se llama **Taladro**.

## Cómo se usa

1. Abrí la página.
2. Pegá la dirección de tu wallet, la misma con la que operás.
3. Apretá **Analizar**.

Listo. A partir de ahí se actualiza solo cada 20 segundos.

## Qué necesita y qué no

- **No pide clave privada.** No puede operar, no puede mover fondos, no puede firmar nada.
- Solo lee tus operaciones de la blockchain, que son públicas para cualquiera que tenga tu dirección.
- **Todo se procesa en tu navegador.** No hay servidor: nada de lo tuyo sale de tu máquina.
- Las notas y las rachas se guardan en tu navegador. Con **Vincular archivo** podés además guardarlas en un `.json` tuyo, en tu disco.

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

**Sin posición abierta** manda la franja horaria que está corriendo: cuánto te dio o te costó históricamente, con su ranking entre tus cinco sesiones. Debajo, una sola cosa para hacer mejor que la anterior — y si la venís ignorando, cambia de forma hasta volverse un compromiso de una sola operación que se verifica solo. Más abajo, una calculadora que convierte tu banda de pérdida en un tamaño.

**Con posición abierta** pasa a gestión: qué asegura tu stop, a qué distancia está la liquidación, cuánto anotás si salta, y el riesgo agregado si tenés varias.

Atrás de *Ver los números* está el resto: rachas esperadas, qué rindió cada contexto con chequeo de estabilidad, primera mitad contra segunda, el reloj de actividad de 24 horas y la tabla de operaciones con notas y tesis.

## Límites

- Reconstruye las operaciones desde los fills on-chain. Si operaste desde otra wallet, esas no aparecen.
- Con menos de 30 operaciones casi nada de lo que muestra es distinguible de la suerte, y la app te lo dice.
- No es asesoramiento financiero. Es un registro de lo que hiciste.

## Para el que quiera tocarlo

`index.html` es generado, no se edita a mano. La lógica está en `_build/engine.js` y la interfaz en `_build/shell.html`; `python3 _build/build.py` los junta en un archivo solo. `node _build/test.js` corre los tests. Está todo en [SETUP.md](SETUP.md).

## Licencia

MIT. Hacé lo que quieras con esto.
