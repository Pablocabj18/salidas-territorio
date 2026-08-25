# Salidas por territorio

Aplicacion web para visualizar y analizar los 96 territorios asignados de San Francisco, Cordoba.

El proyecto parte de un mapa territorial en PDF y busca convertirlo en una experiencia interactiva: seleccionar sectores, consultar estadisticas, aplicar filtros, comparar resultados y observar su evolucion en el tiempo.

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

## Estado

La aplicacion contiene los 96 territorios sobre un mapa navegable con paneo y zoom, filtros por color, buscador y semaforo de atencion. Permite registrar salidas con fecha, cantidad de hermanos, modalidad, cobertura, revisitas y cursos; los datos se conservan localmente en el navegador.

Tambien incluye prioridades de planificacion e informe mensual comparativo. La instalacion inicial contiene registros demostrativos, identificados como tales, que pueden reemplazarse progresivamente por datos reales. Todavia falta confirmar el significado operativo de los colores del plano.

La vision funcional y las reglas para agentes se encuentran en `.agents/project.md` y `AGENTS.md`.
