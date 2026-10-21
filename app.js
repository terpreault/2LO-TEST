const DEMO = false; // Distinct TEST app; Web Push opt-in stage.
const STORAGE_KEY = "2lo_v520_demo_only"; // Preserve V6.0.1's local demo data.
const C = window.GASSIEN_CONFIG || {};
const configured = !!window.TW_SYNC?.configured;
const sb = null; // Legacy production hydration tables are NEVER accessed in 2LO TEST.

const T = {
  fr: {
    hello: "Bonjour Gatien", subtitle: "On s’hydrate ?", of: "sur", todayProgress: "Progression du jour",
    remainingToday: n => `Encore ${n} aujourd’hui`, goalReached: "Objectif atteint", goalExceeded: n => `Objectif dépassé de ${n}`,
    nextReminder: "Prochain rappel", lastDrink: "Dernière prise", addWater: "Ajouter de l’eau", custom: "Quantité personnalisée", addLog: "Ajouter au journal",
    progress: "Progression", sevenDays: "7 jours", month: "Mois", year: "Année", goal: n => `Objectif ${n}`,
    avg: "Moyenne quotidienne", goalsReached: "Objectifs atteints", streak: "Série actuelle", days: "jours", thisWeek: "Cette semaine",
    versusPrevious: "par rapport à la semaine précédente", bestDay: "Meilleur jour", noComparison: "Pas encore assez de données",
    history: "Historique", historyLead: "Suivi quotidien", ofGoal: "de l’objectif", takes: "prises", first: "Première", last: "Dernière", noDayLogs: "Aucune prise enregistrée ce jour-là.",
    settings: "Réglages", settingsLead: "Personnalisez votre suivi", dailyGoal: "Objectif quotidien", customGoal: "Personnalisé",
    reminders: "Rappels", wake: "Heure de début", sleep: "Heure de fin", frequency: "Fréquence", saveReminders: "Enregistrer les rappels", testPush: "Envoyer une notification test",
    language: "Langue", data: "Données", sync: "Synchronisation", resetToday: "Réinitialiser les données du jour", deleteHistory: "Supprimer tout l’historique",
    account: "Compte", logout: "Déconnexion", about: "À propos", version: "Version 6.0.5 (gestion des consommations TEST)", today: "Aujourd’hui", navProgress: "Progression", navHistory: "Historique", navSettings: "Réglages",
    cloud: "En ligne", local: "Local", offline: "Hors ligne", saved: "Réglages enregistrés", drank: "Tu as bu", deletedToday: "Données du jour réinitialisées", deletedAll: "Historique supprimé",
    authIntro: "Connecte-toi pour retrouver ton suivi d’hydratation sur tous tes appareils.",
    pushEnabled: "✓ Rappels activés", pushDisabled: "Rappels désactivés", enableFirst: "Connecte-toi d’abord.", unsupported: "Notifications non supportées sur cet appareil.", keyMissing: "Clé de notification manquante.", denied: "Notifications non autorisées.", enabling: "Activation en cours…", pushError: "Impossible d’activer les rappels.", testSending: "Envoi du test…", testSent: "Notification envoyée 💧", testNone: "Aucune notification envoyée", testError: "Erreur pendant le test",
    confirmReset: "Réinitialiser toutes les prises d’aujourd’hui ?", confirmDelete: "Supprimer définitivement tout l’historique d’hydratation ?",
    inMinutes: n => `Dans ${n} min`, inHours: (h,m) => `Dans ${h} h${m ? ` ${m}` : ""}`,
    weekDayCount: (a,b) => `${a} / ${b} jours`, above: n => `+ ${n} %`, below: n => `− ${n} %`,
    syncError: "Erreur de synchronisation", enterAmount: "Entre une quantité en ml"
  }
};

// THREE WORLDS — STEP 2: selector only. Soda modes have deliberately NO intake features yet.
// state.logs and all Supabase hydration tables continue to belong EXCLUSIVELY to Water.
const WORLDS = Object.freeze({
  water: Object.freeze({ id: "water", label: "Water", tracking: "goal", reminders: true }),
  coca: Object.freeze({ id: "coca", label: "Coca-Cola", tracking: "limit", reminders: false }),
  monster: Object.freeze({ id: "monster", label: "Monster", tracking: "limit", reminders: false })
});
const normalizeWorld = value => Object.prototype.hasOwnProperty.call(WORLDS, value) ? value : "water";

let session = null, userId = null, channel = null;
function restoreLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch (error) {
    console.warn("2LO : sauvegarde locale illisible, démarrage avec les réglages par défaut.", error);
  }
  return { lang: "fr", goal: 2000, interval: 60, wake: "08:00", sleep: "23:00", logs: [], remindersEnabled: false };
}
let state = restoreLocalState();
if (!Array.isArray(state.logs)) state.logs = [];
// Backwards-compatible addition: no existing hydration field is renamed or removed.
state.activeMode = normalizeWorld(state.activeMode);
// Interface française uniquement, y compris avec une ancienne préférence anglaise.
state.lang = "fr";
state.remindersEnabled = !!state.remindersEnabled;
const activeWorld = () => WORLDS[state.activeMode];
// Never reassign Water logs to Soda. The selected world is stored locally only.
function setActiveMode(mode) {
  if (!Object.prototype.hasOwnProperty.call(WORLDS, mode)) return false;
  if (state.activeMode === mode) { closeWorldMenu(); return true; }
  closeWorldMenu();
  closeAddSheet();
  state.activeMode = mode;
  document.documentElement.dataset.mode = mode;
  saveLocal();
  render();
  return true;
}
document.documentElement.dataset.mode = activeWorld().id;
document.documentElement.dataset.demo = DEMO ? "true" : "false";
let progressPeriod = "week";
let progressOffset = 0;
let historyMonthOffset = 0;
let selectedHistoryKey = null;
let syncMode = "local";

const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const toast = message => { const el = $("toast"); if (!el) return; el.textContent = message; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 1900); };
function makeUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const arr=new Uint8Array(16);crypto.getRandomValues(arr);
  arr[6]=(arr[6]&15)|64;arr[8]=(arr[8]&63)|128;
  const hex=Array.from(arr,x=>x.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const key = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const saveLocal = () => localStorage.setItem(userId ? `2lo_tw_user_${userId}` : STORAGE_KEY, JSON.stringify(state));
function newUserState(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(`2lo_tw_user_${uid}`) || "null");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch (e) { console.warn('2LO: cache utilisateur illisible.',e); }
  return {lang:'fr',activeMode:'water',goal:2000,interval:60,wake:'08:00',sleep:'23:00',
    remindersEnabled:false,logs:[],sodaData:{},_tw:{pendingLogs:{},pendingSettings:{}}};
}
function queues() {
  if (!state._tw || typeof state._tw !== 'object') state._tw={};
  if (!state._tw.pendingLogs || typeof state._tw.pendingLogs !== 'object') state._tw.pendingLogs={};
  if (!state._tw.pendingSettings || typeof state._tw.pendingSettings !== 'object') state._tw.pendingSettings={};
  return state._tw;
}
const pendingCount = () => userId ? Object.keys(queues().pendingLogs).length + Object.keys(queues().pendingSettings).length : 0;

const locale = () => "fr-FR";
const formatL = (ml, digits = 1) => `${(ml / 1000).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} L`;
const formatTime = ts => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
const dayTotal = d => state.logs.filter(x => x.day === key(d)).reduce((sum, item) => sum + item.ml, 0);
selectedHistoryKey = key(new Date());
const totalForKey = dayKey => state.logs.filter(x => x.day === dayKey).reduce((sum, item) => sum + item.ml, 0);

function setSync(mode) {
  syncMode = mode;
  setText("settingsSyncText", mode === "cloud" ? "Synchronisé" : mode === "offline" ? "Hors ligne" : "En attente");
  setText("syncDetail", userId ? (pendingCount() ? `${pendingCount()} modification(s) à synchroniser` : mode === 'cloud' ? 'Données à jour sur cet appareil et dans Supabase.' : 'Tes données sont conservées localement.') : 'Mode local : aucune synchronisation active.');
}

