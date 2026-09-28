import { GeolocateControl, LngLatBounds, Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { categorias, colorCategoria, territorios } from "./data/territorios";
import { guardarRegistro, obtenerRegistros, restaurarDemo } from "./services/registros";
import type { Categoria, Modalidad, RegistroSalida, Territorio } from "./types/domain";

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
let vistaMapa: { centro: [number, number]; zoom: number } = { centro: [-62.10888, -31.41975], zoom: 14 };
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
      <div class="header-actions"><span class="demo-pill"><i></i> En este dispositivo</span><button id="new-record-top" class="header-primary">+ Registrar salida</button></div>
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
          <div class="map-toolbar"><div><span class="eyebrow">MAPA DE TERRITORIOS</span><h2>San Francisco</h2><small>Calles reales · selecciona un sector</small></div><div class="map-tools"><button id="locate-me" class="round-map-action" aria-label="Mostrar mi ubicación" title="Mi ubicación">${icono("ubicacion")}</button><button id="fit-map" class="round-map-action" aria-label="Ver todos los territorios" title="Ver todos">${icono("encuadrar")}</button></div></div>
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
  return `<div class="map-selection-card">
    <div class="selection-color" style="--selection:${colorCategoria[territorio.categoria]}"></div>
    <div class="selection-main"><span class="eyebrow">SELECCION ACTUAL</span><h2>Territorio ${territorio.id}</h2><p><i class="status-dot ${estadoClase}"></i>${m.estado}${m.ultima ? ` · ultima salida hace ${diasDesde(m.ultima.fecha)} dias` : " · sin registros"}</p></div>
    <div class="selection-buttons"><button id="share-territory" class="share-action" aria-label="Compartir territorio">${icono("compartir")}</button><button id="view-stats" class="selection-action">Ver estadísticas <span>→</span></button></div>
  </div>`;
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
  if(heading) heading.textContent=`Territorio ${id}`;
  if(status) status.innerHTML=`<i class="status-dot ${estadoClase}"></i>${metrica.estado}${metrica.ultima?` · ultima salida hace ${diasDesde(metrica.ultima.fecha)} dias`:" · sin registros"}`;
  color?.style.setProperty("--selection",colorCategoria[territorio.categoria]);
  mapa.setPaintProperty("territorios-fill","fill-opacity",["case",["==",["get","id"],id],.34,.12]);
  mapa.setPaintProperty("territorios-line","line-width",["case",["==",["get","id"],id],4,2]);
  mapa.setPaintProperty("territorios-line","line-opacity",["case",["==",["get","id"],id],1,.82]);
  mapa.setFilter("territorios-selected",["==",["get","id"],id]);
  const points=feature.geometry.coordinates[0] as number[][];
  const bounds=points.reduce((result,point)=>result.extend(point as [number,number]),new LngLatBounds(points[0] as [number,number],points[0] as [number,number]));
  const mobile=window.innerWidth<=760;
  mapa.fitBounds(bounds,{padding:mobile?{top:145,right:42,bottom:245,left:42}:{top:125,right:90,bottom:130,left:285},maxZoom:17,duration:720,essential:true});
  const url=new URL(location.href);url.searchParams.set("t",String(id));history.replaceState({},"",url);
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
      const features=original.features.filter((feature:any)=>idsVisibles.has(Number(feature.properties?.id))).map((feature:any)=>{
        const id=Number(feature.properties.id);
        const territorio=territorios.find(item=>item.id===id)!;
        const metrica=metricasTerritorio(territorio);
        const statusColor=metrica.estado==="Al dia"?"#48a365":metrica.estado==="Atencion"?"#dfa72f":"#bd4037";
        return {...feature,properties:{...feature.properties,id,color:colorCategoria[territorio.categoria],statusColor}};
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
        "fill-color":["get","color"],
        "fill-opacity":["case",["==",["get","id"],seleccionado],.34,.12],
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
      const seleccionar=(event:any)=>{const id=Number(event.features?.[0]?.properties?.id);if(id)enfocarTerritorio(id);};
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
  return `<dialog id="record-dialog"><form id="record-form" method="dialog"><div class="modal-head"><div><span class="eyebrow">NUEVO REGISTRO</span><h2>Registrar salida</h2></div><button type="button" id="close-dialog" aria-label="Cerrar">×</button></div><p class="modal-copy">Registra cantidades generales. No incluyas nombres ni informacion personal.</p><div class="form-grid"><label>Fecha<input required name="fecha" type="date" value="${fechaHoy}"></label><label>Territorio<select name="territorioId">${opciones}</select></label><label>Hermanos que participaron<input required name="hermanos" type="number" min="1" max="99" value="4"></label><label>Modalidad<select name="modalidad">${modalidades.map(m=>`<option>${m}</option>`).join("")}</select></label><label>Cobertura aproximada (%)<input required name="cobertura" type="number" min="0" max="100" value="50"></label><label>Revisitas realizadas<input required name="revisitas" type="number" min="0" value="0"></label><label>Cursos bíblicos<input required name="cursos" type="number" min="0" value="0"></label><label class="full">Observacion general<textarea name="observacion" maxlength="180" placeholder="Ej.: se completo el sector norte"></textarea></label></div><div class="modal-actions"><button type="button" id="cancel-dialog">Cancelar</button><button type="submit">Guardar salida</button></div></form></dialog>`;
}

function bindEvents() {
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach(b=>b.addEventListener("click",()=>{panelActivo=b.dataset.panel as Panel;render();}));
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach(b=>b.addEventListener("click",()=>{categoriaActiva=b.dataset.category as Categoria|"Todas";render();}));
  document.querySelectorAll<HTMLButtonElement>("[data-select]").forEach(b=>b.addEventListener("click",()=>{seleccionado=Number(b.dataset.select);panelActivo="estadisticas";render();}));
  document.querySelector<HTMLInputElement>("#search")?.addEventListener("input",e=>{busqueda=(e.target as HTMLInputElement).value.replace(/\D/g,"").slice(0,2);const input=e.target as HTMLInputElement;input.value=busqueda;const t=territorios.find(t=>String(t.id)===busqueda);if(t)enfocarTerritorio(t.id);});
  document.querySelector("#reset")?.addEventListener("click",()=>{categoriaActiva="Todas";busqueda="";render();});
  document.querySelector("#fit-map")?.addEventListener("click",()=>{
    const mobile=window.innerWidth<=760;
    mapa?.fitBounds([[GEO_BOUNDS.west,GEO_BOUNDS.south],[GEO_BOUNDS.east,GEO_BOUNDS.north]],{padding:mobile?{top:90,right:35,bottom:210,left:35}:{top:85,right:75,bottom:115,left:285}});
    if(mapa) mapa.setZoom(mapa.getZoom()-.7);
  });
  document.querySelector("#locate-me")?.addEventListener("click",()=>controlUbicacion?.trigger());
  document.querySelector("#share-territory")?.addEventListener("click",async()=>{
    const url=new URL(location.href);url.searchParams.set("t",String(seleccionado));
    const data={title:`Territorio ${seleccionado}`,text:`Territorio ${seleccionado} · San Francisco`,url:url.toString()};
    try { if(navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(url.toString()); alert("Enlace copiado"); } } catch { /* compartir cancelado */ }
  });
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
