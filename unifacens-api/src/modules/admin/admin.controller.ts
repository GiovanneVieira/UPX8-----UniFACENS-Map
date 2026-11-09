import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  adminListQuerySchema,
  updateAdminPointSchema,
  type AdminListQuery,
  type UpdateAdminPoint,
} from 'shared';
import { AdminOnly } from '../../common/auth/access.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AdminService } from './admin.service.js';

@ApiTags('admin')
@ApiBearerAuth('admin-bearer')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}
  @Get('points')
  listPoints(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ) {
    return this.service.listPoints(query);
  }
  @Patch('points/:id')
  updatePoint(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateAdminPointSchema)) dto: UpdateAdminPoint,
  ) {
    return this.service.updatePoint(id, dto);
  }
  @Get('users')
  listUsers(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ) {
    return this.service.listUsers(query);
  }
}
