/**
 * OECE / RONIN.SEACE - Pantalla 03: Radar Regional de Postor Único
 * - Mapa de Calor Cartográfico Multinivel Interactivo (3 Niveles de Zoom Geográfico):
 *   1. Nivel Nacional: Mapa del Perú (25 Departamentos). Al hacer clic en un departamento, se expande al Nivel 2.
 *   2. Nivel Departamental: Mapa del Departamento con sus Provincias pintadas por calor. Al hacer clic en una provincia, se expande al Nivel 3.
 *   3. Nivel Provincial/Distrital: Mapa de la Provincia con todos sus Distritos pintados por calor de postor único.
 * - Ranking Térmico con LIMA por defecto y expansión en acordeón de sus Distritos.
 * - Gráfica de Dona "Distribución Regional de Postores Únicos" siempre un nivel inferior (Departamento -> Provincia; Provincia -> Distrito),
 *   con colores individuales para cada territorio (sin agrupar en "OTROS").
 * - Desglose inferior de Empresas Reales (puente_actor_empresa con prorrateo 1/N).
 */

const STORAGE_KEY_RADAR = 'ronin_postor_unico_state';
const STORAGE_KEY_GLOBAL = 'ronin_global_filters';

const DONUT_PALETTE = [
  '#9E1B1E', // 01. Bermellón Imperial
  '#C5A059', // 02. Oro Cresta
  '#0D9488', // 03. Jade Teal
  '#2563EB', // 04. Azul Cobalto
  '#D97706', // 05. Ámbar Real
  '#7C3AED', // 06. Púrpura Kyoto
  '#E11D48', // 07. Carmesí Rosa
  '#059669', // 08. Esmeralda
  '#4F46E5', // 09. Índigo Profundo
  '#EA580C', // 10. Terracota
  '#0284C7', // 11. Celeste Pacífico
  '#9333EA', // 12. Amatista
  '#65A30D', // 13. Verde Bambú
  '#DC2626', // 14. Rojo Escarlata
  '#0891B2', // 15. Cian Oscuro
  '#CA8A04', // 16. Ocre Dorado
  '#DB2777', // 17. Magenta
  '#16A34A', // 18. Verde Bosque
  '#1D4ED8', // 19. Azul Marino
  '#B45309', // 20. Bronce
  '#6D28D9', // 21. Violeta
  '#0F766E', // 22. Turquesa Oscuro
  '#BE123C', // 23. Granate
  '#4338CA', // 24. Azul Ultramar
  '#A16207', // 25. Mostaza Antigua
  '#15803D', // 26. Verde Olivo
  '#C2410C', // 27. Cobre
  '#374151'  // 28. Sumi Carbón
];

let radarState = {
  year: '2026',
  month: 'all',
  departamento: 'all',
  provincia: 'all',
  distrito: 'all',
  tipo_proceso: 'all',
  selectedRegion: 'LIMA',   // Departamento activo por defecto: LIMA
  expandedDept: 'LIMA',     // Departamento expandido en el Ranking Térmico mostrando sus distritos
  selectedProvincia: null,  // Provincia seleccionada en el Mapa, Dona o filtro superior
  selectedDistrito: null,   // Distrito seleccionado en el Mapa, acordeón o Dona
  mapViewLevel: 'peru'      // 'peru' (25 Dptos) | 'departamento' (Mapa de Provincias) | 'provincia' (Mapa de Distritos)
};

let cachedPanoramaDepts = null;      // Panorama de Departamentos para el Mapa del Perú y Ranking
let cachedExpandedDistritos = [];    // Distritos del departamento expandido en el Ranking Térmico
let cachedProvinciasDepto = [];      // Provincias del departamento activo (para Mapa Nivel 2 y Dona)
let cachedDistritosProv = [];        // Distritos de la provincia activa (para Mapa Nivel 3 y Dona)
let cachedDonutSubregions = [];      // Sub-regiones (Provincias o Distritos) para la Gráfica de Dona
let cachedDonutLevelLabel = 'PROVINCIA';
let cachedEmpresas = [];

// Cachés de geometrías SVG de Provincias y Distritos
let geoProvinciasByDeptCache = null;
const geoDistritosByDeptCache = {};

/**
 * Normaliza nombres geográficos (sin tildes ni puntuación extra) para cruzar BD SEACE con cartografía INEI
 */
function normGeoKey(s) {
  const clean = String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (clean.includes('CALLAO') && clean.includes('PROV')) return 'PROV CONST DEL CALLAO';
  return clean;
}

document.addEventListener('DOMContentLoaded', async () => {
  setupThemeToggle();
  setupDotCanvas();
  await loadFilterOptions();
  await restoreRadarState();
  await fetchAllRadarViews();
});

/**
 * Carga el diccionario SVG de Provincias por Departamento (/geo/provincias_by_depto.json)
 */
async function ensureGeoProvinciasLoaded() {
  if (geoProvinciasByDeptCache) return geoProvinciasByDeptCache;
  try {
    const res = await fetch('/geo/provincias_by_depto.json');
    if (res.ok) {
      geoProvinciasByDeptCache = await res.json();
    }
  } catch (e) {
    console.error('Error cargando cartografía de provincias:', e);
  }
  return geoProvinciasByDeptCache || {};
}

/**
 * Carga el diccionario SVG de Distritos para un Departamento específico (/geo/distritos/<DEPTO>.json)
 */
async function ensureGeoDistritosLoaded(deptName) {
  const key = normGeoKey(deptName).replace(/\s+/g, '_');
  if (geoDistritosByDeptCache[key]) return geoDistritosByDeptCache[key];
  try {
    const res = await fetch(`/geo/distritos/${encodeURIComponent(key)}.json`);
    if (res.ok) {
      geoDistritosByDeptCache[key] = await res.json();
    }
  } catch (e) {
    console.error(`Error cargando cartografía de distritos para ${deptName}:`, e);
  }
  return geoDistritosByDeptCache[key] || {};
}

/**
 * Carga los catálogos iniciales de Departamentos y Modalidades
 */
async function loadFilterOptions() {
  try {
    const [deptosRes, procesosRes] = await Promise.all([
      fetch('/api/v1/filtros/departamentos'),
      fetch('/api/v1/filtros/tipos-proceso')
    ]);

    if (deptosRes.ok) {
      const deptos = await deptosRes.json();
      populateSelect('filterDepartamento', deptos, 'TODOS');
    }

    if (procesosRes.ok) {
      const procesos = await procesosRes.json();
      populateSelect('filterTipoProceso', procesos, 'TODAS');
    }
  } catch (e) {
    console.error('Error cargando opciones de filtros en Radar Postor Único:', e);
  }
}

function populateSelect(elementId, items, defaultLabel) {
  const select = document.getElementById(elementId);
  if (!select) return;

  const options = [`<option value="all" selected>${defaultLabel}</option>`];
  items.forEach(item => {
    if (item && String(item).trim() !== '') {
      options.push(`<option value="${item}">${item}</option>`);
    }
  });
  select.innerHTML = options.join('');
}

/**
 * Restaura los filtros y la región activa desde sessionStorage y URL (?year= & ?region=),
 * garantizando que por defecto el departamento activo sea LIMA.
 */
