import { Controller, Get, Query } from '@nestjs/common';
import { CockpitService, CockpitQueryParams } from './cockpit.service';

@Controller('v1/cockpit')
export class CockpitController {
  constructor(private readonly cockpitService: CockpitService) {}

  /**
   * Endpoint maestro consolidado para la pantalla principal (Cockpit Forense)
   * Devuelve KPIs, Rankings, Distribución por modalidad y Top Entidades en 1 round-trip.
   */
  @Get('data')
  async getCockpitData(@Query() query: CockpitQueryParams) {
    return this.cockpitService.getCockpitData(query);
  }

  /**
   * Endpoint de KPIs exclusivo (compatibilidad)
   */
  @Get('kpis')
  async getKpis(@Query() query: CockpitQueryParams) {
    const res = await this.cockpitService.getCockpitData(query);
    return res.data?.kpis || {};
  }

  /**
   * Endpoint de Top Contratistas (compatibilidad)
   */
  @Get('top-contratistas')
  async getTopContratistas(
    @Query('criterio') criterio: string,
    @Query() query: CockpitQueryParams
  ) {
    const res = await this.cockpitService.getCockpitData(query);
    if (criterio === 'monto') {
      return res.data?.top_contratistas_monto || [];
    }
    return res.data?.top_contratistas_cantidad || [];
  }

  /**
   * Endpoint de Distribución por Procesos (compatibilidad)
   */
  @Get('distribucion-procesos')
  async getDistribucionProcesos(@Query() query: CockpitQueryParams) {
    const res = await this.cockpitService.getCockpitData(query);
    return res.data?.distribucion_tipo_proceso || [];
  }

  /**
   * Endpoint de Métricas Regionales (Contratos y Promedio de Participantes por Región)
   */
  @Get('metricas-regionales')
  async getMetricasRegionales(@Query() query: CockpitQueryParams) {
    const res = await this.cockpitService.getCockpitData(query);
    return res.data?.metricas_regionales || [];
  }
}
