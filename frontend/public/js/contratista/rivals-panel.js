/**
 * OECE / RONIN.SEACE - Panel de Red de Rivales Habituales (Face-to-Face Duels)
 * Responsabilidad Única: Renderizar el análisis de confrontación forense y posibles acuerdos colusorios (Bid Rigging).
 */

export const RivalsPanelComponent = {
  renderLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="p-8 text-center text-stone-400 font-mono text-xs">
        <span class="inline-block animate-spin mr-2">☯</span> Rastreando co-licitadores y duelos concurrentes...
      </div>
    `;
  },

  render(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-stone-400 font-mono text-xs">
          <div class="text-xl mb-1">⚔️</div>
          <div>No se detectaron co-licitadores habituales en este periodo.</div>
          <div class="mt-2 text-[10px] text-stone-500 font-serif italic">
            El contratista no compitió en los mismos ítems con rivales recurrentes en este año.
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = items.slice(0, 6).map((item, idx) => {
      const duelos = Number(item.procesos_competidos || 0);
      const vicEmpresa = Number(item.victorias_empresa_consultada || 0);
      const vicRival = Number(item.victorias_rival || 0);

      // Corrección del cálculo: si ambos tienen 0 victorias, ambos porcentajes son 0%
      const sumVictorias = vicEmpresa + vicRival;
      const pctEmpresa = sumVictorias > 0 ? Math.round((vicEmpresa / sumVictorias) * 100) : 0;
      const pctRival = sumVictorias > 0 ? (100 - pctEmpresa) : 0;

      return `
        <div 
          class="p-2.5 bg-white/70 dark:bg-sumi-surface/50 border border-washi-border dark:border-sumi-border hover:border-vermilion transition text-xs font-mono group cursor-pointer"
          onclick="window.selectSearchedCompany('${item.ruc_rival}', '${item.rival ? item.rival.replace(/'/g, "\\'") : ''}')"
          title="Haga clic para auditar a ${item.rival} (RUC: ${item.ruc_rival})"
        >
          <!-- Encabezado del Duelo -->
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sumi-black dark:text-stone-200 group-hover:text-vermilion transition truncate" title="${item.rival}">
                ${String(idx + 1).padStart(2, '0')}. ${item.rival}
              </div>
              <div class="text-[10px] text-stone-400">RUC: ${item.ruc_rival} <span class="text-vermilion text-[9px] opacity-0 group-hover:opacity-100 transition font-bold">Auditar ↗</span></div>
            </div>
            <div class="text-right flex-shrink-0">
              <span class="px-2 py-0.5 bg-vermilion/10 text-vermilion border border-vermilion text-[10px] font-bold">
                ${duelos} PROCESOS DISPUTADOS
              </span>
            </div>
          </div>

          <!-- Barra de Confrontación Bicolor: Empresa vs Rival -->
          <div class="space-y-1 pt-1">
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-emerald-700 dark:text-emerald-400 font-bold">
                🏆 Empresa: ${vicEmpresa} victorias ${sumVictorias > 0 ? `(${pctEmpresa}%)` : ''}
              </span>
              <span class="text-stone-600 dark:text-stone-400 font-bold">
                ⚔️ Rival: ${vicRival} victorias ${sumVictorias > 0 ? `(${pctRival}%)` : ''}
              </span>
            </div>
            <div class="w-full bg-stone-200 dark:bg-stone-800 h-2 flex overflow-hidden">
              <div class="bg-emerald-600 h-2 transition-all duration-500" style="width: ${pctEmpresa}%" title="Victorias de la empresa: ${vicEmpresa}"></div>
              <div class="bg-stone-500 dark:bg-stone-600 h-2 transition-all duration-500" style="width: ${pctRival}%" title="Victorias del rival: ${vicRival}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
};
