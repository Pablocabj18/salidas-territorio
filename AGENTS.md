# Instrucciones para agentes

## Comunicacion

- Responder siempre en espanol.
- Ser claro y breve, pero explicar decisiones que afecten datos, arquitectura o experiencia de uso.
- No repetir la solicitud del usuario.
- Si falta informacion no bloqueante, avanzar con datos de ejemplo y dejar el supuesto documentado.
- Ejecutar las verificaciones pertinentes, incluido `npm run build`, sin pedir permiso.

## Objetivo del proyecto

Construir una aplicacion web para explorar los 96 territorios asignados de San Francisco, Cordoba. El mapa de referencia es `Territorios.pdf`; cada sector esta identificado por un numero y un color.

La aplicacion debe permitir:

- visualizar y seleccionar territorios sobre el mapa;
- consultar indicadores de cada territorio;
- filtrar, ordenar y comparar territorios;
- cargar o reemplazar datos sin redibujar la interfaz;
- distinguir visualmente estados o categorias sin depender solo del color;
- funcionar correctamente en escritorio y dispositivos moviles.

## Criterios de datos

- El numero de territorio es el identificador principal estable.
- Separar la geometria del mapa, el catalogo territorial y las observaciones estadisticas.
- No inventar el significado de los colores del PDF. Usar nombres neutrales hasta que el usuario los defina.
- Conservar la procedencia y fecha de actualizacion de cada conjunto de datos.
- Usar datos mock claramente identificados cuando aun no existan datos reales.
- Toda metrica debe indicar unidad, periodo y criterio de calculo.

## Arquitectura sugerida

```text
src/
|-- components/     componentes reutilizables
|-- views/          paginas y vistas principales
|-- services/       acceso, carga y transformacion de datos
|-- data/           catalogos y datos mock
|-- config/         configuracion del dominio y metricas
|-- utils/          funciones auxiliares
|-- assets/         mapa, iconos y recursos visuales
|-- types/          contratos de datos
```

## Calidad

- Preferir TypeScript y componentes pequenos.
- Mantener accesibilidad por teclado, foco visible y contraste suficiente.
- Evitar acoplar estadisticas directamente al SVG o a los componentes visuales.
- Agregar pruebas para transformaciones, filtros y formulas de metricas.
- Antes de terminar cambios funcionales, ejecutar las pruebas disponibles y el build.

