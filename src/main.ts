import { GeolocateControl, LngLatBounds, Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { categorias, colorCategoria, territorios } from "./data/territorios";
import {
  actualizarCampana,
  actualizarCuadra,
  cerrarSolicitud,
  cerrarSesion,
  crearSolicitud,
  firebaseConfigurado,
  guardarAsignacion,
  guardarCampana,
  guardarConfiguracion,
  guardarRegistro,
  iniciarBackend,
  iniciarSesion,
  resolverSolicitud,
} from "./services/backend";
import { obtenerDatosLocales, restaurarDemo } from "./services/registros";
import { diasTranscurridos, diferenciaPorcentual, perteneceAlMes, promedio } from "./services/metricas";
import type { AlcanceSolicitud, Asignacion, Categoria, ConfiguracionOperacion, DatosAplicacion, EstadoCuadra, EstadoDatos, Modalidad, RegistroSalida, SolicitudTerritorio, Territorio, UsuarioSesion } from "./types/domain";
import { desplazarDias, fechaIsoLocal, parsearTerritorios, rangoSemana } from "./utils/programa";

const app = document.querySelector<HTMLDivElement>("#app")!;
setWorkerUrl(workerUrl);
const HOY = new Date();
const GEO_BOUNDS = {
  north: -31.3976478,
  south: -31.4418611,
  west: -62.1238658,
  east: -62.0938876,
};
type Panel = "mapa" | "estadisticas" | "planificacion" | "informe";
type Estado = "Al dia" | "Atencion" | "Atrasado" | "Sin datos";

const territorioEnUrl = Number(new URLSearchParams(location.search).get("t"));
let seleccionado = territorioEnUrl >= 1 && territorioEnUrl <= 96 ? territorioEnUrl : 36;
let categoriaActiva: Categoria | "Todas" = "Todas";
let busqueda = "";
let panelActivo: Panel = "mapa";
let mapa: Map | null = null;
let controlUbicacion: GeolocateControl | null = null;
let geometriasTerritorios: any = null;
let geometriasCuadras: any = null;
let cuadraSeleccionada: string | null = null;
let vistaMapa: { centro: [number, number]; zoom: number } = { centro: [-62.10888, -31.41975], zoom: 14 };
let mapaInicializado = false;
let datosAplicacion: DatosAplicacion = obtenerDatosLocales();
let estadoDatos: EstadoDatos = { modo: "local", conectado: true, configurado: firebaseConfigurado, mensaje: "Cargando datos" };
let usuario: UsuarioSesion | null = null;
let modoCampana = false;
let tarjetaMinimizada = window.innerWidth <= 760;
let semanaPrograma = rangoSemana(HOY).desde;

const fechaCorta = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });
const mesNombre = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });

function formatearRango(desde: string, hasta: string) {
  return `${fechaCorta.format(new Date(`${desde}T12:00:00`))} – ${fechaCorta.format(new Date(`${hasta}T12:00:00`))}`;
}

function capitalizar(texto: string) {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}

