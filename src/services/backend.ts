import type { Auth } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import firebaseConfig, { firebaseConfigurado } from "../config/firebase";
import type { Asignacion, Campana, ConfiguracionOperacion, DatosAplicacion, EstadoCuadra, EstadoDatos, ProgresoCuadra, RegistroSalida, ReservaTerritorial, SolicitudTerritorio, UsuarioSesion } from "../types/domain";
import {
  actualizarCampanaLocal,
  actualizarCuadraLocal,
  cerrarSolicitudLocal,
  crearSolicitudLocal,
  guardarAsignacionLocal,
  guardarCampanaLocal,
  guardarRegistroLocal,
  obtenerDatosLocales,
  guardarConfiguracionLocal,
  resolverSolicitudLocal,
} from "./registros";

type Observador = (datos: DatosAplicacion) => void;
type ObservadorEstado = (estado: EstadoDatos) => void;
type ObservadorUsuario = (usuario: UsuarioSesion | null) => void;

let db: Firestore | null = null;
let auth: Auth | null = null;
let usuarioActual: UsuarioSesion | null = null;
let authSdk: typeof import("firebase/auth") | null = null;
let firestoreSdk: typeof import("firebase/firestore") | null = null;

function estadoLocal(mensaje = "Datos de demostración guardados en este dispositivo"): EstadoDatos {
  return { modo: "local", conectado: true, configurado: false, mensaje };
}

export async function iniciarBackend(observar: Observador, observarEstado: ObservadorEstado, observarUsuario: ObservadorUsuario) {
  if (!firebaseConfigurado) {
    observar(obtenerDatosLocales());
    observarEstado(estadoLocal());
    observarUsuario(null);
    return () => undefined;
  }

  const [appModule, authModule, firestoreModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);
  authSdk = authModule;
  firestoreSdk = firestoreModule;
  const app = appModule.initializeApp(firebaseConfig);
  db = firestoreModule.initializeFirestore(app, {
    localCache: firestoreModule.persistentLocalCache({ tabManager: firestoreModule.persistentMultipleTabManager() }),
  });
  auth = authModule.getAuth(app);
  const datos: DatosAplicacion = { registros: [], asignaciones: [], campanas: [], progresoCuadras: [], solicitudes: [], reservas: [], configuracion: [] };
  const publicar = () => observar({
    registros: [...datos.registros],
    asignaciones: [...datos.asignaciones],
    campanas: [...datos.campanas],
    progresoCuadras: [...datos.progresoCuadras],
    solicitudes: [...datos.solicitudes],
    reservas: [...datos.reservas],
    configuracion: [...datos.configuracion],
  });
  const subs: Unsubscribe[] = [];
  let cancelarSolicitudes: Unsubscribe | null = null;

  const escuchar = <T>(nombre: keyof DatosAplicacion, coleccion: string) => {
    subs.push(firestoreModule.onSnapshot(firestoreModule.collection(db!, coleccion), { includeMetadataChanges: true }, (snapshot) => {
      (datos[nombre] as T[]) = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
      publicar();
      observarEstado({
        modo: "firebase",
        conectado: !snapshot.metadata.fromCache,
        configurado: true,
        mensaje: snapshot.metadata.fromCache ? "Mostrando la copia disponible sin conexión" : "Datos compartidos sincronizados",
      });
    }, (error) => {
      console.error(`Error al escuchar ${coleccion}`, error);
      observarEstado({ modo: "firebase", conectado: false, configurado: true, mensaje: "No se pudo sincronizar. Revisá el acceso o la conexión." });
    }));
  };

  escuchar<RegistroSalida>("registros", "registros");
  escuchar<Asignacion>("asignaciones", "asignaciones");
  escuchar<Campana>("campanas", "campanas");
  escuchar<ProgresoCuadra>("progresoCuadras", "progresoCuadras");
  escuchar<ReservaTerritorial>("reservas", "reservas");
  escuchar<ConfiguracionOperacion>("configuracion", "configuracion");

  subs.push(authModule.onAuthStateChanged(auth, async (user) => {
    if (!user) {
      usuarioActual = null;
      cancelarSolicitudes?.();
      cancelarSolicitudes = null;
      datos.solicitudes = [];
      publicar();
      observarUsuario(null);
      return;
    }
    const admin = await firestoreModule.getDoc(firestoreModule.doc(db!, "administradores", user.uid));
    usuarioActual = {
      uid: user.uid,
      nombre: user.displayName || "Usuario",
      email: user.email || "",
      foto: user.photoURL || undefined,
      rol: admin.exists() && admin.data().activo === true ? "administrador" : "visitante",
    };
    cancelarSolicitudes?.();
    const solicitudesBase = firestoreModule.collection(db!, "solicitudes");
    const solicitudesQuery = usuarioActual.rol === "administrador" ? solicitudesBase : firestoreModule.query(solicitudesBase, firestoreModule.where("solicitadoPorUid", "==", user.uid));
    cancelarSolicitudes = firestoreModule.onSnapshot(solicitudesQuery, (snapshot) => {
      datos.solicitudes = snapshot.docs.map((item) => ({ id:item.id, ...item.data() } as SolicitudTerritorio));
      publicar();
    });
    observarUsuario(usuarioActual);
  }));

  return () => {
    cancelarSolicitudes?.();
    subs.forEach((cancelar) => cancelar());
  };
}

