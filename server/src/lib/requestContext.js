import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export function withRequestContext(context, handler) {
  return als.run(context, handler);
}

export function getRequestContext() {
  return als.getStore() ?? {};
}

