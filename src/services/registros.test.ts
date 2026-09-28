import { beforeEach, describe, expect, it } from "vitest";
import type { SolicitudTerritorio } from "../types/domain";
import {
  actualizarCuadraLocal,
  cerrarSolicitudLocal,
  crearSolicitudLocal,
  obtenerDatosLocales,
  resolverSolicitudLocal,
} from "./registros";

const memoria = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (clave: string) => memoria.get(clave) ?? null,
    setItem: (clave: string, valor: string) => memoria.set(clave, valor),
  },
});

function solicitud(id: string, cuadras: string[]): SolicitudTerritorio {
  return {
    id,
    territorioId: 36,
    cuadraIds: cuadras,
    alcance: "Cuadras seleccionadas",
    desde: "2026-09-28",
    hasta: "2026-10-05",
    modalidad: "Casa en casa",
    aliasPrivado: "Prueba",
    observacion: "",
    estado: "Pendiente",
    solicitadoPorUid: "local-demo",
    creadoEn: "2026-09-28T12:00:00.000Z",
  };
}

describe("solicitudes y seguimiento local", () => {
  beforeEach(() => memoria.clear());

  it("reserva todas las cuadras juntas y evita cruces", () => {
    crearSolicitudLocal(solicitud("s1", ["T36-C01", "T36-C02"]));
    resolverSolicitudLocal("s1", "Aprobada");
    expect(obtenerDatosLocales().reservas).toHaveLength(2);

    crearSolicitudLocal(solicitud("s2", ["T36-C02", "T36-C03"]));
    expect(() => resolverSolicitudLocal("s2", "Aprobada")).toThrow("ya están reservadas");

    cerrarSolicitudLocal("s1", "Completada");
    resolverSolicitudLocal("s2", "Aprobada");
    expect(obtenerDatosLocales().reservas.map((item) => item.cuadraId)).toEqual(["T36-C02", "T36-C03"]);
  });

  it("conserva el historial incluso al volver a pendiente", () => {
    actualizarCuadraLocal({ id:"T36-C01", territorioId:36, estado:"Completada", fecha:"2026-09-28", actualizadoEn:"2026-09-28T12:00:00.000Z" });
    actualizarCuadraLocal({ id:"T36-C01", territorioId:36, estado:"Pendiente", fecha:"2026-09-29", actualizadoEn:"2026-09-29T12:00:00.000Z" });
    const progreso = obtenerDatosLocales().progresoCuadras[0];
    expect(progreso.estado).toBe("Pendiente");
    expect(progreso.historial?.map((item) => item.estado)).toEqual(["Completada", "Pendiente"]);
  });
});
