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
  creadoPor?: string;
  creadoEn?: string;
}

export type RolUsuario = "visitante" | "administrador";

export interface UsuarioSesion {
  uid: string;
  nombre: string;
  email: string;
  foto?: string;
  rol: RolUsuario;
}

export interface Asignacion {
  id: string;
  territorioId: number;
  fecha: string;
  hora: string;
  grupo: string;
  puntoEncuentro: string;
  estado: "Programada" | "Completada" | "Cancelada";
  creadoPor?: string;
  creadoEn?: string;
  demo?: boolean;
}

export interface Campana {
  id: string;
  nombre: string;
  desde: string;
  hasta: string;
  territorioIds: number[];
  completados: number[];
  activa: boolean;
  creadoPor?: string;
  creadoEn?: string;
  demo?: boolean;
}

export interface EstadoDatos {
  modo: "local" | "firebase";
  conectado: boolean;
  configurado: boolean;
  mensaje: string;
}

export interface DatosAplicacion {
  registros: RegistroSalida[];
  asignaciones: Asignacion[];
  campanas: Campana[];
}
