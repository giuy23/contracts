// Estado global de la aplicación
let currentRankingMode = 'monto'; // 'monto' | 'cantidad'
let cachedCockpitData = null;

// Inicialización de la pantalla al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  setupYearSelector();
  setupThemeToggle();
  setupDotCanvas();
  await loadFilterOptions();
  await fetchCockpitData();
});

/**
 * Genera el selector de años desde 2022 hasta 2026, con 2026 seleccionado por defecto.
 */
function setupYearSelector() {
  const select = document.getElementById('filterYear');
  if (!select) return;

  const options = [
    { year: 2026, label: '2026' },
    { year: 2025, label: '2025' },
    { year: 2024, label: '2024' },
    { year: 2023, label: '2023' },
    { year: 2022, label: '2022' }
  ];

  select.innerHTML = options.map(opt => `
    <option value="${opt.year}" ${opt.year === 2026 ? 'selected' : ''}>${opt.label}</option>
  `).join('');
}

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
        renderTopEntidades(json.data.top_entidades_presupuesto);
      }
    }
  } catch (error) {
    console.error('Error fetching cockpit data:', error);
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
 * Renderiza la Gráfica 1: Top 10 Contratistas & Consorcios
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

    const isConsorcio = (item.tipo_proveedor || '').toUpperCase().includes('CONSORCIO');

    return `
      <div 
        class="group p-2.5 bg-white/70 dark:bg-sumi-surface/50 border border-washi-border dark:border-sumi-border hover:border-vermilion hover:bg-vermilion/5 transition cursor-pointer"
        onclick="window.location.href='contratista.html?ruc=${item.ruc}&year=' + (document.getElementById('filterYear')?.value || '2026')"
        title="Haga clic para ver el Perfil y Auditoría Forense de ${item.proveedor}"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 mb-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sumi-black dark:text-stone-200 group-hover:text-vermilion transition">${String(idx + 1).padStart(2, '0')}. ${item.proveedor}</span>
            <span class="text-[10px] text-stone-400 font-mono">(RUC: ${item.ruc})</span>
            <span class="px-1.5 py-0.2 text-[9px] ${isConsorcio ? 'bg-vermilion text-white font-bold' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'} font-mono">
              ${isConsorcio ? 'CONSORCIO' : 'INDIVIDUAL'}
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
      </div>
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
 * Renderiza la Gráfica 3: Top 10 Entidades Convocantes con Mayor Presupuesto
 */
function renderTopEntidades(list) {
  const container = document.getElementById('topEntidadesList');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<div class="p-4 text-center text-stone-400">Sin entidades registradas.</div>';
    return;
  }

  const maxMonto = Math.max(...list.map(e => e.monto_total_soles || 0), 1);

  container.innerHTML = list.map((item, idx) => {
    const montoMM = (item.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 });
    const pct = Math.round((item.monto_total_soles / maxMonto) * 100);

    return `
      <div class="p-2 border border-washi-border/70 dark:border-sumi-border/70 hover:border-vermilion transition bg-white/50 dark:bg-sumi-surface/40">
        <div class="flex justify-between items-center text-xs mb-1">
          <span class="font-bold text-sumi-black dark:text-stone-200 truncate max-w-[240px]" title="${item.nombre_entidad}">
            ${String(idx + 1).padStart(2, '0')}. ${item.nombre_entidad}
          </span>
          <span class="font-bold text-vermilion font-mono whitespace-nowrap">
            S/ ${montoMM} MM
          </span>
        </div>
        <div class="w-full bg-stone-200 dark:bg-stone-800 h-1.5">
          <div class="bg-vermilion h-1.5 transition-all duration-500" style="width: ${pct}%"></div>
        </div>
        <div class="flex justify-between text-[10px] text-stone-500 mt-0.5">
          <span>RUC: ${item.ruc_entidad}</span>
          <span>${item.total_contratos} contratos</span>
        </div>
      </div>
    `;
  }).join('');
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
 * Toggler entre Modo Washi (Papiro Claro) y Sumi (Tinta Oscura)
 */
function setupThemeToggle() {
  const themeBtn = document.getElementById('themeToggle');
  const themeLabel = document.getElementById('themeLabel');
  if (!themeBtn) return;

  themeBtn.addEventListener('click', () => {
    const htmlEl = document.documentElement;
    if (htmlEl.classList.contains('dark')) {
      htmlEl.classList.remove('dark');
      if (themeLabel) themeLabel.textContent = '墨 SUMI-E';
    } else {
      htmlEl.classList.add('dark');
      if (themeLabel) themeLabel.textContent = '紙 WASHI';
    }
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
