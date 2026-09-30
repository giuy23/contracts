/**
 * OECE / RONIN.SEACE - Panel de Red de Rivales Habituales (Face-to-Face Duels)
 * Responsabilidad Única: Renderizar el análisis de confrontación forense y posibles acuerdos colusorios (Bid Rigging).
 */

export const RivalsPanelComponent = {
  render(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-stone-400 font-mono text-xs">
          No se detectaron co-licitadores habituales en este periodo.
        </div>
      `;
      return;
    }

    container.innerHTML = items.slice(0, 6).map((item, idx) => {
      const duelos = Number(item.procesos_competidos || 0);
      const vicEmpresa = Number(item.victorias_empresa_consultada || 0);
      const vicRival = Number(item.victorias_rival || 0);
      const totalVictorias = Math.max(vicEmpresa + vicRival, 1);
      const pctEmpresa = Math.round((vicEmpresa / totalVictorias) * 100);
      const pctRival = 100 - pctEmpresa;

      return `
        <div class="p-2.5 bg-white/70 dark:bg-sumi-surface/50 border border-washi-border dark:border-sumi-border hover:border-vermilion transition text-xs font-mono">
          <!-- Encabezado del Duelo -->
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sumi-black dark:text-stone-200 truncate" title="${item.rival}">
                ${String(idx + 1).padStart(2, '0')}. ${item.rival}
              </div>
              <div class="text-[10px] text-stone-400">RUC: ${item.ruc_rival}</div>
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
                🏆 Empresa: ${vicEmpresa} victorias (${pctEmpresa}%)
              </span>
              <span class="text-stone-600 dark:text-stone-400 font-bold">
                ⚔️ Rival: ${vicRival} victorias (${pctRival}%)
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

