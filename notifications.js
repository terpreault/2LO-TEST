/* 2LO V6.0.3 TEST — Web Push on iOS Home Screen and Android.
   Notifications are opt-in. Push endpoints and encrypted subscription keys belong
   to the authenticated user; server-side VAPID private keys never ship to clients.
   A remote scheduler is REQUIRED for delivery while the app is closed. */
(() => {
  'use strict';
  const c = window.GASSIEN_CONFIG || {};
  const root = (c.SUPABASE_URL || '').replace(/\/+$/, '');
  const publicKey = c.VAPID_PUBLIC_KEY || '';
  const publishable = c.SUPABASE_PUBLISHABLE_KEY || '';
  const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const available = () => Boolean(root && publishable && /^B[A-Za-z0-9_-]{70,100}$/.test(publicKey));
  const supported = () => ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!window.isSecureContext);
  const user = () => window.TW_SYNC?.getUser?.() || null;
  const encodeKey = key => Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-key.length%4)%4)), x => x.charCodeAt(0));
  let prefs = {weekly_enabled:false,weekly_time:'19:00'};
  async function http(path, opts = {}) {
    if (!navigator.onLine) throw new Error('Connecte-toi à Internet pour changer les notifications.');
    if (!user()?.id) throw new Error('Connecte-toi à ton compte 2LO.');
    const token = await window.TW_SYNC.getAccessToken();
    const res = await fetch(root+path,{method:opts.method||'GET',cache:'no-store',credentials:'omit',
      headers:{apikey:publishable,Authorization:'Bearer '+token, ...(opts.body===undefined?{}:{'Content-Type':'application/json'}),...opts.headers},
      ...(opts.body===undefined?{}:{body:JSON.stringify(opts.body)})});
    if (!res.ok) {
      let message='Erreur HTTP '+res.status;
      try {const payload=await res.json();message=payload.message||payload.error||payload.msg||message;}catch{}
      throw new Error(message);
    }
    if(res.status===204) return null;
    const txt=await res.text();return txt?JSON.parse(txt):null;
  }
  function uri(table,params='') {return '/rest/v1/'+table+params;}
  async function subscription() {
    if(!supported()) return null;
    const sw=await navigator.serviceWorker.ready;
    return sw.pushManager.getSubscription();
  }
  async function upsertDevice(sub) {
    const json=sub.toJSON();
    if(!json?.endpoint||!json.keys?.p256dh||!json.keys?.auth) throw new Error('Souscription push incomplète.');
    await http(uri('three_worlds_push_devices','?on_conflict=endpoint'),{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{
        endpoint:json.endpoint,user_id:user().id,p256dh:json.keys.p256dh,auth_key:json.keys.auth,
        time_zone:timezone(),updated_at:new Date().toISOString()
      }});
  }
  async function enableDevice() {
    if(!available()) throw new Error('Les notifications serveur ne sont pas encore configurées.');
    if(!supported()) throw new Error('Notifications indisponibles. Sur iPhone, installe 2LO sur l’écran d’accueil et ouvre-la depuis son icône.');
    if(Notification.permission==='denied') throw new Error('Notifications bloquées dans les réglages du téléphone.');
    // iOS requires permission to be requested following an explicit tap.
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted') throw new Error('Autorisation de notifications refusée.');
    const sw=await navigator.serviceWorker.ready;
    let sub=await sw.pushManager.getSubscription();
    if(!sub) sub=await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:encodeKey(publicKey)});
    await upsertDevice(sub);
    return sub;
  }
  async function unregisterOnLogout() {
    if(!supported())return;
    const sub=await subscription();if(!sub)return;
    await http(uri('three_worlds_push_devices','?endpoint=eq.'+encodeURIComponent(sub.endpoint)),{method:'DELETE'});
    await sub.unsubscribe();
  }
  async function unregisterIfUnused(waterEnabled) {
    if(waterEnabled||prefs.weekly_enabled||!supported()) return;
    const sub=await subscription();if(!sub)return;
    await http(uri('three_worlds_push_devices','?endpoint=eq.'+encodeURIComponent(sub.endpoint)),{method:'DELETE'});
    await sub.unsubscribe();
  }
  async function loadPrefs() {
    if(!user()?.id||!navigator.onLine)return prefs;
    try {
      const rows=await http(uri('three_worlds_notification_prefs','?select=weekly_enabled,weekly_time&user_id=eq.'+encodeURIComponent(user().id)));
      if(rows?.[0]) prefs={weekly_enabled:!!rows[0].weekly_enabled,weekly_time:rows[0].weekly_time?.slice(0,5)||'19:00'};
    }catch(error) { console.warn('2LO: préférences de notification non disponibles.',error); }
    return {...prefs};
  }
  async function savePrefs(next) {
    const old={...prefs};
    prefs={...prefs,...next};
    try {
      await http(uri('three_worlds_notification_prefs','?on_conflict=user_id'),{method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{
          user_id:user().id, weekly_enabled:!!prefs.weekly_enabled,weekly_time:prefs.weekly_time+':00',
          updated_at:new Date().toISOString()
        }});
    }catch(err){prefs=old;throw err;}
    return {...prefs};
  }
  async function sendTest() {
    if(!await subscription()) throw new Error('Active les notifications sur cet appareil avant le test.');
    const result=await http('/functions/v1/tw-push',{method:'POST',body:{action:'test',endpoint:(await subscription()).endpoint}});
    if(!result?.ok)throw new Error('Test déjà effectué cette minute, ou envoi impossible.');
    return result;
  }
  async function restore() {
    if(!user()?.id||!navigator.onLine) return;
    await loadPrefs();
    if(supported()&&Notification.permission==='granted'){
      const sub=await subscription();if(sub)await upsertDevice(sub);
    }
  }
  window.TW_PUSH={available,supported,enableDevice,subscription,unregisterIfUnused,unregisterOnLogout,loadPrefs,savePrefs,sendTest,restore,getPrefs:()=>({...prefs})};
})();