let synchronizing=null;
let syncAgain=false;
async function init() {
  bind();
  if (!configured) {
    $("configWarning").classList.remove("hidden");
    $("demoBtn").classList.remove("hidden");
    $("loginBtn").classList.add("hidden");
    $("authFields").classList.add("hidden");
    setSync("local"); render(); return;
  }
  try {
    const auth=await window.TW_SYNC.bootstrap();
    if (auth?.user?.id) await enterCloud(auth);
    else { $("auth").classList.remove("hidden"); setSync('local'); }
  } catch (error) {
    console.warn('2LO : authentification',error);
    setText('authStatus','Connexion non terminée : '+error.message);
    $("auth").classList.remove("hidden");
  }
}
async function enterCloud(auth) {
  session=auth;userId=auth.user.id;
  state=newUserState(userId);state.lang='fr';state.activeMode=normalizeWorld(state.activeMode);
  if (!Array.isArray(state.logs)) state.logs=[];
  queues();
  $("auth").classList.add("hidden");
  document.documentElement.dataset.mode=state.activeMode;
  setSync(navigator.onLine?'local':'offline');render();
  scheduleSync();
  // Never ask for permission automatically; only a tap may initiate Push subscription.
  window.TW_PUSH?.restore().then(() => renderNotificationChoices())
    .catch(err => { console.warn('2LO notifications en attente :',err);renderNotificationChoices(); });
}
function queueLog(mode, log, deleted=false) {
  if (!userId) {saveLocal();return;}
  const now=new Date().toISOString();
  queues().pendingLogs[log.id] = {
    id:log.id,mode,amount_ml:log.ml,price_cents:mode==='water'?null:Number(log.cents||0),
    consumed_at:new Date(log.ts).toISOString(),updated_at:now,deleted_at:deleted?now:null
  };
  saveLocal();scheduleSync();
}
function queueSettings(mode) {
  if (!userId) {saveLocal();return;}
  const now=new Date().toISOString();
  queues().pendingSettings[mode]=mode==='water' ? {
    mode,water_goal_ml:state.goal,soda_limit_ml:null,price_330_cents:null,price_500_cents:null,
    reminders_enabled:!!state.remindersEnabled,reminder_interval_min:state.interval,
    reminder_start:state.wake,reminder_end:state.sleep,updated_at:now
  } : {
    mode,water_goal_ml:null,soda_limit_ml:sodaStore(mode).limitMl,
    price_330_cents:Number(sodaStore(mode).prices[330]),price_500_cents:Number(sodaStore(mode).prices[500]),
    reminders_enabled:false,reminder_interval_min:null,reminder_start:null,reminder_end:null,updated_at:now
  };
  saveLocal();scheduleSync();
}
function applyServer({logs,settings}) {
  const q=queues();
  const byId=new Map();
  for(const remote of logs) {
    if (remote.deleted_at) continue;
    const ts=new Date(remote.consumed_at).getTime();
    if (!Number.isFinite(ts)||!['water','coca','monster'].includes(remote.mode))continue;
    byId.set(remote.id,{id:remote.id,mode:remote.mode,ml:Number(remote.amount_ml),
      cents:Number(remote.price_cents||0),ts,day:key(new Date(ts))});
  }
  // Unsynced local changes always remain visible and are never overwritten by a pull.
  for(const item of Object.values(q.pendingLogs)) {
    if(item.deleted_at)byId.delete(item.id);
    else {const ts=new Date(item.consumed_at).getTime();byId.set(item.id,{id:item.id,mode:item.mode,
      ml:Number(item.amount_ml),cents:Number(item.price_cents||0),ts,day:key(new Date(ts))});}
  }
  const records=[...byId.values()];
  state.logs=records.filter(x=>x.mode==='water').map(({mode,cents,...rest})=>rest);
  for(const mode of ['coca','monster']) {
    sodaStore(mode).logs=records.filter(x=>x.mode===mode).map(({mode,...rest})=>rest);
  }
  for(const r of settings) {
    if(q.pendingSettings[r.mode])continue;
    if(r.mode==='water') {
      state.goal=Number(r.water_goal_ml)||2000;
      state.interval=Number(r.reminder_interval_min)||60;
      state.wake=(r.reminder_start||'08:00').slice(0,5);
      state.sleep=(r.reminder_end||'23:00').slice(0,5);
      state.remindersEnabled=!!r.reminders_enabled;
    } else if(r.mode==='coca'||r.mode==='monster') {
      const d=sodaStore(r.mode);
      d.limitMl=Number(r.soda_limit_ml)||SODA_DEFAULT[r.mode].limitMl;
      d.prices={330:Number(r.price_330_cents??SODA_DEFAULT[r.mode].prices[330]),
        500:Number(r.price_500_cents??SODA_DEFAULT[r.mode].prices[500])};
    }
  }
  saveLocal();render();
}
function scheduleSync() {
  if (!userId || !configured || !navigator.onLine)return;
  if (synchronizing){syncAgain=true;return;}
  setTimeout(()=>{void synchronizeAll();},120);
}
async function synchronizeAll() {
  if (!userId || !configured || !navigator.onLine)return;
  if (synchronizing){syncAgain=true;return synchronizing;}
  const uid=userId;
  const job=(async()=>{
    try {
      setSync('local');
      await window.TW_SYNC.push(queues(),uid,(kind,id,revision)=>{
        if(userId!==uid)return;
        const store=kind==='log'?queues().pendingLogs:queues().pendingSettings;
        if(store[id]?.updated_at===revision){delete store[id];saveLocal();}
      });
      const fresh=await window.TW_SYNC.pull(uid);
      if(uid!==userId)return;
      applyServer(fresh);
      setSync(pendingCount()?'local':'cloud');
      render();
    } catch(error) {
      console.warn('2LO: synchronisation reportée (données locales préservées).',error);
      setSync(navigator.onLine?'local':'offline');
      render();
      setText('syncDetail','Connexion non synchronisée : '+error.message);
    }
  })();
  synchronizing=job;
  try { await job; } finally {
    synchronizing=null;
    if(syncAgain){syncAgain=false;scheduleSync();}
  }
}
function todays() { return state.logs.filter(x => x.day === key()); }
function totalToday() { return todays().reduce((sum, item) => sum + item.ml, 0); }

function parseClock(clock, base = new Date()) {
  const [h, m] = String(clock || "00:00").split(":").map(Number);
  const d = new Date(base); d.setHours(h || 0, m || 0, 0, 0); return d;
}

function getNextReminderDate(now = new Date()) {
  const interval = Math.max(15, Number(state.interval) || 60);
  let wake = parseClock(state.wake || "08:00", now);
  let sleep = parseClock(state.sleep || "23:00", now);
  if (sleep <= wake) sleep.setDate(sleep.getDate() + 1);
  if (now < wake) return wake;
  if (now >= sleep) { wake.setDate(wake.getDate() + 1); return wake; }
  const elapsed = Math.max(0, now - wake);
  const steps = Math.floor(elapsed / (interval * 60000)) + 1;
  const next = new Date(wake.getTime() + steps * interval * 60000);
  if (next > sleep) { wake.setDate(wake.getDate() + 1); return wake; }
  return next;
}

function relativeReminderText(date) {
  const mins = Math.max(0, Math.round((date.getTime() - Date.now()) / 60000));
  if (mins < 60) return T[state.lang].inMinutes(mins);
  return T[state.lang].inHours(Math.floor(mins / 60), mins % 60);
}

const WORLD_UI = {
  fr: {
    pick: "Choisir un univers", change: "Changer d’univers", water: "Hydratation", pending: "En préparation",
    heading: "Univers en préparation", title: screen => ({today:"Aujourd’hui",progress:"Progression",history:"Historique",settings:"Réglages"})[screen],
    body: "Le suivi de cette boisson sera activé lors d’une prochaine étape. Aucune prise ne peut être ajoutée pour le moment.",
    note: "Tes données Water restent intactes et séparées.",
    badge: "APERÇU · AUCUNE DONNÉE SODA"
  }
};

function closeWorldMenu() {
  $("worldMenu")?.classList.add("hidden");
  $("worldSwitchButton")?.setAttribute("aria-expanded", "false");
}
function toggleWorldMenu() {
  const menu = $("worldMenu"), button = $("worldSwitchButton");
  const opening = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !opening);
  button.setAttribute("aria-expanded", String(opening));
}
function renderWorldSwitcher() {
  const u = WORLD_UI[state.lang];
  setText("worldMenuHeading", u.pick);
  setText("worldWaterDesc", u.water);
  setText("worldCocaDesc", "Suivi de consommation");
  setText("worldMonsterDesc", "Suivi de consommation");
  $("worldMenu").setAttribute("aria-label", u.pick);
  $("worldSwitchButton").setAttribute("aria-label", `${u.change} : ${activeWorld().label}`);
  document.querySelectorAll(".world-option").forEach(el => {
    const selected = el.dataset.world === state.activeMode;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", String(selected));
  });
  for (const screen of ["today", "progress", "history", "settings"]) {
    const el = $("worldPlaceholder" + screen[0].toUpperCase() + screen.slice(1));
    if (!el) continue;
    el.replaceChildren();
    const badge = document.createElement("span"); badge.className = "world-preview-badge"; badge.textContent = u.badge;
    const logo = document.createElement("div"); logo.className = "world-preview-wordmark"; logo.textContent = "2LO";
    const heading = document.createElement("h2"); heading.textContent = activeWorld().label;
    const subheading = document.createElement("strong"); subheading.textContent = `${u.heading} — ${u.title(screen)}`;
    const body = document.createElement("p"); body.textContent = u.body;
    const note = document.createElement("small"); note.textContent = u.note;
    el.append(badge,logo,heading,subheading,body,note);
  }
}

