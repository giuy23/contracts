import { Controller, Get, Param, Query, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ContratistasService } from './contratistas.service';

@Controller('v1/contratistas')
export class ContratistasController {
  constructor(private readonly contratistasService: ContratistasService) {}

  /**
   * Búsqueda predictiva de empresas por RUC o Razón Social
   * GET /api/v1/contratistas/search?q=term
   */
  @Get('search')
  async search(@Query('q') query: string) {
    return this.contratistasService.search(query || '');
  }

  /**
   * Postores que compitieron en un ítem específico (Acordeón de contrato)
   * GET /api/v1/contratistas/postores?convocatoria=...&item=...
   */
  @Get('postores')
  async getPostoresItem(
    @Query('convocatoria') convocatoria: string,
    @Query('item') item: string
  ) {
    if (!convocatoria || !item) {
      throw new BadRequestException('Parámetros convocatoria e item son requeridos');
    }
    return this.contratistasService.getPostoresItem(convocatoria, parseInt(item, 10));
  }

  /**
   * Ficha de Identidad y KPIs Consolidados
   * GET /api/v1/contratistas/:ruc/summary?year=2025
   */
  @Get(':ruc/summary')
  async getSummary(
    @Param('ruc') ruc: string,
    @Query('year') year?: string
  ) {
    return this.contratistasService.getSummary(ruc, year);
  }

  /**
   * Top 10 Entidades Clientes de la Empresa
   * GET /api/v1/contratistas/:ruc/clientes?year=2025
   */
  @Get(':ruc/clientes')
  async getClientes(
    @Param('ruc') ruc: string,
    @Query('year') year?: string
  ) {
    return this.contratistasService.getClientes(ruc, year);
  }

  /**
   * Distribución Territorial de Contratos
   * GET /api/v1/contratistas/:ruc/territorio?year=2025
   */
  @Get(':ruc/territorio')
  async getTerritorio(
    @Param('ruc') ruc: string,
    @Query('year') year?: string
  ) {
    return this.contratistasService.getTerritorio(ruc, year);
  }

  /**
   * Evolución Histórica Anual (2022-2026)
   * GET /api/v1/contratistas/:ruc/timeline
   */
  @Get(':ruc/timeline')
  async getTimeline(@Param('ruc') ruc: string) {
    return this.contratistasService.getTimeline(ruc);
  }

  /**
   * Red Forense de Rivales Habituales (Bid Rigging Check)
   * GET /api/v1/contratistas/:ruc/competidores?year=2025
   */
  @Get(':ruc/competidores')
  async getCompetidores(
    @Param('ruc') ruc: string,
    @Query('year') year?: string
  ) {
    return this.contratistasService.getCompetidores(ruc, year);
  }

  /**
   * Grilla Detallada de Contratos (Paginada)
   * GET /api/v1/contratistas/:ruc/contratos?year=2025&limit=50&offset=0
   */
  @Get(':ruc/contratos')
  async getContratos(
    @Param('ruc') ruc: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    return this.contratistasService.getContratos(ruc, year, limitNum, offsetNum);
  }

  /**
   * Exportación Forense a Excel (.xlsx) con Streaming
   * GET /api/v1/contratistas/:ruc/export-excel?year=2025
   */
  @Get(':ruc/export-excel')
  async exportarExcel(
    @Param('ruc') ruc: string,
    @Query('year') year: string,
    @Res() res: Response
  ) {
    return this.contratistasService.exportarExcel(ruc, year, res);
  }
}
