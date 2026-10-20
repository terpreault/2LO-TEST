/* 2LO TEST V6.0.2 — Auth / REST transport. No remote access unless configured and logged in.
   First-party code, no CDN runtime dependency: works offline after the initial install.
   Supabase RLS remains the access-control boundary. Never put secret/service_role keys here. */
(() => {
  "use strict";
  const cfg = window.GASSIEN_CONFIG || {};
  const base = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const apiKey = String(cfg.SUPABASE_PUBLISHABLE_KEY || "");
  const valid = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) &&
    (apiKey.startsWith("sb_publishable_") || apiKey.split(".").length === 3) &&
    !apiKey.includes("PASTE_");
  const AUTH_KEY = '2lo_tw_test_auth_v602';
  let current = null;
  const getStored = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; } };
  const store = obj => { current = obj; if (obj) localStorage.setItem(AUTH_KEY, JSON.stringify(obj)); else localStorage.removeItem(AUTH_KEY); };
  const root = () => new URL('./', window.location.href).href;
  const online = () => navigator.onLine;

  async function http(path, { method = 'GET', token = null, body = undefined, headers = {} } = {}) {
    if (!valid) throw new Error('La connexion Supabase n’est pas configurée.');
    const resp = await fetch(base + path, {
      method, cache: 'no-store', credentials: 'omit',
      headers: { apikey: apiKey, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await resp.text();
    let data; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!resp.ok) {
      const error = new Error(typeof data === 'object' && data ?
        (data.msg || data.message || data.error_description || data.error || 'Erreur Supabase') :
        (typeof data === 'string' && data ? data : `Erreur HTTP ${resp.status}`));
      error.status = resp.status; throw error;
    }
    return data;
  }

  async function refresh() {
    if (!current?.refresh_token || !online()) throw new Error('Connexion nécessaire pour renouveler la session.');
    const r = await http('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:{refresh_token:current.refresh_token}});
    if (!r?.access_token || !r?.refresh_token) throw new Error('Réponse d’authentification incomplète.');
    store({ access_token:r.access_token, refresh_token:r.refresh_token,
      expires_at:Date.now() + (Number(r.expires_in)||3600)*1000,
      user:r.user?.id ? r.user : current.user });
    return current.access_token;
  }
  async function token() {
    if (!current?.access_token) throw new Error('Connexion requise.');
    if (current.expires_at < Date.now() + 90_000) await refresh();
    return current.access_token;
  }
  async function authenticated(path, opts={}) {
    let bearer=await token();
    try {return await http(path,{...opts,token:bearer});}
    catch(error) {
      if (error.status !== 401 || !online()) throw error;
      bearer=await refresh();
      return http(path,{...opts,token:bearer});
    }
  }
  async function bootstrap() {
    if (!valid) return null;
    const h = new URLSearchParams(location.hash.replace(/^#/,''));
    if (h.get('error_description')) throw new Error(h.get('error_description'));
    if (h.get('access_token') && h.get('refresh_token')) {
      const candidate = { access_token:h.get('access_token'), refresh_token:h.get('refresh_token'),
        expires_at:Date.now()+(Number(h.get('expires_in'))||3600)*1000, user:null };
      const u = await http('/auth/v1/user', {token:candidate.access_token});
      if (!u?.id) throw new Error('Compte utilisateur non reconnu.');
      candidate.user=u; store(candidate);
      history.replaceState(null, '', location.pathname + location.search);
    } else current=getStored();
    if (!current?.user?.id || !current?.access_token) {store(null);return null;}
    // Network problems never delete a locally signed-in user's offline data.
    if (online() && current.expires_at < Date.now()+90_000) {
      try { await refresh(); }
      catch(err) { if (err.status === 400 || err.status === 401) { store(null); return null; } }
    }
    return current;
  }
  async function sendMagicLink(email) {
    if (!online()) throw new Error('Une connexion Internet est nécessaire pour recevoir le lien.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Saisis une adresse e-mail valide.');
    await http('/auth/v1/otp?redirect_to=' + encodeURIComponent(root()),
      {method:'POST',body:{email,create_user:false}});
  }
  async function signOut() {
    if (current?.access_token && online()) {
      try { await http('/auth/v1/logout',{method:'POST',token:await token()}); } catch (err) { console.warn('2LO sign out:',err); }
    }
    store(null);
  }
  const pathTo = (table, query='') => `/rest/v1/${table}${query}`;
  async function upsert(table, rows, conflict) {
    if (!rows.length) return;
    const query='?on_conflict=' + encodeURIComponent(conflict);
    await authenticated(pathTo(table,query),{method:'POST',body:rows,
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
  }
  async function push(queues, userId, onSave) {
    const logs = Object.values(queues.pendingLogs || {});
    const settings = Object.values(queues.pendingSettings || {});
    // Idempotent batches: one UUID per consumption, even across retries and re-connections.
    for (let i=0;i<logs.length;i+=100) {
      const batch=logs.slice(i,i+100);
      await upsert('three_worlds_logs',batch.map(x=>({...x,user_id:userId})),'id');
      for (const item of batch) onSave('log',item.id,item.updated_at);
    }
    if(settings.length) {
      await upsert('three_worlds_settings',settings.map(x=>({...x,user_id:userId})),'user_id,mode');
      for (const item of settings) onSave('settings',item.mode,item.updated_at);
    }
  }
  async function listAllLogs(userId) {
    const out=[];
    const fields='id,mode,amount_ml,price_cents,consumed_at,updated_at,deleted_at';
    for (let offset=0; offset<100000; offset+=500) {
      const query='?select='+fields+'&user_id=eq.'+encodeURIComponent(userId)+
        '&order=consumed_at.asc&limit=500&offset='+offset;
      const rows=await authenticated(pathTo('three_worlds_logs',query));
      if (!Array.isArray(rows)) throw new Error('Réponse de synchronisation invalide.');
      out.push(...rows);
      if (rows.length<500) return out;
    }
    throw new Error('Historique trop volumineux, pagination interrompue sans rien effacer.');
  }
  async function pull(userId) {
    // RLS additionally restricts all returned rows to auth.uid().
    const [logs,settings] = await Promise.all([
      listAllLogs(userId),
      authenticated(pathTo('three_worlds_settings','?select=*&user_id=eq.'+encodeURIComponent(userId)))
    ]);
    if (!Array.isArray(settings)) throw new Error('Réponse de réglages invalide.');
    return {logs,settings};
  }
  window.TW_SYNC = { configured:valid, bootstrap, sendMagicLink, signOut,
    push, pull, online, getUser:()=>current?.user||null };
})();