function render() {
  const t = T[state.lang];
  document.documentElement.lang = "fr";
  setText("versionLabel", t.version);
  document.documentElement.dataset.mode = activeWorld().id;
  // One unique, vector logo in the theme selector; no duplicate large header logo.
  const visualMode = state.activeMode;
  const imageForMode = visualMode === "coca" ? "assets/logo-2lo-inferno.svg" : visualMode === "monster" ? "assets/logo-2lo-toxic.svg" : "assets/logo-2lo-aqua.svg";
  const miniLogo = $("worldActiveLogo");
  if (miniLogo) miniLogo.src = imageForMode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",visualMode === "coca" ? "#130706" : visualMode === "monster" ? "#060e09" : "#087E9E");
  setText("todayProgressLabel", t.todayProgress);
  setText("nextLabel", t.nextReminder); setText("lastDrinkLabel", t.lastDrink); setText("addWaterMainText", t.addWater); setText("addSheetTitle", t.addWater); setText("customLabel", t.custom); setText("addCustomBtn", t.addLog);
  setText("progressTitle", t.progress); setText("periodWeek", t.sevenDays); setText("periodMonth", t.month); setText("periodYear", t.year); setText("avgLabel", t.avg); setText("goalsReachedLabel", t.goalsReached); setText("streakLabel", t.streak); setText("daysLabel", t.days); setText("weekComparisonLabel", t.thisWeek); setText("weekComparisonSub", t.versusPrevious); setText("bestDayLabel", t.bestDay);
  setText("historyTitle", t.history); setText("historyLead", t.historyLead); setText("ofGoalLabel", t.ofGoal); setText("takesLabel", t.takes); setText("firstLabel", t.first); setText("lastLabel", t.last);
  setText("settingsTitle", t.settings); setText("settingsLead", state.activeMode === "water" ? "Hydratation · objectif et rappels" : `${activeWorld().label} · limite et dépenses`); setText("dailyGoalTitle", t.dailyGoal); setText("customGoalLabel", t.customGoal); setText("remindersTitle", t.reminders); setText("wakeLabel", t.wake); setText("sleepLabel", t.sleep); setText("intervalLabel", t.frequency); setText("saveSettings", t.saveReminders); setText("testPushBtn", t.testPush); setText("dataTitle", t.data); setText("syncLabel", t.sync); setText("resetTodayLabel", t.resetToday); setText("deleteHistoryLabel", t.deleteHistory); setText("accountTitle", t.account); setText("logoutLabel", t.logout); setText("aboutTitle", t.about); setText("versionLabel", t.version);
  setText("navHome", t.today); setText("navProgress", t.navProgress); setText("navHistory", t.navHistory); setText("navSettings", t.navSettings); setText("authIntro", t.authIntro);
  // Keep the navigation state accessible, including after changing worlds.
  document.querySelectorAll(".nav-btn").forEach(button => {
    if (button.classList.contains("active")) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  setText("settingsSyncText", syncMode === "cloud" ? t.cloud : syncMode === "offline" ? t.offline : t.local);


  setText("accountEmail", session?.user?.email || "Mode local");
  setText("settingsLead", state.activeMode === "water" ? "Hydratation · objectif et rappels" : `${activeWorld().label} · limite et dépenses`);

  renderWorldSwitcher();
  if (state.activeMode === "water") {
    renderToday(); renderProgress(); renderHistory(); renderSettings();
  } else renderSoda();
  renderTodayJournal();
  saveLocal();
  setSync(syncMode);
  renderNotificationChoices();
}

// Même cadran circulaire pour Water, Coca-Cola et Monster.
// Le curseur suit le contour à vitesse régulière dans le sens horaire,
// et ne fait jamais de deuxième tour en cas de dépassement de l'objectif/limite.
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 145;
function setClockGauge(progressId, orbitId, percentage) {
  const ratio = Math.min(100, Math.max(0, Number(percentage) || 0));
  const arc = $(progressId);
  if (arc) {
    arc.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
    arc.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - ratio / 100));
  }
  const orbit = $(orbitId);
  if (orbit) orbit.style.setProperty("--gauge-angle", `${ratio * 3.6}deg`);
}

function renderToday() {
  const t = T[state.lang]; const total = totalToday();
  const pctActual = state.goal > 0 ? Math.round(total / state.goal * 100) : 0; const fill = Math.min(100, Math.max(0, pctActual));
  setText("currentLitres", total < 1000 ? `${total} ml` : formatL(total)); setText("goalLitres", formatL(state.goal)); setText("percent", `${pctActual} %`);
  const gauge = $("hydrationGauge"); gauge?.style.setProperty("--fill", fill); gauge?.classList.toggle("goal-reached", pctActual === 100); gauge?.classList.toggle("goal-exceeded", pctActual > 100);
  const liquid = $("gaugeLiquid"); liquid?.parentElement?.style.setProperty("--fill", fill); liquid?.style.setProperty("--fill", fill);
  setClockGauge("gaugeProgress", "waterGaugeOrbit", fill);
  if (liquid) liquid.style.height = `${fill}%`;
  const msg = $("goalMessage"); msg?.classList.remove("reached", "exceeded");
  if (total < state.goal) setText("goalMessage", "");
  if (msg) {
    const text = total < state.goal ? t.remainingToday(formatL(state.goal - total)) : total === state.goal ? t.goalReached : t.goalExceeded(formatL(total - state.goal));
    msg.innerHTML = `<span class="drop-small">●</span><span>${text}</span>`;
    if (total === state.goal) msg.classList.add("reached"); if (total > state.goal) msg.classList.add("exceeded");
  }
  const next = getNextReminderDate(); setText("nextReminderTime", formatTime(next.getTime())); setText("nextReminderRelative", relativeReminderText(next));
  const last = [...state.logs].sort((a, b) => b.ts - a.ts)[0];
  setText("lastDrinkAmount", last ? `${last.ml} ml` : "—"); setText("lastDrinkTime", last ? formatTime(last.ts) : "—");
}

function datesBetween(start, count) { return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); d.setHours(12, 0, 0, 0); return d; }); }

function getProgressPeriodInfo() {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  if (progressPeriod === "week") {
    const end = new Date(now); end.setDate(end.getDate() + progressOffset * 7);
    const start = new Date(end); start.setDate(end.getDate() - 6);
    const days = datesBetween(start, 7);
    return { days, data: days.map(d => ({ date: d, label: d.toLocaleDateString(locale(), { weekday: "short" }).replace(".", "") + "\n" + d.getDate(), value: dayTotal(d) })), label: `${start.toLocaleDateString(locale(), { day: "numeric", month: "short" })} – ${end.toLocaleDateString(locale(), { day: "numeric", month: "short" })}` };
  }
  if (progressPeriod === "month") {
    const base = new Date(now.getFullYear(), now.getMonth() + progressOffset, 1, 12); const dayCount = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(); const days = datesBetween(base, dayCount);
    const groups = [];
    for (let i = 0; i < dayCount; i += 5) { const slice = days.slice(i, i + 5); groups.push({ label: `${i + 1}–${Math.min(i + 5, dayCount)}`, value: Math.round(slice.reduce((s, d) => s + dayTotal(d), 0) / slice.length) }); }
    return { days, data: groups, label: base.toLocaleDateString(locale(), { month: "long", year: "numeric" }) };
  }
  const year = now.getFullYear() + progressOffset; const days = []; const data = [];
  for (let month = 0; month < 12; month++) {
    const dayCount = new Date(year, month + 1, 0).getDate(); const mdays = datesBetween(new Date(year, month, 1, 12), dayCount); days.push(...mdays);
    data.push({ label: new Date(year, month, 1).toLocaleDateString(locale(), { month: "short" }).replace(".", ""), value: Math.round(mdays.reduce((s, d) => s + dayTotal(d), 0) / dayCount) });
  }
  return { days, data, label: String(year) };
}

function currentStreak() {
  let streak = 0; const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 365; i++) { const check = new Date(d); check.setDate(d.getDate() - i); if (dayTotal(check) > 0) streak++; else if (i === 0) continue; else break; }
  return streak;
}

function weeklyComparison() {
  const now = new Date(); now.setHours(12, 0, 0, 0); let current = 0, previous = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() - i); current += dayTotal(d); }
  for (let i = 7; i < 14; i++) { const d = new Date(now); d.setDate(now.getDate() - i); previous += dayTotal(d); }
  if (!previous) return null; return Math.round((current - previous) / previous * 100);
}

function renderProgress() {
  const t = T[state.lang], info = getProgressPeriodInfo(); setText("periodLabel", info.label);
  const maxValue = Math.max(state.goal * 1.5, ...info.data.map(x => x.value), 3000); const maxRounded = Math.ceil(maxValue / 500) * 500;
  setText("chartMaxLabel", formatL(maxRounded)); setText("chartGoalAxisLabel", formatL(state.goal)); setText("chartHalfLabel", formatL(state.goal / 2)); setText("chartGoalLabel", t.goal(formatL(state.goal)));
  // 318 px chart card: plot starts 45 px down and uses a 218 px bar track.
  // Align the goal line to the ACTUAL bar scale, not the old card percentages.
  const goalFraction = Math.min(1, Math.max(0, state.goal / maxRounded));
  if ($("goalThreshold")) $("goalThreshold").style.top = `${(45 + 218 * (1 - goalFraction)).toFixed(2)}px`;
  $("progressChart").innerHTML = info.data.map(item => {
    const height = item.value <= 0 ? 0 : Math.max(2, Math.min(100, item.value / maxRounded * 100)); const intensity = (0.20 + 0.80 * Math.min(1, item.value / state.goal)).toFixed(2);
    const isToday = item.date && key(item.date) === key();
    return `<div class="bar-item ${isToday ? "is-today" : ""}" title="${item.value} ml"><div class="bar-track"><div class="bar" style="--bar:${height}%;--intensity:${intensity}"></div></div><div class="bar-label">${item.label}</div></div>`;
  }).join("");

  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const totals = info.days.filter(d => d <= todayEnd).map(d => ({ d, value: dayTotal(d) })); const avg = totals.length ? Math.round(totals.reduce((s, x) => s + x.value, 0) / totals.length) : 0;
  const reached = totals.filter(x => x.value >= state.goal).length; setText("avgValue", formatL(avg)); setText("goalsReachedValue", t.weekDayCount(reached, totals.length)); setText("streakValue", currentStreak());
  setText("waterHeroAverage", formatL(avg));
  setText("waterHeroMessage", avg === 0 ? "Chaque verre compte. Continue à ton rythme." : avg >= state.goal ? "Tu atteins en moyenne ton objectif d’hydratation." : `En moyenne, ${Math.round(avg / Math.max(state.goal, 1) * 100)} % de ton objectif quotidien. Continue !`);
  const compare = weeklyComparison(); setText("weekComparisonValue", compare === null ? "—" : compare >= 0 ? t.above(Math.abs(compare)) : t.below(Math.abs(compare))); setText("weekComparisonSub", compare === null ? t.noComparison : t.versusPrevious);
  const best = totals.reduce((bestItem, item) => item.value > (bestItem?.value ?? -1) ? item : bestItem, null);
  setText("bestDayValue", best && best.value > 0 ? `${formatL(best.value)} · ${best.d.toLocaleDateString(locale(), { weekday: "long" })}` : "—");
  document.querySelectorAll(".segment").forEach(btn => btn.classList.toggle("active", btn.dataset.period === progressPeriod));
  $("periodNext").disabled = progressOffset >= 0; $("periodNext").style.opacity = progressOffset >= 0 ? ".3" : "1";
}


