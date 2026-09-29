import type { RegistroSalida } from "../types/domain";

export function claveMes(fecha: Date) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function desplazarMes(fecha: Date, desplazamiento: number) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + desplazamiento, 1, 12);
}

export function perteneceAlMes(registro: RegistroSalida, fecha: Date, desplazamiento = 0) {
  return registro.fecha.slice(0, 7) === claveMes(desplazarMes(fecha, desplazamiento));
}

export function territoriosDeRegistro(registro: RegistroSalida) {
  return registro.territorioIds?.length ? registro.territorioIds : [registro.territorioId];
}

export function promedio(valores: number[]) {
  return valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;
}

export function diferenciaPorcentual(actual: number, anterior: number) {
  if (!anterior) return actual ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export function diasTranscurridos(fecha: string | undefined, hoy = new Date()) {
  if (!fecha) return Infinity;
  const inicio = new Date(`${fecha}T12:00:00`);
  const fin = new Date(hoy);
  fin.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((fin.getTime() - inicio.getTime()) / 86400000));
}
