import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(await readFile(new URL('./auth.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function authClient(browser = true) {
  const exports = {}, storage = new Map(), window = new EventTarget();
  const hooks = [];
  vm.runInNewContext(source, { exports, Event, ...(browser && { window }),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    require(name) { assert.equal(name, 'react'); return { useSyncExternalStore(subscribe, read, server) { hooks.push({ subscribe, read, server }); return browser ? read() : server(); } }; },
  });
  return { auth: exports, storage, window, hooks };
}
test('profile user snapshots are SSR-safe and tolerate invalid stored user data', () => {
  const server = authClient(false);
  assert.equal(server.auth.getCurrentUser(), null); assert.equal(server.auth.useCurrentUser(), null);
  const { auth, storage, hooks } = authClient();
  storage.set('auth_user', '{invalid'); assert.equal(auth.getCurrentUser(), null); assert.equal(auth.useCurrentUser(), null);
  assert.equal(hooks[0].server(), null); assert.equal(hooks[0].read(), hooks[0].read());
});
test('profile updates follow same-tab session replacement and logout without route changes', () => {
  const { auth, storage, hooks } = authClient(); auth.useCurrentUser();
  let notifications = 0; const unsubscribe = hooks[0].subscribe(() => notifications++);
  auth.setSession('first-test-session', { id: 'one', name: 'First user', email: 'one@example.test' }, [{ id: 'workspace-one' }]);
  assert.equal(auth.useCurrentUser().name, 'First user');
  auth.setSession('second-test-session', { id: 'two', name: 'Second user', email: 'two@example.test' }, [{ id: 'workspace-two' }]);
  assert.equal(auth.useCurrentUser().name, 'Second user'); assert.equal(auth.useAuthToken(), 'second-test-session');
  auth.clearSession(); assert.equal(auth.useCurrentUser(), null); assert.equal(auth.useAuthToken(), null);
  assert.equal(storage.get('workspace_id'), undefined); assert.equal(notifications, 3);
  unsubscribe(); auth.setSession('later-test-session', { id: 'three' }); assert.equal(notifications, 3);
});
test('profile subscriptions observe cross-tab storage changes and unsubscribe cleanly', () => {
  const { auth, storage, window, hooks } = authClient(); auth.useCurrentUser();
  let notifications = 0; const unsubscribe = hooks[0].subscribe(() => notifications++);
  storage.set('auth_user', JSON.stringify({ id: 'remote', name: 'Other tab' })); window.dispatchEvent(new Event('storage'));
  assert.equal(notifications, 1); assert.equal(auth.useCurrentUser().name, 'Other tab');
  unsubscribe(); window.dispatchEvent(new Event('storage')); assert.equal(notifications, 1);
});
