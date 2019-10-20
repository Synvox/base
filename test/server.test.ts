import http, { IncomingMessage } from 'http';
import listen from 'test-listen';
import axios, { AxiosError } from 'axios';
import {
  base as Base,
  Handler,
  createError,
  getJson,
  createGetter,
  getUrlParams,
  getQueryParams,
  getBasePath,
  Router,
} from '../src';

let server: http.Server | null = null;
async function getUrl(fn: Handler) {
  const srv = http.createServer(Base(fn));
  server = srv;

  return await listen(srv);
}

afterEach(() => {
  // @ts-ignore
  console.error.mockClear();
  if (server) {
    server.close();
    server = null;
  }
});

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // @ts-ignore
  console.error.mockRestore();
  if (server) {
    server.close();
    server = null;
  }
});

test('sends strings', async () => {
  const url = await getUrl(async (_req, _res) => {
    return 'woot';
  });
  const { data } = await axios(url);

  expect(data).toEqual('woot');
});

test('sends json', async () => {
  const url = await getUrl(async (_req, _res) => {
    return { a: 'b' };
  });

  const { data } = await axios(url);

  expect(data).toEqual({ a: 'b' });
});

test('sends numbers', async () => {
  const url = await getUrl(async (_req, _res) => {
    return 1234;
  });

  const { data } = await axios(url);

  expect(data).toEqual(1234);
});

test('sends buffers', async () => {
  const url = await getUrl(async (_req, _res) => {
    return Buffer.from('buffer');
  });

  const { data } = await axios(url);

  expect(data).toEqual('buffer');
});

test('supports async handlers', async () => {
  const url = await getUrl(async (_req, _res) => {
    await new Promise(r => setImmediate(r));
    return 'await';
  });

  const { data } = await axios(url);

  expect(data).toEqual('await');
});

test('return empty string', async () => {
  const url = await getUrl((_req, _res) => {
    return '';
  });

  const { data } = await axios(url);

  expect(data).toEqual('');
});

test('ends a request when null is sent', async () => {
  const url = await getUrl((_req, _res) => {
    return null;
  });

  const { data } = await axios(url);

  expect(data).toEqual('');
});

test('ends requests when errors occur', async () => {
  const url = await getUrl((_req, _res) => {
    throw new Error('Test Error');
  });

  let error = null;
  const oldError = console.error;
  console.error = () => {};

  try {
    await axios(url);
  } catch (e) {
    error = e;
  }

  console.error = oldError;

  expect(error).toBeInstanceOf(Error);
  expect((error as AxiosError).response!.data).toBe('Test Error');
});

test('ends requests when errors occur (async)', async () => {
  const url = await getUrl(async (_req, _res) => {
    await new Promise(r => setImmediate(r));
    throw new Error('Test Error');
  });

  let error = null;
  const oldError = console.error;
  console.error = () => {};

  try {
    await axios(url);
  } catch (e) {
    error = e;
  }

  console.error = oldError;

  expect(error).toBeInstanceOf(Error);
  expect((error as AxiosError).response!.data).toBe('Test Error');
});

test('ends requests with status code when errors occur', async () => {
  const url = await getUrl((_req, _res) => {
    throw createError(400, '400 Error');
  });

  let error = null;
  const oldError = console.error;
  console.error = () => {};

  try {
    await axios(url);
  } catch (e) {
    error = e;
  }

  console.error = oldError;

  expect(error).toBeInstanceOf(Error);
  expect((error as AxiosError).response!.data).toBe('400 Error');
});

