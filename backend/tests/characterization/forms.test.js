// backend/tests/characterization/forms.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../helpers/app.js';
import { useTestDatabase } from '../helpers/suite.js';
import { authHeader } from '../helpers/auth.js';
import {
  createUser, createSite, addCollaborator, createSubmission, getSubmission, countRows,
} from '../helpers/factories.js';

useTestDatabase();

const DENIED = { message: 'Доступ заборонено.' };

let owner, overviewEditor, overviewViewer, commerceEditor, bare, stranger, site, first, second;

beforeEach(async () => {
  owner = await createUser({ plan: 'PLUS' });
  overviewEditor = await createUser();
  overviewViewer = await createUser();
  commerceEditor = await createUser();
  bare = await createUser();
  stranger = await createUser();
  site = await createSite(owner, { site_path: 'acme-shop' });
  await addCollaborator(site, overviewEditor, 'editor', ['overview']);
  await addCollaborator(site, overviewViewer, 'viewer', ['overview']);
  await addCollaborator(site, commerceEditor, 'editor', ['commerce']);
  await addCollaborator(site, bare, 'editor', []);
  first = await createSubmission(site, { form_data: { name: 'Олена', email: 'olena@client.test', message: 'Перше' } });
  second = await createSubmission(site, { form_data: { name: 'Іван', email: 'ivan@client.test', message: 'Друге' } });
});

const actor = (name) => ({ stranger, bare, commerceEditor, overviewViewer, overviewEditor, owner })[name];
const withAuth = (req, user) => (user ? req.set(authHeader(user)) : req);
const forms = (method, url, user, body) => {
  const req = withAuth(request(app)[method](`/api/form${url}`), user);
  return body === undefined ? req : req.send(body);
};

describe('GET /api/form/:siteId', () => {
  it('без токена — 401', async () => {
    expect((await forms('get', `/${site.id}`, null)).status).toBe(401);
  });

  it('власник бачить заявки свого сайту', async () => {
    const res = await forms('get', `/${site.id}`, owner);
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id).sort()).toEqual([first.id, second.id].sort());
    expect(res.body.find((s) => s.id === first.id).form_data).toMatchObject({ name: 'Олена', email: 'olena@client.test', message: 'Перше' });
  });

  it('заявки іншого сайту у відповідь не потрапляють', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const foreign = await createSubmission(otherSite);
    const res = await forms('get', `/${site.id}`, owner);
    expect(res.body.map((s) => s.id)).not.toContain(foreign.id);
  });

  it.each(['overviewEditor', 'overviewViewer'])('D-SEC-06: співавтор %s із секцією overview бачить заявки', async (who) => {
    const res = await forms('get', `/${site.id}`, actor(who));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it.each(['commerceEditor', 'bare', 'stranger'])('D-SEC-06: %s отримує 403 без персональних даних клієнтів', async (who) => {
    const res = await forms('get', `/${site.id}`, actor(who));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(DENIED);
  });

  it('D-SEC-06: співавтор іншого сайту не бачить заявок цього', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const member = await createUser();
    await addCollaborator(otherSite, member, 'editor', ['overview']);
    const res = await forms('get', `/${site.id}`, member);
    expect(res.status).toBe(403);
  });

  it('неіснуючий сайт — 403', async () => {
    expect((await forms('get', '/999999', owner)).status).toBe(403);
  });
});

describe('PATCH /api/form/:siteId/:submissionId/status', () => {
  const setStatus = (user, id, status, siteId = site.id) => forms('patch', `/${siteId}/${id}/status`, user, { status });

  it('власник змінює статус, решта даних заявки зберігається', async () => {
    const res = await setStatus(owner, first.id, 'processing');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Статус оновлено' });
    expect((await getSubmission(first.id)).form_data).toEqual({
      name: 'Олена', email: 'olena@client.test', message: 'Перше', status: 'processing',
    });
    expect((await getSubmission(second.id)).form_data.status).toBeUndefined();
  });

  it('D-SEC-06: редактор із секцією overview змінює статус', async () => {
    const res = await setStatus(overviewEditor, first.id, 'completed');
    expect(res.status).toBe(200);
    expect((await getSubmission(first.id)).form_data.status).toBe('completed');
  });

  it.each(['overviewViewer', 'commerceEditor', 'bare', 'stranger'])('D-SEC-06: %s не змінює статус', async (who) => {
    const res = await setStatus(actor(who), first.id, 'completed');
    expect(res.status).toBe(403);
    expect(res.body).toEqual(DENIED);
    expect((await getSubmission(first.id)).form_data.status).toBeUndefined();
  });

  it('неіснуюча заявка — 404', async () => {
    const res = await setStatus(owner, 999999, 'processing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Заявку не знайдено' });
  });

  it('D-SEC-28: власник свого сайту не змінює заявку чужого сайту, підставивши власний siteId', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const foreign = await createSubmission(otherSite, { form_data: { name: 'Чужий', email: 'x@client.test', message: 'Чуже' } });
    const res = await setStatus(owner, foreign.id, 'completed');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Заявку не знайдено' });
    expect((await getSubmission(foreign.id)).form_data).toEqual({ name: 'Чужий', email: 'x@client.test', message: 'Чуже' });
  });

  it('без токена — 401', async () => {
    expect((await forms('patch', `/${site.id}/${first.id}/status`, null, { status: 'completed' })).status).toBe(401);
  });
});

