// PixelJoy back-office UI. Plain JS, no inline code (strict CSP), DOM built with textContent only.
'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Tiny element builder: h('div', { class: 'x', onclick: fn }, 'text', child). */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  let csrf = '';
  let state = { albums: [], artworks: [], maxUploadBytes: 1048576 };
  let converted = null;

  async function api(method, path, body) {
    const headers = {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`/admin/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') showLogin();
    return { ok: res.ok, status: res.status, data };
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (el.hidden = true), 2600);
  }

  function showErrors(list, errors) {
    list.replaceChildren(...errors.map((e) => h('li', {}, e)));
    list.hidden = errors.length === 0;
  }

  function errorMessages(res) {
    if (Array.isArray(res.data.errors)) return res.data.errors.map((e) => e.message);
    if (res.data.message) return [res.data.message];
    if (res.status === 429) return [`Trop de tentatives. Réessaie dans ${res.data.retryAfter ?? 60} s.`];
    return [`Erreur ${res.status}`];
  }

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const accessLabel = (a) => (a === 'free' ? 'Gratuit' : a === 'pro' ? 'Pro' : `Pack ${a.slice(5)}`);

  // ------------------------------------------------------------------ auth

  function showLogin() {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    $('#login-password').focus();
  }

  async function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    await refresh();
  }

  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('button[type=submit]', ev.target);
    btn.disabled = true;
    const res = await api('POST', '/login', { password: $('#login-password').value });
    btn.disabled = false;
    const err = $('#login-error');
    if (!res.ok) {
      err.textContent = res.status === 401 ? 'Mot de passe incorrect.' : errorMessages(res)[0];
      err.hidden = false;
      return;
    }
    err.hidden = true;
    $('#login-password').value = '';
    csrf = res.data.csrf;
    await showApp();
  });

  $('#logout').addEventListener('click', async () => {
    await api('POST', '/logout');
    csrf = '';
    showLogin();
  });

  // ------------------------------------------------------------------ tabs

  for (const tab of $$('.tab')) {
    tab.addEventListener('click', () => {
      for (const t of $$('.tab')) t.setAttribute('aria-selected', String(t === tab));
      for (const p of $$('.panel')) p.hidden = p.id !== `tab-${tab.dataset.tab}`;
    });
  }

  // ------------------------------------------------------------------ shared fields

  function radios(name, options, checked, label) {
    return h(
      'fieldset',
      {},
      h('legend', {}, label),
      h(
        'div',
        { class: 'segmented' },
        options.map(([value, text]) =>
          h('label', {}, h('input', { type: 'radio', name, value, checked: value === checked, 'aria-label': text }), text),
        ),
      ),
    );
  }

  /** Access selector: free | pro | pack:<id>. */
  function accessField(prefix, value = 'free') {
    const kind = value.startsWith('pack:') ? 'pack' : value;
    const packInput = h('input', {
      name: `${prefix}pack`,
      placeholder: 'id du pack (ex. ocean)',
      value: value.startsWith('pack:') ? value.slice(5) : '',
      maxlength: 48,
      'aria-label': 'Identifiant du pack',
    });
    const wrap = h('div', {}, radios(`${prefix}access`, [['free', 'Gratuit'], ['pro', 'Pro'], ['pack', 'Pack']], kind, 'Accès'), packInput);
    const sync = () => (packInput.hidden = $(`input[name="${prefix}access"]:checked`, wrap)?.value !== 'pack');
    wrap.addEventListener('change', sync);
    sync();
    return wrap;
  }

  function readAccess(form, prefix) {
    const kind = $(`input[name="${prefix}access"]:checked`, form)?.value ?? 'free';
    return kind === 'pack' ? `pack:${$(`input[name="${prefix}pack"]`, form).value.trim()}` : kind;
  }

  /** Album / difficulty / access / publication fields, shared by the create and edit forms. */
  function metaFields(form, { album = '', difficulty = 1, access = 'free', publishModes, publish }) {
    const select = h(
      'select',
      { name: 'album', 'aria-label': 'Album' },
      state.albums.map((a) => h('option', { value: a.id, selected: a.id === album }, `${a.titleFr} (${a.id})${a.builtin ? ' · embarqué' : ''}`)),
      h('option', { value: '__new__' }, '+ Nouvel album…'),
    );
    const sub = h(
      'div',
      { class: 'subfields', hidden: true },
      h(
        'div',
        { class: 'grid-3' },
        h('label', { class: 'field' }, h('span', {}, 'Id du nouvel album'), h('input', { name: 'naId', maxlength: 48, 'aria-label': 'Identifiant du nouvel album' })),
        h('label', { class: 'field' }, h('span', {}, 'Titre FR'), h('input', { name: 'naTitleFr', maxlength: 60, 'aria-label': 'Titre du nouvel album en français' })),
        h('label', { class: 'field' }, h('span', {}, 'Titre EN'), h('input', { name: 'naTitleEn', maxlength: 60, 'aria-label': 'Titre du nouvel album en anglais' })),
      ),
      accessField('na', 'free'),
    );
    select.addEventListener('change', () => (sub.hidden = select.value !== '__new__'));
    const when = h('input', { type: 'datetime-local', name: 'publishAt', 'aria-label': 'Date de publication' });
    const pub = radios('publishMode', publishModes, publish, 'Publication');
    const syncWhen = () => (when.hidden = $('input[name="publishMode"]:checked', pub)?.value !== 'schedule');
    pub.addEventListener('change', syncWhen);
    pub.append(when);
    syncWhen();
    const host = $('[data-meta-fields]', form);
    host.replaceChildren(
      h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', {}, 'Album'), select), radios('difficulty', [['1', 'Facile'], ['2', 'Moyen'], ['3', 'Difficile']], String(difficulty), 'Difficulté')),
      sub,
      h('div', { class: 'grid-2' }, accessField('', access), pub),
    );
  }

  function readMeta(form, publishMode) {
    const album = $('select[name=album]', form).value;
    const meta = {
      titleFr: form.elements.titleFr.value,
      titleEn: form.elements.titleEn.value,
      difficulty: Number($('input[name=difficulty]:checked', form)?.value ?? 1),
      access: readAccess(form, ''),
    };
    if (album === '__new__') {
      meta.newAlbum = {
        id: form.elements.naId.value.trim(),
        titleFr: form.elements.naTitleFr.value,
        titleEn: form.elements.naTitleEn.value,
        access: readAccess(form, 'na'),
      };
    } else meta.album = album;
    const mode = publishMode ?? $('input[name=publishMode]:checked', form)?.value ?? 'draft';
    if (mode === 'schedule') {
      const at = form.elements.publishAt.value;
      meta.publish = { mode, at: at ? new Date(at).toISOString() : '' };
    } else meta.publish = { mode };
    return meta;
  }

  // ------------------------------------------------------------------ upload + create

  $('#upload-max-colors').addEventListener('input', (ev) => ($('#max-colors-value').textContent = ev.target.value));

  $('#upload-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = $('#upload-file').files[0];
    const err = $('#upload-error');
    err.hidden = true;
    if (!file) return;
    if (file.size > state.maxUploadBytes) {
      err.textContent = 'Le PNG dépasse 1 Mo.';
      err.hidden = false;
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('maxColors', $('#upload-max-colors').value);
    const btn = $('button[type=submit]', ev.target);
    btn.disabled = true;
    const res = await api('POST', '/convert', fd);
    btn.disabled = false;
    if (!res.ok) {
      err.textContent = errorMessages(res)[0];
      err.hidden = false;
      return;
    }
    converted = res.data;
    $('#preview-img').src = converted.preview;
    $('#preview-stats').textContent = `${converted.w} × ${converted.h} · ${converted.cells} cases à colorier · ${converted.palette.length} couleurs${converted.merged ? ` (${converted.merged} fusionnées)` : ''}`;
    $('#preview-palette').replaceChildren(
      ...converted.palette.map((hex, i) => {
        const sw = h('li', { class: 'swatch', title: hex, 'aria-label': `Couleur ${i + 1} : ${hex}` }, String(i + 1));
        sw.style.background = hex;
        sw.style.color = luminance(hex) > 0.4 ? '#1B1A2E' : '#FFFFFF';
        return sw;
      }),
    );
    $('#preview-card').hidden = false;
    const form = $('#meta-form');
    form.hidden = false;
    if (!form.elements.id.value) form.elements.id.value = slug(file.name.replace(/\.png$/i, ''));
    showErrors($('#meta-errors'), []);
  });

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  function slug(s) {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function renderCreateForm() {
    metaFields($('#meta-form'), { publishModes: [['now', 'Maintenant'], ['schedule', 'Planifiée']], publish: 'now' });
  }

  $('#meta-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!converted) return;
    const form = ev.target;
    const action = ev.submitter?.value === 'publish' ? undefined : 'draft';
    const body = { id: form.elements.id.value.trim(), ...readMeta(form, action), w: converted.w, h: converted.h, palette: converted.palette, rows: converted.rows };
    const res = await api('POST', '/artworks', body);
    if (!res.ok) {
      showErrors($('#meta-errors'), errorMessages(res));
      return;
    }
    toast(res.data.artwork.state === 'draft' ? 'Brouillon enregistré' : res.data.artwork.state === 'scheduled' ? 'Publication planifiée' : 'Œuvre publiée');
    converted = null;
    form.reset();
    form.hidden = true;
    $('#upload-form').reset();
    $('#max-colors-value').textContent = '24';
    $('#preview-card').hidden = true;
    await refresh();
  });

  // ------------------------------------------------------------------ artworks list

  const STATE_LABEL = { draft: 'Brouillon', scheduled: 'Planifiée', published: 'Publiée' };

  function renderArtworks() {
    const list = $('#artwork-list');
    const albumTitle = new Map(state.albums.map((a) => [a.id, a.titleFr]));
    $('#artworks-summary').textContent = `${state.artworks.length} œuvre(s) dans le catalogue en ligne · ${state.embeddedArtworkCount} œuvres embarquées dans l’app (ids réservés).`;
    list.replaceChildren(
      ...state.artworks.map((a) =>
        h(
          'li',
          { class: 'artwork-item' },
          h('img', { class: 'thumb', src: `/admin/api/artworks/${a.id}/preview.png?rev=${a.rev}`, alt: '', loading: 'lazy' }),
          h(
            'div',
            {},
            h('div', { class: 'item-title' }, a.titleFr, h('span', { class: `badge badge-${a.state}` }, STATE_LABEL[a.state])),
            h(
              'div',
              { class: 'item-meta' },
              `${a.id} · rev ${a.rev} · ${albumTitle.get(a.album) ?? a.album} · ${accessLabel(a.access)} · ${a.w}×${a.h}, ${a.colors} couleurs, ${a.cells} cases`,
              a.publishedAt ? ` · ${a.state === 'scheduled' ? 'prévue le' : 'publiée le'} ${fmtDate(a.publishedAt)}` : '',
            ),
          ),
          h(
            'div',
            { class: 'item-actions' },
            h('button', { type: 'button', class: 'btn btn-secondary btn-small', onclick: () => openEdit(a), 'aria-label': `Modifier ${a.titleFr}` }, 'Modifier'),
            a.state !== 'draft' &&
              h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => unpublish(a), 'aria-label': `Dépublier ${a.titleFr}` }, 'Dépublier'),
            !a.everPublished &&
              h('button', { type: 'button', class: 'btn btn-danger btn-small', onclick: () => removeDraft(a), 'aria-label': `Supprimer ${a.titleFr}` }, 'Supprimer'),
          ),
        ),
      ),
    );
    if (!state.artworks.length) list.append(h('li', { class: 'muted' }, 'Aucune œuvre pour l’instant : importe un PNG dans « Nouvelle œuvre ».'));
  }

  async function unpublish(a) {
    if (!confirm(`Dépublier « ${a.titleFr} » ? Elle disparaîtra du catalogue (les joueurs qui l’ont déjà la gardent).`)) return;
    const res = await api('POST', `/artworks/${a.id}/unpublish`);
    if (res.ok) toast('Œuvre dépubliée');
    else toast(errorMessages(res)[0]);
    await refresh();
  }

  async function removeDraft(a) {
    if (!confirm(`Supprimer définitivement le brouillon « ${a.titleFr} » ?`)) return;
    const res = await api('DELETE', `/artworks/${a.id}`);
    toast(res.ok ? 'Brouillon supprimé' : errorMessages(res)[0]);
    await refresh();
  }

  let editing = null;

  function openEdit(a) {
    editing = a;
    const dialog = $('#edit-dialog');
    const form = $('#edit-form');
    $('#edit-title').textContent = `Modifier « ${a.titleFr} »`;
    form.elements.titleFr.value = a.titleFr;
    form.elements.titleEn.value = a.titleEn;
    metaFields(form, {
      album: a.album,
      difficulty: a.difficulty,
      access: a.access,
      publishModes: [['keep', 'Inchangée'], ['draft', 'Brouillon'], ['now', 'Maintenant'], ['schedule', 'Planifiée']],
      publish: 'keep',
    });
    showErrors($('[data-errors]', form), []);
    dialog.showModal();
  }

  $('#edit-form [data-close]').addEventListener('click', () => $('#edit-dialog').close());

  $('#edit-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!editing) return;
    const form = ev.target;
    const res = await api('PATCH', `/artworks/${editing.id}`, readMeta(form));
    if (!res.ok) {
      showErrors($('[data-errors]', form), errorMessages(res));
      return;
    }
    $('#edit-dialog').close();
    toast(res.data.artwork.rev !== editing.rev ? `Enregistré · rev ${res.data.artwork.rev}` : 'Enregistré');
    editing = null;
    await refresh();
  });

  // ------------------------------------------------------------------ albums

  function renderAlbums() {
    $('#album-list').replaceChildren(
      ...state.albums.map((a) => {
        const row = h('li', { class: 'album-item' });
        const fr = h('input', { value: a.titleFr, maxlength: 60, disabled: a.builtin, 'aria-label': `Titre FR de ${a.id}` });
        const en = h('input', { value: a.titleEn, maxlength: 60, disabled: a.builtin, 'aria-label': `Titre EN de ${a.id}` });
        const access = h('input', { value: a.access, maxlength: 54, disabled: a.builtin, 'aria-label': `Accès de ${a.id} (free, pro ou pack:id)` });
        const order = h('input', { type: 'number', min: 0, max: 10000, value: a.order, disabled: a.builtin, 'aria-label': `Ordre de ${a.id}` });
        const label = h('div', {}, h('div', { class: 'item-title' }, a.id, a.builtin && h('span', { class: 'badge badge-builtin' }, 'embarqué')), h('div', { class: 'item-meta' }, `${a.artworkCount} œuvre(s) en ligne`));
        const save = a.builtin
          ? h('span')
          : h(
              'button',
              {
                type: 'button',
                class: 'btn btn-secondary btn-small',
                'aria-label': `Enregistrer l’album ${a.id}`,
                onclick: async () => {
                  const res = await api('PATCH', `/albums/${a.id}`, { titleFr: fr.value, titleEn: en.value, access: access.value.trim(), order: Number(order.value) });
                  toast(res.ok ? 'Album enregistré' : errorMessages(res).join(' · '));
                  if (res.ok) await refresh();
                },
              },
              'Enregistrer',
            );
        row.append(label, h('div', { class: 'grid-2' }, fr, en), access, order, save);
        return row;
      }),
    );
  }

  $('#album-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const body = {
      id: form.elements.id.value.trim(),
      titleFr: form.elements.titleFr.value,
      titleEn: form.elements.titleEn.value,
      access: readAccess(form, 'al'),
      order: Number(form.elements.order.value),
    };
    const res = await api('POST', '/albums', body);
    if (!res.ok) {
      showErrors($('[data-errors]', form), errorMessages(res));
      return;
    }
    showErrors($('[data-errors]', form), []);
    form.reset();
    toast('Album créé');
    await refresh();
  });

  // ------------------------------------------------------------------ boot

  async function refresh() {
    const res = await api('GET', '/state');
    if (!res.ok) return;
    state = res.data;
    renderArtworks();
    renderAlbums();
    if (!converted) renderCreateForm();
    const nextOrder = state.albums.reduce((m, a) => Math.max(m, a.order + 1), 0);
    $('#album-form').elements.order.value = String(nextOrder);
  }

  $('[data-access-field]').replaceWith(accessField('al', 'free'));

  (async () => {
    const res = await api('GET', '/session');
    if (res.ok && res.data.authenticated) {
      csrf = res.data.csrf;
      await showApp();
    } else showLogin();
  })();
})();
