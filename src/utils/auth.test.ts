import { describe, expect, it } from "vitest";
import { preferirRedireccionAuth } from "./auth";

describe("inicio de sesión", () => {
  it("usa redirección en una pantalla móvil aunque el navegador no lo declare", () => {
    expect(preferirRedireccionAuth(390, "Mozilla/5.0 Safari")).toBe(true);
  });

  it("usa redirección para un teléfono aunque esté en orientación horizontal", () => {
    expect(preferirRedireccionAuth(844, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
  });

  it("conserva la ventana emergente en escritorio", () => {
    expect(preferirRedireccionAuth(1440, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
