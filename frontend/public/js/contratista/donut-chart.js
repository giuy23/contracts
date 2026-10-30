/**
 * OECE / RONIN.SEACE - Gráfica Circular Forense (Donut Chart SVG)
 * Responsabilidad Única: Renderizar la distribución territorial de contratos en formato circular/porcentajes.
 */

const PALETTE = [
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

export const DonutChartComponent = {
  renderLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="p-8 text-center text-stone-400 font-mono text-xs">
        <span class="inline-block animate-spin mr-2">☯</span> Analizando distribución territorial de expedientes...
      </div>
    `;
  },

  render(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-stone-400 font-mono text-xs">
          <div class="text-xl mb-1">🗺️</div>
          <div>Sin contratos ni distribución territorial en este periodo.</div>
          <div class="mt-2 text-[10px] text-stone-500 font-serif italic">
            Pruebe seleccionando "Todos los años" en el filtro de Ejercicio Fiscal.
          </div>
        </div>
      `;
      return;
    }

    const totalMonto = items.reduce((acc, i) => acc + (i.monto_total_soles || 0), 0);
    const topItem = items[0];

    // Cálculos de SVG Donut
    const size = 180;
    const center = size / 2;
    const radius = 62;
    const strokeWidth = 26;
    const circumference = 2 * Math.PI * radius;

    let accumulatedPct = 0;
    const slices = items.map((item, idx) => {
      const pct = Number(item.porcentaje || (totalMonto > 0 ? (item.monto_total_soles * 100 / totalMonto) : 0));
      const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((accumulatedPct / 100) * circumference);
      accumulatedPct += pct;
      const color = PALETTE[idx % PALETTE.length];

      return {
        ...item,
        pct,
        color,
        strokeDasharray,
        strokeDashoffset
      };
    });

    const svgSlices = slices.map((s) => `
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="${s.color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${s.strokeDasharray}"
        stroke-dashoffset="${s.strokeDashoffset}"
        class="transition-all duration-300 hover:opacity-85 cursor-pointer slice-hover"
        data-dept="${s.departamento}"
        data-pct="${s.pct.toFixed(1)}"
        data-monto="S/ ${(s.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM"
        transform="rotate(-90 ${center} ${center})"
      />
    `).join('');

    // Leyenda lateral completa (sin recortar ni agrupar en Otros)
    const legendItems = slices.map((s) => {
      const montoText = s.monto_total_soles >= 1_000_000
        ? `S/ ${(s.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`
        : `S/ ${s.monto_total_soles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;

      return `
        <div 
          class="flex items-center justify-between text-xs py-1 px-1.5 hover:bg-stone-100 dark:hover:bg-sumi-surface cursor-pointer transition legend-row"
          data-dept="${s.departamento}"
          data-pct="${s.pct.toFixed(1)}"
          data-monto="${montoText}"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2.5 h-2.5 flex-shrink-0" style="background-color: ${s.color};"></span>
            <span class="font-bold text-sumi-black dark:text-stone-200 truncate">${s.departamento}</span>
            <span class="text-[10px] text-stone-400 font-mono">(${s.total_contratos})</span>
          </div>
          <div class="font-mono text-right flex-shrink-0 ml-2">
            <span class="font-bold text-vermilion">${s.pct.toFixed(1)}%</span>
            <span class="text-[10px] text-stone-400 block">${montoText}</span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="flex flex-col sm:flex-row items-center gap-6 p-2">
        <!-- SVG Donut Chart -->
        <div class="relative flex-shrink-0">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="transform -rotate-0">
            ${svgSlices}
          </svg>
          <!-- Centro de la dona -->
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            <span id="donutCenterDept" class="font-cinzel text-xs font-black uppercase text-sumi-black dark:text-stone-100 truncate max-w-[90px]">
              ${topItem ? topItem.departamento : '--'}
            </span>
            <span id="donutCenterPct" class="font-mono text-base font-black text-vermilion">
              ${topItem ? topItem.porcentaje.toFixed(1) + '%' : '0%'}
            </span>
            <span id="donutCenterSub" class="text-[8px] font-mono text-stone-400 tracking-wider">
              SEDE PRINCIPAL
            </span>
          </div>
        </div>

        <!-- Leyenda detallada completa -->
        <div class="flex-1 w-full max-h-52 overflow-y-auto pr-1 space-y-0.5 divide-y divide-washi-border/40 dark:divide-sumi-border/40 font-mono">
          ${legendItems}
        </div>
      </div>
    `;

    // Interacciones de hover en Donut y Leyenda
    this.attachHoverListeners(container, topItem);
  },

  attachHoverListeners(container, defaultItem) {
    const centerDept = container.querySelector('#donutCenterDept');
    const centerPct = container.querySelector('#donutCenterPct');
    const centerSub = container.querySelector('#donutCenterSub');

    const updateCenter = (dept, pct, sub = 'PARTICIPACIÓN') => {
      if (centerDept) centerDept.textContent = dept;
      if (centerPct) centerPct.textContent = `${pct}%`;
      if (centerSub) centerSub.textContent = sub;
    };

    const resetCenter = () => {
      if (defaultItem) {
        updateCenter(defaultItem.departamento, defaultItem.porcentaje.toFixed(1), 'SEDE PRINCIPAL');
      }
    };

    container.querySelectorAll('.slice-hover, .legend-row').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const dept = el.dataset.dept;
        const pct = el.dataset.pct;
        const monto = el.dataset.monto;
        updateCenter(dept, pct, monto);
      });

      el.addEventListener('mouseleave', resetCenter);
    });
  }
};
