import type { Modalidad, RegistroSalida } from "../types/domain";

const STORAGE_KEY = "sf-territorios-registros-v1";
const modalidades: Modalidad[] = ["Casa en casa", "Revisitas", "Exhibidores", "Cartas", "Telefonica", "Informal"];

function fechaAtras(dias: number) {
  const fecha = new Date("2026-08-24T12:00:00");
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

function registrosDemo(): RegistroSalida[] {
  return Array.from({ length: 96 }, (_, index) => {
    const territorioId = index + 1;
    const cantidad = territorioId % 4 === 0 ? 3 : territorioId % 3 === 0 ? 2 : 1;
    return Array.from({ length: cantidad }, (_, salida) => ({
      id: `demo-${territorioId}-${salida}`,
      fecha: fechaAtras((territorioId * 5 + salida * 17) % 72),
      territorioId,
      hermanos: 2 + ((territorioId + salida * 3) % 8),
      modalidad: modalidades[(territorioId + salida) % modalidades.length],
      cobertura: 18 + ((territorioId * 7 + salida * 13) % 72),
      revisitas: (territorioId + salida * 2) % 7,
      cursos: (territorioId + salida) % 5 === 0 ? 1 : 0,
      observacion: "Registro demostrativo",
      demo: true,
    }));
  }).flat();
}

export function obtenerRegistros(): RegistroSalida[] {
  const guardados = localStorage.getItem(STORAGE_KEY);
  if (!guardados) {
    const demo = registrosDemo();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    return demo;
  }
  try { return JSON.parse(guardados) as RegistroSalida[]; }
  catch { return registrosDemo(); }
}

export function guardarRegistro(registro: Omit<RegistroSalida, "id">) {
  const registros = obtenerRegistros();
  registros.push({ ...registro, id: crypto.randomUUID(), demo: false });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
}

export function restaurarDemo() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registrosDemo()));
}
