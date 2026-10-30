/**
 * OECE / RONIN.SEACE - Buscador Forense Predictivo
 * Responsabilidad Única: Manejo de entrada de búsqueda, autocompletado y selección de contratista.
 * Cumple con validación estricta de 11 dígitos y prefijos SUNAT (10, 15, 17, 20).
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
        this.clearValidation();
        clearTimeout(this.debounceTimer);
        const rawVal = e.target.value.trim();

        // Si el usuario empieza a escribir dígitos, dar feedback en tiempo real
        if (/^\d+$/.test(rawVal) && rawVal.length > 0 && rawVal.length !== 11) {
          this.showValidation(`Digitando RUC: ${rawVal.length}/11 dígitos...`, 'info');
        } else if (/^\d{11}$/.test(rawVal)) {
          this.validateRucDigits(rawVal);
        }

        if (rawVal.length < 2) {
          this.hideDropdown();
          return;
        }

        this.debounceTimer = setTimeout(() => {
          this.performSearch(rawVal);
        }, 260);
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

    // Delegación de eventos en el dropdown para evitar onclick inline
    if (dropdown) {
      dropdown.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.search-item');
        if (itemEl) {
          const ruc = itemEl.dataset.ruc;
          const razonSocial = itemEl.dataset.razon;
          this.selectCompany(ruc, razonSocial);
        }
      });
    }

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        this.hideDropdown();
      }
    });
  },

  selectCompany(ruc, razonSocial) {
    const input = document.getElementById('searchContratistaInput');
    if (input) input.value = `${ruc} - ${razonSocial}`;
    this.clearValidation();
    this.hideDropdown();
    state.setRuc(ruc);
  },

  async performSearch(query) {
    const spinner = document.getElementById('searchSpinner');
    const dropdown = document.getElementById('searchDropdown');
    if (spinner) spinner.classList.remove('hidden');

    // Extraer RUC si query viene en formato "RUC - RAZÓN SOCIAL"
    const rucMatch = query.match(/^(\d{11})\b/);
    const searchTerm = rucMatch ? rucMatch[1] : query;

    try {
      const items = await ContratistaApiService.search(searchTerm);
      this.renderDropdown(items);
    } catch (err) {
      console.error('Error en búsqueda:', err);
      if (dropdown) {
        dropdown.innerHTML = '<div class="p-3 text-xs text-red-500 font-mono">Error al consultar el servidor SEACE.</div>';
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
      dropdown.innerHTML = '<div class="p-3 text-xs text-stone-400 font-mono text-center">No se encontraron contratistas con ese término en el padrón SEACE.</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = items.map(item => {
      const isConsorcio = (item.tipo_proveedor || '').toUpperCase().includes('CONSORCIO');
      const hasContracts = Number(item.total_contratos || 0) > 0;

      return `
        <div 
          class="search-item p-2.5 hover:bg-stone-100 dark:hover:bg-sumi-surface cursor-pointer transition flex items-center justify-between gap-3 text-xs font-mono"
          data-ruc="${item.ruc}"
          data-razon="${this.escapeHtml(item.razon_social)}"
          role="option"
        >
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sumi-black dark:text-stone-100 truncate">${this.escapeHtml(item.razon_social)}</div>
            <div class="text-[10px] text-stone-400">RUC: <span class="text-vermilion font-bold">${item.ruc}</span></div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="px-1.5 py-0.5 text-[9px] font-bold ${isConsorcio ? 'bg-vermilion text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'}">
              ${isConsorcio ? 'CONSORCIO' : 'INDIVIDUAL'}
            </span>
            ${hasContracts
              ? `<span class="text-[10px] text-stone-500 font-serif font-bold">${item.total_contratos} contr.</span>`
              : `<span class="px-1.5 py-0.2 text-[8px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-300">SIN CONTRATOS</span>`
            }
          </div>
        </div>
      `;
    }).join('');

    dropdown.classList.remove('hidden');
  },

  /**
   * Validación estricta y ejecución de búsqueda directa al presionar Enter o botón BUSCAR
   */
  triggerDirectSearch() {
    const input = document.getElementById('searchContratistaInput');
    if (!input) return;
    const rawVal = input.value.trim();

    if (!rawVal) {
      this.showValidation('Por favor digite un número de RUC (11 dígitos) o la Razón Social de la empresa.', 'error');
      return;
    }

    // 1. Caso de recuperación si el input ya tenía "20100041953 - RAZON SOCIAL"
    const rucMatch = rawVal.match(/^(\d{11})\b/);
    if (rucMatch) {
      const cleanRuc = rucMatch[1];
      if (this.validateRucDigits(cleanRuc)) {
        this.clearValidation();
        this.hideDropdown();
        state.setRuc(cleanRuc);
        return;
      }
    }

    // 2. Si el valor ingresado son sólo dígitos numéricos
    if (/^\d+$/.test(rawVal)) {
      if (rawVal.length !== 11) {
        this.showValidation(`Formato de RUC inválido: ingresó ${rawVal.length} dígitos. El RUC debe contener exactamente 11 dígitos numéricos (ej. 20100041953).`, 'error');
        return;
      }

      if (!this.validateRucDigits(rawVal)) {
        return;
      }

      this.clearValidation();
      this.hideDropdown();
      state.setRuc(rawVal);
      return;
    }

    // 3. Si es búsqueda alfanumérica por nombre o razón social
    if (rawVal.length < 3) {
      this.showValidation('Ingrese al menos 3 caracteres para buscar por Razón Social de la empresa.', 'error');
      return;
    }

    this.clearValidation();
    this.performSearch(rawVal);
  },

  validateRucDigits(ruc) {
    if (!/^\d{11}$/.test(ruc)) {
      this.showValidation(`El RUC debe tener exactamente 11 dígitos numéricos (actual: ${ruc.length}).`, 'error');
      return false;
    }

    // Validación de prefijos SUNAT válidos en Perú (10: Persona Natural, 15: Extranjero, 17: Especial, 20: Persona Jurídica)
    const prefix = ruc.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefix)) {
      this.showValidation(`El RUC '${ruc}' no posee un prefijo válido de SUNAT (debe iniciar con 10, 15, 17 o 20).`, 'error');
      return false;
    }

    this.clearValidation();
    return true;
  },

  showValidation(message, type = 'error') {
    const msgBox = document.getElementById('searchValidationMsg');
    const msgText = document.getElementById('searchValidationText');
    if (!msgBox || !msgText) return;

    msgText.textContent = message;
    if (type === 'info') {
      msgBox.className = 'mt-1.5 p-2 bg-stone-100 dark:bg-sumi-surface border-l-2 border-stone-400 text-[11px] font-mono text-stone-600 dark:text-stone-300 flex items-center justify-between';
    } else {
      msgBox.className = 'mt-1.5 p-2 bg-red-50 dark:bg-vermilion/10 border-l-2 border-vermilion text-[11px] font-mono text-vermilion dark:text-red-300 flex items-center justify-between';
    }
    msgBox.classList.remove('hidden');
  },

  clearValidation() {
    const msgBox = document.getElementById('searchValidationMsg');
    if (msgBox) msgBox.classList.add('hidden');
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
