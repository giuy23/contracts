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
   */
  async search(query: string) {
    if (!query || query.trim().length < 2) return [];
    const term = `%${query.trim()}%`;
    const sql = `
      SELECT 
        o.numero_documento AS ruc,
        o.razon_social,
        COALESCE(
          CASE 
            WHEN o.tipo_proveedor LIKE '%CONSORCIO%' OR o.razon_social LIKE '%CONSORCIO%' THEN 'CONSORCIO'
            ELSE 'INDIVIDUAL'
          END, 'INDIVIDUAL'
        ) AS tipo_proveedor,
        COUNT(c.codigo_contrato) AS total_contratos
      FROM organizaciones o
      LEFT JOIN contratos c ON o.id_organizacion = c.id_contratista
      WHERE o.numero_documento LIKE ? OR o.razon_social LIKE ?
      GROUP BY o.id_organizacion, o.numero_documento, o.razon_social, o.tipo_proveedor
      ORDER BY total_contratos DESC, o.razon_social ASC
      LIMIT 10;
    `;
    return this.db.query(sql, [term, term]);
  }

  /**
   * 3.1. Ficha de Identidad y KPIs Consolidados (1 Round-Trip)
   */
  async getSummary(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;

    const sql = `
      WITH info_empresa AS (
          SELECT 
              o.id_organizacion,
              o.numero_documento AS ruc,
              o.razon_social,
              COALESCE(
                  CASE 
                      WHEN o.tipo_proveedor LIKE '%CONSORCIO%' OR o.razon_social LIKE '%CONSORCIO%' THEN 'CONSORCIO'
                      ELSE 'INDIVIDUAL'
                  END, 'INDIVIDUAL'
              ) AS tipo_proveedor,
              COALESCE(o.departamento_sede, 'NO REGISTRADO') AS departamento_sede
          FROM organizaciones o
          WHERE o.numero_documento = ?
          LIMIT 1
      ),
      contratos_empresa AS (
          SELECT 
              c.codigo_contrato,
              c.numero_item,
              c.codigo_convocatoria,
              c.monto_contratado_item,
              conv.ruc_entidad,
              (
                  SELECT COUNT(*) 
                  FROM ofertantes ofe 
                  WHERE ofe.codigo_convocatoria = c.codigo_convocatoria 
                    AND ofe.numero_item = c.numero_item
              ) AS cant_postores
          FROM contratos c
          JOIN info_empresa ie ON c.id_contratista = ie.id_organizacion
          LEFT JOIN convocatorias conv 
              ON c.codigo_convocatoria = conv.codigo_convocatoria 
             AND c.numero_item = conv.numero_item
          WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      ),
      postulaciones_empresa AS (
          SELECT 
              COUNT(DISTINCT ofe.codigo_convocatoria, ofe.numero_item) AS total_postulaciones
          FROM ofertantes ofe
          JOIN info_empresa ie ON ofe.id_postor = ie.id_organizacion
          WHERE (? IS NULL OR YEAR(ofe.fecha_presentacion_propuesta) = ?)
      )
      SELECT 
          ie.ruc,
          ie.razon_social,
          ie.tipo_proveedor,
          ie.departamento_sede,
          COUNT(ce.codigo_contrato) AS total_contratos,
          COALESCE(SUM(ce.monto_contratado_item), 0.00) AS monto_total_soles,
          COUNT(DISTINCT ce.ruc_entidad) AS entidades_distintas,
          ROUND(
              COALESCE(
                  (SUM(CASE WHEN ce.cant_postores = 1 THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(ce.codigo_contrato), 0),
                  0.00
              ), 1
          ) AS tasa_postor_unico_pct,
          COALESCE(pe.total_postulaciones, 0) AS total_postulaciones,
          ROUND(
              COALESCE(
                  (COUNT(ce.codigo_contrato) * 100.0) / NULLIF(pe.total_postulaciones, 0),
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
   * 3.2. Concentración por Entidades Públicas (Clientes Principales)
   */
  async getClientes(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      contratos_empresa AS (
          SELECT 
              conv.ruc_entidad,
              conv.nombre_entidad,
              c.codigo_contrato,
              c.numero_item,
              c.monto_contratado_item
          FROM contratos c
          JOIN empresa_base eb ON c.id_contratista = eb.id_organizacion
          JOIN convocatorias conv 
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
   * 3.3. Distribución Territorial / Geográfica de sus Contratos
   */
  async getTerritorio(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      contratos_empresa AS (
          SELECT 
              COALESCE(NULLIF(TRIM(conv.departamento_item), ''), 'NO ESPECIFICADO') AS departamento,
              c.codigo_contrato,
              c.numero_item,
              c.monto_contratado_item
          FROM contratos c
          JOIN empresa_base eb ON c.id_contratista = eb.id_organizacion
          JOIN convocatorias conv 
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
   * 3.4. Evolución Histórica Anual (Línea de Tiempo 2022-2026)
   */
  async getTimeline(ruc: string) {
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      )
      SELECT 
          YEAR(c.fecha_suscripcion_contrato) AS year,
          COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
          COALESCE(SUM(c.monto_contratado_item), 0.00) AS monto_total_soles,
          COUNT(DISTINCT conv.ruc_entidad) AS entidades_atendidas
      FROM contratos c
      JOIN empresa_base eb ON c.id_contratista = eb.id_organizacion
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
   * 3.5. Red Forense de Rivales Habituales (Bid Rigging Check)
   */
  async getCompetidores(ruc: string, yearParam?: string) {
    const year = yearParam && yearParam !== 'all' ? parseInt(yearParam, 10) : null;
    const sql = `
      WITH empresa_base AS (
          SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
      ),
      items_empresa AS (
          SELECT 
              o.codigo_convocatoria, 
              o.numero_item
          FROM ofertantes o
          JOIN empresa_base eb ON o.id_postor = eb.id_organizacion
          WHERE (? IS NULL OR YEAR(o.fecha_presentacion_propuesta) = ?)
      ),
      rivales AS (
          SELECT 
              o_rival.id_postor,
              ie.codigo_convocatoria,
              ie.numero_item
          FROM items_empresa ie
          JOIN ofertantes o_rival 
              ON ie.codigo_convocatoria = o_rival.codigo_convocatoria 
             AND ie.numero_item = o_rival.numero_item
          JOIN empresa_base eb ON o_rival.id_postor != eb.id_organizacion
      ),
      ganadores_items AS (
          SELECT 
              adj.codigo_convocatoria,
              adj.numero_item,
              adj.id_proveedor AS id_ganador
          FROM adjudicaciones adj
          JOIN items_empresa ie 
              ON adj.codigo_convocatoria = ie.codigo_convocatoria 
             AND adj.numero_item = ie.numero_item
      )
      SELECT 
          org.numero_documento AS ruc_rival,
          org.razon_social AS rival,
          COUNT(DISTINCT r.codigo_convocatoria, r.numero_item) AS procesos_competidos,
          COUNT(DISTINCT CASE WHEN g.id_ganador = eb.id_organizacion THEN CONCAT(r.codigo_convocatoria, '-', r.numero_item) END) AS victorias_empresa_consultada,
          COUNT(DISTINCT CASE WHEN g.id_ganador = r.id_postor THEN CONCAT(r.codigo_convocatoria, '-', r.numero_item) END) AS victorias_rival
      FROM rivales r
      JOIN empresa_base eb ON 1=1
      JOIN organizaciones org ON r.id_postor = org.id_organizacion
      LEFT JOIN ganadores_items g 
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
   * 3.6. Grilla Detallada de Contratos (Paginada y Auditada)
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
          c.monto_contratado_item,
          COALESCE(sub_ofert.cant_postores, 0) AS cantidad_postores,
          CASE WHEN COALESCE(sub_ofert.cant_postores, 0) = 1 THEN 1 ELSE 0 END AS es_postor_unico,
          COALESCE(c.tiene_resolucion, 'NO') AS tiene_resolucion,
          c.url_contrato
      FROM contratos c
      JOIN empresa_base eb ON c.id_contratista = eb.id_organizacion
      LEFT JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      LEFT JOIN (
          SELECT 
              o.codigo_convocatoria, 
              o.numero_item, 
              COUNT(DISTINCT o.id_postor) AS cant_postores
          FROM ofertantes o
          GROUP BY o.codigo_convocatoria, o.numero_item
      ) sub_ofert 
          ON c.codigo_convocatoria = sub_ofert.codigo_convocatoria 
         AND c.numero_item = sub_ofert.numero_item
      WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      ORDER BY c.fecha_suscripcion_contrato DESC, c.monto_contratado_item DESC
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
      monto_contratado_item: Number(r.monto_contratado_item),
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
      { header: 'Monto Formalizado (S/)', key: 'monto_contratado_item', width: 24 },
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
          c.monto_contratado_item,
          COALESCE(sub_ofert.cant_postores, 0) AS cantidad_postores,
          CASE WHEN COALESCE(sub_ofert.cant_postores, 0) = 1 THEN 'SÍ' ELSE 'NO' END AS es_postor_unico,
          COALESCE(c.tiene_resolucion, 'NO') AS tiene_resolucion,
          c.url_contrato
      FROM contratos c
      JOIN empresa_base eb ON c.id_contratista = eb.id_organizacion
      LEFT JOIN convocatorias conv 
          ON c.codigo_convocatoria = conv.codigo_convocatoria 
         AND c.numero_item = conv.numero_item
      LEFT JOIN (
          SELECT o.codigo_convocatoria, o.numero_item, COUNT(DISTINCT o.id_postor) AS cant_postores
          FROM ofertantes o
          GROUP BY o.codigo_convocatoria, o.numero_item
      ) sub_ofert ON c.codigo_convocatoria = sub_ofert.codigo_convocatoria AND c.numero_item = sub_ofert.numero_item
      WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
      ORDER BY c.fecha_suscripcion_contrato DESC;
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
        monto_contratado_item: Number(r.monto_contratado_item),
        cantidad_postores: Number(r.cantidad_postores),
        es_postor_unico: r.es_postor_unico,
        tiene_resolucion: r.tiene_resolucion,
        url_contrato: r.url_contrato
      });

      const celdaMonto = row.getCell('monto_contratado_item');
      celdaMonto.numFmt = '_("S/"* #,##0.00_);_("S/"* \(#,##0.00\);_("S/"* "-"??_);_(@_)';
      celdaMonto.alignment = { horizontal: 'right' };

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
        monto_contratado_item: { formula: `SUM(M2:M${currentRow - 1})` }
      });
      totalRow.font = { bold: true };
      totalRow.getCell('monto_contratado_item').numFmt = '_("S/"* #,##0.00_);_("S/"* \(#,##0.00\);_("S/"* "-"??_);_(@_)';
      totalRow.commit();
    }

    await workbook.commit();
  }
}