// 2LO V6.0.5 — Édition et suppression individuelles, trois univers.
// Le UUID de la prise est conservé lors d'une correction pour ne jamais créer de doublon.
let editingIntake = null;
function intakeList(mode) {
  return mode === 'water' ? state.logs : sodaStore(mode).logs;
}
function intakeActions(mode, item) {
  const actions = document.createElement('div');
  actions.className = 'intake-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'intake-action';
  edit.textContent = '✎'; edit.title = 'Modifier';
  edit.setAttribute('aria-label', `Modifier la consommation de ${item.ml} ml à ${formatTime(item.ts)}`);
  edit.dataset.editIntake = item.id; edit.dataset.intakeMode = mode;
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'intake-action intake-action-danger';
  del.textContent = '×'; del.title = 'Supprimer';
  del.setAttribute('aria-label', `Supprimer la consommation de ${item.ml} ml à ${formatTime(item.ts)}`);
  del.dataset.removeIntake = item.id; del.dataset.intakeMode = mode;
  actions.append(edit, del);
  return actions;
}
function intakeRow(mode, item, compact=false) {
  const row = document.createElement('div');
  row.className = compact ? 'intake-mini-row' : (mode === 'water' ? 'day-log-row intake-manage-row' : 'soda-log-row intake-manage-row');
  const time = document.createElement('time'); time.textContent = formatTime(item.ts);
  const amount = document.createElement('strong'); amount.textContent = `${item.ml} ml`;
  row.append(time, amount);
  if(mode !== 'water') {
    const price = document.createElement('span'); price.className = 'intake-price';
    price.textContent = money(item.cents || 0); row.append(price);
  }
  row.append(intakeActions(mode, item));
  return row;
}
function renderTodayJournal() {
  const mode = state.activeMode;
  const items = intakeList(mode).filter(item => item.day === key()).sort((a,b) => b.ts - a.ts);
  setText('todayJournalCount', `${items.length} prise${items.length>1?'s':''}`);
  const holder = $('todayJournalItems'); holder.replaceChildren();
  if (!items.length) {
    const p=document.createElement('p'); p.className='intake-empty';
    p.textContent='Aucune consommation enregistrée aujourd’hui.';holder.append(p);
  } else {
    const frag=document.createDocumentFragment();
    items.forEach(item=>frag.append(intakeRow(mode,item,true)));
    holder.append(frag);
  }
}
function closeIntakeEditor() {
  editingIntake = null;
  $('editIntakeSheet').classList.add('hidden');
  $('editIntakeSheet').setAttribute('aria-hidden','true');
  $('editIntakeForm').reset();
}
function openIntakeEditor(mode,id) {
  if(mode !== state.activeMode) return;
  const item=intakeList(mode).find(x=>x.id===id);
  if(!item)return toast('Cette consommation n’est plus disponible.');
  editingIntake={mode,id};
  setText('editIntakeTitle', `Modifier · ${WORLDS[mode].label}`);
  $('editIntakeAmount').value = String(item.ml);
  $('editIntakeWhen').value = toLocalDateInput(new Date(item.ts));
  $('editIntakePriceRow').classList.toggle('hidden',mode==='water');
  $('editIntakePrice').required = mode!=='water';
  $('editIntakePrice').value = mode==='water' ? '' : (Number(item.cents||0)/100).toFixed(2);
  $('editIntakeSheet').classList.remove('hidden');
  $('editIntakeSheet').setAttribute('aria-hidden','false');
  $('editIntakeAmount').focus();
}
function saveIntakeEdit(event) {
  event.preventDefault();
  if(!editingIntake)return;
  const {mode,id}=editingIntake;
  if(mode!==state.activeMode)return closeIntakeEditor();
  const item=intakeList(mode).find(x=>x.id===id);
  if(!item){closeIntakeEditor();return toast('Cette consommation n’existe plus.');}
  const amount=Number($('editIntakeAmount').value);
  const when=$('editIntakeWhen').value;
  const ts=when ? new Date(when).getTime() : NaN;
  const price=mode==='water'?0:Number($('editIntakePrice').value);
  const validPrice=mode==='water'||(Number.isFinite(price)&&price>=0&&price<=999&&Math.round(price*100)<=99900);
  if(!Number.isInteger(amount)||amount<1||amount>20000||!Number.isFinite(ts)||ts>Date.now()+60000||ts<946684800000||!validPrice) {
    toast('Vérifie la quantité, la date et le prix.');return;
  }
  item.ml=amount;item.ts=ts;item.day=key(new Date(ts));
  if(mode!=='water')item.cents=Math.round(price*100);
  queueLog(mode,item);
  saveLocal();closeIntakeEditor();render();toast('Consommation modifiée ✓');
}
function removeIntake(mode,id) {
  if(mode!==state.activeMode)return;
  const logs=intakeList(mode), item=logs.find(x=>x.id===id);
  if(!item)return toast('Consommation introuvable.');
  if(!confirm(`Supprimer cette consommation de ${item.ml} ml du ${new Date(item.ts).toLocaleDateString('fr-FR')} à ${formatTime(item.ts)} ?`))return;
  // Tombstone Supabase : une suppression hors connexion ne ressuscite pas au retour du réseau.
  if(mode==='water')state.logs=logs.filter(x=>x.id!==id);
  else sodaStore(mode).logs=logs.filter(x=>x.id!==id);
  queueLog(mode,item,true);
  saveLocal();render();toast('Consommation supprimée');
}
function handleIntakeAction(event) {
  const edit=event.target.closest('[data-edit-intake]');
  if(edit){openIntakeEditor(edit.dataset.intakeMode,edit.dataset.editIntake);return;}
  const remove=event.target.closest('[data-remove-intake]');
  if(remove)removeIntake(remove.dataset.intakeMode,remove.dataset.removeIntake);
}

function renderHistory() {
  const t = T[state.lang]; const now = new Date(); const base = new Date(now.getFullYear(), now.getMonth() + historyMonthOffset, 1, 12);
  setText("historyMonthLabel", base.toLocaleDateString(locale(), { month: "long", year: "numeric" }));
  const weekdayNames = ["L", "M", "M", "J", "V", "S", "D"];
  $("weekdayRow").innerHTML = weekdayNames.map(x => `<span>${x}</span>`).join("");
  const firstOffset = (new Date(base.getFullYear(), base.getMonth(), 1).getDay() + 6) % 7; const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(); let html = "";
  $("calendarGrid").closest(".history-calendar-panel")?.style.setProperty("--history-weeks",String(Math.ceil((firstOffset+days)/7)));
  for (let i = 0; i < firstOffset; i++) html += '<span class="calendar-day empty"></span>';
  for (let day = 1; day <= days; day++) {
    const d = new Date(base.getFullYear(), base.getMonth(), day, 12); const dk = key(d); const total = dayTotal(d); const ratio = state.goal ? Math.min(1, total / state.goal) : 0; const alpha = total ? (0.10 + ratio * 0.64).toFixed(2) : 0;
    const level=total ? (total >= state.goal ? 4 : Math.max(1,Math.min(3,Math.ceil(total/state.goal*3)))) : 0;
    const classes = ["calendar-day", total ? "has-log" : "",`history-intensity-${level}`,total>=state.goal&&total>0?"goal-met":"", dk === selectedHistoryKey ? "selected" : "", dk === key() ? "today" : ""].filter(Boolean).join(" ");
    html += `<button class="${classes}" style="--alpha:${alpha}" data-day="${dk}" type="button" aria-label="${day} : ${total} ml${total>=state.goal&&total>0?', objectif atteint':''}" aria-pressed="${dk===selectedHistoryKey}">${day}</button>`;
  }
  const monthStartKey=key(base), nextMonthKey=key(new Date(base.getFullYear(),base.getMonth()+1,1,12));
  const monthLogs=state.logs.filter(l=>l.day>=monthStartKey&&l.day<nextMonthKey);
  const daysWithWater=new Map();monthLogs.forEach(l=>daysWithWater.set(l.day,(daysWithWater.get(l.day)||0)+l.ml));
  const successes=[...daysWithWater.values()].filter(ml=>ml>=state.goal).length;
  setText("waterHistoryHeroValue",`${successes} ${successes===1?"jour":"jours"}`);
  setText("waterHistoryHeroText",`Objectif atteint · ${daysWithWater.size} ${daysWithWater.size===1?"jour suivi":"jours suivis"}`);
  setText("waterHistoryVolume",formatL(monthLogs.reduce((sum,l)=>sum+l.ml,0)));
  $("calendarGrid").innerHTML = html; $("nextMonth").disabled = historyMonthOffset >= 0; $("nextMonth").style.opacity = historyMonthOffset >= 0 ? ".3" : "1"; renderSelectedDay(t);
}

