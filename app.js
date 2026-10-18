const DEMO = window.TWOLO_TEST_MODE === true;
const STORAGE_KEY = DEMO ? "2lo_v520_demo_only" : "gassienLocal";
const C = DEMO ? {} : (window.GASSIEN_CONFIG || {});
const configured = C.SUPABASE_URL && !C.SUPABASE_URL.includes("PASTE_") &&
  C.SUPABASE_PUBLISHABLE_KEY && !C.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY) : null;

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
    account: "Compte", logout: "Déconnexion", about: "À propos", version: "Version 6.0.1 (jauges harmonisées)", today: "Aujourd’hui", navProgress: "Progression", navHistory: "Historique", navSettings: "Réglages",
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
const key = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const saveLocal = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const locale = () => "fr-FR";
const formatL = (ml, digits = 1) => `${(ml / 1000).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} L`;
const formatTime = ts => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
const dayTotal = d => state.logs.filter(x => x.day === key(d)).reduce((sum, item) => sum + item.ml, 0);
selectedHistoryKey = key(new Date());
const totalForKey = dayKey => state.logs.filter(x => x.day === dayKey).reduce((sum, item) => sum + item.ml, 0);

function setSync(mode) {
  syncMode = mode;
  setText("settingsSyncText", mode === "cloud" ? T[state.lang].cloud : mode === "offline" ? T[state.lang].offline : T[state.lang].local);
}

async function init() {
  if (DEMO) {
    $("auth").classList.add("hidden");
    setSync("local"); bind(); render(); return;
  }
  if (!configured) {
    $("configWarning").classList.remove("hidden");
    $("demoBtn").classList.remove("hidden");
    $("loginBtn").classList.add("hidden");
    $("signupBtn").classList.add("hidden");
    $("authFields").classList.add("hidden");
    setSync("local");
    bind(); render(); return;
  }
  const { data: { session: s } } = await sb.auth.getSession();
  if (s) await enterCloud(s); else $("auth").classList.remove("hidden");
  sb.auth.onAuthStateChange(async (_event, sess) => { if (sess && sess.user?.id !== userId) await enterCloud(sess); });
  bind();
}

async function enterCloud(s) {
  session = s; userId = s.user.id; $("auth").classList.add("hidden");
  await ensureSettings(); await loadCloud(); subscribeRealtime(); setSync("cloud"); await refreshPushState(); render();
}

