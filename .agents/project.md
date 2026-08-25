# Contexto del proyecto: Territorios de San Francisco

## Vision

La aplicacion transforma un plano estatico de 96 territorios en una herramienta interactiva para observar actividad, cobertura y evolucion. El usuario debe poder recorrer el mapa, elegir un territorio y entender rapidamente su situacion mediante indicadores y comparaciones.

## Fuente cartografica

- Archivo de referencia: `C:\Users\Pablo\Desktop\Territorios.pdf`.
- Contiene 96 territorios numerados.
- Los territorios usan cuatro colores principales, cuyo significado todavia debe confirmarse.
- Las calles y formas del plano ayudan a reconocer cada zona y deben preservarse al vectorizarlo.

## Modelo conceptual inicial

- `Territorio`: numero, nombre opcional, categoria visual, geometria y observaciones.
- `Registro`: territorio, fecha, tipo de actividad y cantidades observadas.
- `Metrica`: formula derivada de registros para un periodo determinado.
- `Fuente`: origen, responsable y fecha de actualizacion de los datos.

## Primera experiencia objetivo

1. Ver el mapa completo con una leyenda.
2. Pasar el cursor o tocar un territorio para resaltarlo.
3. Seleccionarlo para abrir una ficha lateral.
4. Consultar sus metricas y su evolucion temporal.
5. Compararlo con otros territorios o con el promedio general.
6. Aplicar filtros y ver como cambian el mapa, la tabla y los graficos.

## Decisiones pendientes del usuario

- significado de cada color;
- metricas prioritarias;
- fuente y formato de los registros reales;
- necesidad de usuarios, permisos o edicion colaborativa;
- frecuencia con la que se actualizaran los datos.

