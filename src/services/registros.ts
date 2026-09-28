import { asignacionesDemo, campanasDemo, registrosDemo } from "../data/demo";
import type { Asignacion, Campana, DatosAplicacion, ProgresoCuadra, RegistroSalida } from "../types/domain";

const STORAGE_KEY = "sf-territorios-datos-v3";

function iniciales(): DatosAplicacion {
  return { registros: registrosDemo(), asignaciones: asignacionesDemo(), campanas: campanasDemo(), progresoCuadras: [] };
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
  datos.progresoCuadras = datos.progresoCuadras.filter((item) => item.id !== progreso.id);
  if (progreso.estado !== "Pendiente") datos.progresoCuadras.push(progreso);
  guardarDatosLocales(datos);
}

export function restaurarDemo() {
  guardarDatosLocales(iniciales());
}
