/**
 * OECE / RONIN.SEACE - Módulo Principal / Orquestador de la Pantalla de Contratista
 * Arquitectura Modular orientada a Principios SOLID (Single Responsibility, Separation of Concerns).
 */

import { state } from './state.js';
import { ContratistaApiService } from './api.service.js';
import { KpiSidebarComponent } from './kpi-sidebar.js';
import { DonutChartComponent } from './donut-chart.js';
import { TimelineEventsComponent } from './timeline-events.js';
import { ClientsPanelComponent } from './clients-panel.js';
import { RivalsPanelComponent } from './rivals-panel.js';
import { ContractsTableComponent } from './contracts-table.js';
import { SearchBarComponent } from './search-bar.js';

class ContratistaApp {
  constructor() {
    this.isFetching = false;
  }

  init() {
    state.initFromUrl();
    this.initTheme();
    this.initDotCanvas();
    this.initControls();
    SearchBarComponent.init();

    // Suscripciones reactivas del estado
    state.subscribe('rucChanged', () => this.loadAllData());
    state.subscribe('yearChanged', () => this.loadAllData());
    state.subscribe('pageChanged', () => this.loadContratosOnly());

    // Carga inicial
    this.loadAllData();
  }

  initControls() {
    // Selector de Ejercicio Fiscal
    const selectYear = document.getElementById('selectYearFilter');
    if (selectYear) {
      selectYear.value = state.year;
      selectYear.addEventListener('change', (e) => {
        state.setYear(e.target.value);
      });
    }

    // Botón de Descarga Excel
    const btnExport = document.getElementById('btnExportExcel');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (!state.ruc) {
          alert('Por favor seleccione una empresa para exportar.');
          return;
        }
        window.location.href = ContratistaApiService.getExcelDownloadUrl(state.ruc, state.year);
      });
    }

    // Paginación de Contratos
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (state.page > 0) state.setPage(state.page - 1);
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        state.setPage(state.page + 1);
      });
    }

    // Exponer helpers en window para eventos inline
    window.selectFiscalYear = (year) => {
      if (selectYear) selectYear.value = year;
      state.setYear(year);
    };

    window.selectSearchedCompany = (ruc, razonSocial) => {
      const input = document.getElementById('searchContratistaInput');
      if (input) input.value = `${ruc} - ${razonSocial}`;
      SearchBarComponent.hideDropdown();
      state.setRuc(ruc);
    };

    window.togglePostoresRow = (convocatoria, item) => {
      ContractsTableComponent.toggleAccordion(convocatoria, item);
    };
  }

  /**
   * Carga paralela de todas las dimensiones forenses de la empresa
   */
  async loadAllData() {
    if (this.isFetching) return;
    this.isFetching = true;

    // Sincronizar el select visual de año con el estado actual
    const selectYear = document.getElementById('selectYearFilter');
    if (selectYear && selectYear.value !== state.year) {
      selectYear.value = state.year;
    }

    KpiSidebarComponent.renderLoading();
    ContractsTableComponent.renderLoading();

    try {
      const [summary, clientes, territorio, timeline, competidores, contratos] = await Promise.all([
        ContratistaApiService.getSummary(state.ruc, state.year).catch(e => { console.error(e); return null; }),
        ContratistaApiService.getClientes(state.ruc, state.year).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getTerritorio(state.ruc, state.year).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getTimeline(state.ruc).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getCompetidores(state.ruc, state.year).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getContratos(state.ruc, state.year, state.pageSize, 0).catch(e => { console.error(e); return []; })
      ]);

      state.setSummaryData(summary);
      KpiSidebarComponent.render(summary, state.year);
      DonutChartComponent.render('donutChartContainer', territorio);
      TimelineEventsComponent.render('timelineEventsContainer', timeline);
      ClientsPanelComponent.render('clientesContainer', clientes);
      RivalsPanelComponent.render('competidoresContainer', competidores);
      ContractsTableComponent.render(contratos);

    } catch (err) {
      console.error('Error general al cargar expediente forense:', err);
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Carga únicamente la página de contratos al paginar
   */
  async loadContratosOnly() {
    ContractsTableComponent.renderLoading();
    try {
      const offset = state.page * state.pageSize;
      const contratos = await ContratistaApiService.getContratos(state.ruc, state.year, state.pageSize, offset);
      ContractsTableComponent.render(contratos);
    } catch (err) {
      console.error('Error al paginar contratos:', err);
    }
  }

  /**
   * Inicialización del Tema Sumi / Washi
   */
  initTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    this.applyTheme(currentTheme);

    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        this.applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
      });
    }
  }

  applyTheme(theme) {
    const label = document.getElementById('themeLabel');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      if (label) label.textContent = '墨 SUMI-E';
    } else {
      document.documentElement.classList.remove('dark');
      if (label) label.textContent = '紙 WASHI';
    }
  }

  /**
   * Malla de puntos de fondo (Canvas)
   */
  initDotCanvas() {
    const canvas = document.getElementById('dotCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      drawDots();
    });

    function drawDots() {
      ctx.clearRect(0, 0, width, height);
      const spacing = 32;
      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';

      for (let x = 0; x < width; x += spacing) {
        for (let y = 0; y < height; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawDots();
  }
}

// Inicializar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  const app = new ContratistaApp();
  app.init();
});

