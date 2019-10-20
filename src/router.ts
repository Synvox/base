import Debug from 'debug';
import url from 'url';
import { reply, Handler, getUrlParams, getBasePath } from '.';
import pathMatch from './path-match';
import { IncomingMessage, ServerResponse } from 'http';

const debug = Debug('router');

const setBasePathSymbol = Symbol('BasePathSetter');

export interface RouterInstance extends Handler {
  [setBasePathSymbol]: (basePath: string) => void;
  use: (
    path: string | Handler | RouterInstance,
    handler?: Handler | RouterInstance
  ) => void;
  get: (path: string, handler: Handler | RouterInstance) => void;
  head: (path: string, handler: Handler | RouterInstance) => void;
  post: (path: string, handler: Handler | RouterInstance) => void;
  put: (path: string, handler: Handler | RouterInstance) => void;
  delete: (path: string, handler: Handler | RouterInstance) => void;
  options: (path: string, handler: Handler | RouterInstance) => void;
  patch: (path: string, handler: Handler | RouterInstance) => void;
}

type Route = {
  method: string | null;
  path: string;
  handler: Handler | RouterInstance;
  match: ReturnType<typeof routeMatch>;
};

const subAppMatch = pathMatch({
  sensitive: false,
  strict: true,
  end: false,
});

const routeMatch = pathMatch({
  sensitive: false,
  strict: false,
  end: true,
});

export default function Router() {
  let basePath = '';
  const routes: Route[] = [];

  function addRoute(
    method: string,
    path: string,
    handler: Handler | RouterInstance
  ) {
    debug(`adding ${method} ${path} to router ${basePath}`);
    const match = routeMatch(basePath + path);
    routes.push({ method, path, handler, match });
  }

  const router: RouterInstance = Object.assign(
    async function handler(req: IncomingMessage, res: ServerResponse) {
      debug('request received', req.url);
      for (let route of routes) {
        if (route.method && route.method !== req.method) continue;

        debug(
          `request ${req.method} ${req.url} may match`,
          route.method || '*',
          route.path
        );

        const path = url.parse(req.url!, true).pathname!;
        const params = route.match(path);

        if (!params) {
          debug('request does not have params, exiting');
          continue;
        }

        debug('request matches route', params);
        getUrlParams.set(req, params);
        getBasePath.set(req, basePath);

        return route.handler(req, res);
      }

      return reply('Not Found', 404);
    },
    {
      [setBasePathSymbol]: function setBasePath(bp: string) {
        basePath = bp;
        const trimTrailing = (str: string) =>
          str.endsWith('/') ? str.slice(0, -1) : str;

        for (let route of routes) {
          if (
            (route.handler as RouterInstance)[setBasePathSymbol] !== undefined
          ) {
            const newPath = `${basePath}${route.path}`;
            debug('setting base path of sub router to', newPath);
            const match = subAppMatch(newPath);
            route.path = basePath;
            route.match = match;
            (route.handler as RouterInstance)[setBasePathSymbol](newPath);
          } else {
            const newPath = `${basePath}${route.path}`;
            debug('setting base path of route to', newPath);
            const match = routeMatch(trimTrailing(newPath));
            // route.path = newPath;
            route.match = match;
          }
        }
      },
      use: function use(
        path: string | Handler | RouterInstance,
        handler?: Handler | RouterInstance
      ) {
        if (typeof path !== 'string') {
          handler = path;
          path = '';
        }

        if ((handler as RouterInstance)[setBasePathSymbol] !== undefined) {
          debug('setting base path to', basePath + path);
          (handler as RouterInstance)[setBasePathSymbol](basePath + path);
        }

        const match = subAppMatch(basePath + path);
        routes.push({ method: null, path, handler: handler!, match });
      },
      get: (path: string, handler: Handler) => addRoute('GET', path, handler),
      head: (path: string, handler: Handler) => addRoute('HEAD', path, handler),
      post: (path: string, handler: Handler) => addRoute('POST', path, handler),
      put: (path: string, handler: Handler) => addRoute('PUT', path, handler),
      delete: (path: string, handler: Handler) =>
        addRoute('DELETE', path, handler),
      options: (path: string, handler: Handler) =>
        addRoute('OPTIONS', path, handler),
      patch: (path: string, handler: Handler) =>
        addRoute('PATCH', path, handler),
    }
  );

  return router;
}