function nombreDiaPrograma(fecha: string) {
  return capitalizar(new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric" }).format(new Date(`${fecha}T12:00:00`)));
}

function rangoProgramaTexto(desde: string, hasta: string) {
  const formatear = (fecha: string) => {
    const valor = new Date(`${fecha}T12:00:00`);
    const mes = capitalizar(new Intl.DateTimeFormat("es-AR", { month: "long" }).format(valor));
    return `${valor.getDate()} de ${mes}`;
  };
  return `${formatear(desde)} al ${formatear(hasta)}`;
}

function tipoAsignacion(asignacion: Asignacion) {
  return asignacion.tipo ?? "Salida";
}

function territoriosAsignacion(asignacion: Asignacion) {
  if (asignacion.territorioIds?.length) return asignacion.territorioIds;
  return typeof asignacion.territorioId === "number" ? [asignacion.territorioId] : [];
}

function etiquetaTerritorioAsignacion(asignacion: Asignacion) {
  const tipo = tipoAsignacion(asignacion);
  if (tipo === "Telefonica") return "Telefónico";
  if (tipo === "Revisitas") return "Revisitas";
  if (tipo === "Reunion" || tipo === "Sin salida") return "—";
  return territoriosAsignacion(asignacion).join("-") || "A definir";
}

function asignacionesDeSemana() {
  const { desde, hasta } = rangoSemana(new Date(`${semanaPrograma}T12:00:00`));
  return datosAplicacion.asignaciones
    .filter((item) => item.estado === "Programada" && item.fecha >= desde && item.fecha <= hasta)
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

function escaparHtml(valor: unknown) {
  return String(valor ?? "").replace(/[&<>"]/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caracter]!);
}

const diasDesde = (fecha?: string) => diasTranscurridos(fecha, HOY);

function estadoTerritorio(registros: RegistroSalida[]): Estado {
  if (!registros.length) return "Sin datos";
  const ultima = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const dias = diasDesde(ultima.fecha);
  if (dias <= 21) return "Al dia";
  if (dias <= 35) return "Atencion";
  return "Atrasado";
}

function registrosDe(id: number) { return datosAplicacion.registros.filter((r) => r.territorioId === id); }
function enMes(registro: RegistroSalida, desplazamiento = 0) { return perteneceAlMes(registro, HOY, desplazamiento); }

function configuracionCobertura(): ConfiguracionOperacion {
  return datosAplicacion.configuracion.find((item) => item.id === "operacion") ?? {
    id: "operacion",
    modoCobertura: "Manual",
    coberturaDesde: "2000-01-01",
  };
}

function inicioCobertura() {
  const config = configuracionCobertura();
  if (config.modoCobertura === "Mensual") return new Date(HOY.getFullYear(), HOY.getMonth(), 1, 12).toISOString().slice(0, 10);
  if (config.modoCobertura === "Campaña") return datosAplicacion.campanas.find((item) => item.activa)?.desde ?? config.coberturaDesde;
  return config.coberturaDesde;
}

function reservaActiva(cuadraId: string) {
  const hoy = HOY.toISOString().slice(0, 10);
  return datosAplicacion.reservas.find((item) => item.cuadraId === cuadraId && item.hasta >= hoy);
}

function solicitudPropiaPara(cuadraId: string) {
  const hoy = HOY.toISOString().slice(0,10);
  if (estadoDatos.modo === "local") return datosAplicacion.solicitudes.find((item) => item.estado === "Aprobada" && item.hasta >= hoy && item.cuadraIds.includes(cuadraId));
  return datosAplicacion.solicitudes.find((item) => item.estado === "Aprobada" && item.hasta >= hoy && item.solicitadoPorUid === usuario?.uid && item.cuadraIds.includes(cuadraId));
}

function puedeEditarCuadra(cuadraId: string) {
  return estadoDatos.modo === "local" || usuario?.rol === "administrador" || Boolean(solicitudPropiaPara(cuadraId));
}

function metricasTerritorio(territorio: Territorio) {
  const registros = registrosDe(territorio.id);
  const actuales = registros.filter((r) => enMes(r));
  const anteriores = registros.filter((r) => enMes(r, -1));
  const ultima = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const cuadras = geometriasCuadras?.features?.filter((feature:any) => Number(feature.properties?.territorioId) === territorio.id) ?? [];
  const progresos = new globalThis.Map(datosAplicacion.progresoCuadras.map((item) => [item.id, item]));
  const desde = inicioCobertura();
  const cuadrasCompletadas = cuadras.filter((feature:any) => {
    const progreso = progresos.get(String(feature.properties?.id));
    return progreso?.estado === "Completada" && progreso.fecha >= desde;
  }).length;
  const cuadrasRevisar = cuadras.some((feature:any) => feature.properties?.needsReview === true);
  const coberturaCuadras = cuadras.length ? Math.round(cuadrasCompletadas / cuadras.length * 100) : null;
  return {
    registros, actuales, anteriores, ultima,
    estado: estadoTerritorio(registros),
    apoyo: promedio(actuales.map((r) => r.hermanos)),
    cobertura: coberturaCuadras ?? Math.min(100, actuales.reduce((total, r) => total + r.cobertura, 0)),
    coberturaFuente: coberturaCuadras === null ? "estimada" : "cuadras",
    cuadrasTotal: cuadras.length,
    cuadrasCompletadas,
    cuadrasRevisar,
    revisitas: actuales.reduce((total, r) => total + r.revisitas, 0),
    cursos: actuales.reduce((total, r) => total + r.cursos, 0),
  };
}

function datosGlobales() {
  const registros = datosAplicacion.registros;
  const actuales = registros.filter((r) => enMes(r));
  const anteriores = registros.filter((r) => enMes(r, -1));
  const territoriosMes = new Set(actuales.map((r) => r.territorioId)).size;
  return {
    registros, actuales, anteriores, territoriosMes,
    hermanos: actuales.reduce((t, r) => t + r.hermanos, 0),
    apoyo: promedio(actuales.map((r) => r.hermanos)),
    cobertura: Math.round(territoriosMes / 96 * 100),
    revisitas: actuales.reduce((t, r) => t + r.revisitas, 0),
    cursos: actuales.reduce((t, r) => t + r.cursos, 0),
  };
}

const diferencia = diferenciaPorcentual;

function render() {
  if (mapa) { mapa.remove(); mapa = null; }
  const global = datosGlobales();
  const actual = territorios.find((t) => t.id === seleccionado) ?? territorios[0];
  const metrica = metricasTerritorio(actual);
  const filtrados = territorios.filter((t) => (categoriaActiva === "Todas" || t.categoria === categoriaActiva) && (!busqueda || String(t.id).includes(busqueda)));
  const diferenciaSalidas = diferencia(global.actuales.length, global.anteriores.length);
  const nombreMesActual = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(HOY);
  const nombreMesAnterior = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1));
  const puedeEditar = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  const campanaActiva = datosAplicacion.campanas.find((campana) => campana.activa);

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span class="brand-mark">SF</span><span>Territorio</span></a>
      <nav class="main-nav" aria-label="Secciones">
        ${navButton("mapa", "Mapa")}${navButton("estadisticas", "Estadisticas")}${navButton("planificacion", "Planificacion")}${navButton("informe", "Informe")}
      </nav>
      <div class="header-actions">
        <button id="data-status" class="sync-pill ${estadoDatos.conectado ? "online" : "offline"}" title="${estadoDatos.mensaje}"><i></i>${estadoDatos.modo === "firebase" ? (estadoDatos.conectado ? "Sincronizado" : "Sin conexión") : "Demo local"}</button>
        ${firebaseConfigurado ? (usuario ? `<button id="auth-action" class="account-button" title="${escaparHtml(usuario.email)}">${usuario.foto ? `<img src="${escaparHtml(usuario.foto)}" alt="">` : "👤"}<span>${usuario.rol === "administrador" ? "Admin" : "Lectura"}</span></button>` : '<button id="auth-action" class="account-button logged-out" aria-label="Ingresar con Google"><b class="google-mark" aria-hidden="true">G</b><span>Ingresar</span></button>') : ""}
        <button id="new-record-top" class="header-primary" aria-label="Registrar salida" ${puedeEditar ? "" : "disabled"}>+ Registrar salida</button>
      </div>
    </header>
    <main class="dashboard ${panelActivo === "mapa" ? "map-mode" : ""} ${tarjetaMinimizada ? "selection-collapsed" : ""}">
      <aside class="sidebar">
        <div class="sidebar-heading"><div><span class="eyebrow">EXPLORAR</span><h1>Territorios</h1></div><span class="count">${filtrados.length}/96</span></div>
        <label class="search"><span>⌕</span><input id="search" value="${busqueda}" inputmode="numeric" placeholder="Buscar por numero" aria-label="Buscar territorio por numero"></label>
        <div class="filter-label">CATEGORIA DEL PLANO</div>
        <div class="category-list">
          <button class="category ${categoriaActiva === "Todas" ? "active" : ""}" data-category="Todas"><span class="all-dots">•••</span><span>Todas</span><b>96</b></button>
          ${categorias.map((c) => `<button class="category ${categoriaActiva === c ? "active" : ""}" data-category="${c}"><i style="background:${colorCategoria[c]}"></i><span>${c}</span><b>${territorios.filter((t) => t.categoria === c).length}</b></button>`).join("")}
        </div>
        <div class="filter-label">ESTADO DE ATENCION</div>
        <div class="status-legend"><span><i class="status-dot current"></i>Al dia</span><span><i class="status-dot warning"></i>Atencion</span><span><i class="status-dot late"></i>Atrasado</span></div>
        ${campanaActiva ? `<button id="campaign-map-toggle" class="campaign-toggle ${modoCampana ? "active" : ""}"><span>◎</span><div><strong>${modoCampana ? "Vista de campaña" : "Ver campaña"}</strong><small>${campanaActiva.completados.length}/${campanaActiva.territorioIds.length} territorios</small></div></button>` : ""}
        <div class="sidebar-note"><span>i</span><p>El color exterior indica la categoria original. El punto superior muestra cuanto tiempo paso desde la ultima salida.</p></div>
        <button id="reset" class="reset-button">Restablecer filtros</button>
      </aside>
      <section class="workspace">
        <div class="summary-row">
          <article><span>Territorios trabajados</span><strong>${global.territoriosMes}</strong><small>de 96 este mes</small></article>
          <article><span>Salidas en ${nombreMesActual}</span><strong>${global.actuales.length}</strong><small><em class="${diferenciaSalidas >= 0 ? "up" : "down"}">${diferenciaSalidas >= 0 ? "↑" : "↓"} ${Math.abs(diferenciaSalidas)}%</em> vs. ${nombreMesAnterior}</small></article>
          <article><span>Apoyo promedio</span><strong>${global.apoyo}</strong><small>hermanos por salida</small></article>
        </div>
        <div class="map-card">
          <div class="map-toolbar"><div><span class="eyebrow">MAPA DE TERRITORIOS</span><h2>San Francisco</h2><small>Calles reales · selecciona un sector</small></div><div class="map-tools"><button id="locate-me" class="round-map-action" aria-label="Mostrar mi ubicación" title="Mi ubicación">${icono("ubicacion")}</button><button id="fit-map" class="round-map-action" aria-label="Ver todos los territorios" title="Ver todos">${icono("encuadrar")}</button></div></div>
          <div id="territory-map" aria-label="Mapa interactivo de territorios y cuadras"></div>
          ${editorCuadra()}
          <div class="map-footer"><span><i class="pulse"></i> ${filtrados.length} territorios visibles</span><span>Cartografía © OpenStreetMap · límites: KML del 28/09/2026</span></div>
        </div>
      </section>
      <aside class="detail-panel">${panelActivo === "mapa" ? panelMapa(actual, metrica) : panelActivo === "estadisticas" ? panelTerritorio(actual, metrica) : panelActivo === "planificacion" ? panelPlanificacion() : panelInforme(global)}</aside>
    </main>
    ${modalRegistro()}${modalAsignacion()}${modalCampana()}${modalSolicitud()}${modalPrograma()}`;
  iniciarMapa(filtrados);
  bindEvents();
}

function icono(nombre: "mapa"|"estadisticas"|"planificacion"|"informe"|"ubicacion"|"encuadrar"|"compartir") {
  const paths = {
    mapa:'<path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"/><path d="M8 3v15M16 6v15"/>',
    estadisticas:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    planificacion:'<path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="m8 14 2 2 5-5"/>',
    informe:'<path d="M5 3h10l4 4v14H5V3Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
    ubicacion:'<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
    encuadrar:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    compartir:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[nombre]}</svg>`;
}
function navButton(panel: Panel, texto: string) { return `<button data-panel="${panel}" class="nav-button ${panelActivo === panel ? "active" : ""}">${icono(panel)}<span>${texto}</span></button>`; }

function panelMapa(territorio: Territorio, m: ReturnType<typeof metricasTerritorio>) {
  const estadoClase = m.estado === "Al dia" ? "current" : m.estado === "Atencion" ? "warning" : "late";
  const campana = datosAplicacion.campanas.find((item) => item.activa);
  const completado = campana?.completados.includes(territorio.id);
  const puedeEditar = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  const reservadas = datosAplicacion.reservas.filter((item) => item.territorioId === territorio.id && item.hasta >= HOY.toISOString().slice(0,10)).length;
  return `<div class="map-selection-card ${tarjetaMinimizada ? "collapsed" : ""}">
    <button id="toggle-selection-card" class="selection-toggle" aria-label="${tarjetaMinimizada ? "Expandir" : "Minimizar"} ficha">${tarjetaMinimizada ? "⌃" : "⌄"}</button>
    <div class="selection-color" style="--selection:${colorCategoria[territorio.categoria]}"></div>
    <div class="selection-main"><span class="eyebrow">SELECCION ACTUAL</span><h2>Territorio ${territorio.id}</h2><p><i class="status-dot ${estadoClase}"></i>${m.estado}${m.ultima ? ` · ultima salida hace ${diasDesde(m.ultima.fecha)} dias` : " · sin registros"}</p>${m.cuadrasTotal ? `<small class="block-summary">${m.cuadrasCompletadas}/${m.cuadrasTotal} cuadras completadas${reservadas ? ` · ${reservadas} reservadas` : ""}${m.cuadrasRevisar ? " · revisar división" : ""}</small><div class="block-legend"><span><i class="pending"></i>Pendiente</span><span><i class="progress"></i>En curso</span><span><i class="reserved"></i>Reservada</span><span><i class="complete"></i>Completa</span></div>` : ""}</div>
    <div class="selection-buttons"><button id="share-territory" class="share-action" aria-label="Compartir territorio">${icono("compartir")}</button>${modoCampana && campana ? `<button id="toggle-campaign-complete" class="campaign-complete ${completado ? "done" : ""}" ${puedeEditar ? "" : "disabled"}>${completado ? "✓ Completado" : "Marcar completo"}</button>` : ""}<button id="request-territory" class="request-action">Solicitar</button><button id="view-stats" class="selection-action">Estadísticas <span>→</span></button></div>
  </div>`;
}

function editorCuadra() {
  const feature = geometriasCuadras?.features?.find((item:any) => String(item.properties?.id) === cuadraSeleccionada);
  const progreso = datosAplicacion.progresoCuadras.find((item) => item.id === cuadraSeleccionada);
  const estado = progreso?.estado ?? "Pendiente";
  const reserva = cuadraSeleccionada ? reservaActiva(cuadraSeleccionada) : undefined;
  const puedeEditar = Boolean(cuadraSeleccionada && puedeEditarCuadra(cuadraSeleccionada));
  const historial = progreso?.historial?.slice(-3).reverse() ?? [];
  return `<aside id="block-editor" class="block-editor ${feature ? "" : "hidden"}" aria-live="polite">
    <button id="close-block-editor" class="block-close" aria-label="Cerrar cuadra">×</button>
    <div><span class="eyebrow">CUADRA SELECCIONADA</span><strong id="block-title">${feature ? `${feature.properties.id} · Territorio ${feature.properties.territorioId}` : "Seleccioná una cuadra"}</strong><small id="block-state">Estado: ${estado}${progreso?.fecha ? ` · ${fechaCorta.format(new Date(`${progreso.fecha}T12:00:00`))}` : ""}</small>${reserva ? `<small class="reservation-note">Reservada hasta ${fechaCorta.format(new Date(`${reserva.hasta}T12:00:00`))}</small>` : ""}</div>
    <div class="block-state-actions">
      ${(["Pendiente","En curso","Completada"] as EstadoCuadra[]).map((item)=>`<button data-block-state="${item}" class="${estado===item?"active":""}" ${puedeEditar?"":"disabled"}>${item === "Completada" ? "✓ " : ""}${item}</button>`).join("")}
    </div>
    ${historial.length ? `<div class="block-history"><span>Actividad reciente</span>${historial.map((item)=>`<small>${item.estado} · ${fechaCorta.format(new Date(`${item.fecha}T12:00:00`))}</small>`).join("")}</div>` : ""}
    ${!puedeEditar && estadoDatos.modo === "firebase" ? '<p class="block-locked">Solo quien tiene la reserva o un administrador puede cambiarla.</p>' : ""}
  </aside>`;
}

function enfocarTerritorio(id:number) {
  const territorio=territorios.find(item=>item.id===id);
  const feature=geometriasTerritorios?.features?.find((item:any)=>Number(item.properties?.id)===id);
  if(!territorio||!mapa||!feature) return;
  seleccionado=id;
  const metrica=metricasTerritorio(territorio);
  const estadoClase=metrica.estado==="Al dia"?"current":metrica.estado==="Atencion"?"warning":"late";
  const heading=document.querySelector<HTMLElement>(".selection-main h2");
  const status=document.querySelector<HTMLElement>(".selection-main p");
  const color=document.querySelector<HTMLElement>(".selection-color");
  const campaignButton=document.querySelector<HTMLButtonElement>("#toggle-campaign-complete");
  const blockSummary=document.querySelector<HTMLElement>(".block-summary");
  if(heading) heading.textContent=`Territorio ${id}`;
  if(status) status.innerHTML=`<i class="status-dot ${estadoClase}"></i>${metrica.estado}${metrica.ultima?` · ultima salida hace ${diasDesde(metrica.ultima.fecha)} dias`:" · sin registros"}`;
  color?.style.setProperty("--selection",colorCategoria[territorio.categoria]);
  if(campaignButton){const completa=datosAplicacion.campanas.find((item)=>item.activa)?.completados.includes(id);campaignButton.textContent=completa?"✓ Completado":"Marcar completo";campaignButton.classList.toggle("done",Boolean(completa));}
  if(blockSummary)blockSummary.textContent=`${metrica.cuadrasCompletadas}/${metrica.cuadrasTotal} cuadras completadas${metrica.cuadrasRevisar?" · revisar división":""}`;
  mapa.setPaintProperty("territorios-fill","fill-opacity",modoCampana?["case",["==",["get","id"],id],.52,.34]:["case",["==",["get","id"],id],.34,.12]);
  mapa.setPaintProperty("territorios-line","line-width",["case",["==",["get","id"],id],4,2]);
  mapa.setPaintProperty("territorios-line","line-opacity",["case",["==",["get","id"],id],1,.82]);
  mapa.setFilter("territorios-selected",["==",["get","id"],id]);
  ["cuadras-fill","cuadras-line","cuadras-labels"].forEach((layer)=>{if(mapa?.getLayer(layer))mapa.setFilter(layer,["==",["get","territorioId"],id]);});
  cuadraSeleccionada=null;
  document.querySelector("#block-editor")?.classList.add("hidden");
  const points=feature.geometry.coordinates[0] as number[][];
  const bounds=points.reduce((result,point)=>result.extend(point as [number,number]),new LngLatBounds(points[0] as [number,number],points[0] as [number,number]));
  const mobile=window.innerWidth<=760;
  mapa.fitBounds(bounds,{padding:mobile?{top:115,right:34,bottom:tarjetaMinimizada?150:270,left:34}:{top:125,right:90,bottom:130,left:285},maxZoom:17,duration:720,essential:true});
  const url=new URL(location.href);url.searchParams.set("t",String(id));history.replaceState({},"",url);
}

function panelTerritorio(territorio: Territorio, m: ReturnType<typeof metricasTerritorio>) {
  const estadoClase = m.estado === "Al dia" ? "current" : m.estado === "Atencion" ? "warning" : "late";
  const puedeEditar = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  return `<div class="detail-head"><div><span class="eyebrow">DETALLE ACTUAL</span><h2>Territorio ${territorio.id}</h2></div><span class="category-badge" style="--badge:${colorCategoria[territorio.categoria]}"><i></i>${territorio.categoria}</span></div>
    <div class="attention-card ${estadoClase}"><div><span>Estado de atencion</span><strong>${m.estado}</strong><small>${m.ultima ? `Ultima salida hace ${diasDesde(m.ultima.fecha)} dias` : "No hay registros"}</small></div><i class="attention-light"></i></div>
    <div class="coverage-card"><div class="coverage-copy"><span>Cobertura actual</span><strong>${m.cobertura}%</strong><small>${m.coberturaFuente === "cuadras" ? `${m.cuadrasCompletadas} de ${m.cuadrasTotal} cuadras completas${m.cuadrasRevisar ? " · división a revisar" : ""}` : "Estimación de las salidas del mes"}</small></div><div class="ring" style="--value:${m.cobertura * 3.6}deg;--ring:${colorCategoria[territorio.categoria]}"><span>${m.cobertura}</span></div></div>
    <div class="detail-metrics"><article><span>Salidas</span><strong>${m.actuales.length}</strong><small>${m.anteriores.length} el mes anterior</small></article><article><span>Apoyo promedio</span><strong>${m.apoyo}</strong><small>hermanos por salida</small></article><article><span>Revisitas</span><strong>${m.revisitas}</strong><small>registradas</small></article><article><span>Cursos</span><strong>${m.cursos}</strong><small>informados</small></article></div>
    <div class="recent-list"><div class="section-title"><span>Salidas recientes</span><button id="new-record-inline" ${puedeEditar ? "" : "disabled"}>+ Agregar</button></div>${m.registros.sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,4).map((r)=>`<div class="record-row"><time>${fechaCorta.format(new Date(`${r.fecha}T12:00:00`))}</time><div><strong>${r.modalidad}</strong><small>${r.hermanos} hermanos · ${r.cobertura}% cobertura</small></div>${r.demo ? '<span class="demo-tag">DEMO</span>' : '<span class="real-tag">REAL</span>'}</div>`).join("") || '<p class="empty">Todavia no hay salidas registradas.</p>'}</div>
    <button class="primary-action" id="new-record-detail" ${puedeEditar ? "" : "disabled"}>Registrar una salida <span>→</span></button>
    <p class="data-warning">Se guardan cantidades agregadas, no nombres de publicadores.</p>`;
}

function panelPlanificacion() {
  const prioridades = territorios.map((t) => ({ t, m: metricasTerritorio(t) })).sort((a,b) => diasDesde(b.m.ultima?.fecha) - diasDesde(a.m.ultima?.fecha)).slice(0,6);
  const bajoApoyo = territorios.map((t)=>({t,m:metricasTerritorio(t)})).filter(({m})=>m.actuales.length && m.apoyo < 4).sort((a,b)=>a.m.apoyo-b.m.apoyo).slice(0,3);
  const proximas = [...datosAplicacion.asignaciones].filter((item) => item.estado === "Programada" && item.fecha >= HOY.toISOString().slice(0,10)).sort((a,b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)).slice(0,4);
  const campana = datosAplicacion.campanas.find((item) => item.activa);
  const porcentajeCampana = campana ? Math.round(campana.completados.length / Math.max(1, campana.territorioIds.length) * 100) : 0;
  const puedeEditar = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  const puedeSolicitar = estadoDatos.modo === "local" || firebaseConfigurado;
  const solicitudes = [...datosAplicacion.solicitudes].sort((a,b)=>b.creadoEn.localeCompare(a.creadoEn)).slice(0,8);
  return `<div class="detail-head"><div><span class="eyebrow">ORGANIZACIÓN</span><h2>Planificación</h2></div><button id="open-program" class="print-button">Ver programa</button></div>
    ${firebaseConfigurado && !usuario ? '<button class="login-callout" data-login><b class="google-mark" aria-hidden="true">G</b><span><strong>Ingresar con Google</strong><small>Solicitá territorios y seguí tus pedidos</small></span><i>→</i></button>' : ""}
    ${campana ? `<div class="campaign-card"><div class="campaign-heading"><span>CAMPAÑA ACTIVA</span><b>${escaparHtml(campana.nombre)}</b></div><strong>${campana.completados.length}<small>/${campana.territorioIds.length}</small></strong><div class="report-progress"><i style="width:${porcentajeCampana}%"></i></div><p>${porcentajeCampana}% completado · ${formatearRango(campana.desde, campana.hasta)}</p></div>` : '<div class="empty-campaign"><strong>Sin campaña activa</strong><p>Podés crear una para seguir el avance territorial.</p></div>'}
    <div class="section-title"><span>Próximas salidas</span><button id="new-assignment" ${puedeEditar ? "" : "disabled"}>+ Nueva salida</button></div>
    <div class="assignment-list">${proximas.map(tarjetaAsignacion).join("") || '<p class="empty">No hay asignaciones próximas.</p>'}</div>
    <div class="section-title"><span>Solicitudes personales</span><button id="request-from-planning" ${puedeSolicitar ? "" : "disabled"}>+ Solicitar T${seleccionado}</button></div>
    <div class="request-list">${solicitudes.map(tarjetaSolicitud).join("") || `<p class="empty">${firebaseConfigurado && !usuario ? "Ingresá para solicitar y ver tus pedidos." : "Todavía no hay solicitudes."}</p>`}</div>
    <div class="planner-intro"><strong>Prioridades sugeridas</strong><p>Se ordenan por días desde la última salida y luego sirven de base al programa. Son ayudas organizativas, no evaluaciones personales.</p></div>
    <div class="priority-list">${prioridades.map(({t,m},i)=>`<button data-select="${t.id}" class="priority-item"><span class="priority-number">${i+1}</span><div><strong>Territorio ${t.id}</strong><small>${m.ultima ? `${diasDesde(m.ultima.fecha)} días sin salida` : "Sin registros"}</small></div><span class="priority-arrow">→</span></button>`).join("")}</div>
    <div class="insight-card"><span class="insight-icon">↗</span><div><strong>Territorios con apoyo bajo</strong><p>${bajoApoyo.length ? bajoApoyo.map(({t})=>t.id).join(", ") : "No se detectaron casos este mes"}</p></div></div>
    <div class="planner-actions"><button id="new-campaign" ${puedeEditar ? "" : "disabled"}>${campana ? "Nueva campaña" : "Crear campaña"}</button><button id="open-report">Ver informe</button></div>`;
}

function tarjetaAsignacion(asignacion: Asignacion) {
  const territorioPrincipal = territoriosAsignacion(asignacion)[0];
  const contenido = `<time>${fechaCorta.format(new Date(`${asignacion.fecha}T12:00:00`))}<b>${escaparHtml(asignacion.hora)}</b></time><div><strong>${escaparHtml(etiquetaTerritorioAsignacion(asignacion))} · ${escaparHtml(asignacion.encargado || asignacion.grupo || "Sin encargado")}</strong><small>${escaparHtml(asignacion.puntoEncuentro || "Punto a confirmar")}${asignacion.grupo ? ` · ${escaparHtml(asignacion.grupo)}` : ""}</small></div>${asignacion.demo ? '<span class="demo-tag">DEMO</span>' : ""}`;
  return territorioPrincipal
    ? `<button data-select="${territorioPrincipal}" class="assignment-item">${contenido}</button>`
    : `<article class="assignment-item static">${contenido}</article>`;
}

function tarjetaSolicitud(solicitud: SolicitudTerritorio) {
  const admin = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  const propia = estadoDatos.modo === "local" || solicitud.solicitadoPorUid === usuario?.uid;
  const privada = admin || propia;
  return `<article class="request-card">
    <div class="request-card-head"><div><strong>Territorio ${solicitud.territorioId}</strong><small>${solicitud.alcance} · ${solicitud.cuadraIds.length} cuadras</small></div><span class="request-status ${solicitud.estado.toLowerCase()}">${solicitud.estado}</span></div>
    <p>${formatearRango(solicitud.desde, solicitud.hasta)} · ${solicitud.modalidad}${privada && solicitud.aliasPrivado ? ` · ${escaparHtml(solicitud.aliasPrivado)}` : ""}</p>
    ${privada && solicitud.observacion ? `<small class="request-note">${escaparHtml(solicitud.observacion)}</small>` : ""}
    ${admin && solicitud.estado === "Pendiente" ? `<div class="request-actions"><button data-request-reject="${solicitud.id}">Rechazar</button><button data-request-approve="${solicitud.id}">Aprobar</button></div>` : ""}
    ${(admin || propia) && solicitud.estado === "Aprobada" ? `<div class="request-actions"><button data-request-close="Cancelada" data-request-id="${solicitud.id}">Cancelar</button><button data-request-close="Completada" data-request-id="${solicitud.id}">Finalizar</button></div>` : ""}
    ${propia && solicitud.estado === "Pendiente" && !admin ? `<div class="request-actions"><button data-request-close="Cancelada" data-request-id="${solicitud.id}">Cancelar solicitud</button></div>` : ""}
  </article>`;
}

function panelInforme(g: ReturnType<typeof datosGlobales>) {
  const salidasAnt = g.anteriores.length;
  const apoyoAnt = promedio(g.anteriores.map(r=>r.hermanos));
  const nombreAnterior = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(HOY.getFullYear(), HOY.getMonth()-1, 1));
  const config = configuracionCobertura();
  const puedeConfigurar = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  return `<div class="detail-head"><div><span class="eyebrow">RESUMEN CONGREGACIONAL</span><h2>${mesNombre.format(HOY)}</h2></div><button id="print-report" class="print-button">Imprimir</button></div>
    <div class="report-hero"><span>Cobertura territorial</span><strong>${g.territoriosMes}<small>/96</small></strong><div class="report-progress"><i style="width:${g.cobertura}%"></i></div><p>${g.cobertura}% de los territorios tuvo al menos una salida este mes.</p></div>
    <div class="report-grid"><article><span>Salidas</span><strong>${g.actuales.length}</strong><small>${diferencia(g.actuales.length,salidasAnt)}% vs. ${nombreAnterior}</small></article><article><span>Participaciones</span><strong>${g.hermanos}</strong><small>suma de asistentes por salida</small></article><article><span>Apoyo promedio</span><strong>${g.apoyo}</strong><small>${diferencia(g.apoyo,apoyoAnt)}% vs. ${nombreAnterior}</small></article><article><span>Revisitas</span><strong>${g.revisitas}</strong><small>${g.cursos} cursos</small></article></div>
    <div class="report-section"><strong>Atencion territorial</strong>${(["Al dia","Atencion","Atrasado"] as Estado[]).map(e=>{const n=territorios.filter(t=>estadoTerritorio(registrosDe(t.id))===e).length;return `<div class="report-line"><span><i class="status-dot ${e==="Al dia"?"current":e==="Atencion"?"warning":"late"}"></i>${e}</span><b>${n}</b></div>`}).join("")}</div>
    <div class="coverage-settings"><div><strong>Período de cuadras</strong><p>Las cuadras completadas se cuentan desde ${fechaCorta.format(new Date(`${inicioCobertura()}T12:00:00`))}.</p></div><select id="coverage-mode" ${puedeConfigurar ? "" : "disabled"}>${(["Mensual","Campaña","Manual"] as const).map((modo)=>`<option ${config.modoCobertura===modo?"selected":""}>${modo}</option>`).join("")}</select><button id="reset-coverage" ${puedeConfigurar ? "" : "disabled"}>Reiniciar hoy</button></div>
    <div class="privacy-box"><strong>Criterio de las métricas</strong><p>Salidas y apoyo: mes calendario. Cobertura por cuadras: período configurable. No se publican nombres; las notas personales de solicitudes son privadas.</p></div>
    ${estadoDatos.modo === "local" ? '<button id="restore-demo" class="reset-button danger">Restaurar datos demostrativos</button>' : ""}`;
}

function cuadrasConEstado() {
  if (!geometriasCuadras) return null;
  const progresos = new globalThis.Map(datosAplicacion.progresoCuadras.map((item) => [item.id, item]));
  return {
    ...geometriasCuadras,
    features: geometriasCuadras.features.map((feature:any) => {
      const progreso = progresos.get(String(feature.properties?.id));
      const reserva = reservaActiva(String(feature.properties?.id));
      return { ...feature, properties: { ...feature.properties, estado: progreso?.estado ?? "Pendiente", fechaEstado: progreso?.fecha ?? "", reservada: Boolean(reserva), reservaHasta: reserva?.hasta ?? "" } };
    }),
  };
}

function mostrarEditorCuadra(id: string) {
  cuadraSeleccionada = id;
  const actual = document.querySelector<HTMLElement>("#block-editor");
  if (actual) actual.outerHTML = editorCuadra();
  bindBlockEditor();
}

function bindBlockEditor() {
  document.querySelector("#close-block-editor")?.addEventListener("click",()=>{cuadraSeleccionada=null;document.querySelector("#block-editor")?.classList.add("hidden");});
  document.querySelectorAll<HTMLButtonElement>("[data-block-state]").forEach((boton)=>boton.addEventListener("click",async()=>{
    const id=cuadraSeleccionada;
    const feature=geometriasCuadras?.features?.find((item:any)=>String(item.properties?.id)===id);
    if(!id||!feature)return;
    try{
      await actualizarCuadra(id,Number(feature.properties.territorioId),boton.dataset.blockState as EstadoCuadra);
      refrescarDatosLocales();
      const source=mapa?.getSource("cuadras") as any;
      source?.setData(cuadrasConEstado());
      mostrarEditorCuadra(id);
      const resumen=document.querySelector<HTMLElement>(".block-summary");
      const territorio=territorios.find((item)=>item.id===Number(feature.properties.territorioId));
      if(resumen&&territorio){const metrica=metricasTerritorio(territorio);const reservadas=datosAplicacion.reservas.filter((item)=>item.territorioId===territorio.id&&item.hasta>=HOY.toISOString().slice(0,10)).length;resumen.textContent=`${metrica.cuadrasCompletadas}/${metrica.cuadrasTotal} cuadras completadas${reservadas?` · ${reservadas} reservadas`:""}${metrica.cuadrasRevisar?" · revisar división":""}`;}
    }catch(error){mostrarError(error);}
  }));
}

function iniciarMapa(visibles: Territorio[]) {
  const limites = new LngLatBounds([GEO_BOUNDS.west,GEO_BOUNDS.south],[GEO_BOUNDS.east,GEO_BOUNDS.north]);
  mapa = new Map({
    container:"territory-map",
    style:"https://tiles.openfreemap.org/styles/positron",
    center:vistaMapa.centro,
    zoom:vistaMapa.zoom,
    minZoom:11,
    maxZoom:20,
    maxBounds:[[GEO_BOUNDS.west-.025,GEO_BOUNDS.south-.02],[GEO_BOUNDS.east+.025,GEO_BOUNDS.north+.02]],
    attributionControl:{compact:true},
    dragPan:true,
    scrollZoom:true,
    touchZoomRotate:true,
    doubleClickZoom:true,
    cooperativeGestures:false,
  });
  mapa.addControl(new NavigationControl({showCompass:false}),"bottom-right");
  controlUbicacion = new GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:true,showUserLocation:true,showAccuracyCircle:true});
  mapa.addControl(controlUbicacion,"bottom-right");
  const idsVisibles = new Set(visibles.map(t=>t.id));
  mapa.on("load",async()=>{
    if (!mapa) return;
    try {
      const response=await fetch(`${import.meta.env.BASE_URL}territorios.geojson`);
      if(!response.ok) throw new Error("GeoJSON no disponible");
      const original=await response.json();
      geometriasTerritorios=original;
      const campana=datosAplicacion.campanas.find((item)=>item.activa);
      const features=original.features.filter((feature:any)=>idsVisibles.has(Number(feature.properties?.id))).map((feature:any)=>{
        const id=Number(feature.properties.id);
        const territorio=territorios.find(item=>item.id===id)!;
        const metrica=metricasTerritorio(territorio);
        const statusColor=metrica.estado==="Al dia"?"#48a365":metrica.estado==="Atencion"?"#dfa72f":"#bd4037";
        const campanaEstado=!campana||!campana.territorioIds.includes(id)?"fuera":campana.completados.includes(id)?"completo":"pendiente";
        return {...feature,properties:{...feature.properties,id,color:colorCategoria[territorio.categoria],statusColor,campanaEstado}};
      });
      const centros={type:"FeatureCollection",features:features.map((feature:any)=>{
        const points=feature.geometry.coordinates[0];
        const xs=points.map((point:number[])=>point[0]);
        const ys=points.map((point:number[])=>point[1]);
        const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
        return {type:"Feature",properties:feature.properties,geometry:{type:"Point",coordinates:center}};
      })};
      mapa.addSource("territorios",{type:"geojson",data:{type:"FeatureCollection",features}});
      mapa.addSource("centros",{type:"geojson",data:centros as any});
      mapa.addLayer({id:"territorios-fill",type:"fill",source:"territorios",paint:{
        "fill-color":modoCampana?["match",["get","campanaEstado"],"completo","#35a768","pendiente","#f0a52b","#a7aaa4"]:["get","color"],
        "fill-opacity":modoCampana?["case",["==",["get","id"],seleccionado],.52,.34]:["case",["==",["get","id"],seleccionado],.34,.12],
      }});
      mapa.addLayer({id:"territorios-line",type:"line",source:"territorios",paint:{
        "line-color":["get","color"],
        "line-width":["case",["==",["get","id"],seleccionado],4,2],
        "line-opacity":["case",["==",["get","id"],seleccionado],1,.82],
      }});
      mapa.addLayer({id:"territorios-selected",type:"line",source:"territorios",filter:["==",["get","id"],seleccionado],paint:{
        "line-color":"#147cff","line-width":7,"line-opacity":.42,"line-blur":2,
      }});
      mapa.addLayer({id:"territorios-labels",type:"symbol",source:"centros",layout:{
        "text-field":["to-string",["get","id"]],"text-font":["Noto Sans Bold"],"text-size":["interpolate",["linear"],["zoom"],12,11,16,14,19,17],"text-allow-overlap":true,
      },paint:{"text-color":"#141615","text-halo-color":"rgba(255,255,255,.96)","text-halo-width":2.2}});
      mapa.addLayer({id:"territorios-status",type:"circle",source:"centros",paint:{
        "circle-radius":["interpolate",["linear"],["zoom"],12,2.5,17,4],"circle-color":["get","statusColor"],"circle-stroke-color":"#fff","circle-stroke-width":1.5,"circle-translate":[10,-10],
      }});
      const blocksData=cuadrasConEstado();
      if(blocksData){
        mapa.addSource("cuadras",{type:"geojson",data:blocksData as any});
        const blockFilter=["==",["get","territorioId"],seleccionado] as any;
        mapa.addLayer({id:"cuadras-fill",type:"fill",source:"cuadras",minzoom:14.6,filter:blockFilter,paint:{
          "fill-color":["case",["get","reservada"],"#7566d5",["match",["get","estado"],"Completada","#35a768","En curso","#f0a52b","#ffffff"]],
          "fill-opacity":["case",["get","reservada"],.48,["match",["get","estado"],"Completada",.5,"En curso",.5,.25]],
        }});
        mapa.addLayer({id:"cuadras-line",type:"line",source:"cuadras",minzoom:14.2,filter:blockFilter,paint:{
          "line-color":["case",["get","reservada"],"#4f3eb6",["match",["get","estado"],"Completada","#247a49","En curso","#a86c0b","#52605a"]],"line-width":2,"line-dasharray":[2,1],"line-opacity":.9,
        }});
        mapa.addLayer({id:"cuadras-labels",type:"symbol",source:"cuadras",minzoom:15.2,filter:blockFilter,layout:{
          "text-field":["concat","C",["to-string",["get","numero"]]],"text-font":["Noto Sans Bold"],"text-size":11,"text-allow-overlap":false,
        },paint:{"text-color":"#25302a","text-halo-color":"rgba(255,255,255,.95)","text-halo-width":2}});
        mapa.on("click","cuadras-fill",(event:any)=>{const id=String(event.features?.[0]?.properties?.id||"");if(id)mostrarEditorCuadra(id);});
        mapa.on("mouseenter","cuadras-fill",()=>{if(mapa)mapa.getCanvas().style.cursor="pointer";});
        mapa.on("mouseleave","cuadras-fill",()=>{if(mapa)mapa.getCanvas().style.cursor="";});
        if(cuadraSeleccionada)setTimeout(()=>mostrarEditorCuadra(cuadraSeleccionada!),0);
      }
      const seleccionar=(event:any)=>{if(mapa?.getLayer("cuadras-fill")&&mapa.queryRenderedFeatures(event.point,{layers:["cuadras-fill"]}).length)return;const id=Number(event.features?.[0]?.properties?.id);if(id)enfocarTerritorio(id);};
      mapa.on("click","territorios-fill",seleccionar);
      mapa.on("mouseenter","territorios-fill",()=>{if(mapa)mapa.getCanvas().style.cursor="pointer";});
      mapa.on("mouseleave","territorios-fill",()=>{if(mapa)mapa.getCanvas().style.cursor="";});
    } catch(error) {
      console.error("No se pudieron cargar los territorios",error);
    }
    if (!mapaInicializado&&mapa) {
      const mobile=window.innerWidth<=760;
      const padding=panelActivo==="mapa"
        ? (mobile?{top:90,right:35,bottom:210,left:35}:{top:85,right:75,bottom:115,left:285})
        : 30;
      mapa.fitBounds(limites,{padding,duration:0});
      mapa.setZoom(mapa.getZoom()-.7);
      mapaInicializado=true;
      if(territorioEnUrl>=1&&territorioEnUrl<=96) setTimeout(()=>enfocarTerritorio(territorioEnUrl),180);
    }
  });
  mapa.on("moveend",()=>{ if(mapa){const center=mapa.getCenter();vistaMapa={centro:[center.lng,center.lat],zoom:mapa.getZoom()};} });
}

