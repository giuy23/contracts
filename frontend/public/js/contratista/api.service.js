/**
 * OECE / RONIN.SEACE - Servicio de API para Contratistas
 * Responsabilidad Única: Manejo de llamadas HTTP fetch al backend NestJS.
 */

const BASE_URL = '/api/v1/contratistas';

export const ContratistaApiService = {
  /**
   * Búsqueda predictiva de empresas por RUC o Razón Social
   */
  async search(query) {
    if (!query || query.trim().length < 2) return [];
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) throw new Error(`Error en búsqueda (${res.status})`);
    return res.json();
  },

  /**
   * Ficha de Identidad y 5 KPIs Consolidados
   */
  async getSummary(ruc, year) {
    const url = `${BASE_URL}/${encodeURIComponent(ruc)}/summary?year=${encodeURIComponent(year || '2026')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Empresa no encontrada (${res.status})`);
    return res.json();
  },

  /**
   * Top 10 Entidades Clientes
   */
  async getClientes(ruc, year) {
    const url = `${BASE_URL}/${encodeURIComponent(ruc)}/clientes?year=${encodeURIComponent(year || '2026')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error al obtener clientes (${res.status})`);
    return res.json();
  },

  /**
   * Distribución Territorial de Contratos
   */
  async getTerritorio(ruc, year) {
    const url = `${BASE_URL}/${encodeURIComponent(ruc)}/territorio?year=${encodeURIComponent(year || '2026')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error al obtener territorio (${res.status})`);
    return res.json();
  },

  /**
   * Evolución Histórica Anual (2022-2026)
   */
  async getTimeline(ruc) {
    const url = `${BASE_URL}/${encodeURIComponent(ruc)}/timeline`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error al obtener línea de tiempo (${res.status})`);
    return res.json();
  },

  /**
   * Red Forense de Rivales Habituales (Bid Rigging Check)
   */
  async getCompetidores(ruc, year) {
    const url = `${BASE_URL}/${encodeURIComponent(ruc)}/competidores?year=${encodeURIComponent(year || '2026')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error al obtener competidores (${res.status})`);
    return res.json();
  },

  /**
   * Grilla Detallada de Contratos (Paginada)
   */
  async getContratos(ruc, year, limit = 25, offset = 0) {
    const url = `${BASE_URL}/${encodeURIComponent(ruc)}/contratos?year=${encodeURIComponent(year || '2026')}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error al obtener contratos (${res.status})`);
    return res.json();
  },

  /**
   * Postores de un Ítem Específico (Acordeón)
   */
  async getPostoresItem(convocatoria, item) {
    const url = `${BASE_URL}/postores?convocatoria=${encodeURIComponent(convocatoria)}&item=${encodeURIComponent(item)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error al obtener postores del ítem (${res.status})`);
    return res.json();
  },

  /**
   * Genera URL de streaming para exportación en Excel
   */
  getExcelDownloadUrl(ruc, year) {
    return `${BASE_URL}/${encodeURIComponent(ruc)}/export-excel?year=${encodeURIComponent(year || '2026')}`;
  }
};
