import { describe, expect, it } from "vitest";
import { parsearTerritorios, rangoSemana } from "./programa";

describe("programa semanal", () => {
  it("usa una semana de domingo a sábado", () => {
    expect(rangoSemana(new Date("2026-09-28T12:00:00"))).toEqual({
      desde: "2026-09-27",
      hasta: "2026-10-03",
    });
  });

  it("interpreta varios territorios separados como en el programa", () => {
    expect(parsearTerritorios("82-83-84, 82")).toEqual([82, 83, 84]);
  });

  it("rechaza números que no sean territorios válidos", () => {
    expect(() => parsearTerritorios("12-97")).toThrow("entre 1 y 96");
  });
});