function modalRegistro() {
  const fechaHoy = HOY.toISOString().slice(0,10);
  const opciones = territorios.map(t=>`<option value="${t.id}" ${t.id===seleccionado?"selected":""}>Territorio ${t.id}</option>`).join("");
  const modalidades: Modalidad[]=["Casa en casa","Revisitas","Exhibidores","Cartas","Telefonica","Informal"];
  return `<dialog id="record-dialog"><form id="record-form" method="dialog"><div class="modal-head"><div><span class="eyebrow">NUEVO REGISTRO</span><h2>Registrar salida</h2></div><button type="button" id="close-dialog" aria-label="Cerrar">×</button></div><p class="modal-copy">Registra cantidades generales. No incluyas nombres ni informacion personal.</p><div class="form-grid"><label>Fecha<input required name="fecha" type="date" value="${fechaHoy}"></label><label>Territorio<select name="territorioId">${opciones}</select></label><label>Hermanos que participaron<input required name="hermanos" type="number" min="1" max="99" value="4"></label><label>Modalidad<select name="modalidad">${modalidades.map(m=>`<option>${m}</option>`).join("")}</select></label><label>Cobertura aproximada si no marcás cuadras (%)<input required name="cobertura" type="number" min="0" max="100" value="50"></label><label>Revisitas realizadas<input required name="revisitas" type="number" min="0" value="0"></label><label>Cursos bíblicos<input required name="cursos" type="number" min="0" value="0"></label><label class="full">Observacion general<textarea name="observacion" maxlength="180" placeholder="Ej.: se completo el sector norte"></textarea></label></div><div class="modal-actions"><button type="button" id="cancel-dialog">Cancelar</button><button type="submit">Guardar salida</button></div></form></dialog>`;
}

