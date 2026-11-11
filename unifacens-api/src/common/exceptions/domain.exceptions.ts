import {
  BadRequestException,
  ConflictException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Exceções de domínio — semanticamente nomeadas no lugar de lançar
 * exceptions HTTP genéricas espalhadas pelos services. Todas estendem
 * as built-ins do Nest (status já correto); o AllExceptionsFilter
 * normaliza o envelope de resposta de todas.
 */

/** Registro referenciado por outro (FK em uso) — 409. */
export class RecordInUseException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

/** Identificador único duplicado (slug, etc.) — 409. */
export class DuplicatedRecordException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

/** Conteúdo/extensão/estrutura de arquivo inválida — 400. */
export class InvalidModelFileException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

/** Arquivo acima do limite permitido — 413. */
export class UploadSizeExceededException extends PayloadTooLargeException {
  constructor(message: string) {
    super(message);
  }
}

/** Falha de infraestrutura de armazenamento (S3/disco fora) — 503. */
export class StorageFailureException extends ServiceUnavailableException {
  constructor(message = 'Falha no armazenamento de arquivos. Tente novamente em instantes.') {
    super(message);
  }
}