async function ensureSettings() {
  const { data, error } = await sb.from("hydration_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) { console.error(error); return; }
  if (!data) await sb.from("hydration_settings").insert({ user_id: userId, goal_ml: 2000, interval_minutes: 60, wake_time: "08:00", sleep_time: "23:00", language: "fr" });
}

async function loadCloud() {
  const [{ data: s, error: se }, { data: logs, error: le }] = await Promise.all([
    sb.from("hydration_settings").select("*").eq("user_id", userId).single(),
    sb.from("hydration_logs").select("*").eq("user_id", userId).order("consumed_at", { ascending: false }).limit(1500)
  ]);
  if (se || le) { console.error(se || le); setSync("offline"); return; }
  state.lang = "fr"; // La langue du cloud ne réactive jamais une interface anglaise.
  state.goal = s.goal_ml;
  state.interval = s.interval_minutes;
  state.wake = (s.wake_time || "08:00").slice(0, 5);
  state.sleep = (s.sleep_time || "23:00").slice(0, 5);
  state.logs = (logs || []).map(x => ({ id: x.id, ml: x.amount_ml, ts: new Date(x.consumed_at).getTime(), day: key(new Date(x.consumed_at)) }));
  saveLocal();
}

function subscribeRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("2lo-live-" + userId)
    .on("postgres_changes", { event: "*", schema: "public", table: "hydration_settings", filter: `user_id=eq.${userId}` }, async () => { await loadCloud(); render(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "hydration_logs", filter: `user_id=eq.${userId}` }, async () => { await loadCloud(); render(); })
    .subscribe(status => { if (status === "SUBSCRIBED") setSync("cloud"); });
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
  setText("versionLabel", DEMO ? "Version 6.0.1 (jauges harmonisées)" : t.version);
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
  if (DEMO) setText("versionLabel", "Version 6.0.1 (jauges harmonisées)");

  setText("accountEmail", session?.user?.email || (DEMO ? "Démonstration · sans Supabase" : "Mode local"));
  setText("settingsLead", state.activeMode === "water" ? "Hydratation · objectif et rappels" : `${activeWorld().label} · limite et dépenses`);

  renderWorldSwitcher();
  if (state.activeMode === "water") {
    renderToday(); renderProgress(); renderHistory(); renderSettings();
  } else renderSoda();
  saveLocal();
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
  $("selectedDayLogs").innerHTML = logs.length ? logs.map(x => `<div class="day-log-row"><span>▱</span><time>${formatTime(x.ts)}</time><strong>${x.ml} ml</strong></div>`).join("") : `<div class="empty-day">${t.noDayLogs}</div>`;
}

function renderSettings() {
  setText("goalHeaderValue", formatL(state.goal)); setText("settingsWaterHeroGoal", formatL(state.goal)); $("goalInput").value = state.goal; $("intervalInput").value = String(state.interval); $("wakeInput").value = state.wake; $("sleepInput").value = state.sleep;
  document.querySelectorAll("[data-goal]").forEach(btn => { btn.classList.toggle("active", Number(btn.dataset.goal) === Number(state.goal)); btn.textContent = formatL(Number(btn.dataset.goal)); });
  const optionLabels = {30:"30 min",45:"45 min",60:"Toutes les heures",90:"Toutes les 1 h 30",120:"Toutes les 2 heures"};
  Array.from($("intervalInput").options).forEach(opt => { opt.textContent = optionLabels[opt.value] || opt.textContent; });
  $("reminderToggle")?.classList.toggle("on", state.remindersEnabled); $("reminderToggle")?.setAttribute("aria-checked", state.remindersEnabled ? "true" : "false");
  if (DEMO) {
    setText("pushStatus", `Mode démo : préférence ${state.remindersEnabled ? "activée" : "désactivée"}, aucune notification réelle n'est envoyée.`);
  } else if (state.remindersEnabled && $("pushStatus") && !$("pushStatus").textContent) $("pushStatus").textContent = T[state.lang].pushEnabled;
}

async function addWater(ml, atMs = Date.now()) {
  if (state.activeMode !== "water") return; // Never put a soda into hydration_logs.
  const amount = Math.round(Number(ml)); if (!amount || amount <= 0) return;
  const temp = { id: "temp-" + Date.now(), ml: amount, ts: atMs, day: key(new Date(atMs)) }; state.logs.push(temp); render(); closeAddSheet();
  if (sb && userId) {
    const { error } = await sb.from("hydration_logs").insert({ user_id: userId, amount_ml: amount, consumed_at: new Date(atMs).toISOString() });
    if (error) { state.logs = state.logs.filter(x => x.id !== temp.id); setSync("offline"); render(); toast(T[state.lang].syncError); return; }
  } else saveLocal();
  toast(`${T[state.lang].drank} ${amount} ml 💧`);
}

async function saveSettings(silent = false) {
  if (state.activeMode !== "water") return;
  const requestedGoal=Number($("goalInput").value);
  if (!Number.isInteger(requestedGoal) || requestedGoal<500 || requestedGoal>20000) {
    toast("Choisis un objectif entre 500 et 20 000 ml.");renderSettings();return;
  }
  state.goal = requestedGoal; state.interval = Number($("intervalInput").value) || 60; state.wake = $("wakeInput").value || "08:00"; state.sleep = $("sleepInput").value || "23:00"; render();
  if (sb && userId) {
    const { error } = await sb.from("hydration_settings").update({ goal_ml: state.goal, interval_minutes: state.interval, wake_time: state.wake, sleep_time: state.sleep, language: state.lang }).eq("user_id", userId);
    if (error) { console.error(error); setSync("offline"); }
  }
  saveLocal(); if (!silent) toast(T[state.lang].saved);
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
  if (state.activeMode !== "water") return;
  const t = T[state.lang]; if (!confirm(t.confirmReset)) return; const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1);
  if (sb && userId) { const { error } = await sb.from("hydration_logs").delete().eq("user_id", userId).gte("consumed_at", start.toISOString()).lt("consumed_at", end.toISOString()); if (error) { toast(t.syncError); return; } }
  state.logs = state.logs.filter(x => x.day !== key()); render(); toast(t.deletedToday);
}

async function deleteAllHistory() {
  if (state.activeMode !== "water") return;
  const t = T[state.lang]; if (!confirm(t.confirmDelete)) return;
  if (sb && userId) { const { error } = await sb.from("hydration_logs").delete().eq("user_id", userId); if (error) { toast(t.syncError); return; } }
  state.logs = []; render(); toast(t.deletedAll);
}

