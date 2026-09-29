export function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function inicioSemanaDomingo(fecha: Date) {
  const inicio = new Date(fecha);
  inicio.setHours(12, 0, 0, 0);
  inicio.setDate(inicio.getDate() - inicio.getDay());
  return inicio;
}

export function desplazarDias(fecha: Date, dias: number) {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

export function rangoSemana(fecha: Date) {
  const inicio = inicioSemanaDomingo(fecha);
  return {
    desde: fechaIsoLocal(inicio),
    hasta: fechaIsoLocal(desplazarDias(inicio, 6)),
  };
}

export function parsearTerritorios(valor: string) {
  const encontrados = valor.match(/\d+/g) ?? [];
  const ids = [...new Set(encontrados.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id < 1 || id > 96)) {
    throw new Error("Los territorios deben estar entre 1 y 96.");
  }
  return ids;
}
