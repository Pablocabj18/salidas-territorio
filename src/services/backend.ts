import type { Auth } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import firebaseConfig, { firebaseConfigurado } from "../config/firebase";
import type { Asignacion, Campana, DatosAplicacion, EstadoCuadra, EstadoDatos, ProgresoCuadra, RegistroSalida, UsuarioSesion } from "../types/domain";
import {
  actualizarCampanaLocal,
  actualizarCuadraLocal,
  guardarAsignacionLocal,
  guardarCampanaLocal,
  guardarRegistroLocal,
  obtenerDatosLocales,
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
  const datos: DatosAplicacion = { registros: [], asignaciones: [], campanas: [], progresoCuadras: [] };
  const publicar = () => observar({
    registros: [...datos.registros],
    asignaciones: [...datos.asignaciones],
    campanas: [...datos.campanas],
    progresoCuadras: [...datos.progresoCuadras],
  });
  const subs: Unsubscribe[] = [];

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

  subs.push(authModule.onAuthStateChanged(auth, async (user) => {
    if (!user) {
      usuarioActual = null;
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
    observarUsuario(usuarioActual);
  }));

  return () => subs.forEach((cancelar) => cancelar());
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
  const firestore = exigirAdmin();
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  if (estado === "Pendiente") {
    await firestoreSdk.deleteDoc(firestoreSdk.doc(firestore, "progresoCuadras", id));
  } else {
    await firestoreSdk.setDoc(firestoreSdk.doc(firestore, "progresoCuadras", id), progreso);
  }
}

export async function eliminarAsignacion(id: string) {
  if (!firebaseConfigurado) throw new Error("La eliminación local se habilita al conectar la administración compartida.");
  if (!firestoreSdk) throw new Error("La sincronización todavía no está lista.");
  await firestoreSdk.deleteDoc(firestoreSdk.doc(exigirAdmin(), "asignaciones", id));
}

export { firebaseConfigurado };