function modalAsignacion() {
  const manana = new Date(HOY); manana.setDate(manana.getDate() + 1);
  return `<dialog id="assignment-dialog"><form id="assignment-form" method="dialog"><div class="modal-head"><div><span class="eyebrow">PROGRAMA SEMANAL</span><h2>Nueva salida</h2></div><button type="button" data-close="assignment-dialog" aria-label="Cerrar">×</button></div><p class="modal-copy">Completá los mismos datos del programa. La web es compartida: en “Encargado” usá un nombre corto o solo el rol si no cuentan con permiso para publicar el nombre completo.</p><div class="form-grid">
    <label class="full">Tipo de actividad<select required name="tipo" id="assignment-type"><option value="Salida">Salida al ministerio</option><option value="Telefonica">Predicación telefónica</option><option value="Revisitas">Revisitas</option><option value="Reunion">Reunión</option><option value="Sin salida">No hay salida</option></select></label>
    <label>Fecha<input required name="fecha" type="date" value="${fechaIsoLocal(manana)}"></label><label>Hora<input required name="hora" type="time" value="09:30"></label>
    <label class="full">Lugar de encuentro<input required name="puntoEncuentro" maxlength="100" placeholder="Ej.: Flia. Quiroga (Gral. Savio 549)"></label>
    <label id="assignment-territories-field">Territorios<input required name="territorios" inputmode="numeric" maxlength="35" value="${seleccionado}" placeholder="Ej.: 21-31 o 82-83-84"><small>Separalos con guiones o comas.</small></label>
    <label>Encargado<input name="encargado" maxlength="55" placeholder="Nombre corto o rol"></label>
    <label class="full">Grupos<input name="grupo" maxlength="55" placeholder="Ej.: Grupo 1, Grupo 2 o -"></label>
  </div><div class="modal-actions"><button type="button" data-close="assignment-dialog">Cancelar</button><button type="submit">Agregar al programa</button></div></form></dialog>`;
}

