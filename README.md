# Territorios San Francisco

Aplicación web para explorar, planificar y medir los 96 territorios asignados de San Francisco, Córdoba.

## Qué incluye

- mapa MapLibre con calles reales de OpenStreetMap mediante OpenFreeMap, sin API key;
- límites exactos de los 96 territorios importados desde el KML del usuario;
- búsqueda, filtros, enlace directo y ubicación GPS;
- registros de salidas y comparación mensual;
- asignaciones por fecha, hora, grupo y punto de encuentro;
- campaña activa con avance por territorio;
- 403 cuadras seleccionables, con estado pendiente, en curso o completada;
- prioridades y programa territorial imprimible;
- informe mensual con criterios de cálculo visibles;
- instalación como aplicación (PWA) y caché de la interfaz;
- Firebase/Firestore opcional para compartir datos entre todos los dispositivos;
- acceso de escritura limitado a administradores.

La aplicación no guarda nombres de publicadores. “Participaciones” es la suma de asistentes informados en cada salida; no representa personas únicas.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Para generar producción:

```bash
npm run build
```

Sin configuración de Firebase funciona en modo demostración y guarda los cambios únicamente en el navegador actual.

## Activar datos compartidos con Firebase

1. Crear un proyecto y una aplicación web en [Firebase Console](https://console.firebase.google.com/).
2. Activar **Firestore Database** y **Authentication > Google**.
3. Copiar `.env.example` como `.env.local` y completar la configuración pública de la aplicación web.
4. Publicar `firestore.rules` desde la consola o con Firebase CLI.
5. Iniciar sesión una vez y buscar el UID del usuario en Authentication.
6. Crear manualmente `administradores/{UID}` en Firestore con el campo booleano `activo: true`.

En GitHub Pages, cargar los seis valores `VITE_FIREBASE_*` como *Repository secrets*. El workflow ya los entrega al build. La configuración web identifica el proyecto, pero la seguridad real la aplican `firestore.rules`; nunca se debe subir una cuenta de servicio.

Colecciones usadas:

- `registros`: cantidades agregadas de cada salida;
- `asignaciones`: programa operativo sin nombres personales;
- `campanas`: alcance y territorios completados;
- `progresoCuadras`: estado y fecha de cada cuadra, usando su identificador estable;
- `administradores`: lista privada de UID autorizados.

## Geometría y procedencia

`public/territorios.geojson` proviene de `Territorio OESTE.kml`, exportado desde Google My Maps el 28 de septiembre de 2026. El conversor valida que existan exactamente los territorios 1–96:

```bash
python scripts/convert_kml_to_geojson.py "Territorio OESTE.kml" public/territorios.geojson
```

Los colores se conservan con nombres neutrales porque todavía no se confirmó su significado operativo.

## Cuadras generadas

`public/cuadras.geojson` contiene 403 unidades generadas con las calles vehiculares de OpenStreetMap y recortadas dentro de los 96 territorios. Cada una posee un ID estable como `T36-C01`, área, territorio, procedencia y fecha de actualización.

La generación se puede repetir con:

```bash
pip install -r scripts/requirements-geometry.txt
python scripts/generate_blocks_from_osm.py public/territorios.geojson public/cuadras.geojson
```

El proceso descarta fragmentos menores a 650 m² y separa únicamente por calles vehiculares. Los territorios 2, 57 y 58 quedaron marcados en la metadata como casos para revisión visual debido a su cantidad de subdivisiones o forma irregular. La geometría es una ayuda operativa derivada de OSM, no un catastro oficial.

## Funcionamiento sin conexión

El service worker conserva la interfaz y la geometría territorial. Firestore mantiene una copia local cuando está configurado. El mapa base depende de mosaicos en línea; solo pueden reaparecer sin conexión las zonas que el navegador ya tenga en caché. Un mapa totalmente offline requiere agregar un archivo PMTiles de San Francisco.
