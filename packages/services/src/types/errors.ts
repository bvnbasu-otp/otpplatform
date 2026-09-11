export class ServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class TransitionError extends ServiceError {
  constructor(from: string, to: string, entity = 'entity') {
    super('INVALID_TRANSITION', `Cannot transition ${entity} from ${from} to ${to}`);
    this.name = 'TransitionError';
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}
