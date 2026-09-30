import { Module } from '@nestjs/common';
import { CockpitController } from './cockpit.controller';
import { CockpitService } from './cockpit.service';

@Module({
  controllers: [CockpitController],
  providers: [CockpitService],
  exports: [CockpitService]
})
export class CockpitModule {}
