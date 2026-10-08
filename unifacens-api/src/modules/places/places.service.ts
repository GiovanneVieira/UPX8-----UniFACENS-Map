import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePlaceDto, PlacesQuery, UpdatePlaceDto } from 'shared';
import { PlacesRepository } from './places.repository.js';

@Injectable()
export class PlacesService {
  constructor(
    @Inject(PlacesRepository) private readonly repository: PlacesRepository,
  ) {}
  findAll(query: PlacesQuery) {
    return this.repository.findAll(query);
  }
  create(dto: CreatePlaceDto) {
    return this.repository.create(dto);
  }
  async findById(id: string) {
    const place = await this.repository.findById(id);
    if (!place) throw new NotFoundException('Local não encontrado');
    return place;
  }
  async update(id: string, dto: UpdatePlaceDto) {
    const place = await this.repository.update(id, dto);
    if (!place) throw new NotFoundException('Local não encontrado');
    return place;
  }
  async remove(id: string) {
    if (!(await this.repository.remove(id)))
      throw new NotFoundException('Local não encontrado');
    return { success: true };
  }
}
