import { describe, expect, it } from "vitest";
import { diasTranscurridos, diferenciaPorcentual, perteneceAlMes, promedio, territoriosDeRegistro } from "./metricas";
import type { RegistroSalida } from "../types/domain";

const registro = (fecha: string): RegistroSalida => ({
  id: "prueba",
  fecha,
  territorioId: 1,
  hermanos: 4,
  modalidad: "Casa en casa",
  cobertura: 50,
  revisitas: 0,
  cursos: 0,
  observacion: "",
});

describe("métricas territoriales", () => {
  it("calcula promedios redondeados y el caso sin datos", () => {
    expect(promedio([2, 3, 7])).toBe(4);
    expect(promedio([])).toBe(0);
  });

  it("compara períodos incluso cuando el período anterior está vacío", () => {
    expect(diferenciaPorcentual(12, 10)).toBe(20);
    expect(diferenciaPorcentual(3, 0)).toBe(100);
    expect(diferenciaPorcentual(0, 0)).toBe(0);
  });

  it("usa el mes calendario local y cruza correctamente el cambio de año", () => {
    const enero = new Date(2027, 0, 15, 12);
    expect(perteneceAlMes(registro("2027-01-02"), enero)).toBe(true);
    expect(perteneceAlMes(registro("2026-12-28"), enero, -1)).toBe(true);
  });

  it("calcula días completos sin producir valores negativos", () => {
    const hoy = new Date(2026, 8, 28, 12);
    expect(diasTranscurridos("2026-09-21", hoy)).toBe(7);
    expect(diasTranscurridos("2026-10-01", hoy)).toBe(0);
  });

  it("reconoce varios territorios sin romper registros anteriores", () => {
    expect(territoriosDeRegistro(registro("2026-09-10"))).toEqual([1]);
    expect(territoriosDeRegistro({ ...registro("2026-09-10"), territorioIds: [1, 2, 3] })).toEqual([1, 2, 3]);
  });
});
