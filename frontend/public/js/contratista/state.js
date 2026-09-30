/**
 * OECE / RONIN.SEACE - Almacén de Estado Reactivo de Contratista
 * Responsabilidad Única: Gestión centralizada del estado de la pantalla y notificación a observadores.
 */

class ContratistaStateStore {
  constructor() {
    this.ruc = '20100041953'; // RUC demo inicial
    this.year = '2026';        // Año fiscal por defecto 2026 (en curso)
    this.page = 0;
    this.pageSize = 25;
    this.summaryData = null;
    this.expandedRows = new Set();
    this.listeners = new Map();
  }

  /**
   * Suscribe una función listener a un evento específico
   */
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  /**
   * Notifica a los suscriptores de un evento
   */
  notify(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error en listener de evento ${event}:`, err);
        }
      });
    }
  }

  setRuc(newRuc) {
    if (!newRuc || this.ruc === newRuc) return;
    this.ruc = newRuc.trim();
    this.page = 0;
    this.expandedRows.clear();
    this.updateUrl();
    this.notify('rucChanged', this.ruc);
  }

  setYear(newYear) {
    if (!newYear || this.year === newYear) return;
    this.year = newYear;
    this.page = 0;
    this.expandedRows.clear();
    this.updateUrl();
    this.notify('yearChanged', this.year);
  }

  setPage(newPage) {
    if (newPage < 0 || this.page === newPage) return;
    this.page = newPage;
    this.notify('pageChanged', this.page);
  }

  setSummaryData(data) {
    this.summaryData = data;
    this.notify('summaryUpdated', data);
  }

  toggleExpandedRow(key) {
    const isExpanded = this.expandedRows.has(key);
    if (isExpanded) {
      this.expandedRows.delete(key);
    } else {
      this.expandedRows.add(key);
    }
    this.notify('expandedRowsChanged', { key, isExpanded: !isExpanded });
    return !isExpanded;
  }

  isRowExpanded(key) {
    return this.expandedRows.has(key);
  }

  updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('ruc', this.ruc);
    url.searchParams.set('year', this.year);
    window.history.replaceState({}, '', url.toString());
  }

  initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rucParam = params.get('ruc');
    const yearParam = params.get('year');

    if (rucParam && rucParam.trim().length > 0) {
      this.ruc = rucParam.trim();
    }

    if (yearParam && ['2026', '2025', '2024', '2023', '2022', 'all'].includes(yearParam)) {
      this.year = yearParam;
    } else {
      this.year = '2026';
    }
  }
}

export const state = new ContratistaStateStore();

