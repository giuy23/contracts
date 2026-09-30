import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: mysql.Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('DB_HOST', '127.0.0.1');
    const port = parseInt(this.configService.get<string>('DB_PORT', '3306'), 10);
    const user = this.configService.get<string>('DB_USER', 'etl_user');
    const password = this.configService.get<string>('DB_PASSWORD', 'etl_password');
    const database = this.configService.get<string>('DB_NAME', 'contrataciones');

    this.pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      decimalNumbers: true
    });

    try {
      const conn = await this.pool.getConnection();
      this.logger.log(`[MySQL] Conectado exitosamente a '${database}' en ${host}:${port}`);
      conn.release();
    } catch (error: any) {
      this.logger.warn(`[MySQL] No se pudo verificar la conexión: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('[MySQL] Pool de conexiones cerrado.');
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new Error('El pool de conexiones MySQL no ha sido inicializado.');
    }
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }
}