function urlBase64ToUint8Array(base64String) { const padding = "=".repeat((4 - base64String.length % 4) % 4); const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/"); const rawData = window.atob(base64); return Uint8Array.from([...rawData].map(char => char.charCodeAt(0))); }

async function refreshPushState() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); state.remindersEnabled = !!subscription; saveLocal();
  } catch (e) { console.warn(e); }
}

async function enablePushReminders() {
  const t = T[state.lang]; const status = $("pushStatus");
  try {
    if (!userId || !sb) { status.textContent = t.enableFirst; return false; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { status.textContent = t.unsupported; return false; }
    if (!C.VAPID_PUBLIC_KEY) { status.textContent = t.keyMissing; return false; }
    const permission = await Notification.requestPermission(); if (permission !== "granted") { status.textContent = t.denied; return false; }
    status.textContent = t.enabling; const registration = await navigator.serviceWorker.ready; let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(C.VAPID_PUBLIC_KEY) });
    const data = subscription.toJSON(); const { error } = await sb.from("push_subscriptions").upsert({ user_id: userId, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, updated_at: new Date().toISOString() }, { onConflict: "endpoint" }); if (error) throw error;
    state.remindersEnabled = true; status.textContent = t.pushEnabled; renderSettings(); saveLocal(); toast(t.pushEnabled); return true;
  } catch (error) { console.error(error); status.textContent = t.pushError; state.remindersEnabled = false; renderSettings(); return false; }
}

async function disablePushReminders() {
  const t = T[state.lang];
  try {
    if ("serviceWorker" in navigator) { const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); if (subscription) { const endpoint = subscription.endpoint; if (sb && userId) { try { await sb.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint); } catch {} } await subscription.unsubscribe(); } }
  } catch (e) { console.warn(e); }
  state.remindersEnabled = false; setText("pushStatus", t.pushDisabled); renderSettings(); saveLocal(); toast(t.pushDisabled);
}