async function restoreRadarState() {
  const urlParams = new URLSearchParams(window.location.search);
  let saved = {};

  try {
    const rawRadar = sessionStorage.getItem(STORAGE_KEY_RADAR);
    const rawGlobal = sessionStorage.getItem(STORAGE_KEY_GLOBAL);
    saved = rawRadar ? JSON.parse(rawRadar) : (rawGlobal ? JSON.parse(rawGlobal) : {});
  } catch (_) {}

  const paramYear = urlParams.get('year');
  const paramRegion = urlParams.get('region');

  radarState.year = paramYear || saved.year || '2026';
  radarState.month = saved.month || 'all';
  radarState.departamento = saved.departamento || 'all';
  radarState.provincia = saved.provincia || 'all';
  radarState.distrito = saved.distrito || 'all';
  radarState.tipo_proceso = saved.tipo_proceso || 'all';

  const defaultDept = (radarState.departamento && radarState.departamento !== 'all')
    ? radarState.departamento
    : (paramRegion && paramRegion !== 'all' ? paramRegion : (saved.selectedRegion && saved.selectedRegion !== 'all' ? saved.selectedRegion : 'LIMA'));

  radarState.selectedRegion = defaultDept;
  radarState.expandedDept = saved.expandedDept || defaultDept;
  radarState.selectedProvincia = (radarState.provincia !== 'all') ? radarState.provincia : (saved.selectedProvincia || null);
  radarState.selectedDistrito = (radarState.distrito !== 'all') ? radarState.distrito : (saved.selectedDistrito || null);
  radarState.mapViewLevel = saved.mapViewLevel || 'peru';

  // Sincronizar selectores del DOM
  const yearEl = document.getElementById('filterYear');
  if (yearEl) yearEl.value = String(radarState.year);

  const monthEl = document.getElementById('filterMonth');
  if (monthEl) monthEl.value = String(radarState.month);

  const procEl = document.getElementById('filterTipoProceso');
  if (procEl) procEl.value = String(radarState.tipo_proceso);

  const deptoEl = document.getElementById('filterDepartamento');
  const provEl = document.getElementById('filterProvincia');
  const distEl = document.getElementById('filterDistrito');

  if (deptoEl && radarState.departamento !== 'all') {
    deptoEl.value = radarState.departamento;
    if (provEl) {
      provEl.disabled = false;
      try {
        const resProv = await fetch(`/api/v1/filtros/provincias?departamento=${encodeURIComponent(radarState.departamento)}`);
        if (resProv.ok) {
          const provincias = await resProv.json();
          populateSelect('filterProvincia', provincias, 'TODAS');
          if (radarState.provincia !== 'all') {
            provEl.value = radarState.provincia;
            if (distEl) {
              distEl.disabled = false;
              const resDist = await fetch(`/api/v1/filtros/distritos?departamento=${encodeURIComponent(radarState.departamento)}&provincia=${encodeURIComponent(radarState.provincia)}`);
              if (resDist.ok) {
                const distritos = await resDist.json();
                populateSelect('filterDistrito', distritos, 'TODOS');
                if (radarState.distrito !== 'all') {
                  distEl.value = radarState.distrito;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error restaurando cascada geográfica:', e);
      }
    }
  }

  syncHeaderNavLinks();
}

/**
 * Persiste el estado actual en sessionStorage y sincroniza la URL
 */
function persistRadarState() {
  try {
    sessionStorage.setItem(STORAGE_KEY_RADAR, JSON.stringify(radarState));
    sessionStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify({
      year: radarState.year === 'all' ? '2026' : radarState.year,
      month: radarState.month,
      departamento: radarState.departamento,
      provincia: radarState.provincia,
      distrito: radarState.distrito,
      tipo_proceso: radarState.tipo_proceso
    }));
  } catch (_) {}

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('year', radarState.year);
  if (radarState.selectedRegion && radarState.selectedRegion !== 'all') {
    currentUrl.searchParams.set('region', radarState.selectedRegion);
  } else {
    currentUrl.searchParams.delete('region');
  }
  window.history.replaceState({}, '', currentUrl.toString());

  syncHeaderNavLinks();
}

function syncHeaderNavLinks() {
  const yearForGeneral = radarState.year === 'all' ? '2026' : radarState.year;
  ['headerLogoLink', 'headerBrandLink', 'navLinkGeneral'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('href', `/index.html?year=${encodeURIComponent(yearForGeneral)}`);
  });

  const navContratista = document.getElementById('navLinkContratista');
  if (navContratista) {
    navContratista.setAttribute('href', `/contratista.html?year=${encodeURIComponent(radarState.year)}`);
  }
}

/**
 * Obtiene el Departamento actualmente activo (por defecto LIMA)
 */
function getActiveDepartment() {
  if (radarState.departamento && radarState.departamento !== 'all') {
    return radarState.departamento;
  }
  if (radarState.selectedRegion && radarState.selectedRegion !== 'all') {
    return radarState.selectedRegion;
  }
  return 'LIMA';
}

/**
 * Obtiene la Provincia actualmente activa (del filtro superior o de clic en Mapa/Dona)
 */
function getActiveProvincia() {
  if (radarState.provincia && radarState.provincia !== 'all') {
    return radarState.provincia;
  }
  return radarState.selectedProvincia || null;
}

/**
 * Obtiene la Provincia a mostrar cuando el Mapa se encuentra en Nivel 3 ('provincia'):
 * Si el usuario aún no eligió provincia explícita, toma la provincia principal del departamento (ej. LIMA en LIMA).
 */
function getEffectiveMapProvincia() {
  const explicitProv = getActiveProvincia();
  if (explicitProv) return explicitProv;
  const activeDept = getActiveDepartment();
  if (activeDept === 'CALLAO') return 'PROV. CONST. DEL CALLAO';
  if (cachedProvinciasDepto && cachedProvinciasDepto.length > 0) {
    return cachedProvinciasDepto[0].region;
  }
  return activeDept;
}

/**
 * Obtiene el Distrito actualmente activo
 */
function getActiveDistrito() {
  if (radarState.distrito && radarState.distrito !== 'all') {
    return radarState.distrito;
  }
  return radarState.selectedDistrito || null;
}

/**
 * Cascada Nivel 1: Cambio de Departamento en la barra superior de filtros
 */
window.onRadarDepartamentoChange = async function() {
  const deptoEl = document.getElementById('filterDepartamento');
  const provEl = document.getElementById('filterProvincia');
  const distEl = document.getElementById('filterDistrito');

  if (!deptoEl || !provEl || !distEl) return;

  const depto = deptoEl.value;
  provEl.innerHTML = '<option value="all" selected>TODAS</option>';
  distEl.innerHTML = '<option value="all" selected>TODOS</option>';

  if (depto === 'all' || !depto) {
    provEl.disabled = true;
    distEl.disabled = true;
    radarState.departamento = 'all';
    radarState.selectedRegion = 'LIMA';
    radarState.expandedDept = 'LIMA';
    radarState.mapViewLevel = 'peru';
  } else {
    provEl.disabled = false;
    distEl.disabled = true;
    radarState.departamento = depto;
    radarState.selectedRegion = depto;
    radarState.expandedDept = depto;
    radarState.mapViewLevel = 'departamento';
    try {
      const res = await fetch(`/api/v1/filtros/provincias?departamento=${encodeURIComponent(depto)}`);
      if (res.ok) {
        const provincias = await res.json();
        populateSelect('filterProvincia', provincias, 'TODAS');
      }
    } catch (e) {
      console.error('Error cargando provincias:', e);
    }
  }

  radarState.provincia = 'all';
  radarState.distrito = 'all';
  radarState.selectedProvincia = null;
  radarState.selectedDistrito = null;

  await onRadarFilterChange();
};

/**
 * Cascada Nivel 2: Cambio de Provincia en la barra superior de filtros
 */
window.onRadarProvinciaChange = async function() {
  const deptoEl = document.getElementById('filterDepartamento');
  const provEl = document.getElementById('filterProvincia');
  const distEl = document.getElementById('filterDistrito');

  if (!deptoEl || !provEl || !distEl) return;

  const depto = deptoEl.value;
  const prov = provEl.value;
  distEl.innerHTML = '<option value="all" selected>TODOS</option>';

  if (prov === 'all' || !prov) {
    distEl.disabled = true;
    radarState.provincia = 'all';
    radarState.selectedProvincia = null;
    radarState.mapViewLevel = 'departamento';
  } else {
    distEl.disabled = false;
    radarState.provincia = prov;
    radarState.selectedProvincia = prov;
    radarState.mapViewLevel = 'provincia';
    try {
      const res = await fetch(`/api/v1/filtros/distritos?departamento=${encodeURIComponent(depto)}&provincia=${encodeURIComponent(prov)}`);
      if (res.ok) {
        const distritos = await res.json();
        populateSelect('filterDistrito', distritos, 'TODOS');
      }
    } catch (e) {
      console.error('Error cargando distritos:', e);
    }
  }

  radarState.distrito = 'all';
  radarState.selectedDistrito = null;

  await onRadarFilterChange();
};

/**
 * Cambio general de filtros superiores
 */
window.onRadarFilterChange = async function() {
  radarState.year = document.getElementById('filterYear')?.value || '2026';
  radarState.month = document.getElementById('filterMonth')?.value || 'all';
  radarState.departamento = document.getElementById('filterDepartamento')?.value || 'all';
  radarState.provincia = document.getElementById('filterProvincia')?.value || 'all';
  radarState.distrito = document.getElementById('filterDistrito')?.value || 'all';
  radarState.tipo_proceso = document.getElementById('filterTipoProceso')?.value || 'all';

  if (radarState.departamento !== 'all') {
    radarState.selectedRegion = radarState.departamento;
    radarState.expandedDept = radarState.departamento;
  }
  if (radarState.provincia !== 'all') {
    radarState.selectedProvincia = radarState.provincia;
    radarState.mapViewLevel = 'provincia';
  }
  if (radarState.distrito !== 'all') {
    radarState.selectedDistrito = radarState.distrito;
    radarState.mapViewLevel = 'provincia';
  }

  persistRadarState();
  await fetchAllRadarViews();
};

/**
 * Restablece todos los filtros del Radar a su estado inicial (2026, LIMA por defecto)
 */
window.resetRadarFilters = async function() {
  const yearEl = document.getElementById('filterYear');
  if (yearEl) yearEl.value = '2026';

  const monthEl = document.getElementById('filterMonth');
  if (monthEl) monthEl.value = 'all';

  const deptoEl = document.getElementById('filterDepartamento');
  if (deptoEl) deptoEl.value = 'all';

  const provEl = document.getElementById('filterProvincia');
  if (provEl) {
    provEl.innerHTML = '<option value="all" selected>TODAS</option>';
    provEl.disabled = true;
  }

  const distEl = document.getElementById('filterDistrito');
  if (distEl) {
    distEl.innerHTML = '<option value="all" selected>TODOS</option>';
    distEl.disabled = true;
  }

  const procEl = document.getElementById('filterTipoProceso');
  if (procEl) procEl.value = 'all';

  radarState = {
    year: '2026',
    month: 'all',
    departamento: 'all',
    provincia: 'all',
    distrito: 'all',
    tipo_proceso: 'all',
    selectedRegion: 'LIMA',
    expandedDept: 'LIMA',
    selectedProvincia: null,
    selectedDistrito: null,
    mapViewLevel: 'peru'
  };

  persistRadarState();
  await fetchAllRadarViews();
};

/**
 * Construye parámetros temporales y de modalidad base
 */
function buildBaseTemporalParams() {
  const params = new URLSearchParams();
  if (radarState.year) params.append('year', radarState.year);
  if (radarState.month && radarState.month !== 'all') params.append('month', radarState.month);
  if (radarState.tipo_proceso && radarState.tipo_proceso !== 'all') params.append('tipo_proceso', radarState.tipo_proceso);
  return params;
}

/**
 * Orquesta la carga completa de datos para el Mapa Multinivel, el Ranking, la Dona y la Tabla
 */
async function fetchAllRadarViews() {
  renderLoadingPanorama();

  try {
    // 1. Panorama Nacional de Departamentos
    const mapParams = buildBaseTemporalParams();
    if (radarState.departamento && radarState.departamento !== 'all') {
      mapParams.append('departamento', radarState.departamento);
    }
    mapParams.append('group_by', 'departamento');

    const resDepts = await fetch(`/api/v1/postor-unico/regiones?${mapParams.toString()}`);
    if (resDepts.ok) {
      const jsonDepts = await resDepts.json();
      if (jsonDepts.success && jsonDepts.data) {
        cachedPanoramaDepts = jsonDepts.data;
        const deptsList = jsonDepts.data.regiones || [];

        const activeDept = getActiveDepartment();
        const existsActive = deptsList.some(r => r.region === activeDept);
        if (!existsActive && deptsList.length > 0) {
          const hasLima = deptsList.some(r => r.region === 'LIMA');
          const fallbackDept = hasLima ? 'LIMA' : deptsList[0].region;
          radarState.selectedRegion = fallbackDept;
          radarState.expandedDept = fallbackDept;
          persistRadarState();
        }
      }
    }

    // 2. Cargar Provincias del Departamento activo y Distritos del Departamento expandido
    const activeDept = getActiveDepartment();
    await Promise.all([
      fetchProvinciasOfActiveDept(activeDept),
      fetchExpandedDepartmentDistritos(),
      ensureGeoProvinciasLoaded(),
      ensureGeoDistritosLoaded(activeDept)
    ]);

    // 3. Cargar Distritos de la Provincia efectiva (para Mapa Nivel 3 y/o Dona en modo Provincia)
    const effectiveProv = getEffectiveMapProvincia();
    await Promise.all([
      fetchDistritosOfProvincia(activeDept, effectiveProv),
      fetchEmpresasByActiveScope()
    ]);

    // 4. Actualizar Dona (siempre un nivel inferior: si está en Departamento -> Provincias; si está en Provincia -> Distritos)
    updateDonutView();

    // 5. Renderizar KPIs y Mapa Multinivel + Ranking
    if (cachedPanoramaDepts) {
      renderRadarKpis(cachedPanoramaDepts.kpis);
      await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
    }
  } catch (e) {
    console.error('Error al cargar vistas del Radar de Postor Único:', e);
  }
}

/**
 * Consulta las Provincias del departamento activo
 */
async function fetchProvinciasOfActiveDept(deptName) {
  if (!deptName || deptName === 'all') {
    cachedProvinciasDepto = [];
    return;
  }
  const params = buildBaseTemporalParams();
  params.append('departamento', deptName);
  params.append('group_by', 'provincia');

  try {
    const res = await fetch(`/api/v1/postor-unico/regiones?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      cachedProvinciasDepto = json.data?.regiones || [];
    }
  } catch (e) {
    console.error('Error cargando provincias del departamento activo:', e);
    cachedProvinciasDepto = [];
  }
}

/**
 * Consulta los Distritos de una Provincia específica dentro del Departamento activo
 */
async function fetchDistritosOfProvincia(deptName, provName) {
  if (!deptName || !provName) {
    cachedDistritosProv = [];
    return;
  }
  const params = buildBaseTemporalParams();
  params.append('departamento', deptName);
  params.append('provincia', provName);
  params.append('group_by', 'distrito');

  try {
    const res = await fetch(`/api/v1/postor-unico/regiones?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      cachedDistritosProv = json.data?.regiones || [];
    }
  } catch (e) {
    console.error('Error cargando distritos de la provincia activa:', e);
    cachedDistritosProv = [];
  }
}

/**
 * Consulta todos los Distritos del departamento expandido en el Ranking Térmico
 */
async function fetchExpandedDepartmentDistritos() {
  if (!radarState.expandedDept || radarState.expandedDept === 'all') {
    cachedExpandedDistritos = [];
    return;
  }

  const params = buildBaseTemporalParams();
  params.append('departamento', radarState.expandedDept);
  params.append('group_by', 'distrito');

  try {
    const res = await fetch(`/api/v1/postor-unico/regiones?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      cachedExpandedDistritos = json.data?.regiones || [];
    }
  } catch (e) {
    console.error('Error cargando distritos para acordeón del ranking:', e);
    cachedExpandedDistritos = [];
  }
}

/**
 * Sincroniza la Gráfica de Dona derecha para mostrar SIEMPRE UN NIVEL INFERIOR:
 * - Si no hay Provincia seleccionada (nivel Departamento) -> muestra las PROVINCIAS del departamento activo.
 * - Si hay Provincia seleccionada (nivel Provincia) -> muestra los DISTRITOS de esa provincia.
 */
function updateDonutView() {
  const activeDept = getActiveDepartment();
  const activeProv = getActiveProvincia();

  if (activeProv) {
    cachedDonutLevelLabel = 'DISTRITO';
    cachedDonutSubregions = cachedDistritosProv;
    renderConcentrationDonut(cachedDonutSubregions, activeDept, activeProv, 'DISTRITO');
  } else {
    cachedDonutLevelLabel = 'PROVINCIA';
    cachedDonutSubregions = cachedProvinciasDepto;
    renderConcentrationDonut(cachedDonutSubregions, activeDept, null, 'PROVINCIA');
  }
}

function renderLoadingPanorama() {
  ['valPuContratos', 'valPuTasa', 'valPuMonto', 'valPuRegionCritica'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="inline-block animate-pulse text-stone-400">---</span>';
  });

  const heatEl = document.getElementById('heatmapGridContainer');
  if (heatEl && !cachedPanoramaDepts) {
    heatEl.innerHTML = '<div class="p-8 text-center text-stone-400 font-mono text-xs"><span class="inline-block animate-spin mr-2">☯</span> Renderizando mapa térmico del Perú...</div>';
  }

  const donutEl = document.getElementById('puDonutContainer');
  if (donutEl && cachedDonutSubregions.length === 0) {
    donutEl.innerHTML = '<div class="p-8 text-center text-stone-400 font-mono text-xs"><span class="inline-block animate-spin mr-2">☯</span> Calculando participación sub-regional...</div>';
  }
}

/**
 * Renderiza los 4 KPIs superiores
 */
function renderRadarKpis(kpis) {
  if (!kpis) return;

  const activeDept = getActiveDepartment();
  const activeProv = getActiveProvincia();
  const activeDist = getActiveDistrito();

  const nivelActual = activeDist ? 'DISTRITO' : activeProv ? 'PROVINCIA' : 'DEPARTAMENTO';

  const badgeHeader = document.getElementById('badgeNivelGeoHeader');
  if (badgeHeader) badgeHeader.textContent = nivelActual;

  const badgeHeatmap = document.getElementById('badgeHeatmapNivel');
  if (badgeHeatmap) {
    badgeHeatmap.textContent = radarState.mapViewLevel === 'provincia'
      ? `MAPA DISTRITAL: ${getEffectiveMapProvincia()}`
      : radarState.mapViewLevel === 'departamento'
        ? `MAPA PROVINCIAL: ${activeDept}`
        : `MAPA PERÚ • ACTIVO: ${activeDept}`;
  }

  const lblKpiNivel = document.getElementById('lblKpiNivelGeo');
  if (lblKpiNivel) lblKpiNivel.textContent = 'DEPARTAMENTO';

  const elContratos = document.getElementById('valPuContratos');
  const subContratos = document.getElementById('subPuContratos');
  if (elContratos) {
    elContratos.textContent = Number(kpis.total_contratos_postor_unico || 0).toLocaleString('es-PE');
  }
  if (subContratos) {
    subContratos.textContent = `De ${Number(kpis.total_contratos_evaluados || 0).toLocaleString('es-PE')} contratos evaluados en el ámbito`;
  }

  const elTasa = document.getElementById('valPuTasa');
  const barTasa = document.getElementById('barPuTasa');
  const pct = Number(kpis.tasa_postor_unico_pct || 0);
  if (elTasa) elTasa.textContent = `${pct.toFixed(2)}%`;
  if (barTasa) barTasa.style.width = `${Math.min(pct, 100)}%`;

  const elMonto = document.getElementById('valPuMonto');
  if (elMonto) {
    elMonto.textContent = kpis.monto_postor_unico_formateado || `S/ ${Number(kpis.monto_postor_unico_soles || 0).toLocaleString('es-PE')}`;
  }

  const elRegion = document.getElementById('valPuRegionCritica');
  if (elRegion) {
    elRegion.textContent = kpis.region_critica || '--';
  }
}

/**
 * Calcula el color térmico de un territorio según su volumen y tasa de Postor Único
 */
function getPeruHeatColor(contratosPU, maxContratosPU, tasaPU, isDark) {
  if (!contratosPU || contratosPU <= 0) {
    return isDark ? '#242127' : '#E7DEC8';
  }
  const ratioVol = Math.min(contratosPU / Math.max(maxContratosPU, 1), 1);
  const ratioTasa = Math.min(tasaPU / 50, 1);
  const heatScore = ratioVol * 0.72 + ratioTasa * 0.28;

  if (heatScore >= 0.70 || contratosPU === maxContratosPU) {
    return '#7A1215'; // Rojo Crítico Imperial (Máximo calor)
  }
  if (heatScore >= 0.42) {
    return '#DC2626'; // Rojo Intenso
  }
  if (heatScore >= 0.20) {
    return '#EA580C'; // Naranja Térmico Medio-Alto
  }
  return '#DFBD76'; // Oro / Ámbar Suave (Calor Bajo)
}

/**
 * Cambia el nivel de visualización del Mapa de Calor ('peru' | 'departamento' | 'provincia')
 */
window.setMapViewLevel = async function(level) {
  radarState.mapViewLevel = level;
  const activeDept = getActiveDepartment();

  if (level === 'provincia') {
    const targetProv = getEffectiveMapProvincia();
    if (!radarState.selectedProvincia && radarState.provincia === 'all') {
      radarState.selectedProvincia = targetProv;
    }
    await fetchDistritosOfProvincia(activeDept, getEffectiveMapProvincia());
  } else if (level === 'departamento') {
    radarState.selectedProvincia = null;
    radarState.selectedDistrito = null;
  } else if (level === 'peru') {
    radarState.selectedProvincia = null;
    radarState.selectedDistrito = null;
  }

  persistRadarState();
  updateDonutView();
  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
  await fetchEmpresasByActiveScope();
};

/**
 * Construye el SVG según el nivel de zoom activo:
 * - 'peru': Los 25 Departamentos del Perú
 * - 'departamento': Las Provincias del Departamento activo (ej. las 10 provincias de LIMA)
 * - 'provincia': Los Distritos de la Provincia activa (ej. los 42 distritos de la Provincia de LIMA)
 */
async function buildActiveMapSvg(regionesDepts, isDark) {
  const activeDept = getActiveDepartment();
  const effectiveProv = getEffectiveMapProvincia();
  const activeDist = getActiveDistrito();
  const level = radarState.mapViewLevel || 'peru';

  // NIVEL 2: MAPA DE PROVINCIAS DEL DEPARTAMENTO ACTIVO
  if (level === 'departamento') {
    const allProvsGeo = await ensureGeoProvinciasLoaded();
    const deptKey = normGeoKey(activeDept);
    const provShapes = allProvsGeo[deptKey] || [];

    if (provShapes.length > 0) {
      const provDataMap = new Map();
      let totalDeptPU = 0;
      cachedProvinciasDepto.forEach(p => {
        const k = normGeoKey(p.region);
        provDataMap.set(k, p);
        totalDeptPU += Number(p.contratos_postor_unico || 0);
      });
      const maxProvPU = Math.max(...cachedProvinciasDepto.map(p => Number(p.contratos_postor_unico || 0)), 1);

      const pathsHtml = provShapes.map(shape => {
        const pData = provDataMap.get(shape.name);
        const cPU = pData ? Number(pData.contratos_postor_unico || 0) : 0;
        const totalReg = pData ? Number(pData.total_contratos_region || 0) : 0;
        const tasa = pData ? Number(pData.tasa_postor_unico_region_pct || 0) : 0;
        const shareOfDeptPct = totalDeptPU > 0 ? ((cPU * 100) / totalDeptPU) : 0;
        const montoMM = pData
          ? (Number(pData.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })
          : '0.00';
        const empresasCount = pData ? Number(pData.empresas_beneficiarias_region || 0) : 0;
        const rawProvName = pData ? pData.region : shape.name;

        const isSelected = normGeoKey(getActiveProvincia() || '') === shape.name;
        const fillColor = getPeruHeatColor(cPU, maxProvPU, tasa, isDark);
        const strokeColor = isSelected ? '#FFF8E7' : (isDark ? '#111116' : '#FAF7F2');
        const strokeWidth = isSelected ? '2.5' : '1.3';
        const escapedProv = String(rawProvName).replace(/'/g, "\\'");

        return `
          <g
            class="peru-dept-group"
            onclick="onMapProvinciaPolygonClick('${escapedProv}')"
            data-dept="PROV. ${rawProvName} (${activeDept})"
            data-cpu="${cPU}"
            data-total="${totalReg}"
            data-tasa="${tasa.toFixed(1)}"
            data-monto="S/ ${montoMM} MM (${shareOfDeptPct.toFixed(1)}% del Dpto.)"
            data-empresas="${empresasCount}"
          >
            <path
              d="${shape.d}"
              fill="${fillColor}"
              stroke="${strokeColor}"
              stroke-width="${strokeWidth}"
              class="peru-dept-path ${isSelected ? 'is-selected' : ''}"
            />
            <g pointer-events="none">
              <rect
                x="${shape.cx - 32}"
                y="${shape.cy - 11}"
                width="64"
                height="22"
                rx="3"
                fill="${cPU > 0 ? 'rgba(17, 17, 22, 0.84)' : 'rgba(17, 17, 22, 0.55)'}"
                stroke="${cPU === maxProvPU && cPU > 0 ? '#C5A059' : 'rgba(255,255,255,0.25)'}"
                stroke-width="0.9"
              />
              <text
                x="${shape.cx}"
                y="${shape.cy - 1.5}"
                text-anchor="middle"
                fill="#FFFFFF"
                font-family="Cinzel, serif"
                font-size="7.5"
                font-weight="800"
              >${shape.name.slice(0, 11)}</text>
              <text
                x="${shape.cx}"
                y="${shape.cy + 8}"
                text-anchor="middle"
                fill="${cPU > 0 ? '#DFBD76' : '#A8A29E'}"
                font-family="JetBrains Mono, monospace"
                font-size="7.5"
                font-weight="700"
              >${cPU} PU (${shareOfDeptPct.toFixed(0)}%)</text>
            </g>
          </g>
        `;
      }).join('');

      const topProv = cachedProvinciasDepto[0] || { region: activeDept, contratos_postor_unico: 0, tasa_postor_unico_region_pct: 0, monto_postor_unico_soles: 0, empresas_beneficiarias_region: 0 };
      const topProvShare = totalDeptPU > 0 ? ((Number(topProv.contratos_postor_unico || 0) * 100) / totalDeptPU).toFixed(1) : '0.0';
      const provsWithPU = cachedProvinciasDepto.filter(p => Number(p.contratos_postor_unico || 0) > 0).length;

      return {
        viewBox: '0 0 500 580',
        svgInner: pathsHtml,
        defaultTitle: `DPTO. ${activeDept} ▸ PROV. ${topProv.region}`,
        defaultMain: `${topProv.contratos_postor_unico} contr. PU (${topProvShare}% del Dpto. ${activeDept})`,
        defaultSub: `${provsWithPU} de ${provShapes.length} provincias con Postor Único • Click en una provincia para ver el mapa de sus distritos`,
        footerHint: `🖱️ Click en una provincia (ej. ${topProv.region}) para abrir el Mapa de Calor de sus Distritos`
      };
    }
  }

  // NIVEL 3: MAPA DE DISTRITOS DE LA PROVINCIA ACTIVA
  if (level === 'provincia') {
    const deptDistGeo = await ensureGeoDistritosLoaded(activeDept);
    const provKey = normGeoKey(effectiveProv);
    const distShapes = deptDistGeo[provKey] || deptDistGeo['__ALL__'] || [];

    if (distShapes.length > 0) {
      const distDataMap = new Map();
      let totalProvPU = 0;
      cachedDistritosProv.forEach(d => {
        const k = normGeoKey(d.region);
        distDataMap.set(k, d);
        totalProvPU += Number(d.contratos_postor_unico || 0);
      });
      const maxDistPU = Math.max(...cachedDistritosProv.map(d => Number(d.contratos_postor_unico || 0)), 1);
      const distsWithPUCount = cachedDistritosProv.filter(d => Number(d.contratos_postor_unico || 0) > 0).length;
      const pctDistsWithPU = distShapes.length > 0 ? ((distsWithPUCount * 100) / distShapes.length).toFixed(1) : '0.0';

      // Calcular qué % del departamento representa esta provincia
      const totalDeptPU = cachedProvinciasDepto.reduce((acc, p) => acc + Number(p.contratos_postor_unico || 0), 0) || 1;
      const provShareInDept = ((totalProvPU * 100) / totalDeptPU).toFixed(1);

      const pathsHtml = distShapes.map(shape => {
        const dData = distDataMap.get(shape.name);
        const cPU = dData ? Number(dData.contratos_postor_unico || 0) : 0;
        const totalReg = dData ? Number(dData.total_contratos_region || 0) : 0;
        const tasa = dData ? Number(dData.tasa_postor_unico_region_pct || 0) : 0;
        const shareOfProvPct = totalProvPU > 0 ? ((cPU * 100) / totalProvPU) : 0;
        const montoMM = dData
          ? (Number(dData.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })
          : '0.00';
        const empresasCount = dData ? Number(dData.empresas_beneficiarias_region || 0) : 0;
        const rawDistName = dData ? dData.region : shape.name;

        const isSelected = normGeoKey(activeDist || '') === shape.name;
        const fillColor = getPeruHeatColor(cPU, maxDistPU, tasa, isDark);
        const strokeColor = isSelected ? '#FFF8E7' : (isDark ? '#111116' : '#FAF7F2');
        const strokeWidth = isSelected ? '2.4' : '0.9';
        const escapedDist = String(rawDistName).replace(/'/g, "\\'");

        return `
          <g
            class="peru-dept-group"
            onclick="onMapDistritoPolygonClick('${escapedDist}')"
            data-dept="DISTRITO: ${rawDistName}"
            data-cpu="${cPU}"
            data-total="${totalReg}"
            data-tasa="${tasa.toFixed(1)}"
            data-monto="S/ ${montoMM} MM (${shareOfProvPct.toFixed(1)}% de la Prov.)"
            data-empresas="${empresasCount}"
          >
            <path
              d="${shape.d}"
              fill="${fillColor}"
              stroke="${strokeColor}"
              stroke-width="${strokeWidth}"
              class="peru-dept-path ${isSelected ? 'is-selected' : ''}"
            />
            ${cPU > 0 ? `
              <g pointer-events="none">
                <circle
                  cx="${shape.cx}"
                  cy="${shape.cy}"
                  r="8.5"
                  fill="${isSelected ? '#9E1B1E' : 'rgba(17, 17, 22, 0.85)'}"
                  stroke="${isSelected ? '#FFF8E7' : '#C5A059'}"
                  stroke-width="0.9"
                />
                <text
                  x="${shape.cx}"
                  y="${shape.cy + 2.8}"
                  text-anchor="middle"
                  fill="#FFFFFF"
                  font-family="JetBrains Mono, monospace"
                  font-size="7.5"
                  font-weight="700"
                >${cPU}</text>
              </g>
            ` : ''}
          </g>
        `;
      }).join('');

      const topDist = cachedDistritosProv.find(d => d.region === activeDist) || cachedDistritosProv[0] || { region: effectiveProv, contratos_postor_unico: 0, tasa_postor_unico_region_pct: 0 };

      return {
        viewBox: '0 0 500 580',
        svgInner: pathsHtml,
        defaultTitle: activeDist ? `DISTRITO: ${activeDist}` : `PROV. ${effectiveProv} (MAPA DISTRITAL)`,
        defaultMain: `Prov. ${effectiveProv}: ${provShareInDept}% de PU del Dpto. • ${distsWithPUCount} de ${distShapes.length} distritos (${pctDistsWithPU}%) con Postor Único`,
        defaultSub: `Distrito foco: ${topDist.region} (${topDist.contratos_postor_unico} contr. PU) • Click en cualquier distrito para filtrar empresas`,
        footerHint: `🖱️ Click en un distrito del mapa para filtrar sus empresas adjudicadas`
      };
    }
  }

  // NIVEL 1 (POR DEFECTO): MAPA NACIONAL DEL PERÚ (25 DEPARTAMENTOS)
  const maxContratosPU = Math.max(...regionesDepts.map(r => Number(r.contratos_postor_unico || 0)), 1);
  const regionMap = new Map();
  regionesDepts.forEach(r => {
    regionMap.set(String(r.region || '').trim().toUpperCase(), r);
  });

  const peruDepts = window.PERU_DEPARTMENTS_SVG || [];
  const svgPathsHtml = peruDepts.map(dept => {
    const data = regionMap.get(dept.name);
    const cPU = data ? Number(data.contratos_postor_unico || 0) : 0;
    const totalReg = data ? Number(data.total_contratos_region || 0) : 0;
    const tasa = data ? Number(data.tasa_postor_unico_region_pct || 0) : 0;
    const montoMM = data
      ? (Number(data.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })
      : '0.00';
    const empresasCount = data ? Number(data.empresas_beneficiarias_region || 0) : 0;

    const isSelected = activeDept === dept.name;
    const fillColor = getPeruHeatColor(cPU, maxContratosPU, tasa, isDark);
    const strokeColor = isSelected ? '#FFF8E7' : (isDark ? '#111116' : '#FAF7F2');
    const strokeWidth = isSelected ? '2.5' : '1.1';
    const escapedName = dept.name.replace(/'/g, "\\'");

    return `
      <g
        class="peru-dept-group"
        onclick="onMapDepartmentPolygonClick('${escapedName}')"
        data-dept="${dept.name}"
        data-cpu="${cPU}"
        data-total="${totalReg}"
        data-tasa="${tasa.toFixed(1)}"
        data-monto="S/ ${montoMM} MM"
        data-empresas="${empresasCount}"
      >
        <path
          d="${dept.d}"
          fill="${fillColor}"
          stroke="${strokeColor}"
          stroke-width="${strokeWidth}"
          class="peru-dept-path ${isSelected ? 'is-selected' : ''}"
        />
        ${cPU > 0 && dept.name !== 'CALLAO' ? `
          <g pointer-events="none">
            <rect
              x="${dept.cx - 13}"
              y="${dept.cy - 8}"
              width="26"
              height="15"
              rx="3"
              fill="${isSelected ? '#9E1B1E' : 'rgba(17, 17, 22, 0.78)'}"
              stroke="${isSelected ? '#C5A059' : 'rgba(255,255,255,0.35)'}"
              stroke-width="0.8"
            />
            <text
              x="${dept.cx}"
              y="${dept.cy + 2.5}"
              text-anchor="middle"
              fill="#FFFFFF"
              font-family="JetBrains Mono, monospace"
              font-size="8.5"
              font-weight="700"
            >${cPU}</text>
          </g>
        ` : ''}
      </g>
    `;
  }).join('');

  const callaoData = regionMap.get('CALLAO');
  const callaoPU = callaoData ? Number(callaoData.contratos_postor_unico || 0) : 0;
  const callaoTasa = callaoData ? Number(callaoData.tasa_postor_unico_region_pct || 0) : 0;
  const callaoMonto = callaoData
    ? (Number(callaoData.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })
    : '0.00';
  const callaoEmp = callaoData ? Number(callaoData.empresas_beneficiarias_region || 0) : 0;
  const isCallaoSelected = activeDept === 'CALLAO';
  const callaoColor = getPeruHeatColor(callaoPU, maxContratosPU, callaoTasa, isDark);

  const callaoCalloutSvg = `
    <g
      class="cursor-pointer peru-dept-group"
      onclick="onMapDepartmentPolygonClick('CALLAO')"
      data-dept="CALLAO"
      data-cpu="${callaoPU}"
      data-total="${callaoData ? callaoData.total_contratos_region : 0}"
      data-tasa="${callaoTasa.toFixed(1)}"
      data-monto="S/ ${callaoMonto} MM"
      data-empresas="${callaoEmp}"
    >
      <line x1="175" y1="422" x2="96" y2="422" stroke="#9E1B1E" stroke-width="1.2" stroke-dasharray="3,2" />
      <circle cx="175" cy="422" r="3" fill="#9E1B1E" />
      <rect
        x="14"
        y="404"
        width="82"
        height="34"
        rx="4"
        fill="${callaoColor}"
        stroke="${isCallaoSelected ? '#FFF8E7' : '#9E1B1E'}"
        stroke-width="${isCallaoSelected ? '2.2' : '1.2'}"
      />
      <text x="55" y="418" text-anchor="middle" fill="${callaoPU > 0 ? '#FFFFFF' : '#7F786B'}" font-family="Cinzel, serif" font-size="8.5" font-weight="800">CALLAO</text>
      <text x="55" y="431" text-anchor="middle" fill="${callaoPU > 0 ? '#FFF8E7' : '#7F786B'}" font-family="JetBrains Mono, monospace" font-size="8.5" font-weight="700">${callaoPU} PU (${callaoTasa.toFixed(0)}%)</text>
    </g>
  `;

  const selectedObj = regionesDepts.find(r => r.region === activeDept) || regionesDepts[0];
  const selMontoMM = (Number(selectedObj.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 });

  return {
    viewBox: '0 0 500 680',
    svgInner: svgPathsHtml + callaoCalloutSvg,
    defaultTitle: selectedObj.region,
    defaultMain: `${selectedObj.contratos_postor_unico} contr. PU (${Number(selectedObj.tasa_postor_unico_region_pct || 0).toFixed(1)}%)`,
    defaultSub: `S/ ${selMontoMM} MM • ${selectedObj.empresas_beneficiarias_region} empresas reales • Click en el departamento para expandir sus provincias`,
    footerHint: `🖱️ Click en cualquier departamento del mapa para expandir el mapa de sus Provincias y Distritos`
  };
}

/**
 * Renderiza el Mapa de Calor Multinivel (Perú -> Provincias del Dpto -> Distritos de la Provincia)
 * junto con el Ranking Térmico y su acordeón de Distritos
 */
async function renderHeatmapGrid(regiones) {
  const container = document.getElementById('heatmapGridContainer');
  if (!container) return;

  if (!regiones || regiones.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-stone-400 font-mono text-xs">
        Sin contratos con postor único bajo los filtros seleccionados.
      </div>
    `;
    return;
  }

  const isDark = document.documentElement.classList.contains('dark');
  const maxContratosPU = Math.max(...regiones.map(r => Number(r.contratos_postor_unico || 0)), 1);
  const activeDept = getActiveDepartment();
  const effectiveProv = getEffectiveMapProvincia();
  const activeDist = getActiveDistrito();
  const level = radarState.mapViewLevel || 'peru';

  const mapConfig = await buildActiveMapSvg(regiones, isDark);

  // Ranking Térmico de Departamentos con Acordeón de Distritos al hacer clic
  const listRowsHtml = regiones.map((r, idx) => {
    const tasa = Number(r.tasa_postor_unico_region_pct || 0);
    const cPU = Number(r.contratos_postor_unico || 0);
    const isSelected = activeDept === r.region;
    const isExpanded = radarState.expandedDept === r.region;
    const montoMM = (Number(r.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 });
    const barPct = Math.round((cPU / maxContratosPU) * 100);
    const heatHex = getPeruHeatColor(cPU, maxContratosPU, tasa, isDark);
    const escapedRegion = String(r.region).replace(/'/g, "\\'");

    let distritosAccordionHtml = '';
    if (isExpanded) {
      if (cachedExpandedDistritos.length === 0) {
        distritosAccordionHtml = `
          <div class="mt-2 pt-2 border-t border-washi-border/60 dark:border-sumi-border/60 text-[10px] font-mono text-stone-400 text-center py-2">
            Sin distritos desagregados para ${r.region}.
          </div>
        `;
      } else {
        const distItemsHtml = cachedExpandedDistritos.map((d, dIdx) => {
          const isDistActive = activeDist === d.region;
          const dMontoMM = (Number(d.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 });
          const escapedDist = String(d.region).replace(/'/g, "\\'");
          const distColor = DONUT_PALETTE[dIdx % DONUT_PALETTE.length];

          return `
            <div
              onclick="event.stopPropagation(); onRankingDistritoClick('${escapedRegion}', '${escapedDist}')"
              class="flex items-center justify-between py-1.5 px-2 text-[11px] font-mono border-l-2 ${isDistActive ? 'border-l-vermilion bg-vermilion/15 font-bold text-vermilion' : 'border-l-stone-300 dark:border-l-stone-700 hover:bg-stone-200/60 dark:hover:bg-sumi-deep/70 text-sumi-black dark:text-stone-200'} cursor-pointer transition"
              title="Filtrar empresas con postor único en el distrito de ${d.region}"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-2 h-2 flex-shrink-0" style="background-color: ${distColor};"></span>
                <span class="truncate">${dIdx + 1}. ${d.region}</span>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                <span class="text-vermilion font-bold">${d.contratos_postor_unico} PU</span>
                <span class="text-[9px] text-stone-400">S/ ${dMontoMM}M</span>
              </div>
            </div>
          `;
        }).join('');

        distritosAccordionHtml = `
          <div class="mt-2.5 pt-2 border-t border-vermilion/30 bg-washi-base/90 dark:bg-sumi-ink/80 p-2 space-y-1">
            <div class="flex items-center justify-between text-[9px] font-mono uppercase text-vermilion font-bold pb-1 border-b border-washi-border/50 dark:border-sumi-border/50">
              <span>📍 DISTRITOS DE ${r.region} (${cachedExpandedDistritos.length})</span>
              ${activeDist ? `<button type="button" onclick="event.stopPropagation(); clearSelectedDistrito()" class="underline hover:opacity-80">Ver todo ${r.region}</button>` : '<span>Click para filtrar</span>'}
            </div>
            <div class="max-h-40 overflow-y-auto space-y-0.5 pr-1">
              ${distItemsHtml}
            </div>
          </div>
        `;
      }
    }

    return `
      <div
        onclick="onDepartmentSelectAndExpand('${escapedRegion}')"
        class="heatmap-tile p-2.5 border ${isSelected ? 'is-selected bg-vermilion/10 dark:bg-vermilion/20 border-vermilion' : 'border-washi-border/80 dark:border-sumi-border/80 bg-white/75 dark:bg-sumi-surface/50 hover:border-vermilion'} transition"
      >
        <div class="flex items-center justify-between gap-1 text-xs">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2.5 h-2.5 flex-shrink-0 rounded-xs" style="background-color: ${heatHex};"></span>
            <span class="font-cinzel font-bold text-sumi-black dark:text-stone-100 truncate" title="${r.region}">
              ${String(idx + 1).padStart(2, '0')}. ${r.region}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-vermilion whitespace-nowrap">
              ${cPU} PU <span class="text-[10px] text-stone-400 font-normal">(${tasa.toFixed(1)}%)</span>
            </span>
            <span class="text-[10px] font-mono text-vermilion font-bold">${isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        <div class="w-full bg-stone-200 dark:bg-stone-800 h-1.5 mt-1.5 overflow-hidden">
          <div class="h-1.5 transition-all duration-500" style="width: ${barPct}%; background-color: ${heatHex};"></div>
        </div>
        <div class="flex items-center justify-between text-[10px] font-mono text-stone-500 dark:text-stone-400 mt-1">
          <span>S/ ${montoMM} MM • 🏢 ${r.empresas_beneficiarias_region} emp.</span>
          <span class="${isSelected ? 'text-vermilion font-bold' : ''}">${isExpanded ? 'Distritos ▼' : 'Ver distritos ▶'}</span>
        </div>
        ${distritosAccordionHtml}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
      <!-- Panel Cartográfico Multinivel (7 cols internas): Perú -> Provincias -> Distritos -->
      <div class="md:col-span-7 relative flex flex-col items-center justify-center bg-washi-surface/60 dark:bg-sumi-deep/60 border border-washi-border/70 dark:border-sumi-border/70 p-2.5">
        
        <!-- Barra Interactiva de Zoom Geográfico (3 Niveles) -->
        <div class="w-full grid grid-cols-3 gap-1 p-0.5 mb-2 bg-white dark:bg-sumi-black border border-washi-border dark:border-sumi-border text-[10px] font-mono">
          <button
            type="button"
            onclick="setMapViewLevel('peru')"
            class="py-1.5 px-2 truncate text-center transition ${level === 'peru' ? 'bg-vermilion text-white font-bold shadow-xs' : 'text-sumi-black dark:text-stone-300 hover:text-vermilion'}"
            title="Ver Mapa Nacional del Perú (25 Departamentos)"
          >
            1. 🇵🇪 Perú (25 Dptos)
          </button>
          <button
            type="button"
            onclick="setMapViewLevel('departamento')"
            class="py-1.5 px-2 truncate text-center transition ${level === 'departamento' ? 'bg-vermilion text-white font-bold shadow-xs' : 'text-sumi-black dark:text-stone-300 hover:text-vermilion'}"
            title="Expandir Mapa del Departamento con sus Provincias"
          >
            2. 🗺️ Dpto: ${activeDept} (Provincias)
          </button>
          <button
            type="button"
            onclick="setMapViewLevel('provincia')"
            class="py-1.5 px-2 truncate text-center transition ${level === 'provincia' ? 'bg-vermilion text-white font-bold shadow-xs' : 'text-sumi-black dark:text-stone-300 hover:text-vermilion'}"
            title="Expandir Mapa de Calor por Distritos de la Provincia"
          >
            3. 🔥 Prov: ${effectiveProv} (Distritos)
          </button>
        </div>

        <!-- Ficha de Inspección Térmica -->
        <div id="peruMapHoverCard" class="w-full mb-1.5 px-3 py-2 bg-white/95 dark:bg-sumi-black/95 border-l-4 border-vermilion shadow-sm font-mono text-xs flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="text-[9px] text-stone-400 uppercase block">
              ${level === 'provincia' ? `MAPA DE CALOR DISTRITAL (${activeDept} ▸ ${effectiveProv})` : level === 'departamento' ? `MAPA DE CALOR PROVINCIAL (DPTO. ${activeDept})` : 'MAPA NACIONAL DEL PERÚ (DEPARTAMENTOS)'}
            </span>
            <span id="mapTooltipDept" class="font-cinzel font-black text-sm text-sumi-black dark:text-stone-100 uppercase">${mapConfig.defaultTitle}</span>
          </div>
          <div class="text-right">
            <span id="mapTooltipMain" class="font-bold text-vermilion text-xs block">${mapConfig.defaultMain}</span>
            <span id="mapTooltipSub" class="text-[10px] text-stone-500 dark:text-stone-400 block">${mapConfig.defaultSub}</span>
          </div>
        </div>

        <!-- Lienzo Vectorial SVG (Perú / Provincias / Distritos) -->
        <svg viewBox="${mapConfig.viewBox}" class="w-full max-h-[390px] select-none">
          ${mapConfig.svgInner}
        </svg>

        <div class="w-full flex items-center justify-between text-[10px] font-mono text-stone-500 dark:text-stone-400 px-2 pt-1.5 border-t border-washi-border/50 dark:border-sumi-border/50">
          <span>${mapConfig.footerHint}</span>
          ${level !== 'peru' ? `
            <button type="button" onclick="setMapViewLevel('${level === 'provincia' ? 'departamento' : 'peru'}')" class="text-vermilion font-bold underline whitespace-nowrap ml-2">
              ← Subir un nivel
            </button>
          ` : `<span class="font-bold text-vermilion">Activo: ${activeDept}</span>`}
        </div>
      </div>

      <!-- Ranking Térmico Sincronizado con Acordeón de Distritos (5 cols internas) -->
      <div class="md:col-span-5 flex flex-col h-full">
        <div class="flex items-center justify-between text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase mb-2 px-1">
          <span>RANKING DEPARTAMENTAL (CLICK = DISTRITOS)</span>
          <span>CONTRATOS PU</span>
        </div>
        <div class="space-y-2 max-h-[470px] overflow-y-auto pr-1">
          ${listRowsHtml}
        </div>
      </div>
    </div>
  `;

  // Eventos de hover sobre los polígonos del mapa activo (Departamento, Provincia o Distrito)
  const elDept = container.querySelector('#mapTooltipDept');
  const elMain = container.querySelector('#mapTooltipMain');
  const elSub = container.querySelector('#mapTooltipSub');

  container.querySelectorAll('.peru-dept-group').forEach(g => {
    g.addEventListener('mouseenter', () => {
      const dept = g.dataset.dept;
      const cpu = g.dataset.cpu;
      const total = g.dataset.total;
      const tasa = g.dataset.tasa;
      const monto = g.dataset.monto;
      const empresas = g.dataset.empresas;
      if (elDept) elDept.textContent = dept;
      if (elMain) elMain.textContent = `${cpu} de ${total} contr. con Postor Único (${tasa}% tasa local)`;
      if (elSub) elSub.textContent = `${monto} • ${empresas} empresas reales beneficiarias`;
    });
    g.addEventListener('mouseleave', () => {
      if (elDept) elDept.textContent = mapConfig.defaultTitle;
      if (elMain) elMain.textContent = mapConfig.defaultMain;
      if (elSub) elSub.textContent = mapConfig.defaultSub;
    });
  });
}

/**
 * Clic en un Departamento directamente sobre el Mapa Nacional del Perú (Nivel 1):
 * Expande el Mapa al Nivel 2 (Mapa del Departamento con sus Provincias), despliega sus distritos en el Ranking
 * y actualiza la Dona y la Tabla de Empresas.
 */
window.onMapDepartmentPolygonClick = async function(deptName) {
  if (!deptName) return;
  radarState.selectedRegion = deptName;
  radarState.expandedDept = deptName;
  radarState.selectedProvincia = null;
  radarState.selectedDistrito = null;
  radarState.mapViewLevel = 'departamento'; // Expande automáticamente el mapa del departamento y sus provincias

  persistRadarState();

  await Promise.all([
    fetchProvinciasOfActiveDept(deptName),
    fetchExpandedDepartmentDistritos(),
    ensureGeoProvinciasLoaded(),
    ensureGeoDistritosLoaded(deptName)
  ]);

  const effectiveProv = getEffectiveMapProvincia();
  await Promise.all([
    fetchDistritosOfProvincia(deptName, effectiveProv),
    fetchEmpresasByActiveScope()
  ]);

  updateDonutView();

  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
};

/**
 * Clic en una Provincia dentro del Mapa Departamental (Nivel 2):
 * Expande el Mapa al Nivel 3 (Mapa de Calor por Distritos de esa Provincia) y actualiza la Dona y la Tabla.
 */
window.onMapProvinciaPolygonClick = async function(provName) {
  if (!provName) return;
  const activeDept = getActiveDepartment();
  radarState.selectedProvincia = provName;
  radarState.selectedDistrito = null;
  radarState.mapViewLevel = 'provincia'; // Expande automáticamente el mapa de calor por distritos de esa provincia

  persistRadarState();

  await Promise.all([
    fetchDistritosOfProvincia(activeDept, provName),
    fetchEmpresasByActiveScope()
  ]);

  updateDonutView();

  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
};

/**
 * Clic en un Distrito dentro del Mapa Distrital (Nivel 3):
 * Selecciona ese distrito y filtra la tabla de empresas reales.
 */
window.onMapDistritoPolygonClick = async function(distName) {
  if (!distName) return;
  radarState.selectedDistrito = radarState.selectedDistrito === distName ? null : distName;
  persistRadarState();

  updateDonutView();
  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
  await fetchEmpresasByActiveScope();
};

/**
 * Clic en un Departamento de la lista de Ranking Térmico:
 * Selecciona ese departamento, expande su acordeón de Distritos y muestra el mapa de sus Provincias.
 */
window.onDepartmentSelectAndExpand = async function(deptName) {
  if (!deptName) return;

  const isSameDept = radarState.selectedRegion === deptName;
  radarState.selectedRegion = deptName;
  radarState.expandedDept = isSameDept && radarState.expandedDept === deptName ? null : deptName;
  if (!isSameDept) {
    radarState.expandedDept = deptName;
    radarState.mapViewLevel = 'departamento';
  }
  radarState.selectedProvincia = null;
  radarState.selectedDistrito = null;

  persistRadarState();

  await Promise.all([
    fetchProvinciasOfActiveDept(deptName),
    fetchExpandedDepartmentDistritos(),
    ensureGeoProvinciasLoaded(),
    ensureGeoDistritosLoaded(deptName)
  ]);

  const effectiveProv = getEffectiveMapProvincia();
  await Promise.all([
    fetchDistritosOfProvincia(deptName, effectiveProv),
    fetchEmpresasByActiveScope()
  ]);

  updateDonutView();

  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
};

/**
 * Al hacer clic en un Distrito dentro del acordeón expandido en el Ranking Térmico:
 * Cambia el mapa al Nivel 3 (Mapa de Calor por Distritos) y filtra la tabla por ese distrito.
 */
window.onRankingDistritoClick = async function(deptName, distritoName) {
  radarState.selectedRegion = deptName;
  radarState.expandedDept = deptName;
  radarState.selectedDistrito = radarState.selectedDistrito === distritoName ? null : distritoName;
  if (radarState.selectedDistrito) {
    radarState.mapViewLevel = 'provincia';
  }
  persistRadarState();

  updateDonutView();
  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
  await fetchEmpresasByActiveScope();
};

window.clearSelectedDistrito = async function() {
  radarState.selectedDistrito = null;
  persistRadarState();
  updateDonutView();
  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
  await fetchEmpresasByActiveScope();
};

/**
 * Renderiza la Gráfica de Dona de Concentración de Postor Único (5 columnas)
 * Siempre muestra UN NIVEL MENOS:
 * - Si está en Departamento -> muestra sus PROVINCIAS
 * - Si está en Provincia -> muestra sus DISTRITOS
 * Todas las unidades aparecen con su propio color individual (sin "OTROS").
 */
function renderConcentrationDonut(subregiones, activeDept, activeProv, sublevelType) {
  const container = document.getElementById('puDonutContainer');
  const badgeSublevel = document.getElementById('badgeDonutSublevel');
  const titleSublevel = document.getElementById('titleDonutSublevel');
  const subtitleScope = document.getElementById('subtitleDonutScope');
  const btnBackProv = document.getElementById('btnDonutBackToProvincias');

  if (badgeSublevel) {
    badgeSublevel.textContent = sublevelType === 'DISTRITO'
      ? `DISTRITOS DE ${activeProv}`
      : `PROVINCIAS DE ${activeDept}`;
  }
  if (titleSublevel) {
    titleSublevel.textContent = sublevelType === 'DISTRITO'
      ? `Distritos con Postor Único (${activeProv})`
      : `Provincias con Postor Único (${activeDept})`;
  }
  if (subtitleScope) {
    subtitleScope.textContent = sublevelType === 'DISTRITO'
      ? `Nivel Provincia (${activeProv}) → mostrando Distritos. Haga clic en un distrito para filtrar empresas.`
      : `Nivel Departamento (${activeDept}) → mostrando Provincias. Haga clic en una provincia para desglosar sus distritos.`;
  }
  if (btnBackProv) {
    if (sublevelType === 'DISTRITO' && radarState.provincia === 'all') {
      btnBackProv.classList.remove('hidden');
    } else {
      btnBackProv.classList.add('hidden');
    }
  }

  if (!container) return;

  if (!subregiones || subregiones.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-stone-400 font-mono text-xs">
        Sin ${sublevelType.toLowerCase()}s con postor único registrados en ${activeProv || activeDept}.
      </div>
    `;
    return;
  }

  const totalPU = subregiones.reduce((acc, r) => acc + Number(r.contratos_postor_unico || 0), 0) || 1;
  const activeDist = getActiveDistrito();

  const slicesData = subregiones.map((r, idx) => ({
    region: r.region,
    contratos_pu: Number(r.contratos_postor_unico || 0),
    pct: (Number(r.contratos_postor_unico || 0) * 100) / totalPU,
    montoMM: (Number(r.monto_postor_unico_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 }),
    color: DONUT_PALETTE[idx % DONUT_PALETTE.length]
  }));

  const size = 200;
  const center = size / 2;
  const radius = 68;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPct = 0;
  const svgSlices = slicesData.map(s => {
    const dash = `${(s.pct / 100) * circumference} ${circumference}`;
    const offset = -((accumulatedPct / 100) * circumference);
    accumulatedPct += s.pct;
    const escapedName = String(s.region).replace(/'/g, "\\'");

    return `
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="${s.color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${dash}"
        stroke-dashoffset="${offset}"
        class="transition-all duration-300 hover:opacity-80 cursor-pointer pu-donut-item"
        data-region="${s.region}"
        data-pct="${s.pct.toFixed(1)}%"
        data-sub="${s.contratos_pu} contr. PU • S/ ${s.montoMM} MM"
        onclick="onDonutSubregionClick('${escapedName}', '${sublevelType}')"
        transform="rotate(-90 ${center} ${center})"
      />
    `;
  }).join('');

  const highlightedName = sublevelType === 'DISTRITO' ? activeDist : activeProv;
  const activeSlice = slicesData.find(s => s.region === highlightedName) || slicesData[0];

  const legendHtml = slicesData.map((s, idx) => {
    const isSelected = highlightedName === s.region;
    const escapedName = String(s.region).replace(/'/g, "\\'");
    return `
      <div
        onclick="onDonutSubregionClick('${escapedName}', '${sublevelType}')"
        class="flex items-center justify-between text-xs py-1.5 px-2 border ${isSelected ? 'border-vermilion bg-vermilion/10 font-bold' : 'border-transparent hover:bg-stone-100 dark:hover:bg-sumi-surface'} cursor-pointer transition pu-donut-item"
        data-region="${s.region}"
        data-pct="${s.pct.toFixed(1)}%"
        data-sub="${s.contratos_pu} contr. PU • S/ ${s.montoMM} MM"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 flex-shrink-0" style="background-color: ${s.color};"></span>
          <span class="text-sumi-black dark:text-stone-200 truncate">${String(idx + 1).padStart(2, '0')}. ${s.region}</span>
          <span class="text-[10px] text-stone-400">(${s.contratos_pu} PU)</span>
        </div>
        <div class="text-right flex-shrink-0 ml-2">
          <span class="font-bold text-vermilion">${s.pct.toFixed(1)}%</span>
          <span class="text-[10px] text-stone-400 block">S/ ${s.montoMM} MM</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col items-center gap-4">
      <div class="relative flex-shrink-0">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          ${svgSlices}
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          <span id="puDonutCenterReg" class="font-cinzel text-xs font-black uppercase text-sumi-black dark:text-stone-100 truncate max-w-[105px]">
            ${activeSlice.region}
          </span>
          <span id="puDonutCenterPct" class="font-mono text-base font-black text-vermilion">
            ${activeSlice.pct.toFixed(1)}%
          </span>
          <span id="puDonutCenterSub" class="text-[8px] font-mono text-stone-400 tracking-wider max-w-[110px] truncate">
            ${activeSlice.contratos_pu} contr. PU
          </span>
        </div>
      </div>

      <div class="w-full max-h-[265px] overflow-y-auto pr-1 space-y-1 divide-y divide-washi-border/40 dark:divide-sumi-border/40">
        ${legendHtml}
      </div>
    </div>
  `;

  const cReg = container.querySelector('#puDonutCenterReg');
  const cPct = container.querySelector('#puDonutCenterPct');
  const cSub = container.querySelector('#puDonutCenterSub');

  container.querySelectorAll('.pu-donut-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (cReg) cReg.textContent = el.dataset.region || '--';
      if (cPct) cPct.textContent = el.dataset.pct || '--';
      if (cSub) cSub.textContent = el.dataset.sub || '--';
    });
    el.addEventListener('mouseleave', () => {
      if (cReg) cReg.textContent = activeSlice.region;
      if (cPct) cPct.textContent = `${activeSlice.pct.toFixed(1)}%`;
      if (cSub) cSub.textContent = `${activeSlice.contratos_pu} contr. PU`;
    });
  });
}

/**
 * Clic en un segmento o fila de la Gráfica de Dona:
 * - Si la Dona estaba mostrando PROVINCIAS -> selecciona esa Provincia, baja la Dona a mostrar sus DISTRITOS y sincroniza el Mapa al Nivel 3 (Distritos).
 * - Si la Dona estaba mostrando DISTRITOS -> selecciona ese Distrito para filtrar la tabla de empresas.
 */
window.onDonutSubregionClick = async function(name, sublevelType) {
  if (!name) return;

  if (sublevelType === 'PROVINCIA') {
    await window.onMapProvinciaPolygonClick(name);
  } else {
    await window.onMapDistritoPolygonClick(name);
  }
};

/**
 * Botón "← Ver Provincias" en la cabecera de la Dona para subir de Distritos a Provincias del departamento activo
 */
window.resetDonutToProvincias = async function() {
  radarState.selectedProvincia = null;
  radarState.selectedDistrito = null;
  if (radarState.mapViewLevel === 'provincia') {
    radarState.mapViewLevel = 'departamento';
  }
  persistRadarState();

  updateDonutView();
  if (cachedPanoramaDepts) {
    renderRadarKpis(cachedPanoramaDepts.kpis);
    await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
  }
  await fetchEmpresasByActiveScope();
};

/**
 * Restablece a vista de departamento activo desde la tabla inferior
 */
window.selectRegion = async function(regionName) {
  if (!regionName || regionName === 'all') {
    radarState.selectedProvincia = null;
    radarState.selectedDistrito = null;
    if (radarState.mapViewLevel === 'provincia') {
      radarState.mapViewLevel = 'departamento';
    }
    persistRadarState();
    updateDonutView();
    if (cachedPanoramaDepts) {
      renderRadarKpis(cachedPanoramaDepts.kpis);
      await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
    }
    await fetchEmpresasByActiveScope();
    return;
  }
  await window.onDepartmentSelectAndExpand(regionName);
};

/**
 * Consulta las empresas reales que ganaron como Postor Único en el ámbito territorial activo
 */
async function fetchEmpresasByActiveScope() {
  const tbody = document.getElementById('empresasPostorUnicoBody');
  const badgeRegion = document.getElementById('badgeSelectedRegion');
  const titleEl = document.getElementById('titleBreakdownEmpresas');
  const btnAll = document.getElementById('btnShowAllRegionsEmpresas');

  const activeDept = getActiveDepartment();
  const activeProv = getActiveProvincia();
  const activeDist = getActiveDistrito();

  const scopeParts = [`DEPTO: ${activeDept}`];
  if (activeProv) scopeParts.push(`PROV: ${activeProv}`);
  if (activeDist) scopeParts.push(`DIST: ${activeDist}`);
  const scopeLabel = scopeParts.join(' ▸ ');

  if (badgeRegion) badgeRegion.textContent = scopeLabel;
  if (titleEl) {
    titleEl.textContent = activeDist
      ? `Empresas Reales con Postor Único en el Distrito de ${activeDist} (${activeDept})`
      : activeProv
        ? `Empresas Reales con Postor Único en la Provincia de ${activeProv} (${activeDept})`
        : `Empresas Reales Adjudicadas como Postor Único en ${activeDept}`;
  }
  if (btnAll) {
    if (activeProv || activeDist) {
      btnAll.textContent = `← Ver Todo ${activeDept}`;
      btnAll.classList.remove('hidden');
    } else {
      btnAll.classList.add('hidden');
    }
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-stone-400">
          <span class="inline-block animate-spin mr-2">☯</span> Desagregando empresas reales (puente_actor_empresa 1/N) en ${scopeLabel}...
        </td>
      </tr>
    `;
  }

  const params = buildBaseTemporalParams();
  if (activeDept && activeDept !== 'all') {
    params.append('departamento', activeDept);
  }
  if (activeProv && activeProv !== 'all') {
    params.append('provincia', activeProv);
  }
  if (activeDist && activeDist !== 'all') {
    params.append('distrito', activeDist);
  }
  params.append('limit', '100');

  try {
    const res = await fetch(`/api/v1/postor-unico/empresas?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      cachedEmpresas = json.items || [];
      renderEmpresasTable(cachedEmpresas);
    }
  } catch (e) {
    console.error('Error cargando empresas por ámbito territorial:', e);
  }
}

/**
 * Filtra localmente la tabla de empresas reales por texto (RUC o Razón Social)
 */
window.filterBreakdownTable = function() {
  const q = (document.getElementById('filterEmpresaTableInput')?.value || '').trim().toLowerCase();
  if (!q) {
    renderEmpresasTable(cachedEmpresas);
    return;
  }
  const filtered = cachedEmpresas.filter(emp =>
    String(emp.ruc || '').toLowerCase().includes(q) ||
    String(emp.razon_social || '').toLowerCase().includes(q)
  );
  renderEmpresasTable(filtered);
};

/**
 * Renderiza la tabla forense de empresas reales beneficiarias de Postor Único
 */
function renderEmpresasTable(items) {
  const tbody = document.getElementById('empresasPostorUnicoBody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-stone-400">
          No se encontraron empresas con contratos de postor único bajo este criterio.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map((emp, idx) => {
    const domPct = Number(emp.pct_dominancia_pu || 0);
    const montoFormatted = Number(emp.monto_postor_unico_soles || 0).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const indCount = Number(emp.pu_individuales || 0);
    const consCount = Number(emp.pu_en_consorcio || 0);

    let viaBadges = '';
    if (indCount > 0) {
      viaBadges += `<span class="inline-block px-1.5 py-0.5 text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 mr-1">${indCount} Indiv.</span>`;
    }
    if (consCount > 0) {
      viaBadges += `<span class="inline-block px-1.5 py-0.5 text-[10px] bg-gold-crest/25 border border-gold-crest text-sumi-black dark:text-gold-light font-semibold" title="Contratos ganados integrando un consorcio sin competencia (prorrateo 1/N)">${consCount} Consorcio (1/N)</span>`;
    }

    const domBarColor = domPct >= 75 ? '#9E1B1E' : domPct >= 40 ? '#D97706' : '#0D9488';

    return `
      <tr
        onclick="auditCompanyFromRadar('${emp.ruc}')"
        class="hover:bg-vermilion/5 dark:hover:bg-vermilion/10 cursor-pointer transition group"
        title="Haga clic para auditar el expediente completo de ${emp.razon_social} en la Pantalla 02"
      >
        <td class="py-3 px-3 font-bold text-stone-400">${String(idx + 1).padStart(2, '0')}</td>
        <td class="py-3 px-3">
          <div class="font-bold text-sumi-black dark:text-stone-100 group-hover:text-vermilion transition">
            ${emp.razon_social}
          </div>
          <div class="text-[10px] text-stone-500 dark:text-stone-400">
            RUC: <span class="text-vermilion font-semibold">${emp.ruc}</span>
          </div>
        </td>
        <td class="py-3 px-3 text-center whitespace-nowrap">
          ${viaBadges || '--'}
        </td>
        <td class="py-3 px-3 text-center">
          <span class="font-bold text-vermilion text-sm">${emp.contratos_postor_unico}</span>
          <span class="text-[10px] text-stone-400 block">de ${emp.total_contratos_region} en ámbito</span>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-center justify-between text-[11px] mb-1">
            <span class="font-bold" style="color: ${domBarColor};">${domPct.toFixed(1)}%</span>
            <span class="text-[9px] text-stone-400">sin rival</span>
          </div>
          <div class="w-full bg-stone-200 dark:bg-stone-800 h-1.5 overflow-hidden">
            <div class="h-1.5" style="width: ${Math.min(domPct, 100)}%; background-color: ${domBarColor};"></div>
          </div>
        </td>
        <td class="py-3 px-3 text-center font-bold text-sumi-black dark:text-stone-200">
          ${emp.entidades_capturadas}
        </td>
        <td class="py-3 px-3 text-right font-bold text-vermilion whitespace-nowrap">
          S/ ${montoFormatted}
        </td>
        <td class="py-3 px-3 text-center whitespace-nowrap">
          <span class="px-2.5 py-1 bg-vermilion/10 group-hover:bg-vermilion text-vermilion group-hover:text-white border border-vermilion/40 font-cinzel font-bold text-[10px] tracking-wider transition inline-flex items-center gap-1">
            <span>AUDITAR</span>
            <span>↗</span>
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Redirige a la Pantalla 02 (contratista.html) con la empresa seleccionada y el año activo,
 * dejando intacto el estado de la Pantalla 03 en sessionStorage.
 */
window.auditCompanyFromRadar = function(ruc) {
  if (!ruc) return;
  persistRadarState();
  const targetYear = radarState.year || '2026';
  window.location.href = `/contratista.html?ruc=${encodeURIComponent(ruc)}&year=${encodeURIComponent(targetYear)}&from=postor-unico`;
};

/**
 * Buscador rápido de RUC en cabecera
 */
window.onQuickRucSearch = function(e) {
  e.preventDefault();
  const input = document.getElementById('quickRucInput');
  const errorBox = document.getElementById('quickRucError');
  const errorText = document.getElementById('quickRucErrorText');
  if (!input) return;

  const ruc = input.value.trim();
  if (!/^\d{11}$/.test(ruc)) {
    if (errorBox && errorText) {
      errorText.textContent = `Formato de RUC inválido: ingresó ${ruc.length} dígitos. Debe tener 11 dígitos numéricos.`;
      errorBox.classList.remove('hidden');
    }
    return;
  }

  if (errorBox) errorBox.classList.add('hidden');
  window.auditCompanyFromRadar(ruc);
};

/**
 * Alternador de tema Washi / Sumi-e
 */
function setupThemeToggle() {
  const themeBtn = document.getElementById('themeToggle');
  const themeLabel = document.getElementById('themeLabel');
  if (!themeBtn) return;

  const applyTheme = (theme) => {
    const htmlEl = document.documentElement;
    if (theme === 'dark') {
      htmlEl.classList.add('dark');
      if (themeLabel) themeLabel.textContent = '墨 SUMI-E';
    } else {
      htmlEl.classList.remove('dark');
      if (themeLabel) themeLabel.textContent = '紙 WASHI';
    }
  };

  const currentTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(currentTheme);

  themeBtn.addEventListener('click', async () => {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (cachedPanoramaDepts) {
      await renderHeatmapGrid(cachedPanoramaDepts.regiones || []);
    }
  });
}

/**
 * Matriz interactiva de puntos en canvas de fondo
 */
function setupDotCanvas() {
  const canvas = document.getElementById('dotCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initDots();
  });

  const mouse = { x: -1000, y: -1000, radius: 120 };
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  const spacing = 32;
  let dots = [];

  function initDots() {
    dots = [];
    for (let x = 0; x < width; x += spacing) {
      for (let y = 0; y < height; y += spacing) {
        dots.push({ x, y, size: 1.1 });
      }
    }
  }

  initDots();

  function animate() {
    ctx.clearRect(0, 0, width, height);
    const isDark = document.documentElement.classList.contains('dark');
    const baseColor = isDark ? 'rgba(70, 58, 76, 0.4)' : 'rgba(190, 175, 155, 0.45)';

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const dx = mouse.x - dot.x;
      const dy = mouse.y - dot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mouse.radius) {
        const factor = 1 - dist / mouse.radius;
        ctx.fillStyle = '#9E1B1E';
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size + factor * 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
