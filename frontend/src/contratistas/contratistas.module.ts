import { Module } from '@nestjs/common';
import { ContratistasController } from './contratistas.controller';
import { ContratistasService } from './contratistas.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ContratistasController],
  providers: [ContratistasService],
  exports: [ContratistasService]
})
export class ContratistasModule {}
