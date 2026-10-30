import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface PostorUnicoQueryParams {
  year?: string;
  month?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  tipo_proceso?: string;
  region?: string;
  group_by?: string;
  limit?: string;
  offset?: string;
}

@Injectable()
export class PostorUnicoService {
  private readonly logger = new Logger(PostorUnicoService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Obtiene el panorama territorial (Mapa de Calor + Dona + 4 KPIs) de contratos con Postor Único.
   * Escala automáticamente la agrupación geográfica: DEPARTAMENTO -> PROVINCIA -> DISTRITO,
   * o permite especificar explícitamente group_by ('departamento' | 'provincia' | 'distrito').
   */
  async getPanoramaRegional(params: PostorUnicoQueryParams) {
    const year = params.year && params.year !== 'all' ? parseInt(params.year, 10) : null;
    const month = params.month && params.month !== 'all' ? parseInt(params.month, 10) : null;
    const departamento = params.departamento && params.departamento !== 'all' ? params.departamento : null;
    const provincia = params.provincia && params.provincia !== 'all' ? params.provincia : null;
    const distrito = params.distrito && params.distrito !== 'all' ? params.distrito : null;
    const tipo_proceso = params.tipo_proceso && params.tipo_proceso !== 'all' ? params.tipo_proceso : null;
    const requestedGroup = (params.group_by || '').toLowerCase();

    const geoColumn = requestedGroup === 'distrito'
      ? 'conv.distrito_item'
      : requestedGroup === 'provincia'
        ? 'conv.provincia_item'
        : requestedGroup === 'departamento'
          ? 'conv.departamento_item'
          : provincia
            ? 'conv.distrito_item'
            : departamento
              ? 'conv.provincia_item'
              : 'conv.departamento_item';

    const nivelGeografico = geoColumn.includes('distrito')
      ? 'DISTRITO'
      : geoColumn.includes('provincia')
        ? 'PROVINCIA'
        : 'DEPARTAMENTO';

    const filterParams = [
      year, year,
      month, month,
      departamento, departamento,
      provincia, provincia,
      distrito, distrito,
      tipo_proceso, tipo_proceso
    ];

    const sqlRegiones = `
      WITH contratos_filtrados AS (
          SELECT 
              COALESCE(NULLIF(TRIM(${geoColumn}), ''), 'NO ESPECIFICADO') AS region,
              c.codigo_contrato,
              c.numero_item,
              c.codigo_convocatoria,
              c.id_contratista,
              c.monto_contratado_item
          FROM contratos c
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
            AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
            AND (? IS NULL OR conv.departamento_item = ?)
            AND (? IS NULL OR conv.provincia_item = ?)
            AND (? IS NULL OR conv.distrito_item = ?)
            AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
      ),
      items_distintos AS (
          SELECT DISTINCT codigo_convocatoria, numero_item
          FROM contratos_filtrados
      ),
      concurrencia_item AS (
          SELECT 
              id.codigo_convocatoria,
              id.numero_item,
              COUNT(DISTINCT o.id_postor) AS cant_postores
          FROM items_distintos id
          LEFT JOIN ofertantes o 
              ON id.codigo_convocatoria = o.codigo_convocatoria 
             AND id.numero_item = o.numero_item
          GROUP BY id.codigo_convocatoria, id.numero_item
      ),
      contratos_evaluados AS (
          SELECT 
              cf.region,
              cf.codigo_contrato,
              cf.numero_item,
              cf.id_contratista,
              cf.monto_contratado_item,
              CASE WHEN ci.cant_postores = 1 THEN 1 ELSE 0 END AS es_postor_unico
          FROM contratos_filtrados cf
          LEFT JOIN concurrencia_item ci 
              ON cf.codigo_convocatoria = ci.codigo_convocatoria 
             AND cf.numero_item = ci.numero_item
      )
      SELECT 
          ce.region,
          COUNT(DISTINCT ce.codigo_contrato, ce.numero_item) AS total_contratos_region,
          COUNT(DISTINCT CASE WHEN ce.es_postor_unico = 1 THEN CONCAT(ce.codigo_contrato, '-', ce.numero_item) END) AS contratos_postor_unico,
          ROUND(
              COALESCE(
                  (COUNT(DISTINCT CASE WHEN ce.es_postor_unico = 1 THEN CONCAT(ce.codigo_contrato, '-', ce.numero_item) END) * 100.0) /
                  NULLIF(COUNT(DISTINCT ce.codigo_contrato, ce.numero_item), 0),
                  0.00
              ), 2
          ) AS tasa_postor_unico_region_pct,
          COALESCE(SUM(CASE WHEN ce.es_postor_unico = 1 THEN ce.monto_contratado_item ELSE 0 END), 0.00) AS monto_postor_unico_soles,
          COUNT(DISTINCT CASE WHEN ce.es_postor_unico = 1 THEN pae.id_empresa_real END) AS empresas_beneficiarias_region
      FROM contratos_evaluados ce
      LEFT JOIN puente_actor_empresa pae 
          ON ce.id_contratista = pae.id_actor_original
      GROUP BY ce.region
      ORDER BY contratos_postor_unico DESC, monto_postor_unico_soles DESC;
    `;

    try {
      const rows = await this.db.query<any>(sqlRegiones, filterParams);

      const totalContratosEvaluados = rows.reduce((acc, r) => acc + Number(r.total_contratos_region || 0), 0);
      const totalContratosPU = rows.reduce((acc, r) => acc + Number(r.contratos_postor_unico || 0), 0);
      const montoTotalPU = rows.reduce((acc, r) => acc + Number(r.monto_postor_unico_soles || 0), 0);
      const tasaGlobalPU = totalContratosEvaluados > 0
        ? Number(((totalContratosPU * 100.0) / totalContratosEvaluados).toFixed(2))
        : 0;

      const regiones = rows
        .filter(r => Number(r.contratos_postor_unico || 0) > 0)
        .map(r => {
        const cPU = Number(r.contratos_postor_unico || 0);
        const pctSobreTotalPU = totalContratosPU > 0
          ? Number(((cPU * 100.0) / totalContratosPU).toFixed(2))
          : 0;

        return {
          region: r.region,
          total_contratos_region: Number(r.total_contratos_region || 0),
          contratos_postor_unico: cPU,
          tasa_postor_unico_region_pct: Number(r.tasa_postor_unico_region_pct || 0),
          monto_postor_unico_soles: Number(r.monto_postor_unico_soles || 0),
          pct_sobre_total_nacional_pu: pctSobreTotalPU,
          empresas_beneficiarias_region: Number(r.empresas_beneficiarias_region || 0)
        };
      });

      const regionCritica = regiones.length > 0 ? regiones[0].region : 'NINGUNA';

      return {
        success: true,
        data: {
          nivel_geografico: nivelGeografico,
          kpis: {
            total_contratos_evaluados: totalContratosEvaluados,
            total_contratos_postor_unico: totalContratosPU,
            tasa_postor_unico_pct: tasaGlobalPU,
            monto_postor_unico_soles: montoTotalPU,
            monto_postor_unico_formateado: `S/ ${(montoTotalPU / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`,
            region_critica: regionCritica
          },
          regiones
        }
      };
    } catch (error: any) {
      this.logger.error(`Error en getPanoramaRegional: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: {
          nivel_geografico: nivelGeografico,
          kpis: {
            total_contratos_evaluados: 0,
            total_contratos_postor_unico: 0,
            tasa_postor_unico_pct: 0,
            monto_postor_unico_soles: 0,
            monto_postor_unico_formateado: 'S/ 0 MM',
            region_critica: '--'
          },
          regiones: []
        }
      };
    }
  }

  /**
   * Obtiene el desglose de Empresas Reales (vía puente_actor_empresa con prorrateo 1/N)
   * que ganaron contratos como Postor Único en la región seleccionada.
   */
  async getEmpresasPorRegion(params: PostorUnicoQueryParams) {
    const year = params.year && params.year !== 'all' ? parseInt(params.year, 10) : null;
    const month = params.month && params.month !== 'all' ? parseInt(params.month, 10) : null;
    const departamento = params.departamento && params.departamento !== 'all' ? params.departamento : null;
    const provincia = params.provincia && params.provincia !== 'all' ? params.provincia : null;
    const distrito = params.distrito && params.distrito !== 'all' ? params.distrito : null;
    const tipo_proceso = params.tipo_proceso && params.tipo_proceso !== 'all' ? params.tipo_proceso : null;
    const region = params.region && params.region !== 'all' ? params.region.trim() : null;
    const limit = Math.min(Math.max(parseInt(params.limit || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(params.offset || '0', 10) || 0, 0);

    const requestedGroup = (params.group_by || '').toLowerCase();
    const geoColumn = requestedGroup === 'distrito'
      ? 'conv.distrito_item'
      : requestedGroup === 'provincia'
        ? 'conv.provincia_item'
        : requestedGroup === 'departamento'
          ? 'conv.departamento_item'
          : provincia
            ? 'conv.distrito_item'
            : departamento
              ? 'conv.provincia_item'
              : 'conv.departamento_item';

    const queryParams = [
      year, year,
      month, month,
      region, region,
      departamento, departamento,
      provincia, provincia,
      distrito, distrito,
      tipo_proceso, tipo_proceso,
      limit,
      offset
    ];

    const sql = `
      WITH contratos_filtrados AS (
          SELECT 
              c.codigo_contrato,
              c.numero_item,
              c.codigo_convocatoria,
              c.id_contratista,
              c.monto_contratado_item,
              conv.ruc_entidad
          FROM contratos c
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
            AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
            AND (? IS NULL OR COALESCE(NULLIF(TRIM(${geoColumn}), ''), 'NO ESPECIFICADO') = ?)
            AND (? IS NULL OR conv.departamento_item = ?)
            AND (? IS NULL OR conv.provincia_item = ?)
            AND (? IS NULL OR conv.distrito_item = ?)
            AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
      ),
      items_distintos AS (
          SELECT DISTINCT codigo_convocatoria, numero_item
          FROM contratos_filtrados
      ),
      concurrencia_item AS (
          SELECT 
              id.codigo_convocatoria,
              id.numero_item,
              COUNT(DISTINCT o.id_postor) AS cant_postores
          FROM items_distintos id
          LEFT JOIN ofertantes o 
              ON id.codigo_convocatoria = o.codigo_convocatoria 
             AND id.numero_item = o.numero_item
          GROUP BY id.codigo_convocatoria, id.numero_item
      ),
      contratos_empresa_region AS (
          SELECT 
              emp.id_organizacion,
              emp.numero_documento AS ruc,
              emp.razon_social,
              cf.codigo_contrato,
              cf.numero_item,
              cf.ruc_entidad,
              pae.es_consorcio,
              ROUND(cf.monto_contratado_item * pae.factor_equitativo, 2) AS monto_atribuido,
              CASE WHEN ci.cant_postores = 1 THEN 1 ELSE 0 END AS es_postor_unico
          FROM contratos_filtrados cf
          INNER JOIN puente_actor_empresa pae 
              ON cf.id_contratista = pae.id_actor_original
          INNER JOIN organizaciones emp 
              ON pae.id_empresa_real = emp.id_organizacion
          LEFT JOIN concurrencia_item ci 
              ON cf.codigo_convocatoria = ci.codigo_convocatoria 
             AND cf.numero_item = ci.numero_item
      )
      SELECT 
          ruc,
          razon_social,
          COUNT(DISTINCT CASE WHEN es_postor_unico = 1 THEN CONCAT(codigo_contrato, '-', numero_item) END) AS contratos_postor_unico,
          COUNT(DISTINCT codigo_contrato, numero_item) AS total_contratos_region,
          ROUND(
              (COUNT(DISTINCT CASE WHEN es_postor_unico = 1 THEN CONCAT(codigo_contrato, '-', numero_item) END) * 100.0) /
              NULLIF(COUNT(DISTINCT codigo_contrato, numero_item), 0),
              1
          ) AS pct_dominancia_pu,
          SUM(CASE WHEN es_postor_unico = 1 AND es_consorcio = 0 THEN 1 ELSE 0 END) AS pu_individuales,
          SUM(CASE WHEN es_postor_unico = 1 AND es_consorcio = 1 THEN 1 ELSE 0 END) AS pu_en_consorcio,
          COALESCE(SUM(CASE WHEN es_postor_unico = 1 THEN monto_atribuido ELSE 0 END), 0.00) AS monto_postor_unico_soles,
          COUNT(DISTINCT CASE WHEN es_postor_unico = 1 THEN ruc_entidad END) AS entidades_capturadas
      FROM contratos_empresa_region
      GROUP BY id_organizacion, ruc, razon_social
      HAVING contratos_postor_unico > 0
      ORDER BY contratos_postor_unico DESC, monto_postor_unico_soles DESC
      LIMIT ? OFFSET ?;
    `;

    try {
      const rows = await this.db.query<any>(sql, queryParams);
      return {
        success: true,
        region: region || 'NACIONAL',
        items: rows.map(r => ({
          ruc: r.ruc,
          razon_social: r.razon_social,
          contratos_postor_unico: Number(r.contratos_postor_unico || 0),
          total_contratos_region: Number(r.total_contratos_region || 0),
          pct_dominancia_pu: Number(r.pct_dominancia_pu || 0),
          pu_individuales: Number(r.pu_individuales || 0),
          pu_en_consorcio: Number(r.pu_en_consorcio || 0),
          monto_postor_unico_soles: Number(r.monto_postor_unico_soles || 0),
          entidades_capturadas: Number(r.entidades_capturadas || 0)
        }))
      };
    } catch (error: any) {
      this.logger.error(`Error en getEmpresasPorRegion: ${error.message}`);
      return {
        success: false,
        error: error.message,
        region: region || 'NACIONAL',
        items: []
      };
    }
  }
}
