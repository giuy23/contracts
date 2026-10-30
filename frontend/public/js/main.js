// Estado global de la aplicación
let currentRankingMode = 'monto'; // 'monto' | 'cantidad'
let currentRegionalTab = 'contratos'; // 'contratos' | 'participantes'
let cachedCockpitData = null;

const REGIONAL_DONUT_PALETTE = [
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

// Inicialización de la pantalla al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  setupYearSelector();
  setupThemeToggle();
  setupDotCanvas();
  await loadFilterOptions();
  await restoreSavedFilters();
  await fetchCockpitData();
});

/**
 * Genera el selector de años desde 2022 hasta 2026, leyendo el año fiscal
 * desde la URL (?year=) o sessionStorage para conservar el filtro entre pantallas
 */
function setupYearSelector() {
  const select = document.getElementById('filterYear');
  if (!select) return;

  const urlParams = new URLSearchParams(window.location.search);
  let paramYear = urlParams.get('year');
  if (!paramYear) {
    try {
      const saved = JSON.parse(sessionStorage.getItem('ronin_global_filters') || '{}');
      if (saved.year) paramYear = String(saved.year);
    } catch (_) {}
  }

  const validYears = [2026, 2025, 2024, 2023, 2022];
  const initialYear = (paramYear && validYears.includes(Number(paramYear))) ? Number(paramYear) : 2026;

  const options = validYears.map(yr => ({ year: yr, label: String(yr) }));

  select.innerHTML = options.map(opt => `
    <option value="${opt.year}" ${opt.year === initialYear ? 'selected' : ''}>${opt.label}</option>
  `).join('');

  updateNavContratistaLink(initialYear);
}

/**
 * Restaura los filtros guardados en sessionStorage si el usuario regresa desde otra pestaña
 */
