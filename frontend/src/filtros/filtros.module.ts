import { Module } from '@nestjs/common';
import { FiltrosController } from './filtros.controller';
import { FiltrosService } from './filtros.service';

@Module({
  controllers: [FiltrosController],
  providers: [FiltrosService],
  exports: [FiltrosService]
})
export class FiltrosModule {}
