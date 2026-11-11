import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Erros do Postgres que chegam cruze (services guardam, FK garante). */
interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
}

/** Drizzle embrulha erros do driver (causa real em .cause). */
function unwrapPostgresError(exception: unknown): PostgresError | null {
  let current: unknown = exception;
  let depth = 0;
  while (current && depth < 4) {
    const candidate = current as PostgresError & { cause?: unknown };
    if (candidate.code && candidate.constraint !== undefined) return candidate;
    current = candidate.cause;
    depth += 1;
  }
  return null;
}

function friendlyFkMessage(constraint?: string): string {
  if (!constraint) {
    return 'Este registro está em uso por outro cadastro e não pode ser removido.';
  }
  if (constraint.includes('places_category_id')) {
    return 'Categoria em uso por locais. Desvincule antes de excluir.';
  }
  if (constraint.includes('anchors_category_id')) {
    return 'Categoria em uso por pontos AR. Desvincule antes de excluir.';
  }
  if (constraint.includes('categories_model_id')) {
    return 'Modelo vinculado a uma categoria. Desvincule antes de excluir.';
  }
  return 'Este registro está em uso por outro cadastro e não pode ser removido.';
}

/**
 * Filtro global de exceções — envelope consistente para TODA resposta de erro:
 * { statusCode, error, message, path, timestamp }.
 *
 * - HttpException: preserva corpo custom (ex.: `validationErrors` do
 *   ZodValidationPipe) e apenas acrescenta path/timestamp;
 * - Erros do Postgres cruze (23503 FK / 23505 unique / 23514 check):
 *   viram 409/409/400 com mensagem amigável — defense in depth sobre os
 *   guards dos services (a FK RESTRICT sempre segura o que escapar);
 * - Desconhecidos: 500 com stack logada no servidor; em produção o body
 *   não vaza detalhe interno.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly nodeEnv: string = process.env.NODE_ENV ?? 'development') {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const mapped = this.mapPostgres(exception);
    if (mapped) {
      const { status, body } = mapped;
      this.logger.warn(`${status} · ${body.message} · ${mapped.constraint ?? ''}`);
      response.status(status).json(this.envelope(status, body.error, body.message, host));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Corpo objeto (ex.: { message, validationErrors }) é preservado e
      // apenas anotado com path/timestamp — contratos existentes seguem intactos.
      if (typeof body === 'object' && body !== null) {
        response.status(status).json({
          ...body,
          path: host.switchToHttp().getRequest<Request>().url,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      response
        .status(status)
        .json(this.envelope(status, exception.name, String(body), host));
      return;
    }

    // Desconhecido: log completo no servidor, resposta genérica.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    const message =
      this.nodeEnv === 'production'
        ? 'Erro interno inesperado. A equipe foi notificada pelo log.'
        : exception instanceof Error
          ? exception.message
          : 'Erro interno inesperado.';
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(this.envelope(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error', message, host));
  }

  private mapPostgres(
    exception: unknown,
  ): { status: number; body: { error: string; message: string }; constraint?: string } | null {
    const pgError = unwrapPostgresError(exception);
    if (!pgError) return null;
    switch (pgError.code) {
      case '23503':
        return {
          status: HttpStatus.CONFLICT,
          body: { error: 'Conflict', message: friendlyFkMessage(pgError.constraint) },
          constraint: pgError.constraint,
        };
      case '23505':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            error: 'Conflict',
            message: 'Já existe um registro com este identificador.',
          },
          constraint: pgError.constraint,
        };
      case '23514':
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            error: 'Bad Request',
            message: 'Dados fora das regras permitidas. Revise os campos.',
          },
          constraint: pgError.constraint,
        };
      default:
        return null;
    }
  }

  private envelope(status: number, error: string, message: string, host: ArgumentsHost) {
    return {
      statusCode: status,
      error,
      message,
      path: host.switchToHttp().getRequest<Request>().url,
      timestamp: new Date().toISOString(),
    };
  }
}
