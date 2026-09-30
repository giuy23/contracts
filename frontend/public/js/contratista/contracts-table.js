/**
 * OECE / RONIN.SEACE - Grilla Detallada de Expedientes con Acordeón
 * Responsabilidad Única: Renderizar contratos paginados y el desglose de postores bajo demanda.
 */

import { ContratistaApiService } from './api.service.js';
import { state } from './state.js';

export const ContractsTableComponent = {
  renderLoading() {
    const tbody = document.getElementById('contratosTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="p-8 text-center text-stone-400 font-mono text-xs">
            <span class="inline-block animate-spin mr-2">☯</span> Consultando contratos formalizados en SEACE...
          </td>
        </tr>
      `;
    }
  },

  render(contratos) {
    const tbody = document.getElementById('contratosTableBody');
    const countLabel = document.getElementById('lblContratosCount');
    const paginationInfo = document.getElementById('paginationInfo');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    if (!tbody) return;

    const offset = state.page * state.pageSize;

    if (countLabel && state.summaryData) {
      countLabel.textContent = `Total Registrados: ${state.summaryData.total_contratos || 0} contratos`;
    }

    if (paginationInfo) {
      paginationInfo.textContent = `Página ${state.page + 1} (${offset + 1} - ${offset + (contratos?.length || 0)})`;
    }

    if (btnPrev) btnPrev.disabled = state.page === 0;
    if (btnNext) btnNext.disabled = !contratos || contratos.length < state.pageSize;

    if (!contratos || contratos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="p-8 text-center text-stone-400 font-mono text-xs">
            No se encontraron contratos registrados para esta empresa en el periodo seleccionado.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = contratos.map(c => {
      const rowKey = `${c.codigo_convocatoria}-${c.numero_item}`;
      const fecha = c.fecha_suscripcion_contrato ? c.fecha_suscripcion_contrato.split('T')[0] : '--';
      const isPostorUnico = Boolean(c.es_postor_unico);
      const monto = Number(c.monto_contratado_item || 0);
      const tieneResolucion = (c.tiene_resolucion || '').toUpperCase() === 'SÍ';

      const pdfBtn = c.url_contrato 
        ? `<a href="${c.url_contrato}" target="_blank" rel="noopener noreferrer" class="px-2 py-0.5 bg-vermilion text-white text-[9px] font-bold hover:bg-vermilion-dark transition" title="Ver contrato digital en SEACE">PDF ↗</a>`
        : `<span class="text-stone-400 text-[10px]">--</span>`;

      return `
        <!-- Fila Principal de Contrato -->
        <tr 
          class="hover:bg-vermilion/5 transition cursor-pointer border-b border-washi-border dark:border-sumi-border"
          onclick="window.togglePostoresRow('${c.codigo_convocatoria}', ${c.numero_item})"
        >
          <td class="py-3 px-2 text-center text-vermilion font-bold text-sm">
            <span id="icon-expand-${rowKey}">+</span>
          </td>
          <td class="py-3 px-3">
            <div class="font-bold text-sumi-black dark:text-stone-100">${c.numero_contrato || c.codigo_contrato}</div>
            <div class="text-[10px] text-stone-400 font-mono">Cód: ${c.codigo_contrato} • Ítem ${c.numero_item}</div>
          </td>
          <td class="py-3 px-3 max-w-xs">
            <div class="font-semibold text-sumi-black dark:text-stone-200 truncate" title="${c.nombre_entidad}">
              ${c.nombre_entidad}
            </div>
            <div class="text-[10px] text-stone-400">RUC: ${c.ruc_entidad}</div>
          </td>
          <td class="py-3 px-3 max-w-xs">
            <div class="truncate font-serif text-stone-700 dark:text-stone-300" title="${c.descripcion_item || c.objeto_contractual}">
              ${c.descripcion_item || c.objeto_contractual}
            </div>
            <div class="text-[9px] text-stone-400">${c.tipo_proceso_seleccion || c.objeto_contractual}</div>
          </td>
          <td class="py-3 px-3 whitespace-nowrap text-stone-600 dark:text-stone-400 text-[11px]">
            ${c.departamento_item}
            <div class="text-[9px] text-stone-400">${c.provincia_item}</div>
          </td>
          <td class="py-3 px-3 text-center whitespace-nowrap font-serif text-stone-600 dark:text-stone-400">
            ${fecha}
          </td>
          <td class="py-3 px-3 text-right whitespace-nowrap font-bold text-sumi-black dark:text-stone-100">
            S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            ${tieneResolucion ? '<div class="text-[9px] text-red-600 font-bold">RESOLUCIÓN</div>' : ''}
          </td>
          <td class="py-3 px-3 text-center whitespace-nowrap">
            ${isPostorUnico 
              ? '<span class="px-1.5 py-0.5 bg-vermilion text-white text-[9px] font-bold">1 (ÚNICO)</span>'
              : `<span class="px-1.5 py-0.5 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 text-[10px]">${c.cantidad_postores} postores</span>`
            }
          </td>
          <td class="py-3 px-2 text-center whitespace-nowrap" onclick="event.stopPropagation()">
            ${pdfBtn}
          </td>
        </tr>

        <!-- Subfila Acordeón de Postores (inicialmente oculta) -->
        <tr id="accordion-row-${rowKey}" class="hidden bg-stone-50 dark:bg-sumi-deep/80 border-b border-vermilion/30">
          <td colspan="9" class="p-3 pl-10">
            <div id="accordion-content-${rowKey}">
              <div class="p-3 text-xs text-stone-400 font-mono">
                <span class="inline-block animate-spin mr-1">☯</span> Consultando postores competidores del ítem...
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async toggleAccordion(convocatoria, item) {
    const rowKey = `${convocatoria}-${item}`;
    const accordionRow = document.getElementById(`accordion-row-${rowKey}`);
    const iconExpand = document.getElementById(`icon-expand-${rowKey}`);
    const contentContainer = document.getElementById(`accordion-content-${rowKey}`);

    if (!accordionRow) return;

    const isExpanded = state.toggleExpandedRow(rowKey);

    if (isExpanded) {
      accordionRow.classList.remove('hidden');
      if (iconExpand) iconExpand.textContent = '−';

      if (contentContainer && !contentContainer.dataset.loaded) {
        try {
          const postores = await ContratistaApiService.getPostoresItem(convocatoria, item);
          this.renderPostoresSubTable(postores, contentContainer);
          contentContainer.dataset.loaded = 'true';
        } catch (err) {
          console.error('Error al cargar postores:', err);
          contentContainer.innerHTML = `
            <div class="p-2 text-xs text-red-500 font-mono">
              No se pudo obtener el desglose de postores para este ítem.
            </div>
          `;
        }
      }
    } else {
      accordionRow.classList.add('hidden');
      if (iconExpand) iconExpand.textContent = '+';
    }
  },

  renderPostoresSubTable(postores, container) {
    if (!postores || postores.length === 0) {
      container.innerHTML = `
        <div class="p-2 text-xs text-stone-400 font-mono">
          No hay propuestas presentadas registradas en ofertantes para este ítem.
        </div>
      `;
      return;
    }

    const rows = postores.map((p, idx) => {
      const isWinner = Boolean(p.fue_adjudicado);
      const fecha = p.fecha_presentacion_propuesta ? p.fecha_presentacion_propuesta.split('T')[0] : '--';
      const montoText = p.monto_adjudicado_item_soles 
        ? `S/ ${Number(p.monto_adjudicado_item_soles).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '--';

      return `
        <tr class="${isWinner ? 'bg-emerald-500/10 font-bold' : ''}">
          <td class="py-1.5 px-3 text-center">${idx + 1}</td>
          <td class="py-1.5 px-3">
            <span class="text-sumi-black dark:text-stone-100">${p.postor}</span>
            <span class="text-[10px] text-stone-400 ml-1 font-mono">(RUC: ${p.ruc_postor})</span>
          </td>
          <td class="py-1.5 px-3 text-center font-serif text-stone-500">${fecha}</td>
          <td class="py-1.5 px-3 text-center">
            ${isWinner 
              ? '<span class="px-2 py-0.5 bg-emerald-700 text-white text-[9px] font-bold">GANADOR / ADJUDICADO</span>' 
              : '<span class="text-stone-400 text-[10px]">PARTICIPANTE</span>'
            }
          </td>
          <td class="py-1.5 px-3 text-right font-mono text-sumi-black dark:text-stone-200">${montoText}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="p-2 bg-white dark:bg-sumi-surface border border-washi-border dark:border-sumi-border shadow-inner">
        <div class="text-[10px] font-mono uppercase text-vermilion font-bold mb-1.5 flex items-center gap-1.5">
          <span>⚔️</span>
          <span>POSTORES OFERTANTES EN ESTE ÍTEM (${postores.length} REGISTRADOS):</span>
        </div>
        <table class="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr class="border-b border-washi-border dark:border-sumi-border text-[9px] text-stone-400 uppercase">
              <th class="py-1 px-3 text-center w-8">#</th>
              <th class="py-1 px-3">Postor / Empresa Concursante</th>
              <th class="py-1 px-3 text-center">Fecha Propuesta</th>
              <th class="py-1 px-3 text-center">Resultado</th>
              <th class="py-1 px-3 text-right">Monto Adjudicado (S/)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-washi-border/60 dark:divide-sumi-border/60">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }
};
