import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import jwt from 'jsonwebtoken';

const root = process.env.ACCOUNTING_AUTH_TEST_API;
const options = { skip: !root && 'Set ACCOUNTING_AUTH_TEST_API to the localhost API with stubbed Google and email.' };
const password = 'disposable-test-password';
async function api(path, body, status = 200, token, method = body === undefined ? 'GET' : 'POST') {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(root).hostname));
  const response = await fetch(root + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
  assert.equal(response.status, status, path + ': ' + JSON.stringify(data));
  return { data, response };
}
async function signup() {
  const email = randomUUID() + '@example.test';
  return { email, ... (await api('/api/auth/signup', { name: 'Auth fixture', email, password }, 201)).data };
}
async function start(profile, startUrl) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  await api('/__test/google', profile);
  const response = await fetch(startUrl || root + '/api/auth/google/start?challenge=' + challenge, { redirect: 'manual' });
  assert.equal(response.status, 302);
  const state = new URL(response.headers.get('location')).searchParams.get('state');
  const cookie = response.headers.getSetCookie().find(row => row.startsWith('accountrix_oauth=')).split(';')[0];
  return { verifier, challenge, state, cookie };
}
async function callback(flow, query = '?code=fixture&state=' + flow.state, status = 302) {
  const response = await fetch(root + '/api/auth/google/callback' + query, { redirect: 'manual', headers: { Cookie: flow.cookie } });
  assert.equal(response.status, status, await response.clone().text());
  return response.headers.get('location');
}
async function emailToken(email, purpose) {
  const { data } = await api('/__test/mail');
  const mail = data.findLast(row => row.to === email && row.purpose === purpose);
  assert.ok(mail); return new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token');
}

test('new passwords preserve suffixes beyond bcrypt’s legacy byte boundary', async () => {
  const first = '長'.repeat(30) + 'one'; const hash = await hashPassword(first);
  assert.equal(await verifyPassword(first, hash), true);
  assert.equal(await verifyPassword('長'.repeat(30) + 'two', hash), false);
});

test('local login, case normalization and per-session revocation cover all auth consumers', options, async () => {
  const user = await signup();
  const { data: login } = await api('/api/auth/login', { email: ' ' + user.email.toUpperCase() + ' ', password });
  assert.notEqual(user.token, login.token);
  await api('/api/auth/signup', { email: user.email.toUpperCase(), name: 'Duplicate', password }, 409);
  await api('/api/auth/me', undefined, 200, user.token);
  await api('/api/workspaces', undefined, 200, user.token);
  await api('/api/accounts', undefined, 200, user.token);
  await api('/api/auth/logout', {}, 200, user.token);
  for (const path of ['/api/auth/me', '/api/workspaces', '/api/accounts']) await api(path, undefined, 401, user.token);
  await api('/api/auth/me', undefined, 200, login.token);
});

test('legacy and fabricated session identities cannot bypass any auth boundary', options, async () => {
  const user = await signup();
  for (const payload of [{ userId: user.user.id }, { userId: user.user.id, sessionId: randomUUID(), version: 0 }]) {
    const token = jwt.sign(payload, 'disposable-readiness-test-secret', { expiresIn: '1m' });
    for (const path of ['/api/auth/me', '/api/workspaces', '/api/accounts']) await api(path, undefined, 401, token);
  }
});

test('email conflict cannot attach Google or retain another person’s local access', options, async () => {
  const user = await signup();
  const flow = await start({ sub: randomUUID(), email: user.email, email_verified: true });
  const location = await callback(flow);
  assert.equal(new URL(location).hash, '#error=account_exists');
  await api('/api/auth/login', { email: user.email, password });
});

test('Google requires verified email, valid browser state and a one-use browser-bound handoff', options, async () => {
  const profile = { sub: randomUUID(), email: randomUUID() + '@example.test', email_verified: true, name: 'Google control' };
  let flow = await start(profile);
  await callback(flow, '?code=fixture&state=' + 'x'.repeat(43), 400);
  flow = await start({ ...profile, email_verified: 'true' }); await callback(flow, undefined, 400);
  flow = await start(profile);
  await callback(flow, '?code=fixture&state=' + flow.state + '&state=' + flow.state, 400);
  flow = await start(profile);
  const location = await callback(flow); const ticket = new URLSearchParams(new URL(location).hash.slice(1)).get('ticket');
  assert.ok(ticket); assert.equal(location.includes('session='), false);
  await api('/api/auth/google/complete', { ticket, verifier: randomBytes(32).toString('base64url') }, 400);
  const { data: session } = await api('/api/auth/google/complete', { ticket, verifier: flow.verifier });
  assert.equal(session.user.email, profile.email); assert.ok(session.user.emailVerifiedAt);
  await api('/api/auth/google/complete', { ticket, verifier: flow.verifier }, 400);
  await callback(flow, undefined, 400);
  flow = await start(profile);
  const again = new URLSearchParams(new URL(await callback(flow)).hash.slice(1)).get('ticket');
  const { data: repeat } = await api('/api/auth/google/complete', { ticket: again, verifier: flow.verifier });
  assert.equal(repeat.user.id, session.user.id);
  const renamed = { ...profile, email: randomUUID() + '@example.test' };
  flow = await start(renamed);
  const renamedTicket = new URLSearchParams(new URL(await callback(flow)).hash.slice(1)).get('ticket');
  const { data: renamedSession } = await api('/api/auth/google/complete', { ticket: renamedTicket, verifier: flow.verifier });
  assert.equal(renamedSession.user.id, session.user.id); assert.equal(renamedSession.user.email, renamed.email);
  await api('/api/auth/me', undefined, 401, session.token);
});

test('verification, explicit linking and ownership recovery preserve the legitimate account', options, async () => {
  const user = await signup(); const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url');
  await api('/api/auth/google/link', { password, challenge }, 403, user.token);
  await api('/api/auth/verification/request', {}, 200, user.token);
  const verification = await emailToken(user.email, 'VERIFY_EMAIL');
  await api('/api/auth/verification/confirm', { token: verification });
  await api('/api/auth/verification/confirm', { token: verification }, 400);
  await api('/api/auth/google/link', { password: 'wrong', challenge }, 403, user.token);
  const { data: linked } = await api('/api/auth/google/link', { password, challenge }, 200, user.token);
  const flow = await start({ sub: randomUUID(), email: user.email, email_verified: true }, linked.url);
  const ticket = new URLSearchParams(new URL(await callback(flow)).hash.slice(1)).get('ticket');
  const { data: google } = await api('/api/auth/google/complete', { ticket, verifier });
  assert.equal(google.user.id, user.user.id);
  await api('/api/auth/password/request', { email: user.email });
  const reset = await emailToken(user.email, 'RESET_PASSWORD');
  await api('/api/auth/password/reset', { token: reset, password: password + '-new' });
  for (const token of [user.token, google.token]) await api('/api/accounts', undefined, 401, token);
  await api('/api/auth/password/reset', { token: reset, password: password + '-again' }, 400);
  await api('/api/auth/login', { email: user.email, password }, 401);
  await api('/api/auth/login', { email: user.email, password: password + '-new' });
});
