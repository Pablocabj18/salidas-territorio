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

export type EstadoCuadra = "Pendiente" | "En curso" | "Completada";

export interface EventoCuadra {
  estado: EstadoCuadra;
  fecha: string;
  registradoEn: string;
}

export interface ProgresoCuadra {
  id: string;
  territorioId: number;
  estado: EstadoCuadra;
  fecha: string;
  actualizadoPor?: string;
  actualizadoEn?: string;
  historial?: EventoCuadra[];
}

export type EstadoSolicitud = "Pendiente" | "Aprobada" | "Rechazada" | "Completada" | "Cancelada";
export type AlcanceSolicitud = "Territorio completo" | "Cuadras seleccionadas";

export interface SolicitudTerritorio {
  id: string;
  territorioId: number;
  cuadraIds: string[];
  alcance: AlcanceSolicitud;
  desde: string;
  hasta: string;
  modalidad: Modalidad;
  aliasPrivado: string;
  observacion: string;
  estado: EstadoSolicitud;
  solicitadoPorUid: string;
  creadoEn: string;
  resueltoEn?: string;
  resueltoPor?: string;
}

export interface ReservaTerritorial {
  id: string;
  solicitudId: string;
  territorioId: number;
  cuadraId: string;
  desde: string;
  hasta: string;
  estado: "Reservada";
}

export type ModoCobertura = "Mensual" | "Campaña" | "Manual";

export interface ConfiguracionOperacion {
  id: "operacion";
  modoCobertura: ModoCobertura;
  coberturaDesde: string;
  actualizadaEn?: string;
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
  progresoCuadras: ProgresoCuadra[];
  solicitudes: SolicitudTerritorio[];
  reservas: ReservaTerritorial[];
  configuracion: ConfiguracionOperacion[];
}
