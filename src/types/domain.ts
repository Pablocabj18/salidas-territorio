export type Categoria = "Rojo" | "Turquesa" | "Verde" | "Negro" | "Gris";

export interface TerritorioBase {
  id: number;
  x: number;
  y: number;
  categoria: Categoria;
}

export interface Territorio extends TerritorioBase {
  salidas: number;
  cobertura: number;
  contactos: number;
  ultimaSalida: string;
  tendencia: number[];
}

export type Modalidad = "Casa en casa" | "Revisitas" | "Exhibidores" | "Cartas" | "Telefonica" | "Informal";

export interface RegistroSalida {
  id: string;
  fecha: string;
  territorioId: number;
  hermanos: number;
  modalidad: Modalidad;
  cobertura: number;
  revisitas: number;
  cursos: number;
  observacion: string;
  demo?: boolean;
}
