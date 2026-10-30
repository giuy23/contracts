import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ContratistasService {
  private readonly logger = new Logger(ContratistasService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Búsqueda predictiva de empresas por RUC o Razón Social
   * Filtra exclusivamente entidades que actúan como PROVEEDOR o AMBOS (excluye ENTIDAD pura).
   */
  async search(query: string) {
    if (!query || query.trim().length < 2) return [];
    const cleanQuery = query.trim();
    const isRuc = /^\d+$/.test(cleanQuery);
    const term = `%${cleanQuery}%`;

    const sql = `
      SELECT 
        emp.numero_documento AS ruc,
        emp.razon_social,
        'INDIVIDUAL' AS tipo_proveedor,
        COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos
      FROM organizaciones emp
      LEFT JOIN puente_actor_empresa pae 
        ON emp.id_organizacion = pae.id_empresa_real
      LEFT JOIN contratos c 
        ON pae.id_actor_original = c.id_contratista
      WHERE emp.tipo_actor IN ('PROVEEDOR', 'AMBOS')
        AND COALESCE(emp.tipo_proveedor, 'INDIVIDUAL') != 'Consorcio'
        AND emp.razon_social NOT LIKE 'CONSORCIO %'
        AND emp.razon_social NOT LIKE '%CONSORCIO%'
        AND (${isRuc ? 'emp.numero_documento LIKE ?' : 'emp.numero_documento LIKE ? OR emp.razon_social LIKE ?'})
      GROUP BY emp.id_organizacion, emp.numero_documento, emp.razon_social
      ORDER BY total_contratos DESC, emp.razon_social ASC
      LIMIT 10;
    `;
    const params = isRuc ? [term] : [term, term];
    return this.db.query(sql, params);
  }

  /**
   * 3.1. Ficha de Identidad y KPIs Consolidados (1 Round-Trip con Prorrateo 1/N)
   */
  async getSummary(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;

    const sql = `
      WITH info_empresa AS (
          SELECT 
              o.id_organizacion,
              o.numero_documento AS ruc,
              o.razon_social,
              'INDIVIDUAL' AS tipo_proveedor,
              COALESCE(o.departamento_sede, 'NO REGISTRADO') AS departamento_sede
          FROM organizaciones o
          WHERE o.numero_documento = ?
            AND COALESCE(o.tipo_proveedor, 'INDIVIDUAL') != 'Consorcio'
          LIMIT 1
      ),
      actores_empresa AS (
          SELECT 
              pae.id_actor_original,
              pae.es_consorcio,
              pae.factor_equitativo
          FROM info_empresa ie
          INNER JOIN puente_actor_empresa pae 
              ON ie.id_organizacion = pae.id_empresa_real
      ),
      contratos_empresa AS (
          SELECT 
              c.codigo_contrato,
              c.numero_item,
              c.codigo_convocatoria,
              SUM(ROUND(c.monto_contratado_item * ae.factor_equitativo, 2)) AS monto_atribuido_item,
              conv.ruc_entidad,
              (
                  SELECT COUNT(DISTINCT ofe.id_postor) 
                  FROM ofertantes ofe 
                  WHERE ofe.codigo_convocatoria = c.codigo_convocatoria 
                    AND ofe.numero_item = c.numero_item
              ) AS cant_postores
          FROM contratos c
          INNER JOIN actores_empresa ae 
              ON c.id_contratista = ae.id_actor_original
          LEFT JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
          GROUP BY c.codigo_contrato, c.numero_item, c.codigo_convocatoria, conv.ruc_entidad
      ),
      postulaciones_empresa AS (
          SELECT 
              COUNT(DISTINCT ofe.codigo_convocatoria, ofe.numero_item) AS total_postulaciones
          FROM ofertantes ofe
          INNER JOIN actores_empresa ae 
              ON ofe.id_postor = ae.id_actor_original
          WHERE (? IS NULL OR YEAR(ofe.fecha_presentacion_propuesta) = ?)
      )
      SELECT 
          ie.ruc,
          ie.razon_social,
          ie.tipo_proveedor,
          ie.departamento_sede,
          COUNT(DISTINCT ce.codigo_contrato, ce.numero_item) AS total_contratos,
          COALESCE(SUM(ce.monto_atribuido_item), 0.00) AS monto_total_soles,
          COUNT(DISTINCT ce.ruc_entidad) AS entidades_distintas,
          ROUND(
              COALESCE(
                  (SUM(CASE WHEN ce.cant_postores = 1 THEN 1 ELSE 0 END) * 100.0) / 
                  NULLIF(COUNT(DISTINCT ce.codigo_contrato, ce.numero_item), 0),
                  0.00
              ), 1
          ) AS tasa_postor_unico_pct,
          COALESCE(pe.total_postulaciones, 0) AS total_postulaciones,
          ROUND(
              COALESCE(
                  (COUNT(DISTINCT ce.codigo_contrato, ce.numero_item) * 100.0) / 
                  NULLIF(pe.total_postulaciones, 0),
                  0.00
              ), 1
          ) AS win_rate_pct
      FROM info_empresa ie
      LEFT JOIN contratos_empresa ce ON 1=1
      LEFT JOIN postulaciones_empresa pe ON 1=1
      GROUP BY 
          ie.ruc, ie.razon_social, ie.tipo_proveedor, ie.departamento_sede, pe.total_postulaciones;
    `;

    const rows = await this.db.query(sql, [ruc, year, year, year, year]);
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`No se encontró el contratista con RUC ${ruc}`);
    }

    const item = rows[0];
    const monto = Number(item.monto_total_soles || 0);

    return {
      ruc: item.ruc,
      razon_social: item.razon_social,
      tipo_proveedor: item.tipo_proveedor,
      departamento_sede: item.departamento_sede,
      total_contratos: Number(item.total_contratos || 0),
      monto_total_soles: monto,
      monto_total_formateado: `S/ ${(monto / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MM`,
      entidades_distintas: Number(item.entidades_distintas || 0),
      tasa_postor_unico_pct: Number(item.tasa_postor_unico_pct || 0),
      total_postulaciones: Number(item.total_postulaciones || 0),
      win_rate_pct: Number(item.win_rate_pct || 0)
    };
  }

  /**
   * 3.2. Concentración por Entidades Públicas (Clientes Principales con Prorrateo 1/N)
   */
  async getClientes(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      actores_empresa AS (
          SELECT pae.id_actor_original, pae.factor_equitativo
          FROM empresa_base eb
          INNER JOIN puente_actor_empresa pae ON eb.id_organizacion = pae.id_empresa_real
      ),
      contratos_empresa AS (
          SELECT 
              conv.ruc_entidad,
              conv.nombre_entidad,
              c.codigo_contrato,
              c.numero_item,
              ROUND(c.monto_contratado_item * ae.factor_equitativo, 2) AS monto_contratado_item
          FROM contratos c
          INNER JOIN actores_empresa ae ON c.id_contratista = ae.id_actor_original
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      )
      SELECT 
          ruc_entidad,
          nombre_entidad,
          COUNT(DISTINCT codigo_contrato, numero_item) AS total_contratos,
          COALESCE(SUM(monto_contratado_item), 0.00) AS monto_total_soles,
          ROUND(
              (SUM(monto_contratado_item) * 100.0) / 
              NULLIF(SUM(SUM(monto_contratado_item)) OVER(), 0), 
              2
          ) AS porcentaje_sobre_empresa
      FROM contratos_empresa
      GROUP BY ruc_entidad, nombre_entidad
      ORDER BY monto_total_soles DESC
      LIMIT 10;
    `;
    const rows = await this.db.query(sql, [ruc, year, year]);
    return rows.map(r => ({
      ruc_entidad: r.ruc_entidad,
      nombre_entidad: r.nombre_entidad,
      total_contratos: Number(r.total_contratos),
      monto_total_soles: Number(r.monto_total_soles),
      porcentaje_sobre_empresa: Number(r.porcentaje_sobre_empresa || 0)
    }));
  }

  /**
   * 3.3. Distribución Territorial / Geográfica de sus Contratos (Prorrateo 1/N)
   */
  async getTerritorio(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      actores_empresa AS (
          SELECT pae.id_actor_original, pae.factor_equitativo
          FROM empresa_base eb
          INNER JOIN puente_actor_empresa pae ON eb.id_organizacion = pae.id_empresa_real
      ),
      contratos_empresa AS (
          SELECT 
              COALESCE(NULLIF(TRIM(conv.departamento_item), ''), 'NO ESPECIFICADO') AS departamento,
              c.codigo_contrato,
              c.numero_item,
              ROUND(c.monto_contratado_item * ae.factor_equitativo, 2) AS monto_contratado_item
          FROM contratos c
          INNER JOIN actores_empresa ae ON c.id_contratista = ae.id_actor_original
          INNER JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      )
      SELECT 
          departamento,
          COUNT(DISTINCT codigo_contrato, numero_item) AS total_contratos,
          COALESCE(SUM(monto_contratado_item), 0.00) AS monto_total_soles,
          ROUND(
              (SUM(monto_contratado_item) * 100.0) / 
              NULLIF(SUM(SUM(monto_contratado_item)) OVER(), 0), 
              2
          ) AS porcentaje
      FROM contratos_empresa
      GROUP BY departamento
      ORDER BY monto_total_soles DESC;
    `;
    const rows = await this.db.query(sql, [ruc, year, year]);
    return rows.map(r => ({
      departamento: r.departamento,
      total_contratos: Number(r.total_contratos),
      monto_total_soles: Number(r.monto_total_soles),
      porcentaje: Number(r.porcentaje || 0)
    }));
  }

  /**
   * 3.4. Evolución Histórica Anual (Línea de Tiempo 2022-2026 con Prorrateo 1/N)
   */
  async getTimeline(ruc: string) {
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      actores_empresa AS (
          SELECT pae.id_actor_original, pae.factor_equitativo
          FROM empresa_base eb
          INNER JOIN puente_actor_empresa pae ON eb.id_organizacion = pae.id_empresa_real
      )
      SELECT 
          YEAR(c.fecha_suscripcion_contrato) AS year,
          COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
          COALESCE(SUM(ROUND(c.monto_contratado_item * ae.factor_equitativo, 2)), 0.00) AS monto_total_soles,
          COUNT(DISTINCT conv.ruc_entidad) AS entidades_atendidas
      FROM contratos c
      INNER JOIN actores_empresa ae ON c.id_contratista = ae.id_actor_original
      LEFT JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      WHERE c.fecha_suscripcion_contrato IS NOT NULL
      GROUP BY YEAR(c.fecha_suscripcion_contrato)
      ORDER BY year ASC;
    `;
    const rows = await this.db.query(sql, [ruc]);
    return rows.map(r => ({
      year: Number(r.year),
      total_contratos: Number(r.total_contratos),
      monto_total_soles: Number(r.monto_total_soles),
      entidades_atendidas: Number(r.entidades_atendidas)
    }));
  }

  /**
   * 3.5. Red Forense de Rivales Habituales (Bid Rigging Check entre Empresas Reales)
   */
  async getCompetidores(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      actores_empresa AS (
          SELECT pae.id_actor_original
          FROM empresa_base eb
          INNER JOIN puente_actor_empresa pae ON eb.id_organizacion = pae.id_empresa_real
      ),
      items_empresa AS (
          SELECT DISTINCT
              o.codigo_convocatoria, 
              o.numero_item,
              o.id_postor AS id_postor_propio
          FROM ofertantes o
          INNER JOIN actores_empresa ae ON o.id_postor = ae.id_actor_original
          WHERE (? IS NULL OR YEAR(o.fecha_presentacion_propuesta) = ?)
      ),
      rivales_reales AS (
          SELECT DISTINCT
              pae_rival.id_empresa_real AS id_rival_real,
              ie.codigo_convocatoria,
              ie.numero_item
          FROM items_empresa ie
          INNER JOIN ofertantes o_rival 
              ON ie.codigo_convocatoria = o_rival.codigo_convocatoria 
             AND ie.numero_item = o_rival.numero_item
             AND o_rival.id_postor != ie.id_postor_propio
          INNER JOIN puente_actor_empresa pae_rival 
              ON o_rival.id_postor = pae_rival.id_actor_original
          INNER JOIN empresa_base eb 
              ON pae_rival.id_empresa_real != eb.id_organizacion
      ),
      ganadores_reales AS (
          SELECT DISTINCT
              adj.codigo_convocatoria,
              adj.numero_item,
              pae_gan.id_empresa_real AS id_ganador_real
          FROM adjudicaciones adj
          INNER JOIN (SELECT DISTINCT codigo_convocatoria, numero_item FROM items_empresa) ie
              ON adj.codigo_convocatoria = ie.codigo_convocatoria 
             AND adj.numero_item = ie.numero_item
          INNER JOIN puente_actor_empresa pae_gan
              ON adj.id_proveedor = pae_gan.id_actor_original
      )
      SELECT 
          org.numero_documento AS ruc_rival,
          org.razon_social AS rival,
          COUNT(DISTINCT r.codigo_convocatoria, r.numero_item) AS procesos_competidos,
          COUNT(DISTINCT CASE WHEN g.id_ganador_real = eb.id_organizacion THEN CONCAT(r.codigo_convocatoria, '-', r.numero_item) END) AS victorias_empresa_consultada,
          COUNT(DISTINCT CASE WHEN g.id_ganador_real = r.id_rival_real THEN CONCAT(r.codigo_convocatoria, '-', r.numero_item) END) AS victorias_rival
      FROM rivales_reales r
      CROSS JOIN empresa_base eb
      INNER JOIN organizaciones org ON r.id_rival_real = org.id_organizacion
      LEFT JOIN ganadores_reales g 
          ON r.codigo_convocatoria = g.codigo_convocatoria 
         AND r.numero_item = g.numero_item
      GROUP BY org.id_organizacion, org.numero_documento, org.razon_social, eb.id_organizacion
      ORDER BY procesos_competidos DESC
      LIMIT 10;
    `;
    const rows = await this.db.query(sql, [ruc, year, year]);
    return rows.map(r => ({
      ruc_rival: r.ruc_rival,
      rival: r.rival,
      procesos_competidos: Number(r.procesos_competidos),
      victorias_empresa_consultada: Number(r.victorias_empresa_consultada),
      victorias_rival: Number(r.victorias_rival)
    }));
  }

  /**
   * 3.6. Grilla Detallada de Contratos (Paginada y Auditada con Doble Monto y Etiqueta 1/N)
   */
  async getContratos(ruc: string, yearParam?: string, limit = 50, offset = 0) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      )
      SELECT 
          c.codigo_contrato,
          c.numero_contrato,
          c.codigo_convocatoria,
          c.numero_item,
          conv.ruc_entidad,
          conv.nombre_entidad,
          conv.objeto_contractual,
          conv.tipo_proceso_seleccion,
          conv.descripcion_item,
          COALESCE(conv.departamento_item, 'NO REGISTRADO') AS departamento_item,
          COALESCE(conv.provincia_item, 'NO REGISTRADO') AS provincia_item,
          c.fecha_suscripcion_contrato,
          c.monto_contratado_item AS monto_total_contrato,
          ROUND(c.monto_contratado_item * pae.factor_equitativo, 2) AS monto_contratado_item,
          pae.es_consorcio,
          pae.etiqueta_modalidad,
          pae.nombre_consorcio,
          pae.total_miembros,
          pae.porcentaje_equitativo,
          (
              SELECT COUNT(DISTINCT o.id_postor)
              FROM ofertantes o
              WHERE o.codigo_convocatoria = c.codigo_convocatoria
                AND o.numero_item = c.numero_item
          ) AS cantidad_postores,
          CASE 
              WHEN (
                  SELECT COUNT(DISTINCT o.id_postor)
                  FROM ofertantes o
                  WHERE o.codigo_convocatoria = c.codigo_convocatoria
                    AND o.numero_item = c.numero_item
              ) = 1 THEN 1 
              ELSE 0 
          END AS es_postor_unico,
          COALESCE(c.tiene_resolucion, 'NO') AS tiene_resolucion,
          c.url_contrato
      FROM contratos c
      INNER JOIN puente_actor_empresa pae 
          ON c.id_contratista = pae.id_actor_original
      INNER JOIN empresa_base eb 
          ON pae.id_empresa_real = eb.id_organizacion
      LEFT JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      ORDER BY c.fecha_suscripcion_contrato DESC, monto_contratado_item DESC
      LIMIT ? OFFSET ?;
    `;
    const rows = await this.db.query(sql, [ruc, year, year, limit, offset]);
    return rows.map(r => ({
      codigo_contrato: r.codigo_contrato,
      numero_contrato: r.numero_contrato,
      codigo_convocatoria: r.codigo_convocatoria,
      numero_item: r.numero_item,
      ruc_entidad: r.ruc_entidad,
      nombre_entidad: r.nombre_entidad,
      objeto_contractual: r.objeto_contractual,
      tipo_proceso_seleccion: r.tipo_proceso_seleccion,
      descripcion_item: r.descripcion_item,
      departamento_item: r.departamento_item,
      provincia_item: r.provincia_item,
      fecha_suscripcion_contrato: r.fecha_suscripcion_contrato,
      monto_total_contrato: Number(r.monto_total_contrato || 0),
      monto_contratado_item: Number(r.monto_contratado_item || 0),
      es_consorcio: Boolean(r.es_consorcio),
      etiqueta_modalidad: r.etiqueta_modalidad || 'INDIVIDUAL',
      nombre_consorcio: r.nombre_consorcio || null,
      total_miembros: Number(r.total_miembros || 1),
      porcentaje_equitativo: Number(r.porcentaje_equitativo || 100),
      cantidad_postores: Number(r.cantidad_postores),
      es_postor_unico: Boolean(r.es_postor_unico),
      tiene_resolucion: r.tiene_resolucion,
      url_contrato: r.url_contrato
    }));
  }

  /**
   * 3.7. Postores de un Ítem Específico (Sub-fila Acordeón)
   */
  async getPostoresItem(codigoConvocatoria: string, numeroItem: number) {
    const sql = `
      SELECT 
          org.numero_documento AS ruc_postor,
          org.razon_social AS postor,
          o.fecha_presentacion_propuesta,
          CASE WHEN adj.id_proveedor IS NOT NULL THEN 1 ELSE 0 END AS fue_adjudicado,
          adj.monto_adjudicado_item_soles
      FROM ofertantes o
      JOIN organizaciones org ON o.id_postor = org.id_organizacion
      LEFT JOIN adjudicaciones adj 
          ON o.codigo_convocatoria = adj.codigo_convocatoria 
         AND o.numero_item = adj.numero_item 
         AND o.id_postor = adj.id_proveedor
      WHERE o.codigo_convocatoria = ? 
        AND o.numero_item = ?
      ORDER BY fue_adjudicado DESC, o.fecha_presentacion_propuesta ASC;
    `;
    const rows = await this.db.query(sql, [codigoConvocatoria, numeroItem]);
    return rows.map(r => ({
      ruc_postor: r.ruc_postor,
      postor: r.postor,
      fecha_presentacion_propuesta: r.fecha_presentacion_propuesta,
      fue_adjudicado: Boolean(r.fue_adjudicado),
      monto_adjudicado_item_soles: r.monto_adjudicado_item_soles ? Number(r.monto_adjudicado_item_soles) : null
    }));
  }

  /**
   * 4. Exportación Forense a Excel (.xlsx) con Streaming y Fórmulas Nativas
   */
  async exportarExcel(ruc: string, yearParam: string | undefined, res: Response) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const fileName = `auditoria_contratista_${ruc}_${year ?? 'historico'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: true
    });

    const worksheet = workbook.addWorksheet('Auditoría Contratos');

    worksheet.columns = [
      { header: 'Cód. Contrato', key: 'codigo_contrato', width: 16 },
      { header: 'N° Contrato', key: 'numero_contrato', width: 22 },
      { header: 'Cód. Convocatoria', key: 'codigo_convocatoria', width: 18 },
      { header: 'Ítem', key: 'numero_item', width: 8 },
      { header: 'RUC Entidad', key: 'ruc_entidad', width: 14 },
      { header: 'Entidad Pública', key: 'nombre_entidad', width: 40 },
      { header: 'Objeto', key: 'objeto_contractual', width: 14 },
      { header: 'Tipo Proceso', key: 'tipo_proceso_seleccion', width: 24 },
      { header: 'Descripción del Ítem', key: 'descripcion_item', width: 45 },
      { header: 'Departamento', key: 'departamento_item', width: 18 },
      { header: 'Provincia', key: 'provincia_item', width: 18 },
      { header: 'Fecha Suscripción', key: 'fecha_suscripcion_contrato', width: 16 },
      { header: 'Modalidad Participación', key: 'etiqueta_modalidad', width: 22 },
      { header: 'Consorcio Integrado', key: 'nombre_consorcio', width: 34 },
      { header: 'Monto Total Contrato (S/)', key: 'monto_total_contrato', width: 24 },
      { header: 'Monto Adjudicado Empresa 1/N (S/)', key: 'monto_contratado_item', width: 28 },
      { header: 'Postores', key: 'cantidad_postores', width: 10 },
      { header: 'Postor Único', key: 'es_postor_unico', width: 13 },
      { header: 'Tiene Resolución', key: 'tiene_resolucion', width: 15 },
      { header: 'Enlace SEACE', key: 'url_contrato', width: 50 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9E1B1E' } // Rojo bermellón institucional
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.commit();

    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      )
      SELECT 
          c.codigo_contrato,
          c.numero_contrato,
          c.codigo_convocatoria,
          c.numero_item,
          conv.ruc_entidad,
          conv.nombre_entidad,
          conv.objeto_contractual,
          conv.tipo_proceso_seleccion,
          conv.descripcion_item,
          COALESCE(conv.departamento_item, 'NO REGISTRADO') AS departamento_item,
          COALESCE(conv.provincia_item, 'NO REGISTRADO') AS provincia_item,
          c.fecha_suscripcion_contrato,
          pae.etiqueta_modalidad,
          COALESCE(pae.nombre_consorcio, 'PARTICIPACIÓN INDIVIDUAL') AS nombre_consorcio,
          c.monto_contratado_item AS monto_total_contrato,
          ROUND(c.monto_contratado_item * pae.factor_equitativo, 2) AS monto_contratado_item,
          (
              SELECT COUNT(DISTINCT o.id_postor)
              FROM ofertantes o
              WHERE o.codigo_convocatoria = c.codigo_convocatoria
                AND o.numero_item = c.numero_item
          ) AS cantidad_postores,
          CASE 
              WHEN (
                  SELECT COUNT(DISTINCT o.id_postor)
                  FROM ofertantes o
                  WHERE o.codigo_convocatoria = c.codigo_convocatoria
                    AND o.numero_item = c.numero_item
              ) = 1 THEN 'SÍ' 
              ELSE 'NO' 
          END AS es_postor_unico,
          COALESCE(c.tiene_resolucion, 'NO') AS tiene_resolucion,
          c.url_contrato
      FROM contratos c
      INNER JOIN puente_actor_empresa pae 
          ON c.id_contratista = pae.id_actor_original
      INNER JOIN empresa_base eb 
          ON pae.id_empresa_real = eb.id_organizacion
      LEFT JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      ORDER BY c.fecha_suscripcion_contrato DESC, monto_contratado_item DESC;
    `;

    const rows = await this.db.query(sql, [ruc, year, year]);

    let currentRow = 2;
    for (const r of rows) {
      const row = worksheet.addRow({
        codigo_contrato: r.codigo_contrato,
        numero_contrato: r.numero_contrato,
        codigo_convocatoria: r.codigo_convocatoria,
        numero_item: r.numero_item,
        ruc_entidad: r.ruc_entidad,
        nombre_entidad: r.nombre_entidad,
        objeto_contractual: r.objeto_contractual,
        tipo_proceso_seleccion: r.tipo_proceso_seleccion,
        descripcion_item: r.descripcion_item,
        departamento_item: r.departamento_item,
        provincia_item: r.provincia_item,
        fecha_suscripcion_contrato: r.fecha_suscripcion_contrato ? new Date(r.fecha_suscripcion_contrato) : null,
        etiqueta_modalidad: r.etiqueta_modalidad || 'INDIVIDUAL',
        nombre_consorcio: r.nombre_consorcio || 'PARTICIPACIÓN INDIVIDUAL',
        monto_total_contrato: Number(r.monto_total_contrato || 0),
        monto_contratado_item: Number(r.monto_contratado_item || 0),
        cantidad_postores: Number(r.cantidad_postores),
        es_postor_unico: r.es_postor_unico,
        tiene_resolucion: r.tiene_resolucion,
        url_contrato: r.url_contrato
      });

      const celdaMontoTotal = row.getCell('monto_total_contrato');
      celdaMontoTotal.numFmt = '_("S/"* #,##0.00_);_("S/"* \(#,##0.00\);_("S/"* "-"??_);_(@_)';
      celdaMontoTotal.alignment = { horizontal: 'right' };

      const celdaMonto = row.getCell('monto_contratado_item');
      celdaMonto.numFmt = '_("S/"* #,##0.00_);_("S/"* \(#,##0.00\);_("S/"* "-"??_);_(@_)';
      celdaMonto.alignment = { horizontal: 'right' };
      celdaMonto.font = { bold: true };

      const celdaFecha = row.getCell('fecha_suscripcion_contrato');
      celdaFecha.numFmt = 'yyyy-mm-dd';
      celdaFecha.alignment = { horizontal: 'center' };

      if (r.es_postor_unico === 'SÍ') {
        row.getCell('es_postor_unico').font = { color: { argb: 'FFDC2626' }, bold: true };
      }

      row.commit();
      currentRow++;
    }

    if (currentRow > 2) {
      const totalRow = worksheet.addRow({
        descripcion_item: 'TOTAL FORMALIZADO AUDITADO (S/)',
        monto_total_contrato: { formula: `SUM(O2:O${currentRow - 1})` },
        monto_contratado_item: { formula: `SUM(P2:P${currentRow - 1})` }
      });
      totalRow.font = { bold: true };
      totalRow.getCell('monto_total_contrato').numFmt = '_("S/"* #,##0.00_);_("S/"* \(#,##0.00\);_("S/"* "-"??_);_(@_)';
      totalRow.getCell('monto_contratado_item').numFmt = '_("S/"* #,##0.00_);_("S/"* \(#,##0.00\);_("S/"* "-"??_);_(@_)';
      totalRow.commit();
    }

    await workbook.commit();
  }
}
