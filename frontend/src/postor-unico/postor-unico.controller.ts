import { Controller, Get, Query } from '@nestjs/common';
import { PostorUnicoService, PostorUnicoQueryParams } from './postor-unico.service';

@Controller('v1/postor-unico')
export class PostorUnicoController {
  constructor(private readonly postorUnicoService: PostorUnicoService) {}

  /**
   * GET /api/v1/postor-unico/regiones
   * Retorna los KPIs, el Mapa de Calor y los datos de Dona por región/provincia/distrito.
   */
  @Get('regiones')
  async getPanoramaRegional(@Query() query: PostorUnicoQueryParams) {
    return this.postorUnicoService.getPanoramaRegional(query);
  }

  /**
   * GET /api/v1/postor-unico/empresas
   * Retorna el desglose de empresas reales que ganaron como postor único en la región seleccionada.
   */
  @Get('empresas')
  async getEmpresasPorRegion(@Query() query: PostorUnicoQueryParams) {
    return this.postorUnicoService.getEmpresasPorRegion(query);
  }
}

