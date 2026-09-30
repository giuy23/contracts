import { Controller, Get, Query } from '@nestjs/common';
import { FiltrosService } from './filtros.service';

@Controller('v1/filtros')
export class FiltrosController {
  constructor(private readonly filtrosService: FiltrosService) {}

  @Get('departamentos')
  async getDepartamentos() {
    return this.filtrosService.getDepartamentos();
  }

  @Get('provincias')
  async getProvincias(@Query('departamento') departamento: string) {
    return this.filtrosService.getProvincias(departamento);
  }

  @Get('distritos')
  async getDistritos(
    @Query('departamento') departamento: string,
    @Query('provincia') provincia: string
  ) {
    return this.filtrosService.getDistritos(departamento, provincia);
  }

  @Get('monedas')
  async getMonedas() {
    return this.filtrosService.getMonedas();
  }

  @Get('tipos-proceso')
  async getTiposProceso() {
    return this.filtrosService.getTiposProceso();
  }

  @Get('estados')
  async getEstados() {
    return this.filtrosService.getEstados();
  }
}