function renderSelectedDay(t = T[state.lang]) {
  const [y, m, d] = selectedHistoryKey.split("-").map(Number); const date = new Date(y, m - 1, d, 12); const logs = state.logs.filter(x => x.day === selectedHistoryKey).sort((a, b) => a.ts - b.ts); const total = logs.reduce((s, x) => s + x.ml, 0); const pct = state.goal ? Math.round(total / state.goal * 100) : 0;
  setText("selectedDateLabel", date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })); setText("selectedDayTotal", formatL(total)); setText("selectedDayPercent", `${pct} %`); setText("selectedDrinkCount", logs.length); setText("selectedFirstTime", logs[0] ? formatTime(logs[0].ts) : "—"); setText("selectedLastTime", logs.at(-1) ? formatTime(logs.at(-1).ts) : "—");
  const label=!logs.length?"Aucune prise enregistrée ce jour-là.":total>=state.goal?"Objectif quotidien atteint !":`Encore ${formatL(state.goal-total)} pour atteindre ton objectif.`;
  setText("waterDayStatus",label);
  $("waterDayStatus")?.classList.toggle("is-positive",logs.length>0&&total>=state.goal);
  $("dayScoreRing")?.style.setProperty("--score-pct", `${Math.min(100, pct)}%`);
  const container=$('selectedDayLogs');container.replaceChildren();
  if(logs.length){logs.forEach(x=>container.append(intakeRow('water',x)));}
  else {const empty=document.createElement('div');empty.className='empty-day';empty.textContent=t.noDayLogs;container.append(empty);}
}

function renderSettings() {
  setText("goalHeaderValue", formatL(state.goal)); setText("settingsWaterHeroGoal", formatL(state.goal)); $("goalInput").value = state.goal; $("intervalInput").value = String(state.interval); $("wakeInput").value = state.wake; $("sleepInput").value = state.sleep;
  document.querySelectorAll("[data-goal]").forEach(btn => { btn.classList.toggle("active", Number(btn.dataset.goal) === Number(state.goal)); btn.textContent = formatL(Number(btn.dataset.goal)); });
  const optionLabels = {30:"30 min",45:"45 min",60:"Toutes les heures",90:"Toutes les 1 h 30",120:"Toutes les 2 heures"};
  Array.from($("intervalInput").options).forEach(opt => { opt.textContent = optionLabels[opt.value] || opt.textContent; });
  $("reminderToggle")?.classList.toggle("on", state.remindersEnabled); $("reminderToggle")?.setAttribute("aria-checked", state.remindersEnabled ? "true" : "false");
  renderNotificationChoices();
}

