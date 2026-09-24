# ECOS — Snake con ecos

**Jugar:** https://rodrigoinfante48.github.io/Snake/ *(placeholder: activo tras el primer deploy)*

Un Snake donde **tu pasado es tu obstáculo**. Cada ronda que juegas se graba, y en la
siguiente reaparece como un **eco**: una serpiente fantasma semitransparente que repite
exactamente lo que hiciste, sincronizada tick a tick. En la ronda 5 compartes el tablero
con 4 versiones de ti.

## Qué lo hace distinto

- **Ecos deterministas.** El motor avanza por ticks (no por tiempo de pantalla) y el azar
  viene de un generador con semilla, así que cada eco es una copia exacta de tu recorrido.
- **Muda.** Una vez por ronda sueltas la mitad de tu cola, que queda como pared temporal. Si
  un eco choca con ella, se disuelve y ganas puntos. Juegas pensando en la ronda siguiente.
- **Manipular el tiempo.** Hay frutas que congelan a los ecos o invierten su tiempo.
- **Reto diario sin servidor.** La fecha define la semilla: todos juegan el mismo tablero ese
  día y el resultado se comparte como texto, estilo Wordle.

## Reglas

- Un nivel tiene varias rondas (5 por defecto). Una ronda termina al comer la meta de frutas
  o al acabarse el tiempo (barra superior).
- Al superar una ronda, tu recorrido se convierte en un eco que se suma a los anteriores.
- **Cabeza de un eco** = pierdes el nivel. **Cuerpo de un eco** = se puede cruzar, pero pierdes
  un segmento (y quedas unos ticks inmune). Con un solo segmento, el roce te mata.
- Paredes, tu propio cuerpo y tu propia muda también matan.
- Durante los primeros ticks de cada ronda los ecos parpadean y todavía no colisionan.
- **Muda** (una vez por ronda, con 4 o más segmentos): la mitad trasera de la cola se vuelve
  una pared ámbar temporal. Un eco cuya cabeza la toque se disuelve (+60 y más multiplicador).
- **Frutas especiales** (solo cuando ya hay ecos): ❄ congela a los ecos unos 3 s; ⟲ invierte
  su tiempo durante unos 3 s.
- **Puntaje final** = puntos × (1 + 0,25 × rondas sobrevividas + 0,5 × ecos disueltos).

## Controles

| | Escritorio | Celular |
|---|---|---|
| Girar | Flechas o WASD | Deslizar (se pueden encadenar giros sin levantar el dedo) |
| Mudar | Espacio o Shift | Botón **MUDA** o doble toque |
| Pausa | P o Esc | Botón ❚❚ |
| Empezar / continuar | Cualquier tecla / Enter | Tocar |

Los giros se guardan en un buffer (hasta 3), así los giros rápidos no se pierden.

## Modos de juego

- **Campaña:** 6 niveles con dificultad creciente y tableros distintos: bordes, pilares,
  bordes que dan la vuelta, portales, laberinto y una arena circular. Cada nivel tiene semilla
  fija, así las frutas caen igual en cada intento y puedes planear. Superar un nivel
  desbloquea el siguiente.
- **Reto diario:** tablero y frutas generados a partir de la fecha. El primer intento del día
  es el oficial y se puede compartir; los siguientes son práctica.
- **Clásico:** el Snake de siempre, sin ecos, muda ni especiales. Una sola ronda sin límite.

Los récords y el progreso se guardan en `localStorage`. Si el almacenamiento está bloqueado,
el juego funciona igual pero no recuerda nada.

## Crear un nivel nuevo

Agrega un objeto a `LEVELS` en `src/levels/levels.js`:

```js
{
  id: 'mi-nivel',            // único; se usa para récords y semilla
  name: 'level.miNivel',     // clave de texto (agrégala en src/i18n/es.js)
  hint: 'hint.miNivel',      // descripción corta en la lista de niveles
  tickMs: 120,               // ms por tick (velocidad)
  rounds: 5,                 // rondas del nivel
  roundTicks: 480,           // duración máxima de cada ronda, en ticks
  fruitGoal: 9,              // frutas para terminar antes la ronda
  map: [
    '####################',
    '#..>...............#',
    '#......1.....1.....#',
    '#..................#',
    // ...todas las filas del mismo ancho
    '####################',
  ],
}
```

Leyenda del mapa:

| Carácter | Significado |
|---|---|
| `#` | pared |
| `.` | vacío |
| `>` `<` `^` `v` | punto de salida y dirección inicial. La ronda N usa la N-ésima salida en orden de lectura (cíclico). Pon varias para que los ecos no arranquen encima tuyo. |
| `1`…`9` | portales: cada dígito aparece exactamente dos veces |

Los bordes del mapa dan la vuelta, así que si no quieres eso rodéalo de `#`. Después corre
`node --test`: el test `todos los niveles son válidos` comprueba que el mapa no tenga zonas
aisladas y que cada salida tenga espacio detrás (el cuerpo inicial) y delante.

## Correrlo localmente

Los ES modules no cargan desde `file://`, así que hace falta un servidor estático:

```bash
python3 -m http.server 8000      # o: npx http-server -p 8000
# abrir http://localhost:8000/
```

Tests (Node 20+, sin dependencias):

```bash
node --test
```

Agrega `?debug` a la URL para exponer el controlador en `window.__ecos`.

## Estructura del repo

```
index.html               entrada única (rutas relativas: funciona bajo /<repo>/)
css/style.css            estética neón, mobile-first
src/
  main.js                pantallas y menú
  game.js                controlador de partida: bucle de ticks, HUD, overlays
  config.js              parámetros de balance y reglas por modo
  core/                  lógica pura y determinista (sin DOM; se testea en Node)
    rng.js               RNG con semilla (mulberry32) y hashes
    board.js             parser de mapas, portales, salidas
    engine.js            step(): un tick de simulación
    echoes.js            grabación y reproducción de ecos
    session.js           rondas → ecos, puntaje total, replay de sesiones
  modes/
    modes.js             configuración de cada modo (nivel + semilla)
    daily.js             generador del tablero diario a partir de la fecha
  levels/levels.js       niveles de campaña
  io/                    todo lo que toca el navegador
    input.js             teclado, swipe, buffer de giros
    render.js            Canvas 2D
    audio.js             sonidos con Web Audio API
    storage.js           localStorage con try/catch
    share.js             texto compartible del reto diario
  i18n/                  textos centralizados (es.js); index.js expone t()
tests/replay.test.mjs    tests del motor: grabar, reproducir y comparar
.github/workflows/pages.yml  tests y deploy a GitHub Pages
CLAUDE.md                contexto técnico y registro de decisiones
```

## Deploy

Cada push a `main` corre los tests y publica el sitio en GitHub Pages con GitHub Actions.
Solo hay que activarlo una vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