async function restoreSavedFilters() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('ronin_global_filters') || '{}');
    if (!saved || Object.keys(saved).length === 0) return;

    const monthEl = document.getElementById('filterMonth');
    if (monthEl && saved.month) monthEl.value = saved.month;

    const procEl = document.getElementById('filterTipoProceso');
    if (procEl && saved.tipo_proceso) procEl.value = saved.tipo_proceso;

    const estEl = document.getElementById('filterEstado');
    if (estEl && saved.estado) estEl.value = saved.estado;

    const deptoEl = document.getElementById('filterDepartamento');
    const provEl = document.getElementById('filterProvincia');
    const distEl = document.getElementById('filterDistrito');

    if (deptoEl && saved.departamento && saved.departamento !== 'all') {
      deptoEl.value = saved.departamento;
      if (provEl) {
        provEl.disabled = false;
        const resProv = await fetch(`/api/v1/filtros/provincias?departamento=${encodeURIComponent(saved.departamento)}`);
        if (resProv.ok) {
          const provincias = await resProv.json();
          populateSelect('filterProvincia', provincias, 'TODAS');
          if (saved.provincia && saved.provincia !== 'all') {
            provEl.value = saved.provincia;
            if (distEl) {
              distEl.disabled = false;
              const resDist = await fetch(`/api/v1/filtros/distritos?departamento=${encodeURIComponent(saved.departamento)}&provincia=${encodeURIComponent(saved.provincia)}`);
              if (resDist.ok) {
                const distritos = await resDist.json();
                populateSelect('filterDistrito', distritos, 'TODOS');
                if (saved.distrito && saved.distrito !== 'all') {
                  distEl.value = saved.distrito;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('No se pudieron restaurar filtros previos:', e);
  }
}

/**
 * Actualiza los enlaces de cabecera hacia contratista.html y postor-unico.html preservando el año fiscal activo
 */
function updateNavContratistaLink(year) {
  const navLink = document.getElementById('navLinkContratista');
  if (navLink) {
    navLink.setAttribute('href', `/contratista.html?year=${encodeURIComponent(year || '2026')}`);
  }
  const navPostorUnico = document.getElementById('navLinkPostorUnico');
  if (navPostorUnico) {
    navPostorUnico.setAttribute('href', `/postor-unico.html?year=${encodeURIComponent(year || '2026')}`);
  }
}

/**
 * Navega directamente al Radar de Postor Único sincronizando los filtros activos
 */
window.navigateToPostorUnico = function() {
  const year = document.getElementById('filterYear')?.value || '2026';
  const month = document.getElementById('filterMonth')?.value || 'all';
  const departamento = document.getElementById('filterDepartamento')?.value || 'all';
  const provincia = document.getElementById('filterProvincia')?.value || 'all';
  const distrito = document.getElementById('filterDistrito')?.value || 'all';
  const tipo_proceso = document.getElementById('filterTipoProceso')?.value || 'all';

  try {
    const existing = JSON.parse(sessionStorage.getItem('ronin_postor_unico_state') || '{}');
    sessionStorage.setItem('ronin_postor_unico_state', JSON.stringify({
      ...existing,
      year,
      month,
      departamento,
      provincia,
      distrito,
      tipo_proceso
    }));
  } catch (_) {}

  window.location.href = `/postor-unico.html?year=${encodeURIComponent(year)}`;
};

/**
 * Buscador rápido global de RUC en la cabecera de la pantalla principal
 */
window.onQuickRucSearch = function(e) {
  e.preventDefault();
  const input = document.getElementById('quickRucInput');
  const errorBox = document.getElementById('quickRucError');
  const errorText = document.getElementById('quickRucErrorText');
  if (!input) return;

  const ruc = input.value.trim();
  const year = document.getElementById('filterYear')?.value || '2026';

  if (!/^\d{11}$/.test(ruc)) {
    if (errorBox && errorText) {
      errorText.textContent = `Formato de RUC inválido: ingresó ${ruc.length} dígitos. Debe tener exactamente 11 dígitos numéricos (ej. 20100041953).`;
      errorBox.classList.remove('hidden');
    }
    return;
  }

  const prefix = ruc.substring(0, 2);
  if (!['10', '15', '17', '20'].includes(prefix)) {
    if (errorBox && errorText) {
      errorText.textContent = `El RUC '${ruc}' no posee un prefijo válido de SUNAT (debe iniciar con 10, 15, 17 o 20).`;
      errorBox.classList.remove('hidden');
    }
    return;
  }

  if (errorBox) errorBox.classList.add('hidden');
  window.location.href = `/contratista.html?ruc=${encodeURIComponent(ruc)}&year=${encodeURIComponent(year)}`;
};

/**
 * Carga las listas de opciones iniciales para los filtros desde los endpoints de NestJS.
 */
async function loadFilterOptions() {
  try {
    const [deptosRes, procesosRes, estadosRes] = await Promise.all([
      fetch('/api/v1/filtros/departamentos'),
      fetch('/api/v1/filtros/tipos-proceso'),
      fetch('/api/v1/filtros/estados')
    ]);

    if (deptosRes.ok) {
      const deptos = await deptosRes.json();
      populateSelect('filterDepartamento', deptos, 'TODOS');
    }

    if (procesosRes.ok) {
      const procesos = await procesosRes.json();
      populateSelect('filterTipoProceso', procesos, 'TODAS');
    }

    if (estadosRes.ok) {
      const estados = await estadosRes.json();
      populateSelect('filterEstado', estados, 'TODOS');
    }
  } catch (error) {
    console.error('Error al cargar opciones de filtros:', error);
  }
}

/**
 * Helper para rellenar un elemento <select>
 */
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
 * Cascada Nivel 1: Cambio de Departamento
 */
async function onDepartamentoChange() {
  const deptoSelect = document.getElementById('filterDepartamento');
  const provSelect = document.getElementById('filterProvincia');
  const distSelect = document.getElementById('filterDistrito');

  if (!deptoSelect || !provSelect || !distSelect) return;

  const depto = deptoSelect.value;

  // Resetear provincias y distritos
  provSelect.innerHTML = '<option value="all" selected>TODAS</option>';
  distSelect.innerHTML = '<option value="all" selected>TODOS</option>';

  if (depto === 'all' || !depto) {
    provSelect.disabled = true;
    distSelect.disabled = true;
  } else {
    provSelect.disabled = false;
    distSelect.disabled = true;

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

  onFilterChange();
}

/**
 * Cascada Nivel 2: Cambio de Provincia
 */
async function onProvinciaChange() {
  const deptoSelect = document.getElementById('filterDepartamento');
  const provSelect = document.getElementById('filterProvincia');
  const distSelect = document.getElementById('filterDistrito');

  if (!deptoSelect || !provSelect || !distSelect) return;

  const depto = deptoSelect.value;
  const prov = provSelect.value;

  distSelect.innerHTML = '<option value="all" selected>TODOS</option>';

  if (prov === 'all' || !prov) {
    distSelect.disabled = true;
  } else {
    distSelect.disabled = false;
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

  onFilterChange();
}

/**
 * Disparador unificado de cambio de cualquier filtro
 */
async function onFilterChange() {
  await fetchCockpitData();
}

/**
 * Limpia todos los filtros y restablece a 2026 Nacional
 */
async function resetFilters() {
  const yearSelect = document.getElementById('filterYear');
  if (yearSelect) yearSelect.value = '2026';

  const monthSelect = document.getElementById('filterMonth');
  if (monthSelect) monthSelect.value = 'all';

  const deptoSelect = document.getElementById('filterDepartamento');
  if (deptoSelect) deptoSelect.value = 'all';
  
  const provSelect = document.getElementById('filterProvincia');
  if (provSelect) {
    provSelect.innerHTML = '<option value="all" selected>TODAS</option>';
    provSelect.disabled = true;
  }

  const distSelect = document.getElementById('filterDistrito');
  if (distSelect) {
    distSelect.innerHTML = '<option value="all" selected>TODOS</option>';
    distSelect.disabled = true;
  }

  const tipoProcesoSelect = document.getElementById('filterTipoProceso');
  if (tipoProcesoSelect) tipoProcesoSelect.value = 'all';

  const estadoSelect = document.getElementById('filterEstado');
  if (estadoSelect) estadoSelect.value = 'all';

  try {
    sessionStorage.removeItem('ronin_global_filters');
  } catch (_) {}

  await fetchCockpitData();
}

/**
 * Consulta el endpoint maestro /api/v1/cockpit/data con los filtros actuales
 */
async function fetchCockpitData() {
  const year = document.getElementById('filterYear')?.value || '2026';
  const month = document.getElementById('filterMonth')?.value || 'all';
  const departamento = document.getElementById('filterDepartamento')?.value || 'all';
  const provincia = document.getElementById('filterProvincia')?.value || 'all';
  const distrito = document.getElementById('filterDistrito')?.value || 'all';
  const tipo_proceso = document.getElementById('filterTipoProceso')?.value || 'all';
  const estado = document.getElementById('filterEstado')?.value || 'all';

  // Persistir filtros activos en sessionStorage
  try {
    sessionStorage.setItem('ronin_global_filters', JSON.stringify({
      year,
      month,
      departamento,
      provincia,
      distrito,
      tipo_proceso,
      estado
    }));
  } catch (_) {}

  // Sincronizar enlaces hacia contratista.html y postor-unico.html en la barra superior
  updateNavContratistaLink(year);

  // Sincronizar URL para preservar el estado de navegación
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('year', year);
  window.history.replaceState({}, '', currentUrl.toString());

  // Indicadores de carga inmediatos
  renderLoadingCockpit();

  const params = new URLSearchParams();
  if (year) params.append('year', year);
  if (month && month !== 'all') params.append('month', month);
  if (departamento && departamento !== 'all') params.append('departamento', departamento);
  if (provincia && provincia !== 'all') params.append('provincia', provincia);
  if (distrito && distrito !== 'all') params.append('distrito', distrito);
  if (tipo_proceso && tipo_proceso !== 'all') params.append('tipo_proceso', tipo_proceso);
  if (estado && estado !== 'all') params.append('estado', estado);

  try {
    const res = await fetch(`/api/v1/cockpit/data?${params.toString()}`);

    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        cachedCockpitData = json.data;
        renderKpis(json.data.kpis);
        renderTopContratistas();
        renderDistribucionProcesos(json.data.distribucion_tipo_proceso);
        renderMetricasRegionales();
      }
    }
  } catch (error) {
    console.error('Error fetching cockpit data:', error);
  }
}

/**
 * Indicadores de carga en KPIs y gráficas de la portada
 */
function renderLoadingCockpit() {
  ['valKpiContratos', 'valKpiMonto', 'valKpiContratistas', 'valKpiPostorUnico'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="inline-block animate-pulse text-stone-400">---</span>';
  });

  const listTop = document.getElementById('topContratistasList');
  if (listTop) {
    listTop.innerHTML = '<div class="p-6 text-center text-stone-400 font-mono text-xs"><span class="inline-block animate-spin mr-2">☯</span> Consultando datos de contratistas en MySQL...</div>';
  }

  const listProc = document.getElementById('distribucionProcesosList');
  if (listProc) {
    listProc.innerHTML = '<div class="p-4 text-center text-stone-400 font-mono text-xs"><span class="inline-block animate-spin mr-2">☯</span> Calculando modalidades...</div>';
  }

  const regContainer = document.getElementById('metricasRegionalesContainer');
  if (regContainer) {
    regContainer.innerHTML = '<div class="p-6 text-center text-stone-400 font-mono text-xs"><span class="inline-block animate-spin mr-2">☯</span> Calculando dinámica territorial...</div>';
  }
}

/**
 * Renderiza los 4 KPIs principales en la fila superior
 */
function renderKpis(kpis) {
  if (!kpis) return;

  const elContratos = document.getElementById('valKpiContratos');
  const elMonto = document.getElementById('valKpiMonto');
  const elContratistas = document.getElementById('valKpiContratistas');
  const elPostorUnico = document.getElementById('valKpiPostorUnico');
  const barPostorUnico = document.getElementById('kpiBarPostorUnico');

  if (elContratos) {
    elContratos.textContent = (kpis.total_contratos || 0).toLocaleString('es-PE');
  }

  if (elMonto) {
    elMonto.textContent = kpis.monto_total_formateado || `S/ ${(kpis.monto_total_soles || 0).toLocaleString('es-PE')}`;
  }

  if (elContratistas) {
    elContratistas.textContent = (kpis.contratistas_activos || 0).toLocaleString('es-PE');
  }

  if (elPostorUnico) {
    const pct = Number(kpis.tasa_postor_unico_pct || 0);
    elPostorUnico.textContent = `${pct.toFixed(2)}%`;
    if (barPostorUnico) {
      barPostorUnico.style.width = `${Math.min(pct, 100)}%`;
    }
  }
}

/**
 * Alterna entre el ranking por Monto y por Cantidad de Contratos
 */
function switchRankingToggle(mode) {
  currentRankingMode = mode;
  const btnMonto = document.getElementById('btnToggleMonto');
  const btnCantidad = document.getElementById('btnToggleCantidad');

  if (mode === 'monto') {
    btnMonto.className = "px-2.5 py-1 font-bold bg-vermilion text-white shadow-sm transition";
    btnCantidad.className = "px-2.5 py-1 text-sumi-black dark:text-stone-300 hover:text-vermilion transition";
  } else {
    btnCantidad.className = "px-2.5 py-1 font-bold bg-vermilion text-white shadow-sm transition";
    btnMonto.className = "px-2.5 py-1 text-sumi-black dark:text-stone-300 hover:text-vermilion transition";
  }

  renderTopContratistas();
}

/**
 * Renderiza la Gráfica 1: Top 10 Contratistas (Empresas Reales con Prorrateo 1/N)
 */
function renderTopContratistas() {
  const container = document.getElementById('topContratistasList');
  if (!container || !cachedCockpitData) return;

  const isMonto = currentRankingMode === 'monto';
  const list = isMonto 
    ? (cachedCockpitData.top_contratistas_monto || [])
    : (cachedCockpitData.top_contratistas_cantidad || []);

  if (list.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-stone-400">Sin contratistas registrados bajo los filtros actuales.</div>';
    return;
  }

  const maxVal = isMonto
    ? Math.max(...list.map(i => i.monto_total_soles || 0), 1)
    : Math.max(...list.map(i => i.total_contratos || 0), 1);

  const currentYear = document.getElementById('filterYear')?.value || '2026';

  container.innerHTML = list.map((item, idx) => {
    const mainText = isMonto
      ? `S/ ${(item.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`
      : `${item.total_contratos} contratos`;

    const subText = isMonto
      ? `${item.total_contratos} contratos formalizados`
      : `S/ ${(item.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM formalizados`;

    const pct = isMonto
      ? Math.round((item.monto_total_soles / maxVal) * 100)
      : Math.round((item.total_contratos / maxVal) * 100);

    return `
      <a 
        href="/contratista.html?ruc=${encodeURIComponent(item.ruc)}&year=${encodeURIComponent(currentYear)}"
        class="block group p-2.5 bg-white/70 dark:bg-sumi-surface/50 border border-washi-border dark:border-sumi-border hover:border-vermilion hover:bg-vermilion/5 transition"
        title="Haga clic para ver el Perfil y Auditoría Forense de ${item.proveedor}"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 mb-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sumi-black dark:text-stone-200 group-hover:text-vermilion transition">${String(idx + 1).padStart(2, '0')}. ${item.proveedor}</span>
            <span class="text-[10px] text-stone-400 font-mono">(RUC: ${item.ruc})</span>
            <span class="px-1.5 py-0.2 text-[9px] bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-mono">
              EMPRESA
            </span>
          </div>
          <div class="flex items-center gap-2">
            <div class="font-mono text-vermilion font-bold whitespace-nowrap">
              ${mainText}
            </div>
            <span class="text-[10px] text-vermilion opacity-0 group-hover:opacity-100 transition-opacity font-mono font-bold">
              Auditar ↗
            </span>
          </div>
        </div>
        <div class="w-full bg-stone-200 dark:bg-stone-800 h-2">
          <div class="bg-vermilion h-2 transition-all duration-500" style="width: ${pct}%"></div>
        </div>
        <div class="flex justify-between items-center text-[10px] font-serif text-stone-500 dark:text-stone-400 mt-0.5">
          <span>${subText}</span>
          <span class="text-[9px] font-mono text-stone-400 group-hover:text-vermilion transition">Click para auditar expedientes</span>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * Renderiza la Gráfica 2: Distribución por Tipo de Proceso de Selección
 */
function renderDistribucionProcesos(list) {
  const container = document.getElementById('distribucionProcesosList');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<div class="p-4 text-center text-stone-400">Sin datos de modalidades.</div>';
    return;
  }

  container.innerHTML = list.slice(0, 6).map((item) => {
    const pct = Number(item.porcentaje || 0);
    const montoMM = (item.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 });

    return `
      <div>
        <div class="flex justify-between items-center mb-1 text-xs">
          <span class="font-bold text-sumi-black dark:text-stone-200 truncate max-w-xs" title="${item.tipo_proceso}">
            ${item.tipo_proceso}
          </span>
          <span class="font-bold text-vermilion whitespace-nowrap">
            ${pct.toFixed(1)}% <span class="text-stone-400 font-normal">(${item.total_contratos} contr.)</span>
          </span>
        </div>
        <div class="w-full bg-stone-200 dark:bg-stone-800 h-2">
          <div class="bg-gold-crest h-2 transition-all duration-500" style="width: ${Math.min(pct, 100)}%"></div>
        </div>
        <div class="flex justify-between text-[10px] font-mono text-stone-500 mt-0.5">
          <span>Monto: S/ ${montoMM} MM</span>
          <span>Participación</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Alterna entre Tab 1 (Cantidad de Contratos por Región) y Tab 2 (Promedio de Participantes por Región)
 */
window.switchRegionalTab = function(mode) {
  currentRegionalTab = mode;
  const btnContratos = document.getElementById('btnTabRegContratos');
  const btnParticipantes = document.getElementById('btnTabRegParticipantes');

  if (btnContratos && btnParticipantes) {
    if (mode === 'contratos') {
      btnContratos.className = "px-2 py-1.5 font-bold bg-vermilion text-white shadow-sm transition text-center truncate";
      btnParticipantes.className = "px-2 py-1.5 text-sumi-black dark:text-stone-300 hover:text-vermilion transition text-center truncate";
    } else {
      btnParticipantes.className = "px-2 py-1.5 font-bold bg-vermilion text-white shadow-sm transition text-center truncate";
      btnContratos.className = "px-2 py-1.5 text-sumi-black dark:text-stone-300 hover:text-vermilion transition text-center truncate";
    }
  }

  renderMetricasRegionales();
};

/**
 * Renderiza la Gráfica 3: Dinámica Territorial por Región (Dona Interactiva con 2 Tabs)
 */
function renderMetricasRegionales() {
  const container = document.getElementById('metricasRegionalesContainer');
  const badgeNivel = document.getElementById('badgeNivelRegional');
  if (!container || !cachedCockpitData) return;

  const nivel = cachedCockpitData.nivel_geografico || 'DEPARTAMENTO';
  if (badgeNivel) {
    badgeNivel.textContent = nivel;
  }

  const rawList = cachedCockpitData.metricas_regionales || [];
  if (rawList.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-stone-400">Sin registros regionales para los filtros seleccionados.</div>';
    return;
  }

  const isContratos = currentRegionalTab === 'contratos';
  const sortedList = [...rawList].sort((a, b) => {
    if (isContratos) {
      return (b.total_contratos || 0) - (a.total_contratos || 0);
    }
    return (b.promedio_participantes || 0) - (a.promedio_participantes || 0);
  });

  // Construcción de segmentos para el Donut SVG: TODAS las regiones con su propio color individual (sin agrupar en OTROS)
  let donutItems = [];
  if (isContratos) {
    const totalContratosGlobal = sortedList.reduce((acc, r) => acc + Number(r.total_contratos || 0), 0) || 1;
    donutItems = sortedList.map((r, idx) => ({
      region: r.region,
      pct: (Number(r.total_contratos || 0) * 100) / totalContratosGlobal,
      mainLabel: `${r.total_contratos} contr.`,
      subLabel: `${Number(r.porcentaje_contratos || 0).toFixed(1)}% del total`,
      color: REGIONAL_DONUT_PALETTE[idx % REGIONAL_DONUT_PALETTE.length]
    }));
  } else {
    // En modo Promedio de Participantes, todas las regiones aparecen en la dona con su peso proporcional y su color propio
    const sumPromedios = sortedList.reduce((acc, r) => acc + Number(r.promedio_participantes || 0), 0) || 1;
    donutItems = sortedList.map((r, idx) => {
      const prom = Number(r.promedio_participantes || 0);
      const nivelComp = prom <= 1.5 ? 'BAJA CONCURRENCIA' : prom <= 2.5 ? 'CONCURRENCIA MEDIA' : 'ALTA COMPETENCIA';
      return {
        region: r.region,
        pct: (prom * 100) / sumPromedios,
        mainLabel: `${prom.toFixed(2)} postores`,
        subLabel: `${nivelComp} (${r.total_contratos} contr.)`,
        color: REGIONAL_DONUT_PALETTE[idx % REGIONAL_DONUT_PALETTE.length]
      };
    });
  }

  const size = 180;
  const center = size / 2;
  const radius = 62;
  const strokeWidth = 25;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPct = 0;
  const svgCircles = donutItems.map((slice) => {
    const dash = `${(slice.pct / 100) * circumference} ${circumference}`;
    const offset = -((accumulatedPct / 100) * circumference);
    accumulatedPct += slice.pct;

    return `
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="${slice.color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${dash}"
        stroke-dashoffset="${offset}"
        class="transition-all duration-300 hover:opacity-80 cursor-pointer reg-donut-interact"
        data-region="${slice.region}"
        data-main="${slice.mainLabel}"
        data-sub="${slice.subLabel}"
        transform="rotate(-90 ${center} ${center})"
      />
    `;
  }).join('');

  const topItem = donutItems[0] || { region: '--', mainLabel: '--', subLabel: '--' };

  // Lista completa desplazable de todas las regiones con el mismo color exacto de su segmento en la dona
  const maxListMetric = isContratos
    ? Math.max(...sortedList.map(r => Number(r.total_contratos || 0)), 1)
    : Math.max(...sortedList.map(r => Number(r.promedio_participantes || 0)), 1);

  const rowsHtml = sortedList.map((item, idx) => {
    const color = REGIONAL_DONUT_PALETTE[idx % REGIONAL_DONUT_PALETTE.length];
    const montoMM = (Number(item.monto_total_soles || 0) / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 });
    const barPct = isContratos
      ? Math.round((Number(item.total_contratos || 0) / maxListMetric) * 100)
      : Math.round((Number(item.promedio_participantes || 0) / maxListMetric) * 100);

    const rightPrimary = isContratos
      ? `${item.total_contratos} contr. (${Number(item.porcentaje_contratos || 0).toFixed(1)}%)`
      : `${Number(item.promedio_participantes || 0).toFixed(2)} postores/ítem`;

    const rightSecondary = isContratos
      ? `S/ ${montoMM} MM • Prom: ${Number(item.promedio_participantes || 0).toFixed(2)} postores`
      : `${item.total_contratos} contratos • ${item.items_postor_unico || 0} con postor único`;

    const mainHover = isContratos
      ? `${item.total_contratos} contr.`
      : `${Number(item.promedio_participantes || 0).toFixed(2)} postores`;

    const subHover = isContratos
      ? `${Number(item.porcentaje_contratos || 0).toFixed(1)}% del total`
      : `${item.items_postor_unico || 0} ítems postor único`;

    return `
      <div
        class="p-2 border border-washi-border/70 dark:border-sumi-border/70 hover:border-vermilion transition bg-white/50 dark:bg-sumi-surface/40 cursor-pointer reg-donut-interact"
        data-region="${item.region}"
        data-main="${mainHover}"
        data-sub="${subHover}"
      >
        <div class="flex justify-between items-center text-xs mb-1 gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2.5 h-2.5 flex-shrink-0" style="background-color: ${color};"></span>
            <span class="font-bold text-sumi-black dark:text-stone-200 truncate" title="${item.region}">
              ${String(idx + 1).padStart(2, '0')}. ${item.region}
            </span>
          </div>
          <span class="font-bold text-vermilion font-mono whitespace-nowrap">
            ${rightPrimary}
          </span>
        </div>
        <div class="w-full bg-stone-200 dark:bg-stone-800 h-1.5">
          <div class="h-1.5 transition-all duration-500" style="width: ${barPct}%; background-color: ${color};"></div>
        </div>
        <div class="flex justify-between text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
          <span>${rightSecondary}</span>
          <span>${nivel}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col items-center gap-3 mb-3 pt-1">
      <div class="relative flex-shrink-0">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          ${svgCircles}
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          <span id="regDonutCenterRegion" class="font-cinzel text-[11px] font-black uppercase text-sumi-black dark:text-stone-100 truncate max-w-[96px]">
            ${topItem.region}
          </span>
          <span id="regDonutCenterMain" class="font-mono text-sm font-black text-vermilion mt-0.5">
            ${topItem.mainLabel}
          </span>
          <span id="regDonutCenterSub" class="text-[8px] font-mono text-stone-400 tracking-wider leading-tight mt-0.5 max-w-[96px] truncate">
            ${topItem.subLabel}
          </span>
        </div>
      </div>
      <div class="text-[10px] font-serif italic text-stone-500 dark:text-stone-400 text-center">
        ${isContratos
          ? `Distribución territorial por volumen de contratos (${sortedList.length} ${nivel.toLowerCase()}s)`
          : `Promedio de ofertantes por ítem adjudicado (${sortedList.length} ${nivel.toLowerCase()}s)`}
      </div>
    </div>

    <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
      ${rowsHtml}
    </div>
  `;

  // Eventos interactivos de hover sobre segmentos y filas
  const centerReg = container.querySelector('#regDonutCenterRegion');
  const centerMain = container.querySelector('#regDonutCenterMain');
  const centerSub = container.querySelector('#regDonutCenterSub');

  container.querySelectorAll('.reg-donut-interact').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (centerReg) centerReg.textContent = el.dataset.region || '--';
      if (centerMain) centerMain.textContent = el.dataset.main || '--';
      if (centerSub) centerSub.textContent = el.dataset.sub || '--';
    });
    el.addEventListener('mouseleave', () => {
      if (centerReg) centerReg.textContent = topItem.region;
      if (centerMain) centerMain.textContent = topItem.mainLabel;
      if (centerSub) centerSub.textContent = topItem.subLabel;
    });
  });
}

/**
 * Navegación de pestañas en cabecera (Suite de Pantallas)
 */
function setActiveNavTab(btn, tabId) {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  navBtns.forEach(b => {
    b.classList.remove('active', 'bg-vermilion', 'text-white', 'shadow-sm');
    b.classList.add('text-sumi-black', 'dark:text-stone-300');
  });

  btn.classList.add('active', 'bg-vermilion', 'text-white', 'shadow-sm');
  btn.classList.remove('text-sumi-black', 'dark:text-stone-300');

  if (tabId !== 'general') {
    alert(`Pantalla [${tabId.toUpperCase()}] preparada para implementación de vistas secundarias.`);
  }
}

/**
 * Toggler entre Modo Washi (Papiro Claro) y Sumi (Tinta Oscura) sincronizado con localStorage
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

  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  });
}

/**
 * Fondo interactivo de partículas / matriz de puntos con onda de tinta
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
