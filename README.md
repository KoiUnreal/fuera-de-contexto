# FUERA DE CONTEXTO — KOI Studios

Party game de deducción social en tiempo real para 2–8 jugadores. Cada jugador entra desde su navegador; Socket.IO sincroniza las salas, las pistas, los votos y el marcador.

## Requisitos
- Node.js 18 o superior
- npm
- Conexión a internet para descargar dependencias y cargar las fuentes web (el juego funciona sin las fuentes externas usando las tipografías de respaldo)

## Ejecutar en tu PC
1. Descomprime el proyecto.
2. Abre una terminal dentro de la carpeta `koi-party-game`.
3. Ejecuta:

   ```bash
   npm install
   npm start
   ```
4. Abre `http://localhost:3000`.
5. Para probar con varios jugadores en el mismo PC, abre varias ventanas/incógnito. Para que amigos fuera de tu red jueguen, despliega el servidor (siguiente sección).

## Desplegar para jugar por internet (Render)
1. Sube esta carpeta a un repositorio nuevo de GitHub.
2. En Render, crea un **Web Service** y conecta el repositorio.
3. Usa `npm install` como Build Command y `npm start` como Start Command.
4. Selecciona una versión de Node.js compatible (18+), crea el servicio y espera a que termine el despliegue.
5. Comparte la URL HTTPS con tus amigos. Uno crea una sala y comparte el código.

El servidor escucha en `process.env.PORT`, como esperan Render y servicios similares. Socket.IO usa WebSockets con fallback HTTP long-polling.

## Cómo se juega
- De 4 a 8 personas por sala.
- El anfitrión inicia cuando hay al menos 4 jugadores.
- La partida dura 5 rondas.
- En cada ronda, una persona al azar es el infiltrado; el resto recibe la palabra secreta.
- Los jugadores envían una pista por turno, luego votan.
- Puntuación: +2 para cada civil si el infiltrado es atrapado; +4 para el infiltrado si escapa; +1 por votar.
- El anfitrión controla el avance entre rondas y puede iniciar una nueva partida al terminar.

## Archivos
- `server.js`: servidor autoritativo, salas, roles, fases, temporizadores y puntuación.
- `public/index.html`: estructura de la interfaz.
- `public/style.css`: identidad visual responsive.
- `public/app.js`: interfaz cliente y eventos Socket.IO.

## Notas para producción
Este es un prototipo funcional listo para desplegar en un servidor Node persistente. Las salas viven en memoria: si el servidor se reinicia, las partidas activas se pierden. Para escalar a múltiples instancias, añade un adaptador de Socket.IO (por ejemplo Redis) y persistencia. También conviene incorporar rate limiting, moderación/reportes, tests automatizados y límites contra abuso antes de abrirlo al público.


## Modo de dos jugadores

Ahora se puede iniciar una sala con solo dos personas. El flujo de partida, los temporizadores y las votaciones siguen funcionando con dos jugadores. Para una experiencia social más variada, se recomienda jugar con 4–8 personas.