async function addWater(ml, atMs = Date.now()) {
  if(state.activeMode!=='water')return;
  const amount=Math.round(Number(ml));if(!Number.isFinite(amount)||amount<=0)return;
  const item={id:makeUuid(),ml:amount,ts:atMs,day:key(new Date(atMs))};
  state.logs.push(item);queueLog('water',item);saveLocal();render();closeAddSheet();
  toast(`${T[state.lang].drank} ${amount} ml 💧`);
}
async function saveSettings(silent=false) {
  if(state.activeMode!=='water')return;
  const goal=Number($('goalInput').value);
  if(!Number.isInteger(goal)||goal<500||goal>20000){toast('Choisis un objectif entre 500 et 20 000 ml.');renderSettings();return;}
  state.goal=goal;state.interval=Number($('intervalInput').value)||60;
  state.wake=$('wakeInput').value||'08:00';state.sleep=$('sleepInput').value||'23:00';
  queueSettings('water');saveLocal();render();if(!silent)toast(T[state.lang].saved);
}
function showScreen(target) {
  if (!["today", "progress", "history", "settings"].includes(target)) return;
  document.querySelectorAll(".screen").forEach(s => {
    const active = s.dataset.screen === target;
    s.classList.toggle("active", active);
    s.setAttribute("aria-hidden", String(!active));
  });
  document.querySelectorAll(".nav-btn").forEach(b => {
    const active = b.dataset.target === target;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" });
  if (state.activeMode === "water") {
    if (target === "history") renderHistory(); if (target === "progress") renderProgress(); if (target === "settings") renderSettings();
  } else renderSoda();
}

function openAddSheet() { if (state.activeMode !== "water") return; $("customTime").value = new Date().toTimeString().slice(0, 5); $("addSheet").classList.remove("hidden"); $("addSheet").setAttribute("aria-hidden", "false"); }
function closeAddSheet() { $("addSheet").classList.add("hidden"); $("addSheet").setAttribute("aria-hidden", "true"); $("customMl").value = ""; }
function customTimestampFromTime(timeValue) { if (!timeValue) return Date.now(); const [h, m] = timeValue.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }

async function resetToday() {
  if(state.activeMode!=='water'||!confirm(T[state.lang].confirmReset))return;
  const selected=state.logs.filter(l=>l.day===key());
  for(const item of selected)queueLog('water',item,true);
  state.logs=state.logs.filter(l=>l.day!==key());saveLocal();render();toast(T[state.lang].deletedToday);
}
async function deleteAllHistory() {
  if(state.activeMode!=='water'||!confirm(T[state.lang].confirmDelete))return;
  for(const item of state.logs)queueLog('water',item,true);
  state.logs=[];saveLocal();render();toast(T[state.lang].deletedAll);
}
function urlBase64ToUint8Array(base64String) { const padding = "=".repeat((4 - base64String.length % 4) % 4); const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/"); const rawData = window.atob(base64); return Uint8Array.from([...rawData].map(char => char.charCodeAt(0))); }

function renderNotificationChoices() {
  const p=window.TW_PUSH?.getPrefs() || {weekly_enabled:false,weekly_time:'19:00'};
  for(const suffix of ['Water','Soda']) {
    const btn=$('weeklyToggle'+suffix), clock=$('weeklyTime'+suffix);
    if(btn){btn.classList.toggle('on',!!p.weekly_enabled);btn.setAttribute('aria-checked',String(!!p.weekly_enabled));}
    if(clock && document.activeElement!==clock)clock.value=p.weekly_time||'19:00';
  }
  const ready=window.TW_PUSH?.available() && window.TW_PUSH?.supported();
  const msg= !window.TW_PUSH?.available() ? 'Configuration Web Push serveur à terminer sur Supabase.' :
    !window.TW_PUSH?.supported() ? 'Sur iPhone, ouvre 2LO depuis son icône sur l’écran d’accueil. Vérifie les autorisations Android/iOS.' :
    Notification.permission==='denied' ? 'Notifications bloquées : autorise 2LO dans les réglages du téléphone.' :
    Notification.permission==='granted' ? 'Notifications autorisées sur cet appareil (envois serveur à tester).' :
    'Active les rappels ou le bilan pour autoriser les notifications sur cet appareil.';
  setText('pushStatus',msg);
  setText('weeklyStatusWater',ready ? 'Bilan envoyé le dimanche, avec Internet.' : msg);
  setText('weeklyStatusSoda',ready ? 'Bilan envoyé le dimanche, avec Internet.' : msg);
}
async function toggleReminderPush() {
  if(state.activeMode!=='water')return;
  const next=!state.remindersEnabled;
  const b=$('reminderToggle');if(b)b.disabled=true;
  try{
    if(next)await window.TW_PUSH.enableDevice();
    state.remindersEnabled=next;
    queueSettings('water');saveLocal();renderSettings();
    if(!next)await window.TW_PUSH.unregisterIfUnused(false);
    toast(next?'Rappels Water activés 💧':'Rappels Water désactivés');
  }catch(e){toast(e.message||'Notifications non disponibles.');}
  finally{if(b)b.disabled=false;renderNotificationChoices();}
}
async function toggleWeekly() {
  const btns=['weeklyToggleWater','weeklyToggleSoda'].map($).filter(Boolean);
  btns.forEach(b=>b.disabled=true);
  const cur=window.TW_PUSH.getPrefs();const next=!cur.weekly_enabled;
  try{
    if(next)await window.TW_PUSH.enableDevice();
    await window.TW_PUSH.savePrefs({weekly_enabled:next});
    if(!next)await window.TW_PUSH.unregisterIfUnused(state.remindersEnabled);
    toast(next?'Bilan du dimanche activé':'Bilan du dimanche désactivé');
  }catch(e){toast(e.message||'Impossible d’enregistrer ce réglage.');}
  finally{btns.forEach(b=>b.disabled=false);renderNotificationChoices();}
}
async function saveWeeklyTime(value) {
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return;
  try {await window.TW_PUSH.savePrefs({weekly_time:value});toast('Heure du bilan enregistrée');}
  catch(e){toast(e.message||'Connexion nécessaire.');}
  renderNotificationChoices();
}
async function enableNotificationsThisDevice() {
  try {await window.TW_PUSH.enableDevice();toast('Notifications autorisées sur cet appareil.');}
  catch(e){toast(e.message||'Notifications indisponibles.');}
  renderNotificationChoices();
}
async function testPush() {
  const b=$('testPushBtn');if(b)b.disabled=true;
  try{await window.TW_PUSH.sendTest();toast('Notification test envoyée au service Push.');}
  catch(e){toast(e.message||'Échec du test Push.');}
  finally{if(b)b.disabled=false;}
}
function bind() {
  if (window.__bound) return; window.__bound = true;
  $("worldSwitchButton").onclick = toggleWorldMenu;
  document.querySelectorAll(".world-option").forEach(b => b.onclick = () => setActiveMode(b.dataset.world));
  document.addEventListener("click", e => { if (!e.target.closest("#worldSwitcher")) closeWorldMenu(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    closeWorldMenu();
    if (!$("addSheet").classList.contains("hidden")) closeAddSheet();
    if (!$("sodaSheet").classList.contains("hidden")) closeSodaSheet();
    if (!$('editIntakeSheet').classList.contains('hidden')) closeIntakeEditor();
  });
  $("demoBtn").onclick = () => { $("auth").classList.add("hidden"); render(); };
  $("loginBtn").onclick = async () => {
    const button=$("loginBtn"), magic=$("magicLinkBtn"), pass=$("loginPassword");
    button.disabled=true;magic.disabled=true;setText('authStatus','Connexion en cours…');
    try {
      const auth=await window.TW_SYNC.signInWithPassword($("email").value.trim(),pass.value);
      pass.value='';setText('authStatus','');
      await enterCloud(auth);
    } catch(error) {
      const msg=/invalid login credentials|invalid credentials/i.test(error.message)
        ? 'Adresse e-mail ou mot de passe incorrect.' : error.message;
      setText('authStatus','Connexion impossible : '+msg);
    } finally {pass.value='';button.disabled=false;magic.disabled=false;}
  };
  $("loginPassword").addEventListener('keydown', e => {
    if (e.key === 'Enter') {e.preventDefault();if(!$("loginBtn").disabled)$("loginBtn").click();}
  });
  $("magicLinkBtn").onclick = async () => {
    const button=$("magicLinkBtn"), signIn=$("loginBtn");
    button.disabled=true;signIn.disabled=true;setText('authStatus','Envoi du lien en cours…');
    try {await window.TW_SYNC.sendMagicLink($("email").value.trim());
      setText('authStatus', 'Lien envoyé. Sur iPhone, ouvre-le dans Safari, puis définis ton mot de passe dans Réglages → Compte.');}
    catch(error){setText('authStatus','Envoi impossible : '+error.message);}
    finally{button.disabled=false;signIn.disabled=false;}
  };
  $("openPasswordForm").onclick = () => {
    const panel=$("passwordManage"), open=panel.classList.contains('hidden');
    panel.classList.toggle('hidden',!open);
    $("openPasswordForm").setAttribute('aria-expanded', String(open));
    setText('passwordStatus','');
    if(open)$("newAccountPassword").focus();
    else {$("newAccountPassword").value='';$("confirmAccountPassword").value='';}
  };
  $("cancelAccountPassword").onclick = () => {
    $("passwordManage").classList.add('hidden');
    $("openPasswordForm").setAttribute('aria-expanded','false');
    $("newAccountPassword").value='';$("confirmAccountPassword").value='';
    setText('passwordStatus','');
  };
  $("passwordManage").addEventListener('submit', async event => {
    event.preventDefault();
    const pwd=$("newAccountPassword"), check=$("confirmAccountPassword"), btn=$("saveAccountPassword");
    if(pwd.value.length < 12 || pwd.value.length > 128) {
      setText('passwordStatus','Choisis un mot de passe de 12 à 128 caractères.');return;
    }
    if(pwd.value !== check.value) {
      setText('passwordStatus','Les deux mots de passe ne correspondent pas.');return;
    }
    if(!confirm('Tu modifies le mot de passe de ton compte Supabase EXISTANT. Cela peut aussi affecter la connexion à ton ancienne application. Continuer ?')) return;
    btn.disabled=true;setText('passwordStatus','Enregistrement sécurisé en cours…');
    try {
      await window.TW_SYNC.updatePassword(pwd.value);
      setText('passwordStatus','Mot de passe enregistré ! Tu peux maintenant ouvrir 2LO installée sur iPhone et te connecter directement.');
      toast('Mot de passe du compte enregistré.');
      pwd.value='';check.value='';
    } catch(error) {
      setText('passwordStatus','Impossible d’enregistrer : '+error.message);
      pwd.value='';check.value='';
    } finally {btn.disabled=false;}
  });
  $("logoutBtn").onclick = async () => {
    if(pendingCount()){toast('Synchronise d’abord les modifications en attente avant de te déconnecter.');return;}
    if(!navigator.onLine){toast('Reconnecte-toi à Internet avant de te déconnecter.');return;}
    if(!confirm('Se déconnecter de 2LO TEST ? Les données de ce compte resteront sauvegardées sur cet appareil.'))return;
    try{await window.TW_PUSH.unregisterOnLogout();}
    catch(e){toast('Impossible de retirer les notifications de cet appareil : '+e.message);return;}
    await window.TW_SYNC.signOut();location.reload();
  };
  document.querySelectorAll(".quick").forEach(b => b.onclick = () => addWater(Number(b.dataset.ml)));
  document.querySelectorAll("[data-add-ml]").forEach(b => b.onclick = () => addWater(Number(b.dataset.addMl), customTimestampFromTime($("customTime").value)));
  $("addCustomBtn").onclick = () => { const amount = Number($("customMl").value); if (amount > 0) addWater(amount, customTimestampFromTime($("customTime").value)); else toast(T[state.lang].enterAmount); };
  $("openAdd").onclick = openAddSheet; $("closeAdd").onclick = closeAddSheet; $("addSheet").addEventListener("click", e => { if (e.target === $("addSheet")) closeAddSheet(); });
  document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => showScreen(b.dataset.target)); document.querySelectorAll("[data-go-home]").forEach(b => b.onclick = () => showScreen("today")); document.querySelectorAll("[data-target-settings]").forEach(b => b.onclick = () => showScreen("settings"));
  $("lastDrinkCard").onclick = () => { selectedHistoryKey = key(); historyMonthOffset = 0; showScreen("history"); };
  $('editIntakeClose').onclick=closeIntakeEditor;
  $('editIntakeSheet').onclick=e=>{if(e.target===$('editIntakeSheet'))closeIntakeEditor();};
  $('editIntakeForm').addEventListener('submit',saveIntakeEdit);
  $('todayJournalItems').addEventListener('click',handleIntakeAction);
  $('selectedDayLogs').addEventListener('click',handleIntakeAction);
  document.querySelectorAll(".segment").forEach(b => b.onclick = () => { progressPeriod = b.dataset.period; progressOffset = 0; renderProgress(); });
  $("periodPrev").onclick = () => { progressOffset--; renderProgress(); }; $("periodNext").onclick = () => { if (progressOffset < 0) progressOffset++; renderProgress(); };
  $("prevMonth").onclick = () => { historyMonthOffset--; const base = new Date(); base.setMonth(base.getMonth() + historyMonthOffset, 1); selectedHistoryKey = key(base); renderHistory(); };
  $("nextMonth").onclick = () => { if (historyMonthOffset < 0) { historyMonthOffset++; const base = new Date(); base.setMonth(base.getMonth() + historyMonthOffset, 1); selectedHistoryKey = historyMonthOffset === 0 ? key() : key(base); renderHistory(); } };
  $("calendarGrid").addEventListener("click", e => { const btn = e.target.closest("[data-day]"); if (!btn) return; selectedHistoryKey = btn.dataset.day; renderHistory(); });
  document.querySelectorAll("[data-goal]").forEach(btn => btn.onclick = async () => { $("goalInput").value = btn.dataset.goal; await saveSettings(true); });
  $("goalInput").addEventListener("change", () => saveSettings(true)); $("saveSettings").onclick = () => saveSettings(false); $("reminderToggle").onclick = toggleReminderPush;
  $("resetTodayBtn").onclick = resetToday; $("deleteHistoryBtn").onclick = deleteAllHistory;
  bindSoda();

  $("testPushBtn").onclick=testPush;
  $("enableDeviceWater").onclick=enableNotificationsThisDevice;
  $("enableDeviceSoda").onclick=enableNotificationsThisDevice;
  for(const id of ['weeklyToggleWater','weeklyToggleSoda'])$(id).onclick=toggleWeekly;
  for(const id of ['weeklyTimeWater','weeklyTimeSoda'])$(id).onchange=e=>saveWeeklyTime(e.target.value);
}


// 2LO V5.2.0 — Soda demo store. Deliberately local-only and isolated from Water and Supabase.
const SODA_DEFAULT = {
  coca: { limitMl: 1000, prices: { 330: 125, 500: 180 }, logs: [] },
  monster: { limitMl: 500, prices: { 330: 150, 500: 220 }, logs: [] }
};
function sodaStore(mode = state.activeMode) {
  if (mode !== "coca" && mode !== "monster") return null;
  if (!state.sodaData || typeof state.sodaData !== "object") state.sodaData = {};
  const record = state.sodaData[mode];
  if (!record || typeof record !== "object") state.sodaData[mode] = structuredClone(SODA_DEFAULT[mode]);
  const d = state.sodaData[mode];
  if (!Array.isArray(d.logs)) d.logs = [];
  if (!d.prices || typeof d.prices !== "object") d.prices = { ...SODA_DEFAULT[mode].prices };
  if (!Number.isFinite(Number(d.limitMl)) || Number(d.limitMl) <= 0) d.limitMl = SODA_DEFAULT[mode].limitMl;
  return d;
}
function money(cents) { return (Math.round(cents) / 100).toLocaleString("fr-FR", { style:"currency",currency:"EUR" }); }
function fmtAmount(ml) { return ml >= 1000 ? formatL(ml, 2).replace(/0(?= L$)/, "") : `${ml} ml`; }
function sodaTodayLogs(d=sodaStore()) { return d.logs.filter(l=>l.day===key()); }
function sodaTodayMl(d=sodaStore()) { return sodaTodayLogs(d).reduce((a,l)=>a+l.ml,0); }
function sodaTotal(day, d=sodaStore()) { return d.logs.filter(l=>l.day===day).reduce((a,l)=>a+l.ml,0); }
function sodaSpend(logs) { return logs.reduce((sum,l)=>sum+Number(l.cents||0),0); }
function sodaSelectedModeLabel() { return state.activeMode === "coca" ? "Coca-Cola" : "Monster"; }
function renderSoda() {
  if (state.activeMode === "water") return;
  const d = sodaStore(); const logs = sodaTodayLogs(d); const todayMl=sodaTodayMl(d);
  const ratio = d.limitMl ? Math.round(todayMl/d.limitMl*100) : 0;
  setText("sodaName", sodaSelectedModeLabel());
  setText("sodaTodayAmount", fmtAmount(todayMl));
  setText("sodaLimitText", `Limite personnelle : ${fmtAmount(d.limitMl)}`);
  setText("sodaGaugePercent", `${ratio} % de la limite`);
  $("sodaGaugeLiquid").style.height = `${Math.min(ratio,100)}%`;
  setClockGauge("sodaRingProgress", "sodaGaugeOrbit", ratio);
  $("sodaGauge").classList.toggle("limit-over", todayMl>d.limitMl);
  setText("sodaLimitMessage", todayMl===0 ? "Aucune consommation aujourd’hui. Continue ainsi !" : todayMl<=d.limitMl ? `Encore ${fmtAmount(d.limitMl-todayMl)} avant ta limite.` : `Limite dépassée de ${fmtAmount(todayMl-d.limitMl)}. Demain est un nouveau jour.`);
  setText("sodaSpendToday",money(sodaSpend(logs)));
  const last = [...d.logs].sort((a,b)=>b.ts-a.ts)[0];
  setText("sodaLastAmount",last ? fmtAmount(last.ml) : "—");
  setText("sodaLastTime",last ? `${formatTime(last.ts)} · ${new Date(last.ts).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}` : "Aucune prise");
  setText("sodaProgressTitle",`${sodaSelectedModeLabel()} · progression`);
  setText("sodaHistoryTitle",`${sodaSelectedModeLabel()} · historique`);
  setText("sodaSettingsTitle",`${sodaSelectedModeLabel()} · réglages`);
  setText("settingsLead",`${sodaSelectedModeLabel()} · limite et dépenses`);
  setText("sodaSettingsEyebrow",state.activeMode === "coca" ? "🔥 COCA-COLA · INFERNO RED" : "⚡ MONSTER · TOXIC GREEN");
  setText("sodaSettingsHeroHeadline",state.activeMode === "coca" ? "Moins de soda, à ton rythme." : "L’énergie avec modération.");
  setText("sodaSettingsHeroLimit",fmtAmount(d.limitMl));
  setText("sodaLimitValue",fmtAmount(d.limitMl));
  $("sodaLimitInput").value = d.limitMl;
  document.querySelectorAll("[data-soda-limit]").forEach(b=>b.classList.toggle("active",Number(b.dataset.sodaLimit)===Number(d.limitMl)));
  $("sodaPrice330").value = (Number(d.prices[330])/100).toFixed(2);
  $("sodaPrice500").value = (Number(d.prices[500])/100).toFixed(2);
  renderSodaProgress(); renderSodaHistory();
}
function sodaPeriod() {
  const now=new Date(); now.setHours(12,0,0,0);
  const days=[]; let title,groups;
  if (progressPeriod === "week") {
    const end=new Date(now);end.setDate(now.getDate()+progressOffset*7);
    const start=new Date(end);start.setDate(end.getDate()-6);
    for(let i=0;i<7;i++){const x=new Date(start);x.setDate(start.getDate()+i);days.push(x);}
    title=`${start.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} – ${end.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`;
    groups=days.map(x=>({label:x.toLocaleDateString("fr-FR",{weekday:"short"}).replace(".","")+" "+x.getDate(),dates:[x]}));
  } else if (progressPeriod === "month") {
    const start=new Date(now.getFullYear(),now.getMonth()+progressOffset,1,12);
    const count=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
    for(let i=0;i<count;i++){let x=new Date(start);x.setDate(i+1);days.push(x);}
    groups=[];for(let i=0;i<count;i+=5)groups.push({label:`${i+1}–${Math.min(i+5,count)}`,dates:days.slice(i,i+5)});
    title=start.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
  } else {
    const year=now.getFullYear()+progressOffset;groups=[];
    for(let m=0;m<12;m++) { const count=new Date(year,m+1,0).getDate();const dates=[];for(let j=1;j<=count;j++)dates.push(new Date(year,m,j,12)); days.push(...dates); groups.push({label:new Date(year,m,1).toLocaleDateString("fr-FR",{month:"short"}).replace(".",""),dates}); }
    title=String(year);
  }
  return {days,groups,title};
}
function renderSodaProgress() {
  const d=sodaStore(), info=sodaPeriod();
  setText("sodaPeriodLabel",info.title);
  const now=new Date();now.setHours(23,59,59,999);
  const completed=info.days.filter(day=>day<=now);
  const amounts=completed.map(day=>sodaTotal(key(day),d));
  const avg=amounts.length ? Math.round(amounts.reduce((a,b)=>a+b,0)/amounts.length) : 0;
  setText("sodaHeroBrand",state.activeMode === "monster" ? "MONSTER" : "COCA-COLA");
  setText("sodaHeroAverage",fmtAmount(avg));
  const exceededDays = amounts.filter(ml => ml > d.limitMl).length;
  setText("sodaHeroMessage", !amounts.length ? "Aucune journée écoulée sur cette période." : amounts.every(x=>x===0) ? "Aucune consommation sur cette période. Continue à ton rythme." : exceededDays > 0 ? `${exceededDays} jour${exceededDays>1?"s":""} au-dessus de ta limite personnelle sur cette période.` : "Tous les jours de cette période restent sous ta limite personnelle.");
  setText("sodaAverage",fmtAmount(avg));
  setText("sodaUnderLimit",`${amounts.filter(x=>x<=d.limitMl).length} / ${amounts.length} jours`);
  setText("sodaWithout",String(amounts.filter(x=>x===0).length));
  setText("sodaSpendPeriod",money(sodaSpend(d.logs.filter(l=>info.days.some(day=>key(day)===l.day)&&l.ts<=now.getTime()))));
  const bars=info.groups.map(g=>({label:g.label,ml:g.dates.reduce((a,x)=>a+sodaTotal(key(x),d),0)/g.dates.length}));
  const max=Math.max(d.limitMl*1.25,...bars.map(b=>b.ml*1.12),100);
  const threshold=Math.max(0,Math.min(100,d.limitMl/max*100));
  $("sodaLimitLine").style.setProperty("--limit-fraction",((100-threshold)/100).toFixed(4));
  setText("sodaChartLimit",`Limite ${fmtAmount(d.limitMl)}`);
  $("sodaBars").replaceChildren();
  bars.forEach(b=>{const cell=document.createElement("div");cell.className="soda-bar-cell";
    const track=document.createElement("div");track.className="soda-bar-track";
    const bar=document.createElement("div");bar.className="soda-bar";bar.style.height=`${b.ml ? Math.max(3,b.ml/max*100):0}%`;track.append(bar);
    const label=document.createElement("small");label.textContent=b.label;cell.title=fmtAmount(Math.round(b.ml));cell.setAttribute("aria-label",`${b.label} : ${fmtAmount(Math.round(b.ml))}`);cell.append(track,label);$("sodaBars").append(cell);});
  document.querySelectorAll(".soda-period-btn").forEach(b=>b.classList.toggle("active",b.dataset.sodaPeriod===progressPeriod));
  $("sodaPeriodNext").disabled=progressOffset>=0;
}
function renderSodaHistory() {
  const d=sodaStore(),today=new Date();const month=new Date(today.getFullYear(),today.getMonth()+historyMonthOffset,1,12);
  setText("sodaHistoryMonth",month.toLocaleDateString("fr-FR",{month:"long",year:"numeric"}));
  const start=key(month),end=key(new Date(month.getFullYear(),month.getMonth()+1,1,12));
  const monthLogs=d.logs.filter(l=>l.day>=start&&l.day<end);
  const consumptionDays=new Map();monthLogs.forEach(l=>consumptionDays.set(l.day,(consumptionDays.get(l.day)||0)+l.ml));
  const followedWithinLimit=[...consumptionDays.values()].filter(v=>v<=d.limitMl).length;
  setText("sodaHistoryEyebrow",`${sodaSelectedModeLabel().toUpperCase()} · BILAN DU MOIS`);
  setText("sodaHistoryHeroValue",`${followedWithinLimit} ${followedWithinLimit===1?"jour":"jours"}`);
  setText("sodaHistoryHeroText",`Jours suivis sous la limite · ${consumptionDays.size} ${consumptionDays.size===1?"jour suivi":"jours suivis"}`);
  setText("sodaHistoryHeroSpend",money(sodaSpend(monthLogs)));
  $("sodaWeekdays").innerHTML="<span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>";
  $("sodaCalendar").replaceChildren();
  const offset=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  $("sodaCalendar").closest(".history-calendar-panel")?.style.setProperty("--history-weeks",String(Math.ceil((offset+days)/7)));
  for(let n=0;n<offset;n++){const blank=document.createElement("span");blank.className="soda-date-blank";$("sodaCalendar").append(blank);}
  for(let n=1;n<=days;n++){
    const dt=new Date(month.getFullYear(),month.getMonth(),n,12),date=key(dt),ml=sodaTotal(date,d);
    const button=document.createElement("button");button.type="button";button.className="soda-calendar-day";button.textContent=String(n);button.dataset.sodaDay=date;
    const level=ml ? (ml>d.limitMl?4:Math.max(1,Math.min(3,Math.ceil(ml/d.limitMl*3)))):0;
    button.classList.add(`history-intensity-${level}`);
    button.classList.toggle("has-consumption",ml>0);button.classList.toggle("is-selected",date===selectedHistoryKey);button.classList.toggle("over-limit",ml>d.limitMl);
    button.setAttribute("aria-label",`${n} : ${fmtAmount(ml)}${ml>d.limitMl?', limite dépassée':''}`);button.setAttribute("aria-pressed",String(date===selectedHistoryKey));
    if (date===key()) button.classList.add("is-today");$("sodaCalendar").append(button);
  }
  $("sodaHistoryNext").disabled=historyMonthOffset>=0;
  const [y,m,day]=selectedHistoryKey.split("-").map(Number);
  const selectedDate=new Date(y,m-1,day,12),items=d.logs.filter(l=>l.day===selectedHistoryKey).sort((a,b)=>a.ts-b.ts);
  setText("sodaSelectedDate",selectedDate.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}));
  const selectedMl=items.reduce((a,l)=>a+l.ml,0),ratio=d.limitMl?Math.round(selectedMl/d.limitMl*100):0;
  setText("sodaSelectedTotal",fmtAmount(selectedMl));
  setText("sodaSelectedPercent",`${ratio} %`);
  setText("sodaDayCount",String(items.length));
  setText("sodaDayLimit",fmtAmount(d.limitMl));
  setText("sodaSelectedSpend",money(sodaSpend(items)));
  $("sodaDayScoreRing")?.style.setProperty("--score-pct",`${Math.min(ratio,100)}%`);
  setText("sodaDayStatus",!items.length?"Aucune consommation enregistrée ce jour-là.":selectedMl>d.limitMl?`Limite dépassée de ${fmtAmount(selectedMl-d.limitMl)}.`:`Sous la limite personnelle · ${fmtAmount(d.limitMl-selectedMl)} de marge.`);
  $("sodaDayStatus")?.classList.toggle("is-positive",items.length>0&&selectedMl<=d.limitMl);
  $("sodaDayItems").replaceChildren();
  if(!items.length){const p=document.createElement("p");p.className="soda-no-logs";p.textContent="Aucune consommation ce jour-là.";$("sodaDayItems").append(p);}
  items.forEach(l=>$('sodaDayItems').append(intakeRow(state.activeMode,l)));
}
function openSodaSheet(amount=330) {
  if (state.activeMode === "water") return;
  const d=sodaStore();$("sodaSheetName").textContent=`Ajouter du ${sodaSelectedModeLabel()}`;
  $("sodaAmountInput").value=String(amount);$("sodaWhenInput").value=toLocalDateInput(new Date());
  $("sodaPriceInput").value=(Number(d.prices[amount]||0)/100).toFixed(2);
  $("sodaSheet").classList.remove("hidden");$("sodaSheet").setAttribute("aria-hidden","false");
}
function toLocalDateInput(d) {return `${key(d)}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
function closeSodaSheet(){$("sodaSheet").classList.add("hidden");$("sodaSheet").setAttribute("aria-hidden","true");}
function addSodaFromSheet() {
  if (state.activeMode === "water") return;
  const amount=Number($("sodaAmountInput").value), price=Number($("sodaPriceInput").value), ts=new Date($("sodaWhenInput").value).getTime();
  if (![330,500].includes(amount) || !Number.isFinite(price) || price<0 || price>999 || !Number.isFinite(ts) || ts>Date.now()+60000){toast("Vérifie la quantité, le prix et la date.");return;}
  const item={id:makeUuid(), ml:amount,cents:Math.round(price*100),ts,day:key(new Date(ts))};
  sodaStore().logs.push(item);queueLog(state.activeMode,item);saveLocal();closeSodaSheet();render();toast(`${fmtAmount(amount)} de ${sodaSelectedModeLabel()} enregistré`);
}
function saveSodaSettings() {
  if(state.activeMode==="water")return;
  const limit=Number($("sodaLimitInput").value),p330=Number($("sodaPrice330").value),p500=Number($("sodaPrice500").value);
  if(!Number.isInteger(limit)||limit<100||limit>20000||![p330,p500].every(p=>Number.isFinite(p)&&p>=0&&p<=999)) {toast("Vérifie les limites et les prix.");return;}
  const d=sodaStore();d.limitMl=limit;d.prices={330:Math.round(p330*100),500:Math.round(p500*100)};queueSettings(state.activeMode);saveLocal();renderSoda();toast("Réglages soda enregistrés");
}
function resetSoda(which) {
  if(state.activeMode==="water")return;
  const d=sodaStore(),prompt=which==="today"?`Effacer les prises de ${sodaSelectedModeLabel()} d’aujourd’hui ?`:`Effacer tout l’historique ${sodaSelectedModeLabel()} de cette démo ?`;
  if(!confirm(prompt))return;
  const selected=which==='today'?d.logs.filter(l=>l.day===key()):[...d.logs];
  for(const item of selected)queueLog(state.activeMode,item,true);
  if(which==='today')d.logs=d.logs.filter(l=>l.day!==key());else d.logs=[];
  saveLocal();render();toast("Consommations effacées");
}
function bindSoda() {
  document.querySelectorAll("[data-soda-add]").forEach(b=>b.addEventListener("click",()=>openSodaSheet(Number(b.dataset.sodaAdd))));
  $("sodaOpenSheet").onclick=()=>openSodaSheet(330);
  $("sodaSheetClose").onclick=closeSodaSheet;$("sodaSheet").onclick=e=>{if(e.target===$("sodaSheet"))closeSodaSheet();};
  $("sodaAmountInput").onchange=()=>{$("sodaPriceInput").value=(Number(sodaStore().prices[$("sodaAmountInput").value]||0)/100).toFixed(2);};
  $("sodaSheetSave").onclick=addSodaFromSheet;
  $("sodaSaveSettings").onclick=saveSodaSettings;
  document.querySelectorAll("[data-soda-limit]").forEach(b=>b.onclick=()=>{
    $("sodaLimitInput").value=b.dataset.sodaLimit;
    document.querySelectorAll("[data-soda-limit]").forEach(chip=>chip.classList.toggle("active",chip===b));
  });
  $("sodaResetToday").onclick=()=>resetSoda("today");$("sodaResetAll").onclick=()=>resetSoda("all");
  document.querySelectorAll(".soda-period-btn").forEach(b=>b.onclick=()=>{progressPeriod=b.dataset.sodaPeriod;progressOffset=0;renderSodaProgress();});
  $("sodaPeriodPrev").onclick=()=>{progressOffset--;renderSodaProgress();};
  $("sodaPeriodNext").onclick=()=>{if(progressOffset<0)progressOffset++;renderSodaProgress();};
  $("sodaHistoryPrev").onclick=()=>{historyMonthOffset--;const d=new Date();d.setMonth(d.getMonth()+historyMonthOffset,1);selectedHistoryKey=key(d);renderSodaHistory();};
  $("sodaHistoryNext").onclick=()=>{if(historyMonthOffset<0){historyMonthOffset++;selectedHistoryKey=historyMonthOffset===0?key():key(new Date(new Date().getFullYear(),new Date().getMonth()+historyMonthOffset,1,12));renderSodaHistory();}};
  $("sodaCalendar").onclick=e=>{const b=e.target.closest("[data-soda-day]");if(b){selectedHistoryKey=b.dataset.sodaDay;renderSodaHistory();}};
  $('sodaDayItems').onclick=handleIntakeAction;
  $("sodaLastCard").onclick=()=>{historyMonthOffset=0;selectedHistoryKey=key();showScreen("history");};
}

let displayedDay = key();
function refreshOnDayChange() {
  const today = key();
  if (today === displayedDay) return;
  displayedDay = today;
  historyMonthOffset = 0;
  selectedHistoryKey = today;
  render();
}
// Reduce visual work in hidden tabs and re-evaluate dates when the app returns to view.
document.addEventListener("visibilitychange", () => {
  document.documentElement.dataset.pageHidden = String(document.hidden);
  if (!document.hidden) {refreshOnDayChange();if(userId)scheduleSync();}
});
setInterval(refreshOnDayChange, 60000);
// Foreground periodic reconciliation also catches updates from another signed-in device.
setInterval(()=>{if(!document.hidden&&userId&&navigator.onLine)scheduleSync();},60000);
setInterval(() => { if (document.hidden) return; if (state.activeMode === "water" && $("nextReminderRelative")) { const next = getNextReminderDate(); setText("nextReminderTime", formatTime(next.getTime())); setText("nextReminderRelative", relativeReminderText(next)); } }, 30000);
window.addEventListener('online',()=>{scheduleSync();});
window.addEventListener('offline',()=>{setSync('offline');renderSettings();});
window.addEventListener('focus',()=>{if(userId)scheduleSync();});

// V6.0 étape 6A — sur localhost également, tester le vrai service worker.
// Utiliser le port 8016 pour séparer cette démo des anciennes versions.
// Le déploiement HTTPS et le test PWA sur téléphone viendront ensuite.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      await navigator.serviceWorker.ready;
      // The first tab may still be uncontrolled during installation; a reload fixes that.
      if (!sessionStorage.getItem('2lo-v6-offline-ready-notified')) {
        sessionStorage.setItem('2lo-v6-offline-ready-notified', '1');
        toast('2LO prête pour un essai hors connexion');
      }
      reg.update().catch(() => {});
    } catch (error) {
      console.warn('2LO: installation du mode hors ligne impossible.', error);
      toast('Le mode hors ligne n’est pas encore prêt. Recharge avec Internet.');
    }
  });
}


window.setTimeout(() => $("launchSplash")?.classList.add("hide"), 900);
init();