function exigirAdmin() {
  if (!db || usuarioActual?.rol !== "administrador") {
    throw new Error("Solo un administrador autorizado puede modificar los datos compartidos.");
  }
  return db;
}

export async function iniciarSesion() {
  if (!auth || !authSdk) throw new Error("Firebase todavía no está configurado.");
  await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
}

export async function cerrarSesion() {
  if (auth && authSdk) await authSdk.signOut(auth);
}

export async function guardarRegistro(registro: Omit<RegistroSalida, "id">) {
  if (!firebaseConfigurado) return guardarRegistroLocal(registro);
  const firestore = exigirAdmin();
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  const id = crypto.randomUUID();
  const nuevo = { ...registro, id, demo: false, creadoPor: usuarioActual!.uid, creadoEn: new Date().toISOString() };
  await firestoreSdk.setDoc(firestoreSdk.doc(firestore, "registros", id), nuevo);
  return nuevo;
}

export async function guardarAsignacion(asignacion: Omit<Asignacion, "id">) {
  if (!firebaseConfigurado) return guardarAsignacionLocal(asignacion);
  const firestore = exigirAdmin();
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  const id = crypto.randomUUID();
  const nueva = { ...asignacion, id, demo: false, creadoPor: usuarioActual!.uid, creadoEn: new Date().toISOString() };
  await firestoreSdk.setDoc(firestoreSdk.doc(firestore, "asignaciones", id), nueva);
  return nueva;
}

export async function guardarCampana(campana: Omit<Campana, "id">) {
  if (!firebaseConfigurado) return guardarCampanaLocal(campana);
  const firestore = exigirAdmin();
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  const id = crypto.randomUUID();
  const nueva = { ...campana, id, demo: false, creadoPor: usuarioActual!.uid, creadoEn: new Date().toISOString() };
  await firestoreSdk.setDoc(firestoreSdk.doc(firestore, "campanas", id), nueva);
  return nueva;
}

export async function actualizarCampana(campana: Campana) {
  if (!firebaseConfigurado) return actualizarCampanaLocal(campana);
  const firestore = exigirAdmin();
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  await firestoreSdk.setDoc(firestoreSdk.doc(firestore, "campanas", campana.id), campana);
}

export async function actualizarCuadra(id: string, territorioId: number, estado: EstadoCuadra) {
  const progreso: ProgresoCuadra = {
    id,
    territorioId,
    estado,
    fecha: new Date().toISOString().slice(0, 10),
    actualizadoPor: usuarioActual?.uid,
    actualizadoEn: new Date().toISOString(),
  };
  if (!firebaseConfigurado) return actualizarCuadraLocal(progreso);
  if (!db || !usuarioActual) throw new Error("Iniciá sesión para actualizar una cuadra reservada.");
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  const referencia=firestoreSdk.doc(db,"progresoCuadras",id);
  await firestoreSdk.runTransaction(db,async(transaction)=>{
    const anterior=await transaction.get(referencia);
    const historial=[...((anterior.data()?.historial as ProgresoCuadra["historial"])??[]),{estado,fecha:progreso.fecha,registradoEn:progreso.actualizadoEn!}].slice(-12);
    transaction.set(referencia,{...progreso,historial});
  });
}

export async function crearSolicitud(solicitud: Omit<SolicitudTerritorio,"id"|"estado"|"solicitadoPorUid"|"creadoEn">) {
  const uid=firebaseConfigurado?usuarioActual?.uid:"local-demo";
  if(!uid)throw new Error("Iniciá sesión con Google para solicitar un territorio.");
  const completa:SolicitudTerritorio={...solicitud,id:crypto.randomUUID(),estado:"Pendiente",solicitadoPorUid:uid,creadoEn:new Date().toISOString()};
  if(!firebaseConfigurado){crearSolicitudLocal(completa);return completa;}
  if(!db||!firestoreSdk)throw new Error("La sincronización todavía no está lista.");
  await firestoreSdk.setDoc(firestoreSdk.doc(db,"solicitudes",completa.id),completa);
  return completa;
}