describe('PATCH /api/form/:siteId/:submissionId/pin', () => {
  const pin = (user, id, siteId = site.id) => forms('patch', `/${siteId}/${id}/pin`, user);

  it('власник закріплює й відкріплює заявку', async () => {
    const on = await pin(owner, first.id);
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ message: 'Заявку закріплено', is_pinned: true });
    expect((await getSubmission(first.id)).is_pinned).toBe(1);
    const off = await pin(owner, first.id);
    expect(off.body).toEqual({ message: 'Заявку відкріплено', is_pinned: false });
    expect((await getSubmission(first.id)).is_pinned).toBe(0);
  });

  it('D-SEC-06: редактор із секцією overview закріплює заявку', async () => {
    const res = await pin(overviewEditor, first.id);
    expect(res.status).toBe(200);
    expect((await getSubmission(first.id)).is_pinned).toBe(1);
  });

  it.each(['overviewViewer', 'commerceEditor', 'bare', 'stranger'])('D-SEC-06: %s не закріплює заявку', async (who) => {
    const res = await pin(actor(who), first.id);
    expect(res.status).toBe(403);
    expect((await getSubmission(first.id)).is_pinned).toBe(0);
  });

  it('заявка іншого сайту не змінюється', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const foreign = await createSubmission(otherSite, { is_pinned: 1 });
    const res = await pin(owner, foreign.id);
    expect(res.status).toBe(200);
    expect(res.body.is_pinned).toBe(false);
    expect((await getSubmission(foreign.id)).is_pinned).toBe(1);
  });
});

describe('PUT /api/form/:siteId/:submissionId/read', () => {
  const markRead = (user, id, siteId = site.id) => forms('put', `/${siteId}/${id}/read`, user);

  it('власник позначає заявку прочитаною', async () => {
    const res = await markRead(owner, first.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Заявку позначено як прочитану.' });
    expect((await getSubmission(first.id)).is_read).toBe(1);
    expect((await getSubmission(second.id)).is_read).toBe(0);
  });

  it('D-SEC-06: редактор із секцією overview позначає заявку прочитаною', async () => {
    expect((await markRead(overviewEditor, first.id)).status).toBe(200);
    expect((await getSubmission(first.id)).is_read).toBe(1);
  });

  it.each(['overviewViewer', 'commerceEditor', 'bare', 'stranger'])('D-SEC-06: %s не позначає заявку прочитаною', async (who) => {
    const res = await markRead(actor(who), first.id);
    expect(res.status).toBe(403);
    expect((await getSubmission(first.id)).is_read).toBe(0);
  });

  it('заявка іншого сайту не змінюється', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const foreign = await createSubmission(otherSite);
    await markRead(owner, foreign.id);
    expect((await getSubmission(foreign.id)).is_read).toBe(0);
  });
});

describe('DELETE /api/form/:siteId/:submissionId', () => {
  const remove = (user, id, siteId = site.id) => forms('delete', `/${siteId}/${id}`, user);

  it('власник видаляє заявку', async () => {
    const res = await remove(owner, first.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Заявку успішно видалено.' });
    expect(await getSubmission(first.id)).toBeUndefined();
    expect(await getSubmission(second.id)).toBeDefined();
  });

  it('D-SEC-06: редактор із секцією overview видаляє заявку', async () => {
    expect((await remove(overviewEditor, first.id)).status).toBe(200);
    expect(await getSubmission(first.id)).toBeUndefined();
  });

  it.each(['overviewViewer', 'commerceEditor', 'bare', 'stranger'])('D-SEC-06: %s не видаляє заявку', async (who) => {
    const res = await remove(actor(who), first.id);
    expect(res.status).toBe(403);
    expect(await countRows('form_submissions', 'site_id = ?', [site.id])).toBe(2);
  });

  it('заявка іншого сайту не видаляється', async () => {
    const otherOwner = await createUser({ plan: 'PLUS' });
    const otherSite = await createSite(otherOwner);
    const foreign = await createSubmission(otherSite);
    await remove(owner, foreign.id);
    expect(await getSubmission(foreign.id)).toBeDefined();
  });
});
