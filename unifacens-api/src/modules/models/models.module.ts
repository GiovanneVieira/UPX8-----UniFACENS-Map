import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller.js';
import { ModelsService } from './models.service.js';

/**
 * Upload de modelos 3D sem conversão server-side (decisão 2026-11-11):
 * aceita .glb/.gltf(embutido)/.obj/.vrx; FBX é recusado com orientação de
 * exportar GLB. O seam de conversão (MODEL_CONVERTER/FBX2glTF) foi removido
 * — voltar atrás = reverter este commit.
 */
@Module({
  controllers: [ModelsController],
  providers: [ModelsService],
})
export class ModelsModule {}
