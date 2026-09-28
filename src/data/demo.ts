import type { Asignacion, Campana, Modalidad, RegistroSalida } from "../types/domain";

const modalidades: Modalidad[] = ["Casa en casa", "Revisitas", "Exhibidores", "Cartas", "Telefonica", "Informal"];

function fechaAtras(dias: number) {
  const fecha = new Date();
  fecha.setHours(12, 0, 0, 0);
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

function fechaAdelante(dias: number) {
  return fechaAtras(-dias);
}

export function registrosDemo(): RegistroSalida[] {
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

export function asignacionesDemo(): Asignacion[] {
  return [
    { id: "demo-a-1", territorioId: 36, fecha: fechaAdelante(2), hora: "09:30", grupo: "Grupo 1", puntoEncuentro: "Salón del Reino", estado: "Programada", demo: true },
    { id: "demo-a-2", territorioId: 72, fecha: fechaAdelante(4), hora: "17:00", grupo: "Grupo 2", puntoEncuentro: "Punto habitual", estado: "Programada", demo: true },
  ];
}

export function campanasDemo(): Campana[] {
  const hoy = new Date();
  return [{
    id: "demo-c-1",
    nombre: "Campaña especial (demostración)",
    desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12).toISOString().slice(0, 10),
    hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 12).toISOString().slice(0, 10),
    territorioIds: Array.from({ length: 96 }, (_, i) => i + 1),
    completados: [4, 12, 21, 36, 48, 72],
    activa: true,
    demo: true,
  }];
}
