import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { categorias, colorCategoria, territorios } from "./data/territorios";
import { guardarRegistro, obtenerRegistros, restaurarDemo } from "./services/registros";
import type { Categoria, Modalidad, RegistroSalida, Territorio } from "./types/domain";

const app = document.querySelector<HTMLDivElement>("#app")!;
const HOY = new Date("2026-08-24T12:00:00");
const GEO_BOUNDS = {
  north: -31.385,
  south: -31.478,
  west: -62.137,
  east: -62.027,
};
type Panel = "mapa" | "estadisticas" | "planificacion" | "informe";
type Estado = "Al dia" | "Atencion" | "Atrasado" | "Sin datos";

let seleccionado = 36;
let categoriaActiva: Categoria | "Todas" = "Todas";
let busqueda = "";
let panelActivo: Panel = "mapa";
let mapa: L.Map | null = null;
let vistaMapa: { centro: L.LatLngExpression; zoom: number } = { centro: [-31.425, -62.084], zoom: 13 };
let mapaInicializado = false;

const fechaCorta = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });
const mesNombre = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });

function diasDesde(fecha?: string) {
  if (!fecha) return Infinity;
  return Math.floor((HOY.getTime() - new Date(`${fecha}T12:00:00`).getTime()) / 86400000);
}

function estadoTerritorio(registros: RegistroSalida[]): Estado {
  if (!registros.length) return "Sin datos";
  const ultima = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const dias = diasDesde(ultima.fecha);
  if (dias <= 21) return "Al dia";
  if (dias <= 35) return "Atencion";
  return "Atrasado";
}

function registrosDe(id: number) { return obtenerRegistros().filter((r) => r.territorioId === id); }
function promedio(valores: number[]) { return valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0; }
function coordenadaTerritorio(territorio: Territorio): L.LatLngTuple {
  const lat = GEO_BOUNDS.north + (territorio.y / 100) * (GEO_BOUNDS.south - GEO_BOUNDS.north);
  const lng = GEO_BOUNDS.west + (territorio.x / 100) * (GEO_BOUNDS.east - GEO_BOUNDS.west);
  return [lat, lng];
}
function enMes(registro: RegistroSalida, desplazamiento = 0) {
  const referencia = new Date(HOY);
  referencia.setMonth(referencia.getMonth() + desplazamiento);
  return registro.fecha.slice(0, 7) === referencia.toISOString().slice(0, 7);
}

function metricasTerritorio(territorio: Territorio) {
  const registros = registrosDe(territorio.id);
  const actuales = registros.filter((r) => enMes(r));
  const anteriores = registros.filter((r) => enMes(r, -1));
  const ultima = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return {
    registros, actuales, anteriores, ultima,
    estado: estadoTerritorio(registros),
    apoyo: promedio(actuales.map((r) => r.hermanos)),
    cobertura: Math.min(100, actuales.reduce((total, r) => total + r.cobertura, 0)),
    revisitas: actuales.reduce((total, r) => total + r.revisitas, 0),
    cursos: actuales.reduce((total, r) => total + r.cursos, 0),
  };
}

