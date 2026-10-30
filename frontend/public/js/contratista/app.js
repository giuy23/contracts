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
    this.activeRequestId = 0;
  }

  init() {
    state.initFromUrl();
    this.initTheme();
    this.initDotCanvas();
    this.initControls();
    SearchBarComponent.init();

    // Suscripciones reactivas del estado
    state.subscribe('rucChanged', () => {
      this.updateNavigationLinks();
      this.loadAllData();
    });
    state.subscribe('yearChanged', () => {
      this.updateNavigationLinks();
      this.loadAllData();
    });
    state.subscribe('pageChanged', () => this.loadContratosOnly());

    // Carga inicial
    this.updateNavigationLinks();
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

    // Botón de Descarga Excel Forense con comprobación de datos
    const btnExport = document.getElementById('btnExportExcel');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (!state.ruc) {
          alert('Por favor seleccione una empresa para exportar.');
          return;
        }
        if (!state.summaryData || Number(state.summaryData.total_contratos || 0) === 0) {
          alert(`El contratista ${state.ruc} no registra contratos formalizados en el periodo seleccionado (${state.year === 'all' ? 'Histórico' : state.year}).`);
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
      SearchBarComponent.selectCompany(ruc, razonSocial);
    };

    window.togglePostoresRow = (convocatoria, item) => {
      ContractsTableComponent.toggleAccordion(convocatoria, item);
    };
  }

  /**
   * Sincroniza dinámicamente los enlaces de navegación de la cabecera para preservar
   * el filtro de año fiscal al volver a la pantalla principal (index.html) o al Radar de Postor Único
   */
  updateNavigationLinks() {
    const returnYear = state.year === 'all' ? '2026' : state.year;
    const returnUrl = `/index.html?year=${encodeURIComponent(returnYear)}`;
    const postorUnicoUrl = `/postor-unico.html?year=${encodeURIComponent(state.year)}`;

    ['headerLogoLink', 'headerBrandLink', 'navTabGeneralLink', 'btnVolverGeneral'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('href', returnUrl);
    });

    const navTabContratista = document.getElementById('navTabContratistaLink');
    if (navTabContratista) {
      navTabContratista.setAttribute('href', `/contratista.html?ruc=${encodeURIComponent(state.ruc)}&year=${encodeURIComponent(state.year)}`);
    }

    const navTabPostorUnico = document.getElementById('navTabPostorUnicoLink');
    if (navTabPostorUnico) {
      navTabPostorUnico.setAttribute('href', postorUnicoUrl);
    }

    const btnVolverPostorUnico = document.getElementById('btnVolverPostorUnico');
    if (btnVolverPostorUnico) {
      btnVolverPostorUnico.setAttribute('href', postorUnicoUrl);
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('from') === 'postor-unico') {
        btnVolverPostorUnico.classList.remove('hidden');
      }
    }
  }

  /**
   * Carga paralela de todas las dimensiones forenses de la empresa sin carreras
   */
  async loadAllData() {
    const reqId = ++this.activeRequestId;

    // Sincronizar el select visual de año con el estado actual
    const selectYear = document.getElementById('selectYearFilter');
    if (selectYear && selectYear.value !== state.year) {
      selectYear.value = state.year;
    }

    // Renderizar estados de carga en los 6 paneles inmediatamente
    KpiSidebarComponent.renderLoading();
    DonutChartComponent.renderLoading('donutChartContainer');
    TimelineEventsComponent.renderLoading('timelineEventsContainer');
    ClientsPanelComponent.renderLoading('clientesContainer');
    RivalsPanelComponent.renderLoading('competidoresContainer');
    ContractsTableComponent.renderLoading();
    this.hideAlertBanner();

    try {
      const [summary, clientes, territorio, timeline, competidores, contratos] = await Promise.all([
        ContratistaApiService.getSummary(state.ruc, state.year).catch(e => { console.error(e); return null; }),
        ContratistaApiService.getClientes(state.ruc, state.year).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getTerritorio(state.ruc, state.year).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getTimeline(state.ruc).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getCompetidores(state.ruc, state.year).catch(e => { console.error(e); return []; }),
        ContratistaApiService.getContratos(state.ruc, state.year, state.pageSize, 0).catch(e => { console.error(e); return []; })
      ]);

      // Si llegó otra petición posterior, descartar esta respuesta obsoleta
      if (reqId !== this.activeRequestId) return;

      state.setSummaryData(summary);

      if (!summary) {
        // Caso: Empresa no existe en la BD
        KpiSidebarComponent.renderNotFound(state.ruc, state.year);
        this.renderNotFoundBanner(state.ruc);
      } else {
        // Caso normal o empresa con 0 contratos en el año
        KpiSidebarComponent.render(summary, state.year);
        this.syncSearchInputValue(summary);

        if (summary.total_contratos === 0) {
          this.renderEmptyContractsBanner(summary, timeline);
        }
      }

      DonutChartComponent.render('donutChartContainer', territorio);
      TimelineEventsComponent.render('timelineEventsContainer', timeline);
      ClientsPanelComponent.render('clientesContainer', clientes);
      RivalsPanelComponent.render('competidoresContainer', competidores);
      ContractsTableComponent.render(contratos);

    } catch (err) {
      console.error('Error general al cargar expediente forense:', err);
    }
  }

  syncSearchInputValue(summary) {
    const input = document.getElementById('searchContratistaInput');
    if (input && document.activeElement !== input && summary) {
      input.value = `${summary.ruc} - ${summary.razon_social}`;
    }
  }

  renderNotFoundBanner(ruc) {
    const banner = document.getElementById('contratistaAlertBanner');
    if (!banner) return;
    banner.className = 'comic-panel corner-bracket p-4 border-l-4 border-l-vermilion bg-vermilion/5 mb-6';
    banner.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div>
          <span class="font-bold text-vermilion text-sm block">⚠️ RUC NO ENCONTRADO EN PADRÓN SEACE</span>
          <p class="text-stone-600 dark:text-stone-300 mt-0.5">
            El número de RUC <strong>${ruc}</strong> no registra inscripción formal como organización proveedora o contratista en el sistema.
          </p>
        </div>
        <button 
          onclick="window.selectSearchedCompany('20100041953', 'RIMAC SEGUROS Y REASEGUROS')" 
          class="px-3 py-1.5 bg-vermilion text-white font-cinzel text-xs font-bold whitespace-nowrap hover:bg-vermilion-dark transition"
        >
          Cargar Empresa Demo (Rimac)
        </button>
      </div>
    `;
    banner.classList.remove('hidden');
  }

  renderEmptyContractsBanner(summary, timeline) {
    const banner = document.getElementById('contratistaAlertBanner');
    if (!banner) return;

    const yearsWithContracts = (timeline || []).filter(t => t.total_contratos > 0);
    const lastActiveYear = yearsWithContracts.length > 0 ? yearsWithContracts[yearsWithContracts.length - 1].year : null;

    banner.className = 'comic-panel corner-bracket p-4 border-l-4 border-l-gold-crest bg-gold-crest/5 mb-6';
    banner.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div>
          <span class="font-bold text-sumi-black dark:text-stone-100 text-sm block">
            ⚖️ SIN CONTRATOS REGISTRADOS EN ${state.year === 'all' ? 'TODO EL HISTÓRICO' : `EL EJERCICIO FISCAL ${state.year}`}
          </span>
          <p class="text-stone-600 dark:text-stone-300 mt-0.5">
            La empresa <strong>${summary.razon_social}</strong> (RUC ${summary.ruc}) no formalizó contratos en este periodo.
            ${lastActiveYear ? `Se registran contratos en el ejercicio <strong>${lastActiveYear}</strong>.` : ''}
          </p>
        </div>
        <div class="flex items-center gap-2">
          ${lastActiveYear ? `
            <button 
              onclick="window.selectFiscalYear('${lastActiveYear}')" 
              class="px-3 py-1.5 bg-vermilion text-white font-cinzel text-xs font-bold hover:bg-vermilion-dark transition whitespace-nowrap"
            >
              Ir al año ${lastActiveYear} ↗
            </button>
          ` : ''}
          <button 
            onclick="window.selectFiscalYear('all')" 
            class="px-3 py-1.5 border border-washi-border dark:border-sumi-border bg-white dark:bg-sumi-deep hover:border-vermilion text-sumi-black dark:text-stone-200 font-cinzel text-xs font-bold transition whitespace-nowrap"
          >
            Ver Todo el Histórico (2022-2026)
          </button>
        </div>
      </div>
    `;
    banner.classList.remove('hidden');
  }

  hideAlertBanner() {
    const banner = document.getElementById('contratistaAlertBanner');
    if (banner) banner.classList.add('hidden');
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
   * Inicialización del Tema Sumi / Washi con sincronización a localStorage
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
