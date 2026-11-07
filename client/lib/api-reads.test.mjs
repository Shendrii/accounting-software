import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('./api.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client() {
  const storage = new Map([['auth_token', 'first-session'], ['workspace_id', 'workspace-a']]);
  const calls = [];
  const exports = {};
  let clears = 0;
  const fakeFetch = (input, init) => new Promise((resolve, reject) => {
    calls.push({ input, init, resolve: value => resolve(Response.json(value)), reject, unauthorized: () => resolve(Response.json({ error: 'Unauthorized' }, { status: 401 })) });
  });
  const context = {
    exports, Request, Headers, Response, URL, process: { env: { NEXT_PUBLIC_API_URL: 'https://local-api.example.test' } },
    localStorage: { getItem: key => storage.get(key) ?? null },
    window: { location: { pathname: '/sales', href: '', reload() {} } },
    fetch: fakeFetch,
    require(name) {
      if (name === './auth') return { clearSession() { clears++; storage.delete('auth_token'); } };
      if (name === './public-paths') return { isPublicPath() { return false; } };
      if (name === './money') return { localDay() { return '2026-11-07'; } };
      throw new Error('Unexpected dependency ' + name);
    },
  };
  vm.runInNewContext(source, context);
  return { api: exports, storage, calls, cleared: () => clears };
}

test('simultaneous GETs share one request while later reads and different sessions remain fresh', async () => {
  const { api, storage, calls } = client();
  const one = api.getAccounts();
  const two = api.getAccounts();
  assert.equal(calls.length, 1);
  calls[0].resolve([{ id: 'a' }]);
  assert.deepEqual(await one, await two);
  const next = api.getAccounts();
  assert.equal(calls.length, 2);
  storage.set('workspace_id', 'workspace-b');
  const differentWorkspace = api.getAccounts();
  assert.equal(calls.length, 3);
  storage.set('auth_token', 'second-session');
  const differentSession = api.getAccounts();
  assert.equal(calls.length, 4);
  calls[1].resolve([{ id: 'a2' }]);
  calls[2].resolve([{ id: 'b' }]);
  calls[3].resolve([{ id: 'b2' }]);
  assert.equal((await next)[0].id, 'a2');
  assert.equal((await differentWorkspace)[0].id, 'b');
  assert.equal((await differentSession)[0].id, 'b2');
});

test('writes invalidate in-flight reads and a failed read can be retried', async () => {
  const { api, calls } = client();
  const before = api.getAccounts();
  const mutation = api.createAccount({ code: '1000', name: 'Checking', type: 'ASSET' });
  const during = api.getAccounts();
  assert.equal(calls.length, 3);
  calls[1].resolve({ id: 'new' });
  await mutation;
  const after = api.getAccounts();
  assert.equal(calls.length, 4);
  calls[0].resolve([]);
  calls[2].resolve([]);
  calls[3].resolve([{ id: 'new' }]);
  await Promise.all([before, during, after]);
  const failing = api.getAccounts();
  calls[4].reject(new Error('offline'));
  await assert.rejects(failing, /offline/);
  const retry = api.getAccounts();
  assert.equal(calls.length, 6);
  calls[5].resolve([]);
  await retry;
});

test('an expired response for an old session cannot log out the newly signed-in user', async () => {
  const { api, calls, storage, cleared } = client();
  const old = api.getAccounts();
  storage.set('auth_token', 'new-session');
  calls[0].unauthorized();
  await assert.rejects(old, /Unauthorized/);
  assert.equal(cleared(), 0);
  assert.equal(storage.get('auth_token'), 'new-session');
});
