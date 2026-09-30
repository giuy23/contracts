/**
 * OECE / RONIN.SEACE - Gráfica Circular Forense (Donut Chart SVG)
 * Responsabilidad Única: Renderizar la distribución territorial de contratos en formato circular/porcentajes.
 */

const PALETTE = [
  '#9E1B1E', // Bermellón principal
  '#C5A059', // Oro cresta
  '#362E3B', // Sumi carbón
  '#0D9488', // Jade / Teal
  '#D97706', // Ámbar
  '#7C3AED', // Púrpura imperial
  '#2563EB', // Azul cobalto
  '#6B7280'  // Gris neutro
];

export const DonutChartComponent = {
  render(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-stone-400 font-mono text-xs">
          Sin distribución territorial registrada en este periodo.
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

    // Leyenda lateral
    const legendItems = slices.slice(0, 6).map((s) => {
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

        <!-- Leyenda detallada -->
        <div class="flex-1 w-full space-y-0.5 divide-y divide-washi-border/40 dark:divide-sumi-border/40 font-mono">
          ${legendItems}
          ${slices.length > 6 ? `
            <div class="pt-1 text-[10px] text-stone-400 text-center font-serif italic">
              +${slices.length - 6} departamentos adicionales agrupados
            </div>
          ` : ''}
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