export async function resolverSolicitud(id:string,estado:"Aprobada"|"Rechazada") {
  if(!firebaseConfigurado)return resolverSolicitudLocal(id,estado);
  const firestore=exigirAdmin();
  if(!firestoreSdk)throw new Error("La sincronización todavía no está lista.");
  const solicitudRef=firestoreSdk.doc(firestore,"solicitudes",id);
  await firestoreSdk.runTransaction(firestore,async(transaction)=>{
    const solicitudSnap=await transaction.get(solicitudRef);
    if(!solicitudSnap.exists())throw new Error("Solicitud no encontrada.");
    const solicitud={id,...solicitudSnap.data()} as SolicitudTerritorio;
    const privadas=solicitud.cuadraIds.map((cuadraId)=>firestoreSdk!.doc(firestore,"reservasPrivadas",cuadraId));
    const existentes=estado==="Aprobada"?await Promise.all(privadas.map((ref)=>transaction.get(ref))):[];
    const hoy=new Date().toISOString().slice(0,10);
    if(existentes.some((item)=>item.exists()&&item.data().hasta>=hoy&&item.data().solicitudId!==id))throw new Error("Una o más cuadras ya están reservadas.");
    transaction.update(solicitudRef,{estado,resueltoEn:new Date().toISOString(),resueltoPor:usuarioActual!.uid});
    if(estado==="Aprobada")solicitud.cuadraIds.forEach((cuadraId)=>{
      const publica:ReservaTerritorial={id:cuadraId,solicitudId:id,territorioId:solicitud.territorioId,cuadraId,desde:solicitud.desde,hasta:solicitud.hasta,estado:"Reservada"};
      transaction.set(firestoreSdk!.doc(firestore,"reservas",cuadraId),publica);
      transaction.set(firestoreSdk!.doc(firestore,"reservasPrivadas",cuadraId),{...publica,solicitadoPorUid:solicitud.solicitadoPorUid});
    });
  });
}

export async function cerrarSolicitud(id:string,estado:"Completada"|"Cancelada") {
  if(!firebaseConfigurado)return cerrarSolicitudLocal(id,estado);
  if(!db||!firestoreSdk||!usuarioActual)throw new Error("Iniciá sesión para modificar la solicitud.");
  const solicitudRef=firestoreSdk.doc(db,"solicitudes",id);
  await firestoreSdk.runTransaction(db,async(transaction)=>{
    const solicitudSnap=await transaction.get(solicitudRef);
    if(!solicitudSnap.exists())throw new Error("Solicitud no encontrada.");
    const solicitud={id,...solicitudSnap.data()} as SolicitudTerritorio;
    if(usuarioActual!.rol!=="administrador"&&solicitud.solicitadoPorUid!==usuarioActual!.uid)throw new Error("No podés modificar esta solicitud.");
    const privadas=solicitud.cuadraIds.map((cuadraId)=>firestoreSdk!.doc(db!,"reservasPrivadas",cuadraId));
    const reservas=solicitud.estado==="Aprobada"?await Promise.all(privadas.map((referencia)=>transaction.get(referencia))):[];
    transaction.update(solicitudRef,{estado,resueltoEn:new Date().toISOString()});
    solicitud.cuadraIds.forEach((cuadraId,index)=>{
      if(reservas[index]?.exists()&&reservas[index].data().solicitudId===id){transaction.delete(firestoreSdk!.doc(db!,"reservas",cuadraId));transaction.delete(privadas[index]);}
    });
  });
}

export async function guardarConfiguracion(configuracion:ConfiguracionOperacion){
  if(!firebaseConfigurado)return guardarConfiguracionLocal(configuracion);
  const firestore=exigirAdmin();
  if(!firestoreSdk)throw new Error("La sincronización todavía no está lista.");
  await firestoreSdk.setDoc(firestoreSdk.doc(firestore,"configuracion","operacion"),configuracion);
}

export async function eliminarAsignacion(id: string) {
  if (!firebaseConfigurado) throw new Error("La eliminación local se habilita al conectar la administración compartida.");
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  await firestoreSdk.deleteDoc(firestoreSdk.doc(exigirAdmin(), "asignaciones", id));
}

export { firebaseConfigurado };