function datosGlobales() {
  const registros = obtenerRegistros();
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

function diferencia(actual: number, anterior: number) {
  if (!anterior) return actual ? 100 : 0;
  return Math.round((actual - anterior) / anterior * 100);
}

function render() {
  if (mapa) { mapa.remove(); mapa = null; }
  const global = datosGlobales();
  const actual = territorios.find((t) => t.id === seleccionado) ?? territorios[0];
  const metrica = metricasTerritorio(actual);
  const filtrados = territorios.filter((t) => (categoriaActiva === "Todas" || t.categoria === categoriaActiva) && (!busqueda || String(t.id).includes(busqueda)));
  const diferenciaSalidas = diferencia(global.actuales.length, global.anteriores.length);

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span class="brand-mark">SF</span><span>Territorio</span></a>
      <nav class="main-nav" aria-label="Secciones">
        ${navButton("mapa", "Mapa")}${navButton("estadisticas", "Estadisticas")}${navButton("planificacion", "Planificacion")}${navButton("informe", "Informe")}
      </nav>
      <div class="header-actions"><span class="demo-pill"><i></i> Datos locales · demo inicial</span><button id="new-record-top" class="header-primary">+ Registrar salida</button></div>
    </header>
    <main class="dashboard ${panelActivo === "mapa" ? "map-mode" : ""}">
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
        <div class="sidebar-note"><span>i</span><p>El color exterior indica la categoria original. El punto superior muestra cuanto tiempo paso desde la ultima salida.</p></div>
        <button id="reset" class="reset-button">Restablecer filtros</button>
      </aside>
      <section class="workspace">
        <div class="summary-row">
          <article><span>Territorios trabajados</span><strong>${global.territoriosMes}</strong><small>de 96 este mes</small></article>
          <article><span>Salidas en agosto</span><strong>${global.actuales.length}</strong><small><em class="${diferenciaSalidas >= 0 ? "up" : "down"}">${diferenciaSalidas >= 0 ? "↗" : "↘"} ${Math.abs(diferenciaSalidas)}%</em> vs. julio</small></article>
          <article><span>Apoyo promedio</span><strong>${global.apoyo}</strong><small>hermanos por salida</small></article>
        </div>
        <div class="map-card">
          <div class="map-toolbar"><div><span class="eyebrow">MAPA REAL · OPENSTREETMAP</span><h2>San Francisco</h2><small>Arrastra, acerca y selecciona un territorio</small></div><button id="fit-map" class="fit-map">Encuadrar mapa</button></div>
          <div id="territory-map" aria-label="Mapa interactivo de territorios"></div>
          <div class="map-footer"><span><i class="pulse"></i> ${filtrados.length} territorios visibles</span><span>Mapa © OpenStreetMap · posiciones territoriales preliminares</span></div>
        </div>
      </section>
      <aside class="detail-panel">${panelActivo === "mapa" ? panelMapa(actual, metrica) : panelActivo === "estadisticas" ? panelTerritorio(actual, metrica) : panelActivo === "planificacion" ? panelPlanificacion() : panelInforme(global)}</aside>
    </main>
    ${modalRegistro()}`;
  iniciarMapa(filtrados);
  bindEvents();
}

function navButton(panel: Panel, texto: string) { return `<button data-panel="${panel}" class="nav-button ${panelActivo === panel ? "active" : ""}">${texto}</button>`; }

function panelMapa(territorio: Territorio, m: ReturnType<typeof metricasTerritorio>) {
  const estadoClase = m.estado === "Al dia" ? "current" : m.estado === "Atencion" ? "warning" : "late";
  return `<div class="map-selection-card">
    <div class="selection-color" style="--selection:${colorCategoria[territorio.categoria]}"></div>
    <div class="selection-main"><span class="eyebrow">SELECCION ACTUAL</span><h2>Territorio ${territorio.id}</h2><p><i class="status-dot ${estadoClase}"></i>${m.estado}${m.ultima ? ` · ultima salida hace ${diasDesde(m.ultima.fecha)} dias` : " · sin registros"}</p></div>
    <button id="view-stats" class="selection-action">Ver estadisticas <span>→</span></button>
  </div>`;
}

function panelTerritorio(territorio: Territorio, m: ReturnType<typeof metricasTerritorio>) {
  const estadoClase = m.estado === "Al dia" ? "current" : m.estado === "Atencion" ? "warning" : "late";
  return `<div class="detail-head"><div><span class="eyebrow">DETALLE ACTUAL</span><h2>Territorio ${territorio.id}</h2></div><span class="category-badge" style="--badge:${colorCategoria[territorio.categoria]}"><i></i>${territorio.categoria}</span></div>
    <div class="attention-card ${estadoClase}"><div><span>Estado de atencion</span><strong>${m.estado}</strong><small>${m.ultima ? `Ultima salida hace ${diasDesde(m.ultima.fecha)} dias` : "No hay registros"}</small></div><i class="attention-light"></i></div>
    <div class="coverage-card"><div class="coverage-copy"><span>Cobertura del mes</span><strong>${m.cobertura}%</strong><small>Suma aproximada de zonas trabajadas</small></div><div class="ring" style="--value:${m.cobertura * 3.6}deg;--ring:${colorCategoria[territorio.categoria]}"><span>${m.cobertura}</span></div></div>
    <div class="detail-metrics"><article><span>Salidas</span><strong>${m.actuales.length}</strong><small>${m.anteriores.length} el mes anterior</small></article><article><span>Apoyo promedio</span><strong>${m.apoyo}</strong><small>hermanos por salida</small></article><article><span>Revisitas</span><strong>${m.revisitas}</strong><small>registradas</small></article><article><span>Cursos</span><strong>${m.cursos}</strong><small>informados</small></article></div>
    <div class="recent-list"><div class="section-title"><span>Salidas recientes</span><button id="new-record-inline">+ Agregar</button></div>${m.registros.sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,4).map((r)=>`<div class="record-row"><time>${fechaCorta.format(new Date(`${r.fecha}T12:00:00`))}</time><div><strong>${r.modalidad}</strong><small>${r.hermanos} hermanos · ${r.cobertura}% cobertura</small></div>${r.demo ? '<span class="demo-tag">DEMO</span>' : '<span class="real-tag">REAL</span>'}</div>`).join("") || '<p class="empty">Todavia no hay salidas registradas.</p>'}</div>
    <button class="primary-action" id="new-record-detail">Registrar una salida <span>→</span></button>
    <p class="data-warning">Se guardan cantidades agregadas, no nombres de publicadores.</p>`;
}

function panelPlanificacion() {
  const prioridades = territorios.map((t) => ({ t, m: metricasTerritorio(t) })).sort((a,b) => diasDesde(b.m.ultima?.fecha) - diasDesde(a.m.ultima?.fecha)).slice(0,6);
  const bajoApoyo = territorios.map((t)=>({t,m:metricasTerritorio(t)})).filter(({m})=>m.actuales.length && m.apoyo < 4).sort((a,b)=>a.m.apoyo-b.m.apoyo).slice(0,3);
  return `<div class="detail-head"><div><span class="eyebrow">ORGANIZACION</span><h2>Planificacion</h2></div></div>
    <div class="planner-intro"><strong>Prioridades sugeridas</strong><p>Basadas en la fecha de la ultima salida y el nivel de apoyo. Son ayudas organizativas, no evaluaciones personales.</p></div>
    <div class="priority-list">${prioridades.map(({t,m},i)=>`<button data-select="${t.id}" class="priority-item"><span class="priority-number">${i+1}</span><div><strong>Territorio ${t.id}</strong><small>${m.ultima ? `${diasDesde(m.ultima.fecha)} dias sin salida` : "Sin registros"}</small></div><span class="priority-arrow">→</span></button>`).join("")}</div>
    <div class="insight-card"><span class="insight-icon">↗</span><div><strong>Territorios con apoyo bajo</strong><p>${bajoApoyo.length ? bajoApoyo.map(({t})=>t.id).join(", ") : "No se detectaron casos este mes"}</p></div></div>
    <div class="insight-card"><span class="insight-icon">◷</span><div><strong>Horario a observar</strong><p>Registra proximamente dia y horario para descubrir cuando participa mas gente.</p></div></div>
    <button id="open-report" class="primary-action">Ver informe mensual <span>→</span></button>`;
}

function panelInforme(g: ReturnType<typeof datosGlobales>) {
  const salidasAnt = g.anteriores.length;
  const apoyoAnt = promedio(g.anteriores.map(r=>r.hermanos));
  return `<div class="detail-head"><div><span class="eyebrow">RESUMEN CONGREGACIONAL</span><h2>${mesNombre.format(HOY)}</h2></div><button id="print-report" class="print-button">Imprimir</button></div>
    <div class="report-hero"><span>Cobertura territorial</span><strong>${g.territoriosMes}<small>/96</small></strong><div class="report-progress"><i style="width:${g.cobertura}%"></i></div><p>${g.cobertura}% de los territorios tuvo al menos una salida este mes.</p></div>
    <div class="report-grid"><article><span>Salidas</span><strong>${g.actuales.length}</strong><small>${diferencia(g.actuales.length,salidasAnt)}% vs. julio</small></article><article><span>Participaciones</span><strong>${g.hermanos}</strong><small>suma de apoyo</small></article><article><span>Apoyo promedio</span><strong>${g.apoyo}</strong><small>${diferencia(g.apoyo,apoyoAnt)}% vs. julio</small></article><article><span>Revisitas</span><strong>${g.revisitas}</strong><small>${g.cursos} cursos</small></article></div>
    <div class="report-section"><strong>Atencion territorial</strong>${(["Al dia","Atencion","Atrasado"] as Estado[]).map(e=>{const n=territorios.filter(t=>estadoTerritorio(registrosDe(t.id))===e).length;return `<div class="report-line"><span><i class="status-dot ${e==="Al dia"?"current":e==="Atencion"?"warning":"late"}"></i>${e}</span><b>${n}</b></div>`}).join("")}</div>
    <div class="privacy-box"><strong>Lectura equilibrada</strong><p>Estas cifras ayudan a distribuir la atencion y el apoyo. No deben usarse para clasificar ni comparar a publicadores.</p></div>
    <button id="restore-demo" class="reset-button danger">Restaurar datos demostrativos</button>`;
}

function iniciarMapa(visibles: Territorio[]) {
  mapa = L.map("territory-map", { minZoom: 11, maxZoom: 19, zoomSnap: .5, attributionControl: true, zoomControl:false }).setView(vistaMapa.centro, vistaMapa.zoom);
  L.control.zoom({ position: panelActivo === "mapa" ? "bottomright" : "topleft" }).addTo(mapa);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mapa);
  const limites = L.latLngBounds([GEO_BOUNDS.south,GEO_BOUNDS.west],[GEO_BOUNDS.north,GEO_BOUNDS.east]);
  mapa.setMaxBounds(limites.pad(.35));
  const idsVisibles = new Set(visibles.map(t=>t.id));
  const agregarMarcador = (territorio: Territorio, posicion: L.LatLngExpression) => {
    if (!mapa || !idsVisibles.has(territorio.id)) return;
    const metrica = metricasTerritorio(territorio);
    const claseEstado = metrica.estado === "Al dia" ? "current" : metrica.estado === "Atencion" ? "warning" : "late";
    const icono = L.divIcon({ className:"territory-marker-wrap", html:`<button class="leaflet-territory ${territorio.id===seleccionado?"selected":""}" style="--marker:${colorCategoria[territorio.categoria]}"><i class="${claseEstado}"></i>${territorio.id}</button>`, iconSize:[32,32], iconAnchor:[16,16] });
    L.marker(posicion,{icon:icono,title:`Territorio ${territorio.id}`}).addTo(mapa).on("click",()=>{seleccionado=territorio.id;render();});
  };
  fetch(`${import.meta.env.BASE_URL}territorios.geojson`)
    .then(response => response.ok ? response.json() : Promise.reject(new Error("GeoJSON no disponible")))
    .then(collection => {
      if (!mapa) return;
      const layer = L.geoJSON(collection, {
        filter: feature => idsVisibles.has(Number(feature.properties?.id)),
        style: feature => {
          const id = Number(feature?.properties?.id);
          const territorio = territorios.find(item => item.id === id)!;
          return { color:colorCategoria[territorio.categoria], weight:id===seleccionado?4:2, opacity:id===seleccionado?.95:.68, fillColor:colorCategoria[territorio.categoria], fillOpacity:id===seleccionado?.3:.14 };
        },
        onEachFeature: (feature, territoryLayer) => {
          const id = Number(feature.properties?.id);
          const territorio = territorios.find(item => item.id === id);
          if (!territorio) return;
          territoryLayer.on("click",()=>{seleccionado=id;render();});
          const bounds = (territoryLayer as L.Polygon).getBounds();
          agregarMarcador(territorio, bounds.getCenter());
        },
      }).addTo(mapa);
      layer.bringToBack();
    })
    .catch(() => territorios.filter(item=>idsVisibles.has(item.id)).forEach(item=>agregarMarcador(item,coordenadaTerritorio(item))));
  mapa.on("moveend zoomend",()=>{ if(mapa) vistaMapa={centro:mapa.getCenter(),zoom:mapa.getZoom()}; });
  setTimeout(()=>{ mapa?.invalidateSize(); if (!mapaInicializado && mapa) { mapa.fitBounds(limites,{padding:[12,12]}); mapaInicializado=true; } },0);
}

function modalRegistro() {
  const opciones = territorios.map(t=>`<option value="${t.id}" ${t.id===seleccionado?"selected":""}>Territorio ${t.id}</option>`).join("");
  const modalidades: Modalidad[]=["Casa en casa","Revisitas","Exhibidores","Cartas","Telefonica","Informal"];
  return `<dialog id="record-dialog"><form id="record-form" method="dialog"><div class="modal-head"><div><span class="eyebrow">NUEVO REGISTRO</span><h2>Registrar salida</h2></div><button type="button" id="close-dialog" aria-label="Cerrar">×</button></div><p class="modal-copy">Registra cantidades generales. No incluyas nombres ni informacion personal.</p><div class="form-grid"><label>Fecha<input required name="fecha" type="date" value="2026-08-24"></label><label>Territorio<select name="territorioId">${opciones}</select></label><label>Hermanos que participaron<input required name="hermanos" type="number" min="1" max="99" value="4"></label><label>Modalidad<select name="modalidad">${modalidades.map(m=>`<option>${m}</option>`).join("")}</select></label><label>Cobertura aproximada (%)<input required name="cobertura" type="number" min="0" max="100" value="50"></label><label>Revisitas realizadas<input required name="revisitas" type="number" min="0" value="0"></label><label>Cursos bíblicos<input required name="cursos" type="number" min="0" value="0"></label><label class="full">Observacion general<textarea name="observacion" maxlength="180" placeholder="Ej.: se completo el sector norte"></textarea></label></div><div class="modal-actions"><button type="button" id="cancel-dialog">Cancelar</button><button type="submit">Guardar salida</button></div></form></dialog>`;
}

function bindEvents() {
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach(b=>b.addEventListener("click",()=>{panelActivo=b.dataset.panel as Panel;render();}));
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach(b=>b.addEventListener("click",()=>{categoriaActiva=b.dataset.category as Categoria|"Todas";render();}));
  document.querySelectorAll<HTMLButtonElement>("[data-select]").forEach(b=>b.addEventListener("click",()=>{seleccionado=Number(b.dataset.select);panelActivo="estadisticas";render();}));
  document.querySelector<HTMLInputElement>("#search")?.addEventListener("input",e=>{busqueda=(e.target as HTMLInputElement).value.replace(/\D/g,"").slice(0,2);const t=territorios.find(t=>String(t.id)===busqueda);if(t)seleccionado=t.id;render();document.querySelector<HTMLInputElement>("#search")?.focus();});
  document.querySelector("#reset")?.addEventListener("click",()=>{categoriaActiva="Todas";busqueda="";render();});
  document.querySelector("#fit-map")?.addEventListener("click",()=>mapa?.fitBounds([[GEO_BOUNDS.south,GEO_BOUNDS.west],[GEO_BOUNDS.north,GEO_BOUNDS.east]],{padding:[15,15]}));
  document.querySelector("#open-report")?.addEventListener("click",()=>{panelActivo="informe";render();});
  document.querySelector("#view-stats")?.addEventListener("click",()=>{panelActivo="estadisticas";render();});
  document.querySelector("#print-report")?.addEventListener("click",()=>window.print());
  document.querySelector("#restore-demo")?.addEventListener("click",()=>{if(confirm("Se reemplazaran los registros locales por los datos demo. ¿Continuar?")){restaurarDemo();render();}});
  const dialog=document.querySelector<HTMLDialogElement>("#record-dialog");
  ["#new-record-top","#new-record-inline","#new-record-detail"].forEach(id=>document.querySelector(id)?.addEventListener("click",()=>dialog?.showModal()));
  ["#close-dialog","#cancel-dialog"].forEach(id=>document.querySelector(id)?.addEventListener("click",()=>dialog?.close()));
  document.querySelector<HTMLFormElement>("#record-form")?.addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);guardarRegistro({fecha:String(data.get("fecha")),territorioId:Number(data.get("territorioId")),hermanos:Number(data.get("hermanos")),modalidad:String(data.get("modalidad")) as Modalidad,cobertura:Number(data.get("cobertura")),revisitas:Number(data.get("revisitas")),cursos:Number(data.get("cursos")),observacion:String(data.get("observacion")||"")});seleccionado=Number(data.get("territorioId"));panelActivo="estadisticas";dialog?.close();render();});
}

render();
