# CLAUDE.md — contexto del proyecto ECOS

> **Instrucción para Claude:** al **inicio** de cada sesión, lee este archivo completo. Al
> **final**, actualiza el "Registro de decisiones" (fecha + qué se decidió y por qué), el
> roadmap y cualquier sección que haya quedado desactualizada. Corre `node --test` antes de
> hacer commit.

## Concepto

Snake web con un giro: cada ronda se graba, y en las rondas siguientes tus recorridos
anteriores reaparecen como **ecos**: serpientes fantasma que repiten tus movimientos exactos,
sincronizadas por tick. Tu pasado es tu obstáculo.

### Reglas exactas (como están implementadas)

- Un nivel tiene `rounds` rondas (5 por defecto). La ronda termina (`cleared`) al llegar a
  `fruitGoal` frutas o a `roundTicks` ticks. Da `score.roundClear` puntos.
- Morir termina el **nivel** (`session.status = 'lost'`). Superar todas las rondas: `'won'`.
- Cada ronda superada se convierte en un eco (solo en los modos con `echoes: true`).
- La ronda N arranca en la salida N del mapa (cíclico), para que los ecos no aparezcan encima.
- Los primeros `echoWarmupTicks` ticks de cada ronda los ecos no colisionan (parpadean).
- **Cabeza de un eco** en tu nueva celda de cabeza, o cruce frontal (intercambian celdas) → muerte `'echo'`.
- **Cuerpo de un eco** (sin la cabeza) en tu nueva cabeza → pierdes 1 segmento (`scrape`) y quedas
  inmune `echoScrapeGraceTicks` ticks. Si ya tienes `minLength` (1) → muerte `'scrape'`.
- Pared, tu cuerpo o una pared de muda → muerte (`wall`, `self`, `molt`).
- **Muda:** una vez por ronda, con longitud ≥ `moltMinLength`. Conservas `ceil(len/2)`. La cola
  soltada queda como pared durante `moltWallTicks`. Si la **cabeza** de un eco pisa una pared
  de muda, el eco se disuelve durante el resto de la ronda (+`score.dissolve`). En la ronda
  siguiente vuelve a estar, porque es un registro de tu pasado.
- **Especiales:** al comer una fruta normal, si hay ecos y no hay otra especial, con probabilidad
  `specialChance` aparece ❄ (`freeze`) o ⟲ (`reverse`), 50/50. Dura `specialTicks`.
  ❄: el reloj de ecos se detiene `freezeTicks`. ⟲: el reloj de ecos retrocede `reverseTicks`.
- **Puntaje final** = base × (1 + `multPerRound` × rondas superadas + `multPerDissolve` × disueltos).
  En el modo clásico el multiplicador es 1.
- Los bordes del tablero dan la vuelta (wrap). Los niveles con borde lo dibujan con `#`.

## Restricciones (no negociables)

- Solo archivos estáticos en GitHub Pages; sin servidor ni backend.
- HTML + CSS + JS vanilla con ES modules y Canvas 2D. **Sin frameworks, sin bundler, sin dependencias.**
- Lógica determinista por ticks y RNG con semilla. En `src/core/` están **prohibidos**
  `Math.random`, `Date`, `performance` y el DOM.
- Rutas relativas (`./src/...`) para funcionar bajo `/<repo>/`.
- Deploy automático con GitHub Actions en cada push a `main`.
- Mobile-first: swipe en celular, flechas/WASD en escritorio, buffer de giros.
- Sonidos con Web Audio API (sin archivos). Textos en `src/i18n/`. `localStorage` siempre con try/catch.

## Arquitectura

```
core/ (puro, determinista)          io/ (navegador)
  rng ─┐                              input  ─┐
  board ├─> engine.step() <── session │ render │─> game.js (bucle) ─> main.js (pantallas)
  echoes┘        ▲                    │ audio  │
                 └── tests/ (Node)    storage, share
```

### Motor de ticks (`src/core/engine.js`)

`createRound()` crea el estado; `step(state, input)` avanza **un** tick y muta el estado.
Orden dentro de un tick (cambiarlo altera las grabaciones):

1. Aplicar giro válido (se graba) y luego la muda (se graba).
2. Descontar la inmunidad (`graceLeft`).
3. Calcular la nueva cabeza (con portales).
4. Avanzar el reloj de ecos (`advanceEchoClock`) y `tick++`.
5. Colisiones mortales: pared, muda, cuerpo propio y cabeza de eco.
6. Mover (unshift de la cabeza, pop de la cola salvo que crezca).
7. Roce con el cuerpo de un eco.
8. Fruta normal (respawn y quizá una especial) y luego la especial (comer o caducar).
9. Ecos contra paredes de muda (disolver) y caducidad de las mudas.
10. Grabar `history.push(head)` y `lens.push(len)`.
11. Fin de ronda por meta o tiempo.

`game.js` usa un acumulador de paso fijo sobre `requestAnimationFrame`: el render corre a los
fps de la pantalla y la simulación a `tickMs`. `tickMs` es solo presentación, no entra en la lógica.

### Grabación y reproducción de ecos (`src/core/echoes.js`)

- **Invariante:** el cuerpo siempre es un sufijo del historial de cabezas (crecer, mudar y
  rozar solo tocan la cola). Por eso un eco guarda solo `history` (celdas de la cabeza, con
  el cuerpo inicial delante) y `lens` (longitud por tick). Cuerpo en el tiempo `e` =
  `history[offset+e-k]` para `k < lens[e]`. El test verifica esta invariante en cada tick.
- Los ecos se reproducen desde la **trayectoria**, no volviendo a simular. Así no dependen de las
  frutas de la ronda actual, que cambian cuando juegas distinto.
