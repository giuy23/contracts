import { Module } from '@nestjs/common';
import { PostorUnicoController } from './postor-unico.controller';
import { PostorUnicoService } from './postor-unico.service';

@Module({
  controllers: [PostorUnicoController],
  providers: [PostorUnicoService]
})
export class PostorUnicoModule {}