test('errors on invalid json', async () => {
  const url = await getUrl(async req => {
    const body = await getJson(req);
    return body;
  });

  let error = null;
  const oldError = console.error;
  console.error = () => {};

  try {
    await axios.post(url, '{goop}', {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    error = e;
  }

  console.error = oldError;

  expect(error).toBeInstanceOf(Error);
  expect((error as AxiosError).response!.data).toBe('Invalid JSON');
});

test('parses json', async () => {
  const url = await getUrl(async req => {
    const body = (await getJson(req)) as { name: string };
    return { res: `hey ${body.name}` };
  });

  const { data } = await axios.post(url, { name: 'Ryan' });

  expect(data).toEqual({ res: 'hey Ryan' });
});

test('getters are memoized', async () => {
  const url = await getUrl(async req => {
    const body1 = (await getJson(req)) as { name: string };
    const body2 = (await getJson(req)) as { name: string };
    return { isEqual: body1 === body2 };
  });

  const { data } = await axios.post(url, { name: 'Ryan' });

  expect(data).toEqual({ isEqual: true });
});

test('getters are can be set', async () => {
  const getObj = createGetter((_req: IncomingMessage) => {
    throw new Error('Setter did not work');
  });

  const url = await getUrl(async req => {
    const obj = {};
    getObj.set(req, obj);

    return { isEqual: obj === getObj(req) };
  });

  const { data } = await axios(url);

  expect(data).toEqual({ isEqual: true });
});

test('parses json below limit', async () => {
  const url = await getUrl(async req => {
    const body = (await getJson(req, { limit: '100mb' })) as { name: string };
    return { res: `hey ${body.name}` };
  });

  const { data } = await axios.post(url, { name: 'Ryan' });

  expect(data).toEqual({ res: 'hey Ryan' });
});

test('errors on json above limit', async () => {
  const url = await getUrl(async req => {
    const body = (await getJson(req, { limit: '1' })) as { name: string };
    return { res: `hey ${body.name}` };
  });

  let error = null;
  const oldError = console.error;
  console.error = () => {};

  try {
    await axios.post(url, '{goop}', {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    error = e;
  }

  console.error = oldError;

  expect(error).toBeInstanceOf(Error);
  expect((error as AxiosError).response!.data).toBe('request entity too large');
});

it('should handle requests', async () => {
  const app = Router();

  app.get('/:name', req => {
    const { name } = getUrlParams(req) as { name: string };
    return `Hello ${name}`;
  });

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}/bobby`);

  expect(body).toEqual('Hello bobby');
});

it('should handle multiple routes', async () => {
  const app = Router();

  app.get('/:name', req => {
    const { name } = getUrlParams(req) as { name: string };
    return `Hello ${name}`;
  });

  app.post('/:name', req => {
    const { name } = getUrlParams(req) as { name: string };
    return `Posted to ${name}`;
  });

  app.post('/', () => {
    return 'post';
  });

  const url = await getUrl(app);
  const { data: body } = await axios.post(url);

  expect(body).toEqual('post');
});

it('should hit the first qualified route', async () => {
  const app = Router();

  app.get('/', () => {
    return `first`;
  });

  app.get('/abc', () => {
    return `last`;
  });

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}/abc`);

  expect(body).toEqual('last');
});

it('should allow nesting routers', async () => {
  const subApp = Router();

  subApp.get('/:age', req => {
    const { age } = getUrlParams(req) as { age: string };
    return `age is ${age}`;
  });

  const app = Router();

  app.use('/sub', subApp);

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}/sub/123`);

  expect(body).toEqual('age is 123');
});

it('should allow nesting deep routers', async () => {
  const subApp2 = Router();

  subApp2.get('/3rd', () => {
    return '3rd';
  });

  const subApp1 = Router();

  const app = Router();

  subApp1.use('/2nd', subApp2);

  app.use('/1st', subApp1);

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}/1st/2nd/3rd`);

  expect(body).toEqual('3rd');
});

it('should allow nesting deep routers without adding a path', async () => {
  const app = Router();
  const subApp = Router();
  const subApp2 = Router();

  subApp2.use('/app', () => 'res');

  subApp.use(subApp2);
  app.use(subApp);

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}/app`);

  expect(body).toEqual('res');
});

it('should 404 if no route is found', async () => {
  const app = Router();

  const url = await getUrl(app);
  const { status } = await axios.get(`${url}/bobby`).catch(r => r.response);

  expect(status).toEqual(404);
});

it('should allow getting the search query', async () => {
  const app = Router();

  app.get('/', req => {
    const { name } = getQueryParams(req);
    return `Hello ${name}`;
  });

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}?name=bobby`);

  expect(body).toEqual('Hello bobby');
});

it('should allow getting the base path', async () => {
  const subApp = Router();

  subApp.get('/', req => {
    return getBasePath(req);
  });

  const app = Router();

  app.use('/sub', subApp);

  const url = await getUrl(app);
  const { data: body } = await axios.get(`${url}/sub`);

  expect(body).toEqual('/sub');
});

it('works with other http methods', async () => {
  const app = Router();

  app.get('/', () => 'GET');
  app.put('/', () => 'PUT');
  app.post('/', () => 'POST');
  app.patch('/', () => 'PATCH');
  app.delete('/', () => 'DELETE');
  app.head('/', () => null);
  app.options('/', () => 'OPTIONS');

  const url = await getUrl(app);

  {
    const { data: body } = await axios.get(url);
    expect(body).toEqual('GET');
  }
  {
    const { data: body } = await axios.put(url);
    expect(body).toEqual('PUT');
  }
  {
    const { data: body } = await axios.post(url);
    expect(body).toEqual('POST');
  }
  {
    const { data: body } = await axios.patch(url);
    expect(body).toEqual('PATCH');
  }
  {
    const { data: body } = await axios.delete(url);
    expect(body).toEqual('DELETE');
  }
  {
    const { status } = await axios.head(url);
    expect(status).toEqual(200);
  }
  {
    const { data: body } = await axios({
      url,
      method: 'OPTIONS',
    });
    expect(body).toEqual('OPTIONS');
  }
});

describe('custom getters', () => {
  const useUrl = createGetter(req => req.url);
  const useUrlAsync = createGetter(async req => await req.url);

  it('should allow sync hooks', async () => {
    const app = Router();

    app.get('/', req => {
      return useUrl(req);
    });

    const url = await getUrl(app);
    const { data: body } = await axios.get(url);

    expect(typeof body === 'string').toEqual(true);
  });

  it('should allow async hooks', async () => {
    const app = Router();

    app.get('/', async req => {
      return await useUrlAsync(req);
    });

    const url = await getUrl(app);
    const { data: body } = await axios.get(url);

    expect(typeof body === 'string').toEqual(true);
  });

  it('should cache requests to get the hooks', async () => {
    const app = Router();

    app.get('/', req => {
      const query1 = getQueryParams(req);
      const query2 = getQueryParams(req);
      return query1 === query2 ? 'equal' : 'not-equal';
    });

    const url = await getUrl(app);
    const { data: body } = await axios.get(`${url}?name="bob`);

    expect(body).toEqual('equal');
  });
});
