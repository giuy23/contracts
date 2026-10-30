/**
 * OECE / RONIN.SEACE - Módulo de Sidebar Fijo de KPIs e Identidad
 * Responsabilidad Única: Renderizar y actualizar el panel lateral vertical (Sticky Dossier).
 */

export const KpiSidebarComponent = {
  renderLoading() {
    const lblRazonSocial = document.getElementById('lblRazonSocial');
    if (lblRazonSocial) {
      lblRazonSocial.innerHTML = '<span class="inline-block animate-pulse text-vermilion">Consultando expediente forense SEACE...</span>';
    }

    const skeletonEl = (id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="inline-block animate-pulse text-stone-400">---</span>';
    };

    skeletonEl('kpiTotalContratos');
    skeletonEl('kpiMontoTotal');
    skeletonEl('kpiMontoSub');
    skeletonEl('kpiEntidades');
    skeletonEl('kpiPostorUnico');
    skeletonEl('kpiWinRate');
  },

  render(data, currentYear) {
    if (!data) {
      this.renderNotFound();
      return;
    }

    // 1. Identidad de la Empresa
    const lblRuc = document.getElementById('lblRuc');
    const lblRazonSocial = document.getElementById('lblRazonSocial');
    const lblSede = document.getElementById('lblSede');
    const badgeTipo = document.getElementById('badgeTipoProveedor');
    const lblPeriodo = document.getElementById('lblPeriodoAuditoria');

    if (lblRuc) lblRuc.textContent = data.ruc || '--';
    if (lblRazonSocial) lblRazonSocial.textContent = data.razon_social || 'EMPRESA NO IDENTIFICADA';
    if (lblSede) lblSede.textContent = data.departamento_sede || 'NO REGISTRADO';

    const isConsorcio = (data.tipo_proveedor || '').toUpperCase().includes('CONSORCIO');
    if (badgeTipo) {
      badgeTipo.textContent = isConsorcio ? 'CONSORCIO' : 'INDIVIDUAL';
      badgeTipo.className = `px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider ${
        isConsorcio ? 'bg-vermilion text-white shadow-sm' : 'bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200'
      }`;
    }

    if (lblPeriodo) {
      lblPeriodo.textContent = currentYear === 'all'
        ? 'Histórico Completo (2022 - 2026)'
        : `Ejercicio Fiscal ${currentYear}`;
    }

    // 2. Tarjetas KPI Verticales
    const totalContratos = Number(data.total_contratos || 0);
    const montoTotal = Number(data.monto_total_soles || 0);
    const entidadesDistintas = Number(data.entidades_distintas || 0);
    const tasaPostor = Number(data.tasa_postor_unico_pct || 0);
    const winRate = Number(data.win_rate_pct || 0);
    const postulaciones = Number(data.total_postulaciones || 0);

    // KPI 1: Contratos
    const elContratos = document.getElementById('kpiTotalContratos');
    if (elContratos) elContratos.textContent = totalContratos.toLocaleString('es-PE');

    // KPI 2: Monto Formalizado
    const elMonto = document.getElementById('kpiMontoTotal');
    const elMontoSub = document.getElementById('kpiMontoSub');
    if (elMonto) {
      elMonto.textContent = data.monto_total_formateado || `S/ ${(montoTotal / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`;
    }
    if (elMontoSub) {
      elMontoSub.textContent = `S/ ${montoTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // KPI 3: Entidades Clientes
    const elEntidades = document.getElementById('kpiEntidades');
    if (elEntidades) elEntidades.textContent = entidadesDistintas.toLocaleString('es-PE');

    // KPI 4: Tasa Postor Único con Semáforo de Riesgo
    const elPostor = document.getElementById('kpiPostorUnico');
    const barPostor = document.getElementById('barPostorUnico');
    const cardPostor = document.getElementById('cardPostorUnico');
    const badgePostorAlert = document.getElementById('badgePostorAlert');
    const elPostorDesc = document.getElementById('kpiPostorDesc');

    if (elPostor) elPostor.textContent = `${tasaPostor.toFixed(1)}%`;
    if (barPostor) barPostor.style.width = `${Math.min(tasaPostor, 100)}%`;

    if (totalContratos === 0) {
      if (cardPostor) cardPostor.className = "comic-panel p-3.5 border-l-4 border-l-stone-300 dark:border-l-stone-700 transition-all";
      if (badgePostorAlert) {
        badgePostorAlert.textContent = 'SIN CONTRATOS';
        badgePostorAlert.className = 'text-[9px] font-mono px-1.5 py-0.5 bg-stone-200 dark:bg-stone-700 text-stone-500 font-semibold';
      }
      if (elPostorDesc) {
        elPostorDesc.textContent = 'Sin adjudicaciones en el periodo';
        elPostorDesc.className = 'text-[10px] font-serif text-stone-400 italic';
      }
    } else if (tasaPostor >= 40) {
      if (cardPostor) {
        cardPostor.className = "comic-panel p-3.5 border-l-4 border-l-vermilion bg-vermilion/5 transition-all shadow-sm";
      }
      if (badgePostorAlert) {
        badgePostorAlert.textContent = '🚨 RIESGO ALTO';
        badgePostorAlert.className = 'text-[9px] font-mono px-1.5 py-0.5 bg-vermilion text-white font-bold';
      }
      if (elPostorDesc) {
        elPostorDesc.textContent = 'Bandera roja por falta de competencia postora';
        elPostorDesc.className = 'text-[10px] font-serif text-vermilion dark:text-red-400 font-semibold';
      }
    } else {
      if (cardPostor) {
        cardPostor.className = "comic-panel p-3.5 border-l-4 border-l-stone-400 dark:border-l-stone-600 transition-all";
      }
      if (badgePostorAlert) {
        badgePostorAlert.textContent = '⚖️ CONCURRENCIA';
        badgePostorAlert.className = 'text-[9px] font-mono px-1.5 py-0.5 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-semibold';
      }
      if (elPostorDesc) {
        elPostorDesc.textContent = 'Nivel estándar de oferentes múltiples';
        elPostorDesc.className = 'text-[10px] font-serif text-stone-500 dark:text-stone-400';
      }
    }

    // KPI 5: Win Rate Forense
    const elWinRate = document.getElementById('kpiWinRate');
    const barWinRate = document.getElementById('barWinRate');
    const elWinRateDesc = document.getElementById('kpiWinRateDesc');

    if (elWinRate) elWinRate.textContent = `${winRate.toFixed(1)}%`;
    if (barWinRate) barWinRate.style.width = `${Math.min(winRate, 100)}%`;
    if (elWinRateDesc) {
      elWinRateDesc.textContent = `${totalContratos} ganados de ${postulaciones} postulaciones`;
    }
  },

  renderNotFound(ruc, currentYear) {
    const lblRazonSocial = document.getElementById('lblRazonSocial');
    if (lblRazonSocial) {
      lblRazonSocial.textContent = 'RUC NO REGISTRADO EN EL PADRÓN SEACE';
    }

    const lblRuc = document.getElementById('lblRuc');
    if (lblRuc) lblRuc.textContent = ruc || '--';

    const lblSede = document.getElementById('lblSede');
    if (lblSede) lblSede.textContent = 'NO REGISTRADO';

    const lblPeriodo = document.getElementById('lblPeriodoAuditoria');
    if (lblPeriodo) lblPeriodo.textContent = currentYear === 'all' ? 'Histórico Completo' : currentYear;

    const badgeTipo = document.getElementById('badgeTipoProveedor');
    if (badgeTipo) {
      badgeTipo.textContent = 'DESCONOCIDO';
      badgeTipo.className = 'px-2 py-0.5 text-[9px] font-mono font-bold bg-stone-200 dark:bg-stone-700 text-stone-500';
    }

    document.getElementById('kpiTotalContratos').textContent = '0';
    document.getElementById('kpiMontoTotal').textContent = 'S/ 0.00';
    document.getElementById('kpiMontoSub').textContent = 'S/ 0.00';
    document.getElementById('kpiEntidades').textContent = '0';
    document.getElementById('kpiPostorUnico').textContent = '0.0%';
    document.getElementById('barPostorUnico').style.width = '0%';
    document.getElementById('kpiWinRate').textContent = '0.0%';
    document.getElementById('barWinRate').style.width = '0%';
  }
};
