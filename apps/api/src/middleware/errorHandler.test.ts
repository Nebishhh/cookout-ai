import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { gzipSync } from 'node:zlib';
import { InvalidRecipeError } from '@cookout-ai/domain';
import { app } from '../app.js';
import { errorHandler, NotFoundError } from './errorHandler.js';

// Never sent back: proves responses don't echo request content or body-parser's own message.
const SENTINEL = 'sentinel-7f3c9d';

// Sends the bytes exactly as given: without the identity serializer, superagent JSON-encodes a
// Buffer body under a JSON Content-Type (`{"type":"Buffer","data":[...]}`).
function postRaw(headers: Record<string, string>, body: string | Buffer) {
  const req = request(app).post('/api/auth/login');
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.serialize((raw) => raw).send(body);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorHandler: body-parser client errors (through the real app)', () => {
  it('returns 400 with a fixed message for malformed JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await postRaw({ 'Content-Type': 'application/json' }, `{"email": ${SENTINEL}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'BadRequest', message: 'Malformed JSON request body.' });
    expect(res.text).not.toContain(SENTINEL);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('returns 413 with a fixed message for a JSON body over the size limit', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await postRaw(
      { 'Content-Type': 'application/json' },
      JSON.stringify({ email: SENTINEL, padding: 'x'.repeat(200_000) })
    );

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'PayloadTooLarge', message: 'Request body is too large.' });
    expect(res.text).not.toContain(SENTINEL);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('returns 413 when a gzipped body decompresses past the size limit', async () => {
    const res = await postRaw(
      { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      gzipSync(JSON.stringify({ padding: 'x'.repeat(500_000) }))
    );

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('PayloadTooLarge');
  });

  it('returns 400 for a corrupt gzip body', async () => {
    const res = await postRaw(
      { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      `not gzip ${SENTINEL}`
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'BadRequest',
      message: 'Request body could not be decoded.',
    });
  });

  it('returns 415 for an unsupported Content-Encoding', async () => {
    const res = await postRaw(
      { 'Content-Type': 'application/json', 'Content-Encoding': 'br' },
      '{}'
    );

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      error: 'UnsupportedMediaType',
      message: 'Unsupported request body encoding.',
    });
  });

  it('returns 415 for a non-UTF JSON charset', async () => {
    const res = await postRaw({ 'Content-Type': 'application/json; charset=latin1' }, '{}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      error: 'UnsupportedMediaType',
      message: 'Unsupported request body charset.',
    });
  });
});

describe('errorHandler: application errors', () => {
  function appThrowing(err: Error) {
    const testApp = express();
    testApp.get('/boom', () => {
      throw err;
    });
    testApp.use(errorHandler);
    return testApp;
  }

  it('returns the generic 500 body and logs the error with its stack', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error(`db exploded ${SENTINEL}`);

    const res = await request(appThrowing(err)).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    });
    expect(res.text).not.toContain(SENTINEL);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const loggedError = consoleError.mock.calls[0].find((arg) => arg instanceof Error);
    expect(loggedError).toBe(err);
    expect(loggedError?.stack).toBeTruthy();
  });

  it('keeps DomainError as 400 with its name and message, without logging', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(appThrowing(new InvalidRecipeError('Recipe name is required'))).get(
      '/boom'
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'InvalidRecipeError', message: 'Recipe name is required' });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps NotFoundError as 404 with its message, without logging', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(appThrowing(new NotFoundError('Recipe not found'))).get('/boom');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NotFound', message: 'Recipe not found' });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
