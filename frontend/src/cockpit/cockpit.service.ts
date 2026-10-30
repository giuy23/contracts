import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CockpitQueryParams {
  year: string;
  month?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  moneda?: string;
  tipo_proceso?: string;
  estado?: string;
}

@Injectable()
export class CockpitService {
  private readonly logger = new Logger(CockpitService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Obtiene todos los datos consolidados de la pantalla principal en una sola llamada paralela
   */
  async getCockpitData(params: CockpitQueryParams) {
    const year = parseInt(params.year || '2026', 10);
    const month = params.month && params.month !== 'all' ? parseInt(params.month, 10) : null;
    const departamento = params.departamento && params.departamento !== 'all' ? params.departamento : null;
    const provincia = params.provincia && params.provincia !== 'all' ? params.provincia : null;
    const distrito = params.distrito && params.distrito !== 'all' ? params.distrito : null;
    const moneda = params.moneda && params.moneda !== 'all' ? params.moneda : null;
    const tipo_proceso = params.tipo_proceso && params.tipo_proceso !== 'all' ? params.tipo_proceso : null;
    const estado = params.estado && params.estado !== 'all' ? params.estado : null;

    // Vector de parámetros base alineado con:
    // WHERE YEAR(c.fecha_suscripcion_contrato) = ?
    //   AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
    //   AND (? IS NULL OR conv.departamento_item = ?)
    //   AND (? IS NULL OR conv.provincia_item = ?)
    //   AND (? IS NULL OR conv.distrito_item = ?)
    //   AND (? IS NULL OR conv.moneda = ?)
    //   AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
    //   AND (? IS NULL OR conv.estado_item = ?)
    const baseParams = [
      year,
      month, month,
      departamento, departamento,
      provincia, provincia,
      distrito, distrito,
      moneda, moneda,
      tipo_proceso, tipo_proceso,
      estado, estado
    ];

    // Parámetros para la CTE de items convocados (usa conv.fecha_convocatoria y no tiene filtro de moneda de contrato)
    const itemsConvocadosParams = [
      year,
      month, month,
      departamento, departamento,
      provincia, provincia,
      distrito, distrito,
      tipo_proceso, tipo_proceso,
      estado, estado
    ];

    const SQL_KPIS = `
      WITH contratos_filtrados AS (
          SELECT 
              c.codigo_contrato,
              c.numero_item,
              c.monto_contratado_item,
              c.id_contratista
          FROM contratos c
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE YEAR(c.fecha_suscripcion_contrato) = ?
            AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
            AND (? IS NULL OR conv.departamento_item = ?)
            AND (? IS NULL OR conv.provincia_item = ?)
            AND (? IS NULL OR conv.distrito_item = ?)
            AND (? IS NULL OR conv.moneda = ?)
            AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
            AND (? IS NULL OR conv.estado_item = ?)
      ),
      metricas_contratos AS (
          SELECT 
              COUNT(DISTINCT cf.codigo_contrato, cf.numero_item) AS total_contratos,
              COALESCE(SUM(cf.monto_contratado_item), 0.00) AS monto_total_soles,
              (
                  SELECT COUNT(DISTINCT pae.id_empresa_real)
                  FROM contratos_filtrados cf2
                  INNER JOIN puente_actor_empresa pae 
                      ON cf2.id_contratista = pae.id_actor_original
              ) AS contratistas_activos
          FROM contratos_filtrados cf
      ),
      items_convocados AS (
          SELECT 
              conv.codigo_convocatoria,
              conv.numero_item
          FROM convocatorias conv
          WHERE YEAR(conv.fecha_convocatoria) = ?
            AND (? IS NULL OR MONTH(conv.fecha_convocatoria) = ?)
            AND (? IS NULL OR conv.departamento_item = ?)
            AND (? IS NULL OR conv.provincia_item = ?)
            AND (? IS NULL OR conv.distrito_item = ?)
            AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
            AND (? IS NULL OR conv.estado_item = ?)
      ),
      concurrencia_items AS (
          SELECT 
              ic.codigo_convocatoria,
              ic.numero_item,
              COUNT(DISTINCT o.id_postor) AS cantidad_postores
          FROM items_convocados ic
          LEFT JOIN ofertantes o 
              ON ic.codigo_convocatoria = o.codigo_convocatoria 
             AND ic.numero_item = o.numero_item
          GROUP BY ic.codigo_convocatoria, ic.numero_item
      ),
      metricas_postor_unico AS (
          SELECT 
              COUNT(*) AS total_items_evaluados,
              SUM(CASE WHEN cantidad_postores = 1 THEN 1 ELSE 0 END) AS items_con_1_postor,
              ROUND(
                  COALESCE(
                      (SUM(CASE WHEN cantidad_postores = 1 THEN 1 ELSE 0 END) * 100.0) / 
                      NULLIF(COUNT(*), 0), 
                      0.00
                  ), 
                  2
              ) AS tasa_postor_unico_pct
          FROM concurrencia_items
      )
      SELECT 
          mc.total_contratos,
          mc.monto_total_soles,
          mc.contratistas_activos,
          mpu.tasa_postor_unico_pct
      FROM metricas_contratos mc
      CROSS JOIN metricas_postor_unico mpu;
    `;

    const SQL_TOP10_CANTIDAD = `
      SELECT 
          emp.numero_documento AS ruc,
          emp.razon_social AS proveedor,
          'INDIVIDUAL' AS tipo_proveedor,
          COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
          COALESCE(SUM(ROUND(c.monto_contratado_item * pae.factor_equitativo, 2)), 0.00) AS monto_total_soles
      FROM contratos c
      INNER JOIN puente_actor_empresa pae 
          ON c.id_contratista = pae.id_actor_original
      INNER JOIN organizaciones emp 
          ON pae.id_empresa_real = emp.id_organizacion
      INNER JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      WHERE YEAR(c.fecha_suscripcion_contrato) = ?
        AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
        AND (? IS NULL OR conv.departamento_item = ?)
        AND (? IS NULL OR conv.provincia_item = ?)
        AND (? IS NULL OR conv.distrito_item = ?)
        AND (? IS NULL OR conv.moneda = ?)
        AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
        AND (? IS NULL OR conv.estado_item = ?)
      GROUP BY emp.id_organizacion, emp.numero_documento, emp.razon_social
      ORDER BY total_contratos DESC, monto_total_soles DESC
      LIMIT 10;
    `;

    const SQL_TOP10_MONTO = `
      SELECT 
          emp.numero_documento AS ruc,
          emp.razon_social AS proveedor,
          'INDIVIDUAL' AS tipo_proveedor,
          COALESCE(SUM(ROUND(c.monto_contratado_item * pae.factor_equitativo, 2)), 0.00) AS monto_total_soles,
          COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos
      FROM contratos c
      INNER JOIN puente_actor_empresa pae 
          ON c.id_contratista = pae.id_actor_original
      INNER JOIN organizaciones emp 
          ON pae.id_empresa_real = emp.id_organizacion
      INNER JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      WHERE YEAR(c.fecha_suscripcion_contrato) = ?
        AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
        AND (? IS NULL OR conv.departamento_item = ?)
        AND (? IS NULL OR conv.provincia_item = ?)
        AND (? IS NULL OR conv.distrito_item = ?)
        AND (? IS NULL OR conv.moneda = ?)
        AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
        AND (? IS NULL OR conv.estado_item = ?)
      GROUP BY emp.id_organizacion, emp.numero_documento, emp.razon_social
      ORDER BY monto_total_soles DESC, total_contratos DESC
      LIMIT 10;
    `;

    const SQL_DISTRIBUCION_PROCESOS = `
      WITH totales_por_proceso AS (
          SELECT 
              COALESCE(TRIM(conv.tipo_proceso_seleccion), 'NO ESPECIFICADO') AS tipo_proceso,
              COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
              COALESCE(SUM(c.monto_contratado_item), 0.00) AS monto_total_soles
          FROM contratos c
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE YEAR(c.fecha_suscripcion_contrato) = ?
             AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
             AND (? IS NULL OR conv.departamento_item = ?)
             AND (? IS NULL OR conv.provincia_item = ?)
             AND (? IS NULL OR conv.distrito_item = ?)
             AND (? IS NULL OR conv.moneda = ?)
             AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
             AND (? IS NULL OR conv.estado_item = ?)
          GROUP BY conv.tipo_proceso_seleccion
      )
      SELECT 
          tipo_proceso,
          total_contratos,
          monto_total_soles,
          ROUND(
              (monto_total_soles * 100.0) / NULLIF(SUM(monto_total_soles) OVER(), 0), 
              2
          ) AS porcentaje
      FROM totales_por_proceso
      ORDER BY monto_total_soles DESC;
    `;

    // Granularidad geográfica adaptativa (Drill-down automático: Departamento -> Provincia -> Distrito)
    const geoColumn = provincia
      ? 'conv.distrito_item'
      : departamento
        ? 'conv.provincia_item'
        : 'conv.departamento_item';

    const nivelGeografico = provincia
      ? 'DISTRITO'
      : departamento
        ? 'PROVINCIA'
        : 'DEPARTAMENTO';

    const SQL_METRICAS_REGIONALES = `
      WITH contratos_region AS (
          SELECT 
              COALESCE(NULLIF(TRIM(${geoColumn}), ''), 'NO ESPECIFICADO') AS region,
              c.codigo_contrato,
              c.numero_item,
              c.codigo_convocatoria,
              c.monto_contratado_item
          FROM contratos c
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE YEAR(c.fecha_suscripcion_contrato) = ?
            AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
            AND (? IS NULL OR conv.departamento_item = ?)
            AND (? IS NULL OR conv.provincia_item = ?)
            AND (? IS NULL OR conv.distrito_item = ?)
            AND (? IS NULL OR conv.moneda = ?)
            AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
            AND (? IS NULL OR conv.estado_item = ?)
      ),
      items_unicos_region AS (
          SELECT DISTINCT
              region,
              codigo_convocatoria,
              numero_item
          FROM contratos_region
      ),
      postores_por_item_region AS (
          SELECT 
              iur.region,
              iur.codigo_convocatoria,
              iur.numero_item,
              COUNT(DISTINCT o.id_postor) AS cant_postores
          FROM items_unicos_region iur
          LEFT JOIN ofertantes o 
              ON iur.codigo_convocatoria = o.codigo_convocatoria 
             AND iur.numero_item = o.numero_item
          GROUP BY iur.region, iur.codigo_convocatoria, iur.numero_item
      ),
      metricas_participantes AS (
          SELECT 
              region,
              ROUND(COALESCE(AVG(NULLIF(cant_postores, 0)), 1.00), 2) AS promedio_participantes,
              SUM(CASE WHEN cant_postores = 1 THEN 1 ELSE 0 END) AS items_postor_unico
          FROM postores_por_item_region
          GROUP BY region
      ),
      metricas_contratos AS (
          SELECT 
              region,
              COUNT(DISTINCT codigo_contrato, numero_item) AS total_contratos,
              COALESCE(SUM(monto_contratado_item), 0.00) AS monto_total_soles
          FROM contratos_region
          GROUP BY region
      )
      SELECT 
          mc.region,
          mc.total_contratos,
          mc.monto_total_soles,
          ROUND(
              (mc.total_contratos * 100.0) / NULLIF(SUM(mc.total_contratos) OVER(), 0), 
              2
          ) AS porcentaje_contratos,
          COALESCE(mp.promedio_participantes, 1.00) AS promedio_participantes,
          COALESCE(mp.items_postor_unico, 0) AS items_postor_unico
      FROM metricas_contratos mc
      LEFT JOIN metricas_participantes mp ON mc.region = mp.region
      ORDER BY mc.total_contratos DESC, mc.monto_total_soles DESC;
    `;

    try {
      const [
        kpiRows,
        topCantidadRows,
        topMontoRows,
        distribucionRows,
        regionalesRows
      ] = await Promise.all([
        this.db.query<any>(SQL_KPIS, [...baseParams, ...itemsConvocadosParams]),
        this.db.query<any>(SQL_TOP10_CANTIDAD, baseParams),
        this.db.query<any>(SQL_TOP10_MONTO, baseParams),
        this.db.query<any>(SQL_DISTRIBUCION_PROCESOS, baseParams),
        this.db.query<any>(SQL_METRICAS_REGIONALES, baseParams)
      ]);

      const kpi = kpiRows[0] || {
        total_contratos: 0,
        monto_total_soles: 0,
        contratistas_activos: 0,
        tasa_postor_unico_pct: 0
      };

      const monto = Number(kpi.monto_total_soles || 0);

      return {
        success: true,
        data: {
          year,
          nivel_geografico: nivelGeografico,
          kpis: {
            total_contratos: Number(kpi.total_contratos || 0),
            monto_total_soles: monto,
            monto_total_formateado: `S/ ${(monto / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MM`,
            contratistas_activos: Number(kpi.contratistas_activos || 0),
            tasa_postor_unico_pct: Number(kpi.tasa_postor_unico_pct || 0)
          },
          top_contratistas_cantidad: topCantidadRows.map(r => ({
            ruc: r.ruc,
            proveedor: r.proveedor,
            tipo_proveedor: r.tipo_proveedor,
            total_contratos: Number(r.total_contratos),
            monto_total_soles: Number(r.monto_total_soles)
          })),
          top_contratistas_monto: topMontoRows.map(r => ({
            ruc: r.ruc,
            proveedor: r.proveedor,
            tipo_proveedor: r.tipo_proveedor,
            monto_total_soles: Number(r.monto_total_soles),
            total_contratos: Number(r.total_contratos)
          })),
          distribucion_tipo_proceso: distribucionRows.map(r => ({
            tipo_proceso: r.tipo_proceso,
            total_contratos: Number(r.total_contratos),
            monto_total_soles: Number(r.monto_total_soles),
            porcentaje: Number(r.porcentaje || 0)
          })),
          metricas_regionales: regionalesRows.map(r => ({
            region: r.region,
            total_contratos: Number(r.total_contratos),
            monto_total_soles: Number(r.monto_total_soles),
            porcentaje_contratos: Number(r.porcentaje_contratos || 0),
            promedio_participantes: Number(r.promedio_participantes || 1),
            items_postor_unico: Number(r.items_postor_unico || 0)
          }))
        }
      };
    } catch (error: any) {
      this.logger.error(`Error al ejecutar consultas de Cockpit: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: {
          year,
          nivel_geografico: nivelGeografico,
          kpis: {
            total_contratos: 0,
            monto_total_soles: 0,
            monto_total_formateado: "S/ 0 MM",
            contratistas_activos: 0,
            tasa_postor_unico_pct: 0
          },
          top_contratistas_cantidad: [],
          top_contratistas_monto: [],
          distribucion_tipo_proceso: [],
          metricas_regionales: []
        }
      };
    }
  }
}