function modalPrograma() {
  const { desde, hasta } = rangoSemana(new Date(`${semanaPrograma}T12:00:00`));
  const asignaciones = asignacionesDeSemana();
  const porFecha = new globalThis.Map<string, Asignacion[]>();
  asignaciones.forEach((item) => porFecha.set(item.fecha, [...(porFecha.get(item.fecha) ?? []), item]));
  const inicio = new Date(`${desde}T12:00:00`);
  const filas = Array.from({ length: 7 }, (_, indice) => fechaIsoLocal(desplazarDias(inicio, indice))).map((fecha, indiceDia) => {
    const delDia = porFecha.get(fecha) ?? [];
    const tono = indiceDia % 2 === 0 ? "light" : "strong";
    if (!delDia.length) return `<tr class="program-empty-row day-${tono}"><td class="program-day">${nombreDiaPrograma(fecha)}</td><td class="program-time"></td><td></td><td></td><td></td><td></td></tr>`;
    return delDia.map((item, indiceSalida) => {
      const tipo = tipoAsignacion(item);
      const dia = indiceSalida === 0 ? nombreDiaPrograma(fecha) : "";
      const inicioFila = `<td class="program-day">${dia}</td><td class="program-time">${escaparHtml(item.hora)}</td>`;
      if (tipo === "Sin salida" || tipo === "Reunion") {
        const texto = item.puntoEncuentro || (tipo === "Sin salida" ? "No hay salida" : "Reunión");
        return `<tr class="day-${tono} program-special-row">${inicioFila}<td colspan="4" class="program-special">${escaparHtml(texto)}</td></tr>`;
      }
      return `<tr class="day-${tono}">${inicioFila}<td>${escaparHtml(item.puntoEncuentro || "A confirmar")}</td><td>${escaparHtml(etiquetaTerritorioAsignacion(item))}</td><td>${escaparHtml(item.encargado || "")}</td><td>${escaparHtml(item.grupo || "")}</td></tr>`;
    }).join("");
  }).join("");
  const puedeEditar = estadoDatos.modo === "local" || usuario?.rol === "administrador";
  return `<dialog id="program-dialog" class="program-dialog"><div class="program-shell">
    <div class="program-toolbar"><div class="program-week-nav"><button id="program-prev" aria-label="Semana anterior">←</button><span>Cambiar semana</span><button id="program-next" aria-label="Semana siguiente">→</button></div><div class="program-toolbar-actions">${puedeEditar ? '<button id="program-new-assignment">+ Nueva salida</button>' : ""}<button id="share-program">Compartir</button><button id="print-program" class="primary">Imprimir / PDF</button><button type="button" class="program-close" data-close="program-dialog" aria-label="Cerrar">×</button></div></div>
    <p class="program-mobile-hint">Deslizá la tabla hacia los costados para verla completa.</p>
    <div class="program-scroll"><table class="program-table"><thead><tr class="program-title-row"><th colspan="6"><strong>Salidas al ministerio</strong><span>${rangoProgramaTexto(desde, hasta)}</span></th></tr><tr class="program-column-row"><th>Día</th><th>Hora</th><th>Lugar de encuentro</th><th>Territorio</th><th>Encargado</th><th>Grupos</th></tr></thead><tbody>${filas}</tbody></table></div>
  </div></dialog>`;
}

