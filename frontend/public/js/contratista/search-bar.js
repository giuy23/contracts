/**
 * OECE / RONIN.SEACE - Buscador Forense Predictivo
 * Responsabilidad Única: Manejo de entrada de búsqueda, autocompletado y selección de contratista.
 */

import { ContratistaApiService } from './api.service.js';
import { state } from './state.js';

export const SearchBarComponent = {
  debounceTimer: null,

  init() {
    const input = document.getElementById('searchContratistaInput');
    const btnSearch = document.getElementById('btnSearchContratista');
    const dropdown = document.getElementById('searchDropdown');

    if (input) {
      input.addEventListener('input', (e) => {
        clearTimeout(this.debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 2) {
          this.hideDropdown();
          return;
        }

        this.debounceTimer = setTimeout(() => {
          this.performSearch(query);
        }, 280);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.triggerDirectSearch();
        } else if (e.key === 'Escape') {
          this.hideDropdown();
        }
      });
    }

    if (btnSearch) {
      btnSearch.addEventListener('click', () => this.triggerDirectSearch());
    }

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        this.hideDropdown();
      }
    });
  },

  async performSearch(query) {
    const spinner = document.getElementById('searchSpinner');
    const dropdown = document.getElementById('searchDropdown');
    if (spinner) spinner.classList.remove('hidden');

    try {
      const items = await ContratistaApiService.search(query);
      this.renderDropdown(items);
    } catch (err) {
      console.error('Error en búsqueda:', err);
      if (dropdown) {
        dropdown.innerHTML = '<div class="p-3 text-xs text-red-500 font-mono">Error al consultar el servidor.</div>';
        dropdown.classList.remove('hidden');
      }
    } finally {
      if (spinner) spinner.classList.add('hidden');
    }
  },

  renderDropdown(items) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    if (!items || items.length === 0) {
      dropdown.innerHTML = '<div class="p-3 text-xs text-stone-400 font-mono text-center">No se encontraron empresas con ese término.</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = items.map(item => {
      const isConsorcio = (item.tipo_proveedor || '').toUpperCase().includes('CONSORCIO');
      return `
        <div 
          class="search-item p-2.5 hover:bg-stone-100 dark:hover:bg-sumi-surface cursor-pointer transition flex items-center justify-between gap-3 text-xs font-mono"
          onclick="window.selectSearchedCompany('${item.ruc}', '${this.escapeHtml(item.razon_social)}')"
        >
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sumi-black dark:text-stone-100 truncate">${item.razon_social}</div>
            <div class="text-[10px] text-stone-400">RUC: <span class="text-vermilion font-bold">${item.ruc}</span></div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="px-1.5 py-0.5 text-[9px] font-bold ${isConsorcio ? 'bg-vermilion text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'}">
              ${isConsorcio ? 'CONSORCIO' : 'INDIVIDUAL'}
            </span>
            <span class="text-[10px] text-stone-500 font-serif">${item.total_contratos || 0} contratos</span>
          </div>
        </div>
      `;
    }).join('');

    dropdown.classList.remove('hidden');
  },

  triggerDirectSearch() {
    const input = document.getElementById('searchContratistaInput');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;

    if (/^\d{11}$/.test(val)) {
      this.hideDropdown();
      state.setRuc(val);
    } else {
      this.performSearch(val);
    }
  },

  hideDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.classList.add('hidden');
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
