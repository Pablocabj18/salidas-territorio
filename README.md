# Salidas por territorio

Aplicacion web para visualizar y analizar los 96 territorios asignados de San Francisco, Cordoba.

El proyecto parte de un mapa territorial en PDF y busca convertirlo en una experiencia interactiva: seleccionar sectores, consultar estadisticas, aplicar filtros, comparar resultados y observar su evolucion en el tiempo. El mapa usa MapLibre GL con cartografia vectorial de OpenFreeMap y datos de OpenStreetMap, sin API key.

## Alcance inicial

- mapa interactivo de los territorios;
- ficha de detalle por numero de territorio;
- indicadores, graficos y comparaciones;
- filtros por periodo, categoria y estado;
- importacion de datos estructurados;
- diseno adaptable a escritorio y movil.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Para generar la version de produccion:

```bash
npm run build
```

## Geometría territorial

Los límites reales provienen de `Territorio OESTE.kml`, exportado desde Google My Maps el 28 de septiembre de 2026. El archivo contiene un polígono para cada territorio numerado del 1 al 96. La procedencia y la fecha también quedan registradas dentro de `public/territorios.geojson`.

Para reemplazar la geometría después de editar el mapa de My Maps:

```bash
python scripts/convert_kml_to_geojson.py "Territorio OESTE.kml" public/territorios.geojson
```

El conversor comprueba que existan exactamente los territorios 1–96 antes de escribir el resultado.

## Estado

La aplicacion contiene los 96 territorios con los límites del KML sobre un mapa navegable con paneo y zoom, filtros por color, buscador y semaforo de atencion. Permite registrar salidas con fecha, cantidad de hermanos, modalidad, cobertura, revisitas y cursos; los datos se conservan localmente en el navegador.

Tambien incluye prioridades de planificacion e informe mensual comparativo. La instalacion inicial contiene registros demostrativos, identificados como tales, que pueden reemplazarse progresivamente por datos reales. Todavia falta confirmar el significado operativo de los colores del plano.

La vision funcional y las reglas para agentes se encuentran en `.agents/project.md` y `AGENTS.md`.