function modalCampana() {
  const primero = new Date(HOY.getFullYear(), HOY.getMonth(), 1, 12).toISOString().slice(0,10);
  const ultimo = new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0, 12).toISOString().slice(0,10);
  return `<dialog id="campaign-dialog"><form id="campaign-form" method="dialog"><div class="modal-head"><div><span class="eyebrow">COBERTURA ESPECIAL</span><h2>Nueva campaña</h2></div><button type="button" data-close="campaign-dialog" aria-label="Cerrar">×</button></div><p class="modal-copy">La campaña incluirá los 96 territorios. Después podrás marcar cada territorio como completado desde el mapa.</p><div class="form-grid"><label class="full">Nombre<input required name="nombre" maxlength="70" placeholder="Ej.: Campaña de invitación"></label><label>Desde<input required name="desde" type="date" value="${primero}"></label><label>Hasta<input required name="hasta" type="date" value="${ultimo}"></label></div><div class="modal-actions"><button type="button" data-close="campaign-dialog">Cancelar</button><button type="submit">Crear campaña</button></div></form></dialog>`;
}

function modalSolicitud() {
  const desde = HOY.toISOString().slice(0,10);
  const fin = new Date(HOY); fin.setDate(fin.getDate() + 7);
  const cuadras = geometriasCuadras?.features?.filter((item:any)=>Number(item.properties?.territorioId)===seleccionado) ?? [];
  const alias = usuario?.nombre ?? "";
  return `<dialog id="request-dialog"><form id="request-form" method="dialog"><div class="modal-head"><div><span class="eyebrow">USO PERSONAL</span><h2>Solicitar territorio ${seleccionado}</h2></div><button type="button" data-close="request-dialog" aria-label="Cerrar">×</button></div><p class="modal-copy">Podés pedir el territorio completo o armarlo con algunas cuadras. Tu nombre y nota solo los ven vos y los administradores.</p><div class="form-grid">
    <label class="full">Alcance<select name="alcance" id="request-scope"><option>Territorio completo</option><option>Cuadras seleccionadas</option></select></label>
    <label>Desde<input required name="desde" type="date" value="${desde}"></label><label>Hasta<input required name="hasta" type="date" value="${fin.toISOString().slice(0,10)}"></label>
    <label>Modalidad<select name="modalidad">${(["Casa en casa","Revisitas","Exhibidores","Cartas","Telefonica","Informal"] as Modalidad[]).map((item)=>`<option>${item}</option>`).join("")}</select></label><label>Alias privado<input required name="aliasPrivado" maxlength="45" value="${escaparHtml(alias)}" placeholder="Tu nombre o alias"></label>
    <fieldset id="request-blocks" class="full request-blocks" disabled><legend>Elegí las cuadras</legend>${cuadras.map((item:any)=>`<label><input type="checkbox" name="cuadraId" value="${escaparHtml(item.properties.id)}" checked><span>C${item.properties.numero}</span></label>`).join("")}</fieldset>
    <label class="full">Nota privada<textarea name="observacion" maxlength="180" placeholder="Ej.: salimos el sábado por la mañana"></textarea></label>
  </div>${firebaseConfigurado && !usuario ? '<p class="login-required">Para enviar el pedido compartido primero tenés que ingresar con Google.</p>' : ""}<div class="modal-actions"><button type="button" data-close="request-dialog">Cancelar</button><button type="submit">Enviar solicitud</button></div></form></dialog>`;
}