- El **reloj de ecos** (`echoClock`) es independiente de `tick`: congelar lo detiene e invertir
  lo hace retroceder. Pasado `lastTick` el eco desaparece.
- **Grabación compacta:** `state.inputs` = lista de `[tick, código]` (0-3 dirección, 4 muda),
  solo con las entradas aplicadas. `replaySession()` reconstruye todo (rondas y ecos) desde
  nivel + modo + semilla + grabaciones.

### RNG con semilla (`src/core/rng.js`)

mulberry32, con el estado (`rng.s`) dentro del estado de la ronda. La semilla de la ronda es
`hashInts(sessionSeed, roundIndex + 1)`. Semilla de sesión: campaña =
`hashString('campaign-'+id)`, diario = `hashString('ecos-daily-'+AAAA-MM-DD)` (fecha local),
clásico = `Date.now()`.

### Input (`src/io/input.js`)

Cola de hasta 3 giros sin duplicados consecutivos. Cada tick, `game.js` consume el primero
que sea válido (`isValidTurn`: ni reversa ni la misma dirección). El swipe es continuo:
cada 22 px recorridos cuenta como un giro. Muda: Espacio/Shift, doble toque o botón.

### Render (`src/io/render.js`)

Canvas 2D ajustado a `devicePixelRatio`, redibujado completo en cada frame. Solo lee el estado.
Colores en `COLORS`: jugador cian, ecos magenta/violeta (alfa según antigüedad; celeste si
están congelados), muda ámbar, fruta lima. La cabeza del eco lleva un marco (peligro) y
delante se dibujan `echoPreviewTicks` puntos con su recorrido próximo.

## Formato de niveles

Ver README > "Crear un nivel nuevo". Los campos son `id`, `name`, `hint` (claves i18n),
`tickMs`, `rounds`, `roundTicks`, `fruitGoal`, `map` (strings) y opcionalmente `params`
(sobrescribe claves de `CONFIG` para ese nivel). Leyenda: `#` pared, `.` vacío, `><^v` salidas,
`1-9` portales en pares. El reto diario se genera en `src/modes/daily.js`: 20×20 con borde,
bloques con simetría de 180°, a veces un par de portales, 5 salidas fijas con zona reservada
y verificación de conectividad.

## Parámetros de balance: dónde ajustarlos

- `src/config.js` → `CONFIG`: longitud inicial, duración de muda, especiales, puntaje y multiplicadores.
- `src/config.js` → `MODE_RULES`: qué mecánicas tiene cada modo.
- `src/levels/levels.js`: velocidad, rondas, duración y meta de cada nivel.
- `src/modes/daily.js` → `generateDailyLevel`: velocidad y metas del diario.

⚠️ Cambiar cualquier parámetro que afecte a `step()` cambia el resultado de las grabaciones
(no hay grabaciones persistidas hoy, pero importará si se agregan replays o fantasmas compartidos).
Cambiar el generador diario cambia el tablero del día para quien ya lo jugó.

## Tests

`node --test` (sin dependencias). `tests/replay.test.mjs`:
- juega sesiones completas con un bot en varios niveles y modos, y las **reproduce solo con las
  entradas grabadas**, comparando la huella (`stateHash`) de cada ronda, el puntaje y los ecos;
- comprueba que cada eco pasa por la misma celda que la cabeza en vivo, tick a tick;
- comprueba que alterar una entrada cambia el resultado (el test no pasa por casualidad);
- casos dirigidos: roce, choque de cabezas, disolver con la muda y congelar;
- validez de todos los mapas y determinismo del reto diario.

Prueba manual en el navegador: `python3 -m http.server` y abrir `/?debug` (expone `window.__ecos`).

## Roadmap

- [ ] Inglés (`src/i18n/en.js`) y selector de idioma.
- [ ] Guardar la mejor partida por nivel (solo entradas) y mostrarla como "fantasma récord".
- [ ] Compartir el replay completo del diario en la URL (las entradas comprimidas caben en un hash).
- [ ] Más niveles de campaña (tablero con portales móviles, arena con paredes que aparecen).
- [ ] Opciones de accesibilidad: modo alto contraste, reducir destellos y sacudidas.
- [ ] PWA (manifest y service worker) para jugar sin conexión.
- [ ] Ajustar el balance con datos reales: `specialChance`, duración de la muda, metas.

## Registro de decisiones

- **2026-09-24 — Sesión 1 (creación).**
  - Ecos como **trayectoria grabada** (cabeza + longitud por tick) y no como re-simulación: son
    exactos por construcción y no dependen de las frutas de la ronda actual. La re-simulación
    se usa en los tests para validar la grabación compacta de entradas.
  - Morir termina el nivel, no solo la ronda: le da peso a cada ronda y simplifica el multiplicador.
  - Cada ronda usa una salida distinta y hay `echoWarmupTicks` para evitar muertes injustas al empezar.
  - Un eco disuelto desaparece solo durante esa ronda: el eco es tu pasado, no se destruye.
  - Solo la **cabeza** del eco se disuelve con la muda (regla simple y legible).
  - Bordes con wrap siempre; los niveles con borde lo dibujan con `#` (un solo camino de código).
  - Estética neón: jugador cian vs ecos magenta/violeta translúcidos (buen contraste de tono y alfa).
  - Semilla fija por nivel de campaña (aprendible). El clásico usa semilla aleatoria.
  - Reto diario: el primer intento es el oficial y se guarda en `localStorage`; el resto es práctica.
  - Sin dependencias ni en los tests (`node:test`). El workflow corre los tests antes de publicar.