async function toggleReminderPush() {
  if (state.activeMode !== "water") return;
  if (DEMO) {
    state.remindersEnabled = !state.remindersEnabled;
    saveLocal(); renderSettings();
    toast("Préférence de rappel simulée · aucun envoi réel");
    return;
  }
  if (state.remindersEnabled) await disablePushReminders(); else await enablePushReminders();
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
  });
  $("demoBtn").onclick = () => { $("auth").classList.add("hidden"); render(); };
  $("loginBtn").onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value }); if (error) toast(error.message); };
  $("signupBtn").onclick = async () => { const { error } = await sb.auth.signUp({ email: $("email").value.trim(), password: $("password").value }); if (error) toast(error.message); else toast("Compte créé. Vérifie l’e-mail si demandé."); };
  $("logoutBtn").onclick = async () => { if (sb) await sb.auth.signOut(); location.reload(); };
  document.querySelectorAll(".quick").forEach(b => b.onclick = () => addWater(Number(b.dataset.ml)));
  document.querySelectorAll("[data-add-ml]").forEach(b => b.onclick = () => addWater(Number(b.dataset.addMl), customTimestampFromTime($("customTime").value)));
  $("addCustomBtn").onclick = () => { const amount = Number($("customMl").value); if (amount > 0) addWater(amount, customTimestampFromTime($("customTime").value)); else toast(T[state.lang].enterAmount); };
  $("openAdd").onclick = openAddSheet; $("closeAdd").onclick = closeAddSheet; $("addSheet").addEventListener("click", e => { if (e.target === $("addSheet")) closeAddSheet(); });
  document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => showScreen(b.dataset.target)); document.querySelectorAll("[data-go-home]").forEach(b => b.onclick = () => showScreen("today")); document.querySelectorAll("[data-target-settings]").forEach(b => b.onclick = () => showScreen("settings"));
  $("lastDrinkCard").onclick = () => { selectedHistoryKey = key(); historyMonthOffset = 0; showScreen("history"); };
  document.querySelectorAll(".segment").forEach(b => b.onclick = () => { progressPeriod = b.dataset.period; progressOffset = 0; renderProgress(); });
  $("periodPrev").onclick = () => { progressOffset--; renderProgress(); }; $("periodNext").onclick = () => { if (progressOffset < 0) progressOffset++; renderProgress(); };
  $("prevMonth").onclick = () => { historyMonthOffset--; const base = new Date(); base.setMonth(base.getMonth() + historyMonthOffset, 1); selectedHistoryKey = key(base); renderHistory(); };
  $("nextMonth").onclick = () => { if (historyMonthOffset < 0) { historyMonthOffset++; const base = new Date(); base.setMonth(base.getMonth() + historyMonthOffset, 1); selectedHistoryKey = historyMonthOffset === 0 ? key() : key(base); renderHistory(); } };
  $("calendarGrid").addEventListener("click", e => { const btn = e.target.closest("[data-day]"); if (!btn) return; selectedHistoryKey = btn.dataset.day; renderHistory(); });
  document.querySelectorAll("[data-goal]").forEach(btn => btn.onclick = async () => { $("goalInput").value = btn.dataset.goal; await saveSettings(true); });
  $("goalInput").addEventListener("change", () => saveSettings(true)); $("saveSettings").onclick = () => saveSettings(false); $("reminderToggle").onclick = toggleReminderPush;
  $("resetTodayBtn").onclick = resetToday; $("deleteHistoryBtn").onclick = deleteAllHistory;
  bindSoda();

  $("testPushBtn").onclick = async () => {
    const t = T[state.lang];
    try { if (DEMO) { toast("Démo locale : aucune notification réelle n'est envoyée"); return; } if (!sb || !userId) { toast(t.enableFirst); return; } toast(t.testSending); const { data, error } = await sb.functions.invoke("send-water-test"); if (error) throw error; toast(data?.delivered > 0 ? t.testSent : t.testNone); }
    catch (error) { console.error("Push test error:", error); toast(t.testError); }
  };
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
  items.forEach(l=>{
    const row=document.createElement("div");row.className="soda-log-row";
    const time=document.createElement("span");time.textContent=formatTime(l.ts);
    const qty=document.createElement("strong");qty.textContent=fmtAmount(l.ml);
    const price=document.createElement("span");price.textContent=money(l.cents);
    const del=document.createElement("button");del.type="button";del.className="soda-log-delete";del.dataset.deleteSoda=l.id;del.textContent="Supprimer";del.setAttribute("aria-label",`Supprimer la prise de ${formatTime(l.ts)}`);
    row.append(time,qty,price,del);$("sodaDayItems").append(row);
  });
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
  const item={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`, ml:amount,cents:Math.round(price*100),ts,day:key(new Date(ts))};
  sodaStore().logs.push(item);saveLocal();closeSodaSheet();renderSoda();toast(`${fmtAmount(amount)} de ${sodaSelectedModeLabel()} enregistré`);
}
function saveSodaSettings() {
  if(state.activeMode==="water")return;
  const limit=Number($("sodaLimitInput").value),p330=Number($("sodaPrice330").value),p500=Number($("sodaPrice500").value);
  if(!Number.isInteger(limit)||limit<100||limit>20000||![p330,p500].every(p=>Number.isFinite(p)&&p>=0&&p<=999)) {toast("Vérifie les limites et les prix.");return;}
  const d=sodaStore();d.limitMl=limit;d.prices={330:Math.round(p330*100),500:Math.round(p500*100)};saveLocal();renderSoda();toast("Réglages soda enregistrés");
}
function resetSoda(which) {
  if(state.activeMode==="water")return;
  const d=sodaStore(),prompt=which==="today"?`Effacer les prises de ${sodaSelectedModeLabel()} d’aujourd’hui ?`:`Effacer tout l’historique ${sodaSelectedModeLabel()} de cette démo ?`;
  if(!confirm(prompt))return;
  if(which==="today")d.logs=d.logs.filter(l=>l.day!==key());else d.logs=[];
  saveLocal();renderSoda();toast("Consommations effacées");
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
  $("sodaDayItems").onclick=e=>{const b=e.target.closest("[data-delete-soda]");if(!b||state.activeMode==="water")return;const d=sodaStore(),item=d.logs.find(l=>l.id===b.dataset.deleteSoda);if(!item)return;if(!confirm("Supprimer cette consommation ?"))return;d.logs=d.logs.filter(l=>l.id!==item.id);saveLocal();renderSoda();};
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
  if (!document.hidden) refreshOnDayChange();
});
setInterval(refreshOnDayChange, 60000);
setInterval(() => { if (document.hidden) return; if (state.activeMode === "water" && $("nextReminderRelative")) { const next = getNextReminderDate(); setText("nextReminderTime", formatTime(next.getTime())); setText("nextReminderRelative", relativeReminderText(next)); } }, 30000);
window.addEventListener("online", async () => { if (sb && userId) { await loadCloud(); setSync("cloud"); render(); } }); window.addEventListener("offline", () => { setSync("offline"); renderSettings(); });

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
