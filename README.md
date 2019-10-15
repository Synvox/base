# `@synvox/base`

A small Node.js router with middleware inspired by React hooks

```
npm i @synvox/base
```

## Features

- `express` style routing
- composable sub routers
- lightweight
- `getters` that resemble react hooks
- api inspired by `zeit/micro`

## Basic Example

```js
import http from 'http';
import { base, Router, getJson } from '@synvox/base';

const app = Router();

let name = 'World';

app.get('/', () => {
  return `Hello ${name}`;
});

app.post('/', async req => {
  const body = await getJson(req);
  name = body.name;
  return 'Ok';
});

http.createServer(base(app)).listen(3000);
```

## Getters instead of middleware

With `base` you can create your own _getters_ that replace the need for most middleware.

```js
import { base, Router, getJson } from '@synvox/base';
import { connect, createError } from '@synvox/sql';

const sql = connect();

export const getUser = createGetter(async req => {
  const user = await sql`
    select * from users
    join user_tokens on users.id = user_tokens.user_id
    where user_tokens.id=${req.headers.token}
  `;

  if (!user) throw createError(401);

  return user;
});

export const isAdmin = createGetter(async req => {
  return await getUser(req).isAdmin;
});

// elsewhere
import { createError } from '@synvox/base';
import { getUser } from './getters';

app.get('/whoami', async req => {
  return await getUser(req);
});

app.get('/admin', async req => {
  const user = await getUser(req);
  const isAdmin = await isAdmin(req);
  if (!isAdmin) throw createError(401);

  // etc...
});
```

`getter`s that are created with `createGetter` are memoized by `req` so in the previous example, calling `getUser` multiple times results in a single query to the database.

## Responding to requests

### Returning JSON

Returning JavaScript objects will result in them being sent as JSON.

### `reply`

Return `reply(body, [status], [headers])` to send a response with a status code or headers.

### `createError`

Throw `createError(status, [message])` to send a server error.

## Built in getters

### `getText`

Get the body of a request as plaintext.

### `getJson`

Get the body of a request as JSON.

### `getQueryParams`

Get the query parameters of a request as a JavaScript object.

### `getUrlParams`

Get the url parameters of a request as a JavaScript object.

## Routing examples

```js
import { Router } from '@synvox/base';
const app = Router();

app.get('/', () => {
  return 'GET!';
});

app.post('/echo', async req => {
  const body = await getText(req);
  return body;
});

const subApp = Router();

subApp.get('/');

app.use('/sub', subApp); // now all subApp endpoints are prefixed with /sub
```
