import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { FiltrosModule } from './filtros/filtros.module';
import { CockpitModule } from './cockpit/cockpit.module';
import { ContratistasModule } from './contratistas/contratistas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*path}']
    }),
    DatabaseModule,
    FiltrosModule,
    CockpitModule,
    ContratistasModule
  ]
})
export class AppModule {}

