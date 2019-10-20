import { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'http';
import url from 'url';
import contentType from 'content-type';
import queryString from 'query-string';
import getRawBody from 'raw-body';
import { Stream } from 'stream';
export { default as Router, RouterInstance } from './router';

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse
) =>
  | Response
  | Json
  | Buffer
  | undefined
  | any
  | Promise<Response | Json | Buffer | undefined | any>;

export type Json =
  | string
  | number
  | boolean
  | null
  | Date
  | JsonArray
  | JsonObject;
interface JsonArray extends Array<Json> {}
type JsonObject = { [x: string]: Json };

function parseJSON(str: string): Json {
  try {
    return JSON.parse(str);
  } catch (err) {
    throw createError(400, 'Invalid JSON', err);
  }
}

function isStream(stream: any) {
  return (
    stream !== null &&
    typeof stream === 'object' &&
    typeof stream.pipe === 'function'
  );
}

function readable(stream: any) {
  return (
    isStream(stream) &&
    stream.readable !== false &&
    typeof stream._read === 'function' &&
    typeof stream._readableState === 'object'
  );
}

export function base(handler: Handler) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    let rawResponse = null;
    try {
      rawResponse = await handler(req, res);
      if (rawResponse === undefined) return;
    } catch (errorObj) {
      const statusCode = errorObj.statusCode || errorObj.status || 500;
      const message = statusCode ? errorObj.message : 'Internal Server Error';
      rawResponse = reply(message, statusCode);
      console.error(errorObj);
    }

    const response =
      rawResponse instanceof Response ? rawResponse : new Response(rawResponse);

    res.statusCode = response.statusCode;

    const obj = response.body;

    if (obj === null) return res.end();

    // buffers
    if (Buffer.isBuffer(obj)) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      res.setHeader('Content-Length', obj.length);
      res.end(obj);
      return;
    }

    // streams
    if (obj instanceof Stream || readable(obj)) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      ((obj as unknown) as Stream).pipe(res);
      return;
    }

    let str = obj;
    if (typeof obj === 'object' || typeof obj === 'number') {
      str = JSON.stringify(obj);

      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    }

    res.setHeader('Content-Length', Buffer.byteLength(String(str)));
    res.end(str);
  };
}

export class Response {
  body: Json | Buffer;
  statusCode: number;
  headers: OutgoingHttpHeaders;

  constructor(
    body: Json | Buffer,
    statusCode: number = 200,
    headers: OutgoingHttpHeaders = {}
  ) {
    this.body = body;
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

export function reply(
  body: Json | Buffer,
  statusCode: number = 200,
  headers: OutgoingHttpHeaders = {}
) {
  return new Response(body, statusCode, headers);
}

export class ServerError extends Error {
  statusCode: number;
  original: Error | null;
  constructor(
    message: string,
    statusCode: number = 500,
    original: Error | null = null
  ) {
    super(message);
    this.statusCode = statusCode;
    this.original = original;
  }
}

export function createError(
  statusCode: number,
  message: string,
  original?: Error
) {
  return new ServerError(message, statusCode, original);
}

export function createGetter<
  ReturnType,
  T extends (req: IncomingMessage, ...args: any[]) => ReturnType
>(handler: T) {
  const reqWeakMap = new WeakMap<IncomingMessage, ReturnType>();

  const memo = (req: IncomingMessage, ...args: any[]) => {
    if (reqWeakMap.has(req)) return reqWeakMap.get(req);

    const result = handler(req, ...args);
    reqWeakMap.set(req, result);

    return result;
  };

  memo.set = (req: IncomingMessage, value: ReturnType) => {
    reqWeakMap.set(req, value);
  };

  return memo as T & {
    set: (req: IncomingMessage, value: ReturnType) => void;
  };
}

export const getText = createGetter(
  (
    req,
    { limit = '1mb', encoding }: { limit?: string; encoding?: string } = {}
  ) => {
    const type = req.headers['content-type'] || 'text/plain';
    const length = req.headers['content-length'];

    if (encoding === undefined) {
      encoding = contentType.parse(type).parameters.charset;
    }

    return getRawBody(req, { limit, length, encoding });
  }
);

export const getJson = createGetter(
  async (
    req,
    { limit, encoding }: { limit?: string; encoding?: string } = {}
  ) => {
    const body = await getText(req, { limit, encoding });
    return parseJSON(body);
  }
);

export const getQueryParams = createGetter(req => {
  const str = (url.parse(req.url!, true).search || '').slice(1);

  return queryString.parse(str);
});

/* istanbul ignore next */
export const getUrlParams = createGetter(_req => {
  // This function should never be called because it is set
  // in the router function
  return {};
});

/* istanbul ignore next */
export const getBasePath = createGetter(_req => {
  // This function should never be called because it is set
  // in the router function
  return '';
});
