import { asignacionesDemo, campanasDemo, registrosDemo } from "../data/demo";
import type { Asignacion, Campana, ConfiguracionOperacion, DatosAplicacion, ProgresoCuadra, RegistroSalida, ReservaTerritorial, SolicitudTerritorio } from "../types/domain";

const STORAGE_KEY = "sf-territorios-datos-v3";

function iniciales(): DatosAplicacion {
  return { registros: registrosDemo(), asignaciones: asignacionesDemo(), campanas: campanasDemo(), progresoCuadras: [], solicitudes: [], reservas: [], configuracion: [] };
}

export function obtenerDatosLocales(): DatosAplicacion {
  const guardados = localStorage.getItem(STORAGE_KEY);
  if (!guardados) {
    const demo = iniciales();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    return demo;
  }
  try {
    const datos = JSON.parse(guardados) as Partial<DatosAplicacion>;
    return {
      registros: datos.registros ?? registrosDemo(),
      asignaciones: datos.asignaciones ?? asignacionesDemo(),
      campanas: datos.campanas ?? campanasDemo(),
      progresoCuadras: datos.progresoCuadras ?? [],
      solicitudes: datos.solicitudes ?? [],
      reservas: datos.reservas ?? [],
      configuracion: datos.configuracion ?? [],
    };
  } catch {
    return iniciales();
  }
}

export function guardarDatosLocales(datos: DatosAplicacion) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
}

export function guardarRegistroLocal(registro: Omit<RegistroSalida, "id">) {
  const datos = obtenerDatosLocales();
  const nuevo = { ...registro, id: crypto.randomUUID(), demo: false, creadoEn: new Date().toISOString() };
  datos.registros.push(nuevo);
  guardarDatosLocales(datos);
  return nuevo;
}

export function guardarAsignacionLocal(asignacion: Omit<Asignacion, "id">) {
  const datos = obtenerDatosLocales();
  const nueva = { ...asignacion, id: crypto.randomUUID(), demo: false, creadoEn: new Date().toISOString() };
  datos.asignaciones.push(nueva);
  guardarDatosLocales(datos);
  return nueva;
}

export function actualizarAsignacionLocal(asignacion: Asignacion) {
  const datos = obtenerDatosLocales();
  if (!datos.asignaciones.some((item) => item.id === asignacion.id)) throw new Error("La salida ya no existe.");
  const actualizada = { ...asignacion, actualizadoEn: new Date().toISOString(), demo: false };
  datos.asignaciones = datos.asignaciones.map((item) => item.id === asignacion.id ? actualizada : item);
  guardarDatosLocales(datos);
  return actualizada;
}

export function completarAsignacionLocal(asignacionId: string, registro: Omit<RegistroSalida, "id">, cuadrasCompletadas: string[]) {
  const datos = obtenerDatosLocales();
  const asignacion = datos.asignaciones.find((item) => item.id === asignacionId);
  if (!asignacion) throw new Error("La salida ya no existe.");
  if (asignacion.estado !== "Programada") throw new Error("La salida ya fue finalizada.");
  const ahora = new Date().toISOString();
  const nuevo: RegistroSalida = { ...registro, id: crypto.randomUUID(), asignacionId, demo: false, creadoEn: ahora };
  datos.registros.push(nuevo);
  asignacion.estado = "Completada";
  asignacion.completadaEn = ahora;
  cuadrasCompletadas.forEach((id) => {
    const featureTerritorio = Number(id.match(/^T(\d+)-/)?.[1] ?? registro.territorioId);
    const anterior = datos.progresoCuadras.find((item) => item.id === id);
    const evento = { estado: "Completada" as const, fecha: registro.fecha, registradoEn: ahora };
    const progreso: ProgresoCuadra = { id, territorioId: featureTerritorio, estado: "Completada", fecha: registro.fecha, actualizadoEn: ahora, historial: [...(anterior?.historial ?? []), evento].slice(-12) };
    datos.progresoCuadras = [...datos.progresoCuadras.filter((item) => item.id !== id), progreso];
  });
  guardarDatosLocales(datos);
  return nuevo;
}

export function eliminarAsignacionLocal(id: string) {
  const datos = obtenerDatosLocales();
  const cantidadAnterior = datos.asignaciones.length;
  datos.asignaciones = datos.asignaciones.filter((item) => item.id !== id);
  if (datos.asignaciones.length === cantidadAnterior) throw new Error("La salida ya no existe.");
  guardarDatosLocales(datos);
}

export function guardarCampanaLocal(campana: Omit<Campana, "id">) {
  const datos = obtenerDatosLocales();
  const nueva = { ...campana, id: crypto.randomUUID(), demo: false, creadoEn: new Date().toISOString() };
  datos.campanas = datos.campanas.map((item) => ({ ...item, activa: false }));
  datos.campanas.push(nueva);
  guardarDatosLocales(datos);
  return nueva;
}

export function actualizarCampanaLocal(campana: Campana) {
  const datos = obtenerDatosLocales();
  datos.campanas = datos.campanas.map((item) => item.id === campana.id ? campana : item);
  guardarDatosLocales(datos);
}

export function actualizarCuadraLocal(progreso: ProgresoCuadra) {
  const datos = obtenerDatosLocales();
  const anterior = datos.progresoCuadras.find((item) => item.id === progreso.id);
  progreso.historial = [...(anterior?.historial ?? []), { estado: progreso.estado, fecha: progreso.fecha, registradoEn: progreso.actualizadoEn ?? new Date().toISOString() }].slice(-12);
  datos.progresoCuadras = [...datos.progresoCuadras.filter((item) => item.id !== progreso.id), progreso];
  guardarDatosLocales(datos);
}

export function crearSolicitudLocal(solicitud: SolicitudTerritorio) {
  const datos = obtenerDatosLocales();
  datos.solicitudes.push(solicitud);
  guardarDatosLocales(datos);
}

export function resolverSolicitudLocal(id: string, estado: "Aprobada" | "Rechazada") {
  const datos = obtenerDatosLocales();
  const solicitud = datos.solicitudes.find((item) => item.id === id);
  if (!solicitud) throw new Error("Solicitud no encontrada.");
  const hoy = new Date().toISOString().slice(0, 10);
  const ocupadas = datos.reservas.filter((item) => solicitud.cuadraIds.includes(item.cuadraId) && item.hasta >= hoy && item.solicitudId !== id);
  if (estado === "Aprobada" && ocupadas.length) throw new Error("Una o más cuadras ya están reservadas.");
  solicitud.estado = estado;
  solicitud.resueltoEn = new Date().toISOString();
  if (estado === "Aprobada") datos.reservas.push(...solicitud.cuadraIds.map((cuadraId): ReservaTerritorial => ({ id: cuadraId, solicitudId:id, territorioId:solicitud.territorioId, cuadraId, desde:solicitud.desde, hasta:solicitud.hasta, estado:"Reservada" })));
  guardarDatosLocales(datos);
}

export function cerrarSolicitudLocal(id: string, estado: "Completada" | "Cancelada") {
  const datos = obtenerDatosLocales();
  const solicitud = datos.solicitudes.find((item) => item.id === id);
  if (!solicitud) throw new Error("Solicitud no encontrada.");
  solicitud.estado = estado;
  datos.reservas = datos.reservas.filter((item) => item.solicitudId !== id);
  guardarDatosLocales(datos);
}

export function guardarConfiguracionLocal(configuracion: ConfiguracionOperacion) {
  const datos = obtenerDatosLocales();
  datos.configuracion = [configuracion];
  guardarDatosLocales(datos);
}

export function restaurarDemo() {
  guardarDatosLocales(iniciales());
}
