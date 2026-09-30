import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FiltrosService {
  private readonly logger = new Logger(FiltrosService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Obtiene la lista de departamentos únicos desde la tabla ubigeo
   */
  async getDepartamentos(): Promise<string[]> {
    try {
      const sql = `
        SELECT DISTINCT TRIM(departamento) AS departamento
        FROM ubigeo
        WHERE departamento IS NOT NULL AND TRIM(departamento) != ''
        ORDER BY departamento ASC;
      `;
      const rows = await this.db.query<{ departamento: string }>(sql);
      return rows.map(r => r.departamento);
    } catch (error: any) {
      this.logger.error(`Error al obtener departamentos: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene la lista de provincias correspondientes a un departamento
   */
  async getProvincias(departamento: string): Promise<string[]> {
    if (!departamento) return [];
    try {
      const sql = `
        SELECT DISTINCT TRIM(provincia) AS provincia
        FROM ubigeo
        WHERE departamento = ?
          AND provincia IS NOT NULL AND TRIM(provincia) != ''
        ORDER BY provincia ASC;
      `;
      const rows = await this.db.query<{ provincia: string }>(sql, [departamento]);
      return rows.map(r => r.provincia);
    } catch (error: any) {
      this.logger.error(`Error al obtener provincias de ${departamento}: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene la lista de distritos correspondientes a un departamento y provincia
   */
  async getDistritos(departamento: string, provincia: string): Promise<string[]> {
    if (!departamento || !provincia) return [];
    try {
      const sql = `
        SELECT DISTINCT TRIM(distrito) AS distrito
        FROM ubigeo
        WHERE departamento = ?
          AND provincia = ?
          AND distrito IS NOT NULL AND TRIM(distrito) != ''
        ORDER BY distrito ASC;
      `;
      const rows = await this.db.query<{ distrito: string }>(sql, [departamento, provincia]);
      return rows.map(r => r.distrito);
    } catch (error: any) {
      this.logger.error(`Error al obtener distritos: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene las monedas registradas en la tabla monedas
   */
  async getMonedas(): Promise<string[]> {
    try {
      const sql = `
        SELECT DISTINCT TRIM(COALESCE(codigo_iso, nombre_moneda)) AS moneda
        FROM monedas
        WHERE nombre_moneda IS NOT NULL
        ORDER BY moneda ASC;
      `;
      const rows = await this.db.query<{ moneda: string }>(sql);
      return rows.map(r => r.moneda);
    } catch (error: any) {
      this.logger.error(`Error al obtener monedas: ${error.message}`);
      return ['SOLES', 'DOLARES'];
    }
  }

  /**
   * Obtiene los tipos de proceso de selección únicos
   */
  async getTiposProceso(): Promise<string[]> {
    try {
      const sql = `
        SELECT DISTINCT TRIM(tipo_proceso_seleccion) AS tipo_proceso
        FROM procesos
        WHERE tipo_proceso_seleccion IS NOT NULL AND TRIM(tipo_proceso_seleccion) != ''
        ORDER BY tipo_proceso ASC;
      `;
      const rows = await this.db.query<{ tipo_proceso: string }>(sql);
      return rows.map(r => r.tipo_proceso);
    } catch (error: any) {
      this.logger.error(`Error al obtener tipos de proceso: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene los estados de contratación de los ítems
   */
  async getEstados(): Promise<string[]> {
    try {
      const sql = `
        SELECT DISTINCT TRIM(estado_item) AS estado
        FROM convocatoria_items
        WHERE estado_item IS NOT NULL AND TRIM(estado_item) != ''
        ORDER BY estado ASC;
      `;
      const rows = await this.db.query<{ estado: string }>(sql);
      return rows.map(r => r.estado);
    } catch (error: any) {
      this.logger.error(`Error al obtener estados: ${error.message}`);
      return [];
    }
  }
}
