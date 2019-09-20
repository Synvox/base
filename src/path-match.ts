// Typescript version of https://github.com/pillarjs/path-match
import pathToRegexp from 'path-to-regexp';
import { createError } from '.';

export default function PathMatch(
  options: pathToRegexp.RegExpOptions & pathToRegexp.ParseOptions
) {
  options = options || {};

  return function(path: pathToRegexp.Path) {
    const keys: pathToRegexp.Key[] = [];
    const re = pathToRegexp(path, keys, options);

    return function(pathname: string) {
      const m = re.exec(pathname);
      if (!m) {
        return false;
      }

      const params: { [key: string]: string | string[] } = {};

      let key: pathToRegexp.Key | undefined;
      let param;
      for (let i = 0; i < keys.length; i++) {
        key = keys[i];
        param = m[i + 1];
        if (!param) continue;
        params[key.name] = decodeParam(param);
        if (key.repeat)
          params[key.name] = (params[key.name] as string).split(key.delimiter);
      }

      return params;
    };
  };
}

function decodeParam(param: string) {
  try {
    return decodeURIComponent(param);
  } catch (_) {
    throw createError(400, `failed to decode param "${param}"`);
  }
}