function textoPrograma() {
  const { desde, hasta } = rangoSemana(new Date(`${semanaPrograma}T12:00:00`));
  const filas = asignacionesDeSemana().map((item) => `${nombreDiaPrograma(item.fecha)} · ${item.hora} · ${item.puntoEncuentro || "A confirmar"} · ${etiquetaTerritorioAsignacion(item)} · Enc.: ${item.encargado || "—"} · Grupos: ${item.grupo || "—"}`);
  return [`Salidas al ministerio`, capitalizar(rangoProgramaTexto(desde, hasta)), "", ...(filas.length ? filas : ["Sin salidas cargadas."])].join("\n");
}

function imprimirPrograma() {
  document.body.classList.add("printing-program");
  const limpiar = () => document.body.classList.remove("printing-program");
  window.addEventListener("afterprint", limpiar, { once: true });
  window.print();
  window.setTimeout(limpiar, 2000);
}

async function compartirPrograma() {
  const texto = textoPrograma();
  try {
    if (navigator.share) await navigator.share({ title: "Salidas al ministerio", text: texto });
    else {
      await navigator.clipboard.writeText(texto);
      alert("Programa copiado para compartir.");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    mostrarError(error);
  }
}

function refrescarDatosLocales() {
  if (estadoDatos.modo === "local") datosAplicacion = obtenerDatosLocales();
}

function mostrarError(error: unknown) {
  alert(error instanceof Error ? error.message : "No se pudo completar la acción.");
}

async function accederConGoogle(origen?: HTMLButtonElement) {
  const textoOriginal = origen?.innerHTML;
  if (origen) {
    origen.disabled = true;
    origen.setAttribute("aria-busy", "true");
    if (origen.id === "auth-action") origen.innerHTML = '<b class="google-mark" aria-hidden="true">G</b><span>Abriendo…</span>';
  }
  try {
    await iniciarSesion();
  } catch (error) {
    if (origen && textoOriginal) origen.innerHTML = textoOriginal;
    if (origen) {
      origen.disabled = false;
      origen.removeAttribute("aria-busy");
    }
    throw error;
  }
}

function bindEvents() {
  bindBlockEditor();
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach(b=>b.addEventListener("click",()=>{panelActivo=b.dataset.panel as Panel;render();}));
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach(b=>b.addEventListener("click",()=>{categoriaActiva=b.dataset.category as Categoria|"Todas";render();}));
  document.querySelectorAll<HTMLButtonElement>("[data-select]").forEach(b=>b.addEventListener("click",()=>{seleccionado=Number(b.dataset.select);panelActivo="estadisticas";render();}));
  document.querySelector<HTMLInputElement>("#search")?.addEventListener("input",e=>{busqueda=(e.target as HTMLInputElement).value.replace(/\D/g,"").slice(0,2);const input=e.target as HTMLInputElement;input.value=busqueda;const t=territorios.find(t=>String(t.id)===busqueda);if(t)enfocarTerritorio(t.id);});
  document.querySelector("#reset")?.addEventListener("click",()=>{categoriaActiva="Todas";busqueda="";render();});
  document.querySelector("#fit-map")?.addEventListener("click",()=>{const mobile=window.innerWidth<=760;mapa?.fitBounds([[GEO_BOUNDS.west,GEO_BOUNDS.south],[GEO_BOUNDS.east,GEO_BOUNDS.north]],{padding:mobile?{top:85,right:30,bottom:tarjetaMinimizada?135:240,left:30}:{top:85,right:75,bottom:115,left:285}});if(mapa)mapa.setZoom(mapa.getZoom()-.7);});
  document.querySelector("#locate-me")?.addEventListener("click",()=>controlUbicacion?.trigger());
  document.querySelector("#campaign-map-toggle")?.addEventListener("click",()=>{modoCampana=!modoCampana;render();});
  document.querySelector("#data-status")?.addEventListener("click",()=>alert(estadoDatos.mensaje));
  document.querySelector<HTMLButtonElement>("#auth-action")?.addEventListener("click",async(event)=>{try{if(usuario){if(confirm("¿Cerrar la sesión de administración?"))await cerrarSesion();}else await accederConGoogle(event.currentTarget as HTMLButtonElement);}catch(error){mostrarError(error);}});
  document.querySelectorAll<HTMLButtonElement>("[data-login]").forEach((boton)=>boton.addEventListener("click",async()=>{try{await accederConGoogle(boton);}catch(error){mostrarError(error);}}));
  document.querySelector("#share-territory")?.addEventListener("click",async()=>{const url=new URL(location.href);url.searchParams.set("t",String(seleccionado));const data={title:`Territorio ${seleccionado}`,text:`Territorio ${seleccionado} · San Francisco`,url:url.toString()};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(url.toString());alert("Enlace copiado");}}catch{/* compartir cancelado */}});
  document.querySelector("#open-report")?.addEventListener("click",()=>{panelActivo="informe";render();});
  document.querySelector("#view-stats")?.addEventListener("click",()=>{panelActivo="estadisticas";render();});
  document.querySelector("#toggle-selection-card")?.addEventListener("click",()=>{tarjetaMinimizada=!tarjetaMinimizada;render();});
  document.querySelector("#print-report")?.addEventListener("click",()=>window.print());
  document.querySelector("#open-program")?.addEventListener("click",()=>document.querySelector<HTMLDialogElement>("#program-dialog")?.showModal());
  document.querySelector("#print-program")?.addEventListener("click",imprimirPrograma);
  document.querySelector("#share-program")?.addEventListener("click",compartirPrograma);
  document.querySelector("#program-prev")?.addEventListener("click",()=>{semanaPrograma=fechaIsoLocal(desplazarDias(new Date(`${semanaPrograma}T12:00:00`),-7));render();document.querySelector<HTMLDialogElement>("#program-dialog")?.showModal();});
  document.querySelector("#program-next")?.addEventListener("click",()=>{semanaPrograma=fechaIsoLocal(desplazarDias(new Date(`${semanaPrograma}T12:00:00`),7));render();document.querySelector<HTMLDialogElement>("#program-dialog")?.showModal();});
  document.querySelector("#restore-demo")?.addEventListener("click",()=>{if(estadoDatos.modo==="local"&&confirm("Se reemplazarán los datos locales por la demostración. ¿Continuar?")){restaurarDemo();refrescarDatosLocales();render();}});
  const dialog=document.querySelector<HTMLDialogElement>("#record-dialog");
  ["#new-record-top","#new-record-inline","#new-record-detail"].forEach(id=>document.querySelector(id)?.addEventListener("click",()=>dialog?.showModal()));
  ["#close-dialog","#cancel-dialog"].forEach(id=>document.querySelector(id)?.addEventListener("click",()=>dialog?.close()));
  document.querySelector("#new-assignment")?.addEventListener("click",()=>document.querySelector<HTMLDialogElement>("#assignment-dialog")?.showModal());
  document.querySelector("#program-new-assignment")?.addEventListener("click",()=>{document.querySelector<HTMLDialogElement>("#program-dialog")?.close();document.querySelector<HTMLDialogElement>("#assignment-dialog")?.showModal();});
  document.querySelector("#new-campaign")?.addEventListener("click",()=>document.querySelector<HTMLDialogElement>("#campaign-dialog")?.showModal());
  const abrirSolicitud=async()=>{if(firebaseConfigurado&&!usuario){try{await accederConGoogle();}catch(error){mostrarError(error);}return;}document.querySelector<HTMLDialogElement>("#request-dialog")?.showModal();};
  document.querySelector("#request-territory")?.addEventListener("click",abrirSolicitud);
  document.querySelector("#request-from-planning")?.addEventListener("click",abrirSolicitud);
  document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((boton)=>boton.addEventListener("click",()=>document.querySelector<HTMLDialogElement>(`#${boton.dataset.close}`)?.close()));
  const tipoAsignacionSelect=document.querySelector<HTMLSelectElement>("#assignment-type");
  const actualizarCamposAsignacion=()=>{const tipo=tipoAsignacionSelect?.value;const campo=document.querySelector<HTMLElement>("#assignment-territories-field");const territoriosInput=campo?.querySelector<HTMLInputElement>("input");const encuentro=document.querySelector<HTMLInputElement>("#assignment-form [name=puntoEncuentro]");const esSalida=tipo==="Salida";if(territoriosInput){territoriosInput.disabled=!esSalida;territoriosInput.required=esSalida;}campo?.classList.toggle("field-disabled",!esSalida);if(encuentro){const sugerencias:Record<string,string>={Telefonica:"Zoom",Reunion:"Reunión","Sin salida":"No hay salida"};if(sugerencias[tipo??""])encuentro.value=sugerencias[tipo??""];else if(["Zoom","Reunión","No hay salida"].includes(encuentro.value))encuentro.value="";}};
  tipoAsignacionSelect?.addEventListener("change",actualizarCamposAsignacion);
  document.querySelector<HTMLSelectElement>("#request-scope")?.addEventListener("change",(event)=>{const seleccion=(event.currentTarget as HTMLSelectElement).value;const fieldset=document.querySelector<HTMLFieldSetElement>("#request-blocks");if(fieldset)fieldset.disabled=seleccion==="Territorio completo";});
  document.querySelectorAll<HTMLButtonElement>("[data-request-approve]").forEach((boton)=>boton.addEventListener("click",async()=>{try{await resolverSolicitud(boton.dataset.requestApprove!,"Aprobada");refrescarDatosLocales();render();}catch(error){mostrarError(error);}}));
  document.querySelectorAll<HTMLButtonElement>("[data-request-reject]").forEach((boton)=>boton.addEventListener("click",async()=>{try{await resolverSolicitud(boton.dataset.requestReject!,"Rechazada");refrescarDatosLocales();render();}catch(error){mostrarError(error);}}));
  document.querySelectorAll<HTMLButtonElement>("[data-request-close]").forEach((boton)=>boton.addEventListener("click",async()=>{try{await cerrarSolicitud(boton.dataset.requestId!,boton.dataset.requestClose as "Completada"|"Cancelada");refrescarDatosLocales();render();}catch(error){mostrarError(error);}}));
  document.querySelector("#toggle-campaign-complete")?.addEventListener("click",async()=>{const campana=datosAplicacion.campanas.find((item)=>item.activa);if(!campana)return;const completados=campana.completados.includes(seleccionado)?campana.completados.filter((id)=>id!==seleccionado):[...campana.completados,seleccionado];try{await actualizarCampana({...campana,completados});refrescarDatosLocales();render();}catch(error){mostrarError(error);}});
  document.querySelector<HTMLFormElement>("#record-form")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);const submit=form.querySelector<HTMLButtonElement>("button[type=submit]");if(submit)submit.disabled=true;try{await guardarRegistro({fecha:String(data.get("fecha")),territorioId:Number(data.get("territorioId")),hermanos:Number(data.get("hermanos")),modalidad:String(data.get("modalidad")) as Modalidad,cobertura:Number(data.get("cobertura")),revisitas:Number(data.get("revisitas")),cursos:Number(data.get("cursos")),observacion:String(data.get("observacion")||"")});seleccionado=Number(data.get("territorioId"));panelActivo="estadisticas";dialog?.close();refrescarDatosLocales();render();}catch(error){mostrarError(error);if(submit)submit.disabled=false;}});
  document.querySelector<HTMLFormElement>("#assignment-form")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);const tipo=String(data.get("tipo")) as NonNullable<Asignacion["tipo"]>;try{const territorioIds=tipo==="Salida"?parsearTerritorios(String(data.get("territorios")||"")):[];if(tipo==="Salida"&&!territorioIds.length)return alert("Ingresá al menos un territorio.");const fecha=String(data.get("fecha"));await guardarAsignacion({...(territorioIds.length?{territorioId:territorioIds[0],territorioIds}:{}),fecha,hora:String(data.get("hora")),grupo:String(data.get("grupo")||""),puntoEncuentro:String(data.get("puntoEncuentro")||""),encargado:String(data.get("encargado")||""),tipo,estado:"Programada"});semanaPrograma=rangoSemana(new Date(`${fecha}T12:00:00`)).desde;form.closest("dialog")?.close();refrescarDatosLocales();render();document.querySelector<HTMLDialogElement>("#program-dialog")?.showModal();}catch(error){mostrarError(error);}});
  document.querySelector<HTMLFormElement>("#campaign-form")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);const desde=String(data.get("desde"));const hasta=String(data.get("hasta"));if(hasta<desde)return alert("La fecha de finalización debe ser posterior al inicio.");try{await guardarCampana({nombre:String(data.get("nombre")),desde,hasta,territorioIds:Array.from({length:96},(_,i)=>i+1),completados:[],activa:true});form.closest("dialog")?.close();modoCampana=true;refrescarDatosLocales();render();}catch(error){mostrarError(error);}});
  document.querySelector<HTMLFormElement>("#request-form")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);const alcance=String(data.get("alcance")) as AlcanceSolicitud;const todas=geometriasCuadras?.features?.filter((item:any)=>Number(item.properties?.territorioId)===seleccionado).map((item:any)=>String(item.properties.id))??[];const elegidas=alcance==="Territorio completo"?todas:data.getAll("cuadraId").map(String);const desde=String(data.get("desde"));const hasta=String(data.get("hasta"));if(!elegidas.length)return alert("Elegí al menos una cuadra.");if(hasta<desde)return alert("La fecha final debe ser posterior al inicio.");try{await crearSolicitud({territorioId:seleccionado,cuadraIds:elegidas,alcance,desde,hasta,modalidad:String(data.get("modalidad")) as Modalidad,aliasPrivado:String(data.get("aliasPrivado")),observacion:String(data.get("observacion")||"")});form.closest("dialog")?.close();refrescarDatosLocales();panelActivo="planificacion";render();}catch(error){mostrarError(error);}});
  document.querySelector<HTMLSelectElement>("#coverage-mode")?.addEventListener("change",async(event)=>{const modo=(event.currentTarget as HTMLSelectElement).value as ConfiguracionOperacion["modoCobertura"];const campana=datosAplicacion.campanas.find((item)=>item.activa);if(modo==="Campaña"&&!campana){alert("Primero creá una campaña activa.");render();return;}const coberturaDesde=modo==="Mensual"?new Date(HOY.getFullYear(),HOY.getMonth(),1,12).toISOString().slice(0,10):modo==="Campaña"?campana!.desde:configuracionCobertura().coberturaDesde;try{await guardarConfiguracion({id:"operacion",modoCobertura:modo,coberturaDesde,actualizadaEn:new Date().toISOString()});refrescarDatosLocales();render();}catch(error){mostrarError(error);}});
  document.querySelector("#reset-coverage")?.addEventListener("click",async()=>{if(!confirm("La cobertura comenzará a contarse desde hoy. El historial no se borra. ¿Continuar?"))return;try{await guardarConfiguracion({id:"operacion",modoCobertura:"Manual",coberturaDesde:HOY.toISOString().slice(0,10),actualizadaEn:new Date().toISOString()});refrescarDatosLocales();render();}catch(error){mostrarError(error);}});
}

render();
fetch(`${import.meta.env.BASE_URL}cuadras.geojson`).then((response)=>response.ok?response.json():null).then((data)=>{if(data){geometriasCuadras=data;render();}}).catch((error)=>console.warn("No se pudieron cargar las cuadras",error));
iniciarBackend((datos)=>{datosAplicacion=datos;render();},(estado)=>{estadoDatos=estado;render();},(sesion)=>{usuario=sesion;render();});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registro)=>registro.update()).catch(()=>undefined));
