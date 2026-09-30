/**
 * OECE / RONIN.SEACE - Panel de Concentración de Clientes
 * Responsabilidad Única: Renderizar el análisis de captura institucional y dependencia de clientes públicos.
 */

export const ClientsPanelComponent = {
  render(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-stone-400 font-mono text-xs">
          Sin clientes institucionales registrados en este periodo.
        </div>
      `;
      return;
    }

    const maxMonto = Math.max(...items.map(i => i.monto_total_soles || 0), 1);

    container.innerHTML = items.slice(0, 8).map((item, idx) => {
      const pct = Number(item.porcentaje_sobre_empresa || 0);
      const barWidth = Math.round((item.monto_total_soles / maxMonto) * 100);
      const montoText = item.monto_total_soles >= 1_000_000
        ? `S/ ${(item.monto_total_soles / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`
        : `S/ ${item.monto_total_soles.toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;

      return `
        <div class="p-2.5 bg-white/70 dark:bg-sumi-surface/50 border border-washi-border dark:border-sumi-border hover:border-vermilion transition">
          <div class="flex items-start justify-between gap-2 text-xs mb-1">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sumi-black dark:text-stone-200 truncate" title="${item.nombre_entidad}">
                ${String(idx + 1).padStart(2, '0')}. ${item.nombre_entidad}
              </div>
              <div class="text-[10px] text-stone-400 font-mono">
                RUC: ${item.ruc_entidad} • <span class="text-stone-500 font-bold">${item.total_contratos} contratos</span>
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="font-mono font-bold text-vermilion">${montoText}</div>
              <div class="text-[10px] font-mono text-stone-500 font-semibold">${pct.toFixed(1)}% de cartera</div>
            </div>
          </div>
          <div class="w-full bg-stone-200 dark:bg-stone-800 h-1.5">
            <div class="bg-vermilion h-1.5 transition-all duration-500" style="width: ${barWidth}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }
};
