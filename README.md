# DUEL. — KOI Studios

Arena competitiva 1v1 en tiempo real, hecha con HTML, CSS, JavaScript, Node.js, Express y Socket.IO.

## Características
- Salas privadas con código de cuatro caracteres.
- Movimiento WASD / flechas, apuntado con mouse y disparo manteniendo clic.
- Dash con espacio.
- Arena en canvas, proyectiles, vida, marcador, temporizador y revancha.
- Servidor sincroniza posiciones, proyectiles, daño y estado de ronda.
- Compatible con Render como Web Service.

## Ejecutar en Windows
1. Instala Node.js 18 o superior.
2. Abre CMD en la carpeta del proyecto.
3. Ejecuta:

```bat
npm.cmd install
npm.cmd start
```

4. Abre http://localhost:3000.

Para jugar por internet, despliega la carpeta como Web Service en Render:
- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: déjalo vacío si los archivos están en la raíz del repositorio.

## Controles
- WASD o flechas: moverse
- Mouse: apuntar
- Clic sostenido: disparar
- Espacio: dash

## Notas
Es una primera versión jugable y extensible. La versión inicial gana la ronda al eliminar al rival; el temporizador resuelve por vida restante. Las partidas son 1v1 y el servidor debe permanecer activo para que las salas funcionen. Antes de producción pública, conviene añadir límites de frecuencia, reconexión y pruebas de carga.
