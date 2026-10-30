/**
 * OECE / RONIN.SEACE - Línea de Tiempo Forense Tipo Eventos (2022 - 2026)
 * Responsabilidad Única: Renderizar la evolución histórica multianual como una secuencia de hitos cronológicos interactivos.
 */

import { state } from './state.js';

export const TimelineEventsComponent = {
  renderLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="p-8 text-center text-stone-400 font-mono text-xs">
        <span class="inline-block animate-spin mr-2">☯</span> Reconstruyendo línea de tiempo multianual (2022 - 2026)...
      </div>
    `;
  },

  render(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-stone-400 font-mono text-xs">
          <div class="text-xl mb-1">⏳</div>
          <div>Sin hitos contractuales registrados para esta empresa entre 2022 y 2026.</div>
        </div>
      `;
      return;
    }

    const maxMonto = Math.max(...items.map(i => i.monto_total_soles || 0), 1);
    const sorted = [...items].sort((a, b) => a.year - b.year);

    const milestoneCards = sorted.map((item, idx) => {
      const isSelected = String(item.year) === String(state.year);
      const prev = idx > 0 ? sorted[idx - 1] : null;

      // Cálculo de variación porcentual interanual (delta)
      let deltaBadge = '';
      if (prev && prev.monto_total_soles > 0) {
        const diff = item.monto_total_soles - prev.monto_total_soles;
        const diffPct = (diff / prev.monto_total_soles) * 100;
        if (diffPct > 0) {
          deltaBadge = `<span class="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">▲ +${diffPct.toFixed(0)}%</span>`;
        } else if (diffPct < 0) {
          deltaBadge = `<span class="text-[9px] font-mono text-vermilion font-bold">▼ ${diffPct.toFixed(0)}%</span>`;
        } else {
          deltaBadge = `<span class="text-[9px] font-mono text-stone-400 font-semibold">= 0%</span>`;
        }
      } else {
        deltaBadge = `<span class="text-[9px] font-mono text-stone-400">BASE</span>`;
      }

      const montoFormatted = item.monto_total_soles >= 1_000_000
        ? `S/ ${(item.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`
        : `S/ ${item.monto_total_soles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;

      const barWidth = Math.round((item.monto_total_soles / maxMonto) * 100);

      return `
        <div 
          class="relative flex-1 group cursor-pointer transition-all p-3 border ${
            isSelected 
              ? 'border-vermilion bg-vermilion/10 shadow-sm ring-1 ring-vermilion' 
              : 'border-washi-border dark:border-sumi-border bg-white/60 dark:bg-sumi-surface/40 hover:border-vermilion/60'
          }"
          onclick="window.selectFiscalYear('${item.year}')"
          title="Haga clic para auditar el Ejercicio Fiscal ${item.year}"
        >
          <!-- Conector de nodo en la cabecera del hito -->
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-vermilion ring-4 ring-vermilion/20' : 'bg-stone-300 dark:bg-stone-600 group-hover:bg-vermilion'} transition"></span>
              <span class="font-cinzel text-xs font-black ${isSelected ? 'text-vermilion' : 'text-sumi-black dark:text-stone-200'}">
                ${item.year}
              </span>
            </div>
            ${deltaBadge}
          </div>

          <!-- Cifras del año -->
          <div class="space-y-0.5">
            <div class="font-mono text-xs font-black ${isSelected ? 'text-vermilion' : 'text-sumi-black dark:text-stone-100'} truncate">
              ${montoFormatted}
            </div>
            <div class="text-[10px] font-mono text-stone-500 dark:text-stone-400">
              ${item.total_contratos} contratos
            </div>
            <div class="text-[9px] font-serif text-stone-400 italic truncate">
              ${item.entidades_atendidas} entidades
            </div>
          </div>

          <!-- Barra de intensidad proporcional -->
          <div class="w-full bg-stone-200 dark:bg-stone-800 h-1.5 mt-2">
            <div 
              class="${isSelected ? 'bg-vermilion' : 'bg-stone-400 dark:bg-stone-600 group-hover:bg-vermilion'} h-1.5 transition-all duration-500" 
              style="width: ${barWidth}%">
            </div>
          </div>

          ${isSelected ? `
            <div class="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 px-1.5 py-0.2 bg-vermilion text-white text-[8px] font-mono font-bold tracking-wider">
              ACTIVO
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="space-y-3 p-1">
        <div class="flex flex-col sm:flex-row items-stretch gap-2 relative">
          ${milestoneCards}
        </div>
        <p class="text-[10px] font-serif text-stone-400 italic text-center">
          Haga clic en cualquier hito anual para sincronizar toda la auditoría con ese periodo fiscal.
        </p>
      </div>
    `;
  }
};
