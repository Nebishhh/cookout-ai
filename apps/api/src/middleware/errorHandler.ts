import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '@cookout-ai/domain';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

interface ClientErrorResponse {
  status: number;
  error: string;
  message: string;
}

// Client errors raised by express.json() (body-parser/raw-body), keyed on their `type`. The
// responses are fixed strings: body-parser's own messages can echo request details (and its
// errors carry the raw body on `err.body`), so none of that is passed through. Not listed:
// 'entity.verify.failed' (no `verify` option is used) and 'stream.*' (server bugs, so 500).
const BODY_PARSER_ERRORS: Record<string, ClientErrorResponse> = {
  'entity.parse.failed': {
    status: 400,
    error: 'BadRequest',
    message: 'Malformed JSON request body.',
  },
  'entity.too.large': {
    status: 413,
    error: 'PayloadTooLarge',
    message: 'Request body is too large.',
  },
  'request.size.invalid': {
    status: 400,
    error: 'BadRequest',
    message: 'Request body did not match its declared length.',
  },
  'request.aborted': { status: 400, error: 'BadRequest', message: 'Request was aborted.' },
  'charset.unsupported': {
    status: 415,
    error: 'UnsupportedMediaType',
    message: 'Unsupported request body charset.',
  },
  'encoding.unsupported': {
    status: 415,
    error: 'UnsupportedMediaType',
    message: 'Unsupported request body encoding.',
  },
};

// A corrupt gzip/deflate body reaches here as body-parser's untyped 400 wrapping the zlib error
// (code Z_DATA_ERROR etc.), so it can't be matched by `type` above.
const UNDECODABLE_BODY: ClientErrorResponse = {
  status: 400,
  error: 'BadRequest',
  message: 'Request body could not be decoded.',
};

function bodyParserClientError(err: Error): ClientErrorResponse | undefined {
  const { type, status, code } = err as Error & {
    type?: unknown;
    status?: unknown;
    code?: unknown;
  };
  if (typeof type === 'string' && type in BODY_PARSER_ERRORS) return BODY_PARSER_ERRORS[type];
  if (status === 400 && typeof code === 'string' && code.startsWith('Z_')) return UNDECODABLE_BODY;
  return undefined;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const clientError = bodyParserClientError(err);
  if (clientError) {
    return res.status(clientError.status).json({
      error: clientError.error,
      message: clientError.message,
    });
  }

  if (err instanceof DomainError) {
    return res.status(400).json({
      error: err.name,
      message: err.message,
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: 'NotFound',
      message: err.message,
    });
  }

  // Generic 500 error handler (preventing internal stack trace leakage). The error and its stack
  // are logged server-side only; the request itself (body, cookies) is deliberately not logged.
  console.error('errorHandler: unhandled error', err);
  return res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred.',
  });
}
