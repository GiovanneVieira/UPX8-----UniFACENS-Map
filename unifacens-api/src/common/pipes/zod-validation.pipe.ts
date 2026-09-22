import {
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { ZodSchema } from 'shared';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = (result.error as any).issues || (result.error as any).errors || [];
      const formattedErrors = issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Falha na validação de schema Zod',
        validationErrors: formattedErrors,
      });
    }
    return result.data;
  }
}
