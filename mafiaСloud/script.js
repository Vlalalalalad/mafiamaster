/* ============================================================
   МАФІЯ - Ведучий | script.js
   ============================================================ */

// ── КОНСТАНТИ ─────────────────────────────────────────────
const ROLES_DEF = [
  {
    id: 'civilian', label: 'Мирний житель', emoji: '🏘️',
    color: '#7f8c8d', team: 'civil',
    desc: 'Виявляй мафію логікою і переконанням. Немає нічних дій.',
  },
  {
    id: 'mafia', label: 'Мафія', emoji: '🔫',
    color: '#c0392b', team: 'mafia',
    desc: 'Вночі разом з командою вбиваєш мирного. Залишайся непоміченим вдень.',
  },
  {
    id: 'don', label: 'Дон', emoji: '👑',
    color: '#8e1a1a', team: 'mafia',
    desc: 'Лідер мафії. Вночі перевіряєш чи є гравець Шерифом.',
  },
  {
    id: 'sheriff', label: 'Шериф', emoji: '⭐',
    color: '#f39c12', team: 'civil',
    desc: 'Вночі перевіряєш одного гравця: мирний чи мафія.',
  },
  {
    id: 'doctor', label: 'Лікар', emoji: '🩺',
    color: '#27ae60', team: 'civil',
    desc: 'Вночі рятуєш одного гравця від вбивства.',
  },
  {
    id: 'maniac', label: 'Маніяк', emoji: '🔪',
    color: '#8e44ad', team: 'neutral',
    desc: 'Одиночний вбивця. Вночі вбиває будь-кого. Перемагає якщо залишається один або один на один з мирним.',
  },
  {
    id: 'lover', label: 'Коханка', emoji: '💋',
    color: '#e91e8c', team: 'civil',
    desc: 'Вночі відволікає одного гравця - блокує його нічну дію.',
  },
  {
    id: 'suicide', label: 'Самогубець', emoji: '🎭',
    color: '#607d8b', team: 'neutral',
    desc: 'Перемагає якщо його виженуть голосуванням вдень. Програє якщо вбитий вночі.',
  },
  {
    id: 'witness', label: 'Свідок', emoji: '👁️',
    color: '#00bcd4', team: 'civil',
    desc: 'Вночі бачить до кого ходила Коханка або кого лікував Лікар.',
  },
  {
    id: 'lawyer', label: 'Адвокат', emoji: '⚖️',
    color: '#ff9800', team: 'mafia',
    desc: 'Вночі захищає одного гравця мафії - перевірка Шерифа покаже «мирний».',
  },
];

const ROLE_COUNTS_DEFAULT = { civilian: 0, mafia: 0, don: 0, sheriff: 0, doctor: 0, maniac: 0, lover: 0, suicide: 0, witness: 0, lawyer: 0 };

let uidSeq = 1;
const uid = () => 'p' + (uidSeq++);

// ── СТАН ──────────────────────────────────────────────────
let S = {
  screen: 'home',
  players:    [],       // { id, name, role, status:'alive'|'dead'|'eliminated', fols }
  roleCounts: { ...ROLE_COUNTS_DEFAULT },
  preTournamentRoleCounts: null, // снепшот ролей перед увімкненням турнірного режиму

  phase: 'night',       // 'night' | 'day'
  round: 0,             // 0 = Ніч 0; Ніч N → День N → Ніч N+1

  log:  [],
  notes: '',

  // Нічні дії поточної ночі (скидаються на кожній новій ночі)
  na: freshNightActions(),

  // Денний стан
  voteCandidates: [],   // [{ id: string, votes: number }]
  voteRevote: false,    // true, коли йде переголосування після нічиї
  dayVoteConcluded: false, // true, коли голосування цього дня вже завершилось (вигнання або нікого)
  currentSpeaker: '',

  introIdx: 0,
  // _iv та onEnd ніколи не серіалізуються - зберігаємо лише secs та running
  timer: { secs: 60, running: false, _iv: null, onEnd: null },

  savedRooms: [],
  stats: { nightsPlayed: 0, daysPlayed: 0, killed: 0, eliminated: 0 },

  firstKillUsed: false,
  gameStarted:   false,
  suicideWon:    false,  // самогубець переміг але гра триває
  activeTab: 'log',
  lastWinner: null,

  // Налаштування гри - централізований шар правил (game rules config).
  // Кожне поле тут реально читається десь в ігровій логіці нижче.
  settings: {
    gameMode:    'classic', // 'classic' | 'tournament' | 'custom' - лише UI-ярлик обраного пресету

    night0:      true,      // чи проводити Ніч 0 (знайомство мафії) перед грою
    donOrder:    'before',  // 'before' = Дон перед Мафією | 'after' = Дон після Мафії
    loverMafiaBlock: 'team', // 'team' = блокується вся команда | 'random' = лише таємний виконавець

    doctorSelfHeal:   'once',      // 'unlimited' | 'once' | 'forbidden'
    doctorRepeatHeal: 'forbidden', // 'allowed' | 'forbidden' - лікувати ту ж ціль підряд
    doctorPower:      'full',      // 'single' = захист від 1 нападу | 'full' = імунітет на всю ніч

    suicideCheckResult: 'civil',   // 'civil' | 'black' | 'special' - що бачить Шериф при перевірці Самогубці
    roleVisibility:     'color',   // 'color' = тільки колір (мафія/мирний) | 'exact' = точна роль

    revealRole:  true,     // (сумісність) розкривати роль при вибутті - дублює deathReveal==='full'
    deathReveal: 'full',   // 'full' | 'team' | 'hidden' - обсяг інформації після вибуття
    bestMove:    false,    // кращий хід першовбитого
    fols:        true,     // система фолів

    suicideRevenge:   false, // після вигнання Самогубець забирає ще одного гравця
    loverHeartAttack: false, // взаємна смерть Коханки і її цілі цієї ночі

    finalMafiaVsManiac: 'mafia', // 'mafia' | 'maniac' | 'draw' - фінал Мафія проти Маніяка
    mutualDestruction:  'draw',  // 'civil' | 'draw' | 'dark' - коли живих не залишилось

    firstNightImmunity: false, // імунітет вибраних гравців у Ніч 1
    immunePlayerIds:    [],    // до 3 id гравців з імунітетом першої ночі

    sortMode: 'number', // 'number' | 'role' - порядок відображення списку гравців
    hints:    false,    // підказки ведучому під час гри

    sheriffMode: 'mafia',  // 'mafia' = мафія чи ні | 'side' = свій/чужий
  },

  // Лікар: обмеження
  doctorLastSaved:  null,   // id гравця якого лікував минулої ночі
  doctorSelfUsed:   false,  // чи вже лікував себе
};

// Знімок дефолтних налаштувань - використовується для доповнення
// старих збережень (до цього патча), яким не вистачає нових полів.
const DEFAULT_SETTINGS = { ...S.settings };

// Еталонні набори "правил" (без gameMode/immunePlayerIds) для двох
// готових пресетів - використовуються і для застосування пресету, і
// для автоматичного визначення, чи поточні налаштування досі
// співпадають з якимось пресетом (щоб коректно повертати позначку
// режиму назад на "Класичний"/"Турнірний", якщо людина відкатала
// зміну вручну).
const CLASSIC_RULES = {
  night0: true, donOrder: 'before', loverMafiaBlock: 'team',
  doctorSelfHeal: 'once', doctorRepeatHeal: 'forbidden', doctorPower: 'full',
  suicideCheckResult: 'civil', roleVisibility: 'color', sheriffMode: 'mafia',
  revealRole: true, deathReveal: 'full', bestMove: false, fols: true,
  suicideRevenge: false, loverHeartAttack: false,
  finalMafiaVsManiac: 'mafia', mutualDestruction: 'draw',
  firstNightImmunity: false, sortMode: 'number', hints: false,
};
const TOURNAMENT_RULES = {
  night0: true, donOrder: 'after', loverMafiaBlock: 'team',
  doctorSelfHeal: 'forbidden', doctorRepeatHeal: 'forbidden', doctorPower: 'full',
  suicideCheckResult: 'civil', roleVisibility: 'color', sheriffMode: 'mafia',
  revealRole: false, deathReveal: 'hidden', bestMove: true, fols: true,
  suicideRevenge: false, loverHeartAttack: false,
  finalMafiaVsManiac: 'mafia', mutualDestruction: 'draw',
  firstNightImmunity: false, sortMode: 'number', hints: false,
};

function settingsMatchPreset(preset) {
  return Object.keys(preset).every(k => S.settings[k] === preset[k]);
}

// Автоматично повертає позначку режиму на "Класичний"/"Турнірний",
// якщо людина вручну відкатала зміни до одного з пресетів, або
// виставляє "Власний", якщо набір унікальний.
function syncGameModeLabel() {
  if (settingsMatchPreset(TOURNAMENT_RULES))   S.settings.gameMode = 'tournament';
  else if (settingsMatchPreset(CLASSIC_RULES)) S.settings.gameMode = 'classic';
  else                                          S.settings.gameMode = 'custom';
}

// ── СХОВИЩЕ ───────────────────────────────────────────────
const KEY_GAME  = 'mafiaGameState4';
const KEY_ROOMS = 'mafiaRooms3';

// Зберігає весь стан (без _iv - інтервал не серіалізується)
// Не зберігає екран 'end' - статистика живе тільки в пам'яті
function saveStorage() {
  try {
    if (S.screen === 'end') return; // статистику не зберігаємо
    const { _iv, onEnd, ...timerSafe } = S.timer;
    const snapshot = { ...S, timer: timerSafe };
    localStorage.setItem(KEY_GAME,  JSON.stringify(snapshot));
    localStorage.setItem(KEY_ROOMS, JSON.stringify(S.savedRooms));
  } catch (e) {}
}

// Відновлює стан; повертає true якщо є збережена сесія
function loadStorage() {
  try {
    const rooms = localStorage.getItem(KEY_ROOMS);
    if (rooms) S.savedRooms = JSON.parse(rooms);

    const raw = localStorage.getItem(KEY_GAME);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(S, saved);
    S.timer._iv   = null;
    S.timer.onEnd = null;
    // Сумісність зі старими збереженнями (до появи блокування Коханки)
    if (!S.na || typeof S.na !== 'object') S.na = freshNightActions();
    if (!Array.isArray(S.na.blocked)) S.na.blocked = [];
    // Сумісність зі старими збереженнями (до появи розширених налаштувань) -
    // доповнюємо відсутні поля дефолтами, не втрачаючи вже збережені значення.
    S.settings = { ...DEFAULT_SETTINGS, ...S.settings };
    if (!Array.isArray(S.settings.immunePlayerIds)) S.settings.immunePlayerIds = [];
    return true;
  } catch (e) { return false; }
}

// Очищає збережену сесію
function clearGameStorage() {
  try { localStorage.removeItem(KEY_GAME); } catch (e) {}
}

// ── ДОПОМІЖНІ ─────────────────────────────────────────────
const ge = id => document.getElementById(id);
const roleDef  = id => ROLES_DEF.find(r => r.id === id);
const roleName = id => roleDef(id)?.label || id;

// Єдине джерело "чистого" стану нічних дій - використовується при
// старті гри, Ночі 0 → День 1, Дню → наступній Ночі, і після
// завершення resolveNight(). Раніше цей об'єкт був продубльований
// в 5 різних місцях (різний набір полів у кожному) - джерело багів.
function freshNightActions() {
  return {
    mafiaTarget: '', donCheck: '', sheriffCheck: '', doctorSave: '',
    maniacTarget: '', loverTarget: '', witnessTarget: '', lawyerTarget: '',
    donRevealed: false, sheriffRevealed: false, witnessRevealed: false, lawyerProtected: null,
    blocked: [],   // id гравців, заблокованих Коханкою цієї ночі
    mafiaExecutorId: null, // таємний "виконавець" пострілу (режим loverMafiaBlock='random')
  };
}

// Належність до команди визначається з ROLES_DEF.team, а не з
// розкиданих по коду масивів ['mafia','don']. Це гарантує що
// Адвокат (team:'mafia') рахується мафією в умовах перемоги -
// раніше Адвокат не потрапляв ні в мафію, ні правильно у мирних.
const isMafiaTeam = id => roleDef(id)?.team === 'mafia';
const isCivilTeam = id => roleDef(id)?.team === 'civil';

// Централізовані дані відображення переможця - використовуються
// і в текстовому підсумку (buildWinSummaryHTML), і в saveScreenshot,
// щоб маніяк/самогубець не відображались хибно як перемога мафії.
function winDisplay(winner) {
  switch (winner) {
    case 'civil':   return { badge: '🏆', title: 'ПЕРЕМОГА МИРНИХ',    shortTitle: 'МИРНІ',   subtitle: 'знищили всю мафію',          color: '#45e085', grad: 'rgba(46,204,113,.08)' };
    case 'mafia':   return { badge: '☠️',  title: 'ПЕРЕМОГА МАФІЇ',     shortTitle: 'МАФІЯ',   subtitle: 'захопила місто',             color: '#e85050', grad: 'rgba(214,54,54,.08)'  };
    case 'maniac':  return { badge: '🔪', title: 'ПЕРЕМОГА МАНІЯКА',   shortTitle: 'МАНІЯК',  subtitle: 'переміг поодинці',           color: '#9b59b6', grad: 'rgba(155,89,182,.08)' };
    case 'suicide': return { badge: '🎭', title: 'САМОГУБЕЦЬ ПЕРЕМІГ', shortTitle: 'САМОГУБЕЦЬ', subtitle: 'провів місто - його вигнали!', color: '#90a4ae', grad: 'rgba(96,125,139,.08)' };
    case 'draw':    return { badge: '🤝', title: 'НІЧИЯ',               shortTitle: 'НІЧИЯ',   subtitle: 'жодна сторона не перемогла',  color: '#a0a0aa', grad: 'rgba(160,160,170,.08)' };
    default:        return { badge: '🏁', title: 'ГРУ ЗАВЕРШЕНО',       shortTitle: 'КІНЕЦЬ',  subtitle: '',                           color: '#a0a0aa', grad: 'transparent'          };
  }
}

// Чи є гравець переможцем при даному winner?
function isPlayerWinner(p, winner) {
  const rd = roleDef(p.role);
  if (winner === 'maniac')  return p.role === 'maniac';
  if (winner === 'suicide') return p.role === 'suicide' && p.status === 'eliminated';
  if (winner === 'civil')   return isCivilTeam(p.role);
  if (winner === 'mafia')   return isMafiaTeam(p.role);
  return false;
}

// Чи заблокований гравець Коханкою цієї ночі
const isPlayerBlocked = pid => !!pid && S.na.blocked.includes(pid);
const aliveOfRole = role => S.players.filter(p => p.role === role && p.status === 'alive');

// Чи заблокований постріл мафії цієї ночі - централізовано враховує
// обидва режими "Блокування Мафії Коханкою":
// 'team'   - блокується якщо Коханка прийшла ХОЧА Б до одного живого мафіозі/Дона
// 'random' - блокується лише якщо Коханка прийшла саме до таємного "виконавця"
function isMafiaShotBlocked(aliveMafiaList) {
  if (!aliveMafiaList.length) return false;
  if (S.settings.loverMafiaBlock === 'random') {
    return !!S.na.mafiaExecutorId && isPlayerBlocked(S.na.mafiaExecutorId);
  }
  return aliveMafiaList.some(m => isPlayerBlocked(m.id));
}

// Екранування тексту перед вставкою в innerHTML - захист від
// самостійного XSS (імена гравців/кімнат вводяться користувачем
// і раніше вставлялись у innerHTML без жодного екранування).
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Ролі, яких у грі може бути лише ОДНА копія: нічна панель показує
// для кожної з них рівно один select, тож друга копія ролі не мала би
// жодного способу виконати дію. Лічильник в налаштуваннях тепер не
// дозволяє виставити більше 1 для цих ролей.
const SINGLE_INSTANCE_ROLES = new Set(['don', 'lawyer', 'sheriff', 'doctor', 'lover', 'witness', 'maniac', 'suicide']);

// ── ЕКРАНИ ────────────────────────────────────────────────
// pushHistory = true: записати в History API (навігація користувача)
// pushHistory = false: не писати (відновлення після F5 або popstate)
function showScreen(name, pushHistory = true) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  ge(name + 'Screen').classList.add('active');
  S.screen = name;
  if (pushHistory) {
    history.pushState({ screen: name }, '', '#' + name);
  }
  saveStorage();
}


// ── НАЛАШТУВАННЯ ──────────────────────────────────────────
function initSetup() {
  // Якщо немає активної гри - стартуємо чисто, з класичним режимом за умовчанням
  if (!S.gameStarted) {
    S.players    = [];
    S.roleCounts = { ...ROLE_COUNTS_DEFAULT };
    S.settings   = { ...DEFAULT_SETTINGS };
    S.preTournamentRoleCounts = null;
  }
  document.querySelectorAll('.setup-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="start"]').classList.add('active');
  ge('tabStart').style.display = 'block';
  ge('tabRooms').style.display = 'none';
  renderRolesGrid();
  renderPlayerList();
  renderSavedRooms();
  renderSettings();
  updateStartBtn();
  showScreen('setup');
}

// Турнірний формат використовує лише базові ролі - решта заборонені
const TOURNAMENT_ALLOWED_ROLES = ['civilian', 'mafia', 'don', 'sheriff'];

function renderRolesGrid() {
  const isTournament = S.settings.gameMode === 'tournament';
  ge('rolesGrid').innerHTML = ROLES_DEF.map(r => {
    const locked = isTournament && !TOURNAMENT_ALLOWED_ROLES.includes(r.id);
    const max   = SINGLE_INSTANCE_ROLES.has(r.id) ? 1 : Infinity;
    const atMax = (S.roleCounts[r.id] || 0) >= max;
    const disablePlus  = locked || atMax;
    const disableMinus = locked;
    return `
    <div class="role-row" ${locked ? 'style="opacity:.4" title="Недоступно в турнірному режимі"' : ''}>
      <div class="role-dot" style="background:${r.color}"></div>
      <div class="role-label">${r.emoji} ${r.label}</div>
      <div class="role-counter">
        <button onclick="changeRole('${r.id}',-1)" ${disableMinus ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>−</button>
        <span class="role-count" id="rc_${r.id}">${S.roleCounts[r.id] || 0}</span>
        <button onclick="changeRole('${r.id}',1)" ${disablePlus ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>+</button>
      </div>
    </div>`;
  }).join('');
  updateRolesSummary();
}

function changeRole(id, delta) {
  if (S.settings.gameMode === 'tournament' && !TOURNAMENT_ALLOWED_ROLES.includes(id)) {
    toast('Ця роль недоступна в турнірному режимі');
    return;
  }
  const cur   = S.roleCounts[id] || 0;
  const total = roleTotal();
  const max   = SINGLE_INSTANCE_ROLES.has(id) ? 1 : Infinity;
  if (delta > 0 && (total >= S.players.length || cur >= max)) return;
  if (delta < 0 && cur <= 0) return;
  S.roleCounts[id] = cur + delta;
  renderRolesGrid();
  updateStartBtn();
}

function roleTotal() {
  return Object.values(S.roleCounts).reduce((a, b) => a + b, 0);
}

function updateRolesSummary() {
  const total = roleTotal(), n = S.players.length;
  const el = ge('rolesSummary');
  el.textContent = `Призначено: ${total} з ${n} гравців`;
  el.className   = 'roles-summary ' + (total === n && n >= 4 ? 'ok' : 'warn');
}

function updateStartBtn() {
  const total = roleTotal(), n = S.players.length;
  const ok = total === n && n >= 4;
  ge('startIntroBtn').disabled = !ok;
  ge('startHint').textContent  = ok
    ? '✅ Все готово - починаємо!'
    : n < 4 ? 'Потрібно мінімум 4 гравці'
    : `Ролей: ${total}, гравців: ${n}`;
}

// ── НАЛАШТУВАННЯ ──────────────────────────────────────────
// Декларативний опис усіх налаштувань - додавання нового пункту = один
// об'єкт в одному з масивів нижче, без дублювання рендер-коду.
function settingsCategories() {
  const cfg = S.settings;
  return [
    { title: '🌙 Нічні дії', rows: [
      { type: 'toggle', key: 'night0', label: 'Ніч 0 (Ніч знайомства)',
        desc: 'Підготовча ніч без активних дій перед основною грою' },
      { type: 'mode', key: 'donOrder', label: 'Перевірка Дона',
        desc: 'Коли Дон виконує свою перевірку', options: [
          ['before', 'До пострілу Мафії'], ['after', 'Після пострілу Мафії'] ] },
      { type: 'mode', key: 'loverMafiaBlock', label: 'Блокування Мафії Коханкою',
        desc: 'Як саме Коханка впливає на команду мафії', options: [
          ['team', 'Вся команда'], ['random', 'Лише виконавець'] ] },
    ]},
    { title: '🩺 Лікар', rows: [
      { type: 'mode', key: 'doctorSelfHeal', label: 'Самолікування',
        desc: 'Можливість лікувати самого себе', options: [
          ['unlimited', 'Без обмежень'], ['once', 'Один раз за гру'], ['forbidden', 'Заборонено'] ] },
      { type: 'mode', key: 'doctorRepeatHeal', label: 'Повторне лікування',
        desc: 'Чи можна лікувати одну ціль підряд', options: [
          ['allowed', 'Дозволено'], ['forbidden', 'Заборонено'] ] },
      { type: 'mode', key: 'doctorPower', label: 'Сила лікування',
        desc: 'Рівень захисту від нічних атак', options: [
          ['single', 'Від 1 нападу'], ['full', 'Повний імунітет'] ] },
    ]},
    { title: '👮 Шериф та перевірки', rows: [
      { type: 'mode', key: 'suicideCheckResult', label: 'Перевірка Самогубці',
        desc: 'Що показує перевірка ролі Самогубця', options: [
          ['civil', 'Мирний'], ['black', 'Чорний'], ['special', 'Особливий статус'] ] },
      { type: 'mode', key: 'roleVisibility', label: 'Видимість ролей',
        desc: 'Деталізація інформації про роль при перевірці', options: [
          ['color', 'Тільки колір'], ['exact', 'Точна роль'] ] },
      { type: 'mode', key: 'sheriffMode', label: 'Режим перевірки Шерифа',
        desc: 'Критерій визначення загрози', options: [
          ['mafia', 'Мафія/ні'], ['side', 'Свій/чужий'] ] },
    ]},
    { title: '☠️ Особливі ролі', rows: [
      { type: 'toggle', key: 'suicideRevenge', label: 'Помста Самогубці',
        desc: 'Після вигнання Самогубець забирає ще одного гравця' },
      { type: 'toggle', key: 'loverHeartAttack', label: 'Серцевий напад Коханки',
        desc: 'Взаємна загибель Коханки і гравця, якого вона відвідала цієї ночі' },
    ]},
    { title: '👁️ Інформація після смерті', rows: [
      { type: 'mode', key: 'deathReveal', label: 'Розкриття ролей',
        desc: 'Обсяг інформації після вибуття гравця', options: [
          ['full', 'Повна роль'], ['team', 'Лише команда'], ['hidden', 'Приховано'] ] },
      { type: 'toggle', key: 'bestMove', label: 'Кращий хід',
        desc: 'Першовбитий вночі називає 3 підозрюваних' },
    ]},
    { title: '🏆 Умови перемоги', rows: [
      { type: 'mode', key: 'finalMafiaVsManiac', label: 'Фінал: Мафія vs Маніяк',
        desc: 'Результат фінального протистояння', options: [
          ['mafia', 'Мафія'], ['maniac', 'Маніяк'], ['draw', 'Нічия'] ] },
      { type: 'mode', key: 'mutualDestruction', label: 'Повне взаємне знищення',
        desc: 'Результат при відсутності живих гравців', options: [
          ['civil', 'Мирні'], ['draw', 'Нічия'], ['dark', 'Темні'] ] },
    ]},
    { title: '⚙️ Додатково', rows: [
      { type: 'toggle', key: 'fols', label: 'Система фолів', desc: '4 фоли = дискваліфікація гравця' },
      { type: 'toggle', key: 'firstNightImmunity', label: 'Імунітет першої ночі',
        desc: 'Захист вибраних гравців у стартову ніч' },
      { type: 'mode', key: 'sortMode', label: 'Сортування гравців',
        desc: 'Порядок відображення списку', options: [
          ['number', 'За номером'], ['role', 'За ролями'] ] },
      { type: 'toggle', key: 'hints', label: 'Підказки для ведучого',
        desc: 'Система підказок під час гри' },
    ]},
  ];
}

function settingRowHTML(row) {
  const cfg = S.settings;
  if (row.type === 'toggle') {
    return `
      <label class="setting-row toggle-row" onclick="toggleSetting('${row.key}')">
        <div class="setting-info">
          <div class="setting-label">${row.label}</div>
          <div class="setting-desc">${row.desc}</div>
        </div>
        <div class="toggle ${cfg[row.key] ? 'on' : ''}"><div class="toggle-knob"></div></div>
      </label>`;
  }
  return `
    <div class="setting-row" style="cursor:default">
      <div class="setting-info">
        <div class="setting-label">${row.label}</div>
        <div class="setting-desc">${row.desc}</div>
      </div>
      <div class="mode-btn-group">
        ${row.options.map(([val, lbl]) => `
          <button class="mode-btn ${cfg[row.key] === val ? 'active' : ''}"
            onclick="setMode('${row.key}','${val}')">${lbl}</button>`).join('')}
      </div>
    </div>`;
}

function renderSettings() {
  const el = ge('settingsSection');
  if (!el) return;
  el.innerHTML = `
    <div class="setting-row gamemode-row" style="cursor:default;margin-bottom:.6rem">
      <div class="setting-info">
        <div class="setting-label">🏆 Режим гри</div>
        <div class="setting-desc">Готовий набір правил - застосує пов'язані налаштування</div>
      </div>
      <div class="mode-btn-group">
        <button class="mode-btn ${S.settings.gameMode==='classic'?'active':''}" onclick="applyGameMode('classic')">Класичний</button>
        <button class="mode-btn ${S.settings.gameMode==='tournament'?'active':''}" onclick="applyGameMode('tournament')">Турнірний</button>
        <button class="mode-btn ${S.settings.gameMode==='custom'?'active':''}" onclick="applyGameMode('custom')">Власний</button>
      </div>
    </div>
    ${settingsCategories().map(cat => `
      <div class="settings-category-title">${cat.title}</div>
      <div class="settings-grid" style="margin-bottom:.75rem">
        ${cat.rows.map(settingRowHTML).join('')}
      </div>`).join('')}
    ${immunityPickerHTML()}`;
}

function toggleSetting(key) {
  S.settings[key] = !S.settings[key];
  if (key === 'revealRole') S.settings.deathReveal = S.settings.revealRole ? 'full' : 'hidden';
  syncGameModeLabel();
  renderSettings();
  saveStorage();
}

// Єдина точка зміни для всіх "single choice" налаштувань - замінює
// колишні окремі setSheriffMode()/setDonOrder() (уникаємо дублювання).
function setMode(key, value) {
  S.settings[key] = value;
  if (key === 'deathReveal') S.settings.revealRole = (value === 'full');
  syncGameModeLabel();
  renderSettings();
  if (key === 'donOrder' || key === 'loverMafiaBlock') renderNightActions(); // оновити порядок/підписи селектів
  saveStorage();
}

function applyGameMode(mode) {
  if (mode === 'tournament') { applySportTemplate(); return; }
  const wasTournament = S.settings.gameMode === 'tournament';
  // Ролі чіпаємо лише якщо виходимо з турнірного режиму - повертаємо
  // те, що було обрано до нього. Перемикання класичний↔власний саме
  // по собі НЕ повинно торкатись вже обраних ролей.
  if (wasTournament) {
    S.roleCounts = S.preTournamentRoleCounts ? { ...S.preTournamentRoleCounts } : { ...ROLE_COUNTS_DEFAULT };
    S.preTournamentRoleCounts = null;
  }
  if (mode === 'classic') {
    S.settings = { ...S.settings, ...CLASSIC_RULES, gameMode: 'classic' };
    toast('Режим гри «Класичний» застосовано ✓');
  } else {
    S.settings.gameMode = 'custom'; // лишаємо все як є, просто знімаємо позначку пресету
    toast('Режим гри «Власний» - налаштовуйте як забажаєте ✓');
  }
  renderPlayerList(); renderRolesGrid(); renderSettings(); updateStartBtn(); saveStorage();
}

// ── ІМУНІТЕТ ПЕРШОЇ НОЧІ (вибір гравців у сетапі) ─────────
function immunityPickerHTML() {
  if (!S.settings.firstNightImmunity) return '';
  const ids = S.settings.immunePlayerIds || [];
  return `
    <div class="settings-category-title">🛡️ Гравці з імунітетом (макс. 3)</div>
    <div class="settings-grid" style="margin-bottom:.5rem">
      <div class="setting-row toggle-row" style="cursor:default;flex-wrap:wrap">
        <select class="action-select" id="immunityPickSelect" style="max-width:220px">
          <option value="">- оберіть гравця -</option>
          ${S.players.filter(p => !ids.includes(p.id)).map(p =>
            `<option value="${p.id}">${S.players.indexOf(p)+1}. ${esc(p.name)}</option>`).join('')}
        </select>
        <button class="btn-ghost btn-sm" onclick="addImmunePlayer()">+ Додати</button>
      </div>
      ${ids.map(id => {
        const p = S.players.find(x => x.id === id);
        if (!p) return '';
        return `<div class="setting-row toggle-row" style="cursor:default">
          <div class="setting-info"><div class="setting-label">🛡️ ${esc(p.name)}</div></div>
          <button class="btn-ghost btn-sm" onclick="removeImmunePlayer('${id}')"><i class="fas fa-times"></i></button>
        </div>`;
      }).join('')}
    </div>`;
}

// Шаблон «Спортивна мафія» (Турнірний режим)
function applySportTemplate() {
  // Запам'ятовуємо поточний розподіл ролей, щоб повернути його при
  // виході з турнірного режиму (а не лишати порожнім чи турнірним).
  if (S.settings.gameMode !== 'tournament') {
    S.preTournamentRoleCounts = { ...S.roleCounts };
  }
  S.roleCounts = { civilian: 6, mafia: 2, don: 1, sheriff: 1, doctor: 0, maniac: 0, lover: 0, suicide: 0, witness: 0, lawyer: 0 };
  S.settings = { ...S.settings, ...TOURNAMENT_RULES, gameMode: 'tournament', immunePlayerIds: [] };
  // Турнірний формат - рівно 10 гравців, зайвих прибираємо
  let trimmedMsg = '';
  if (S.players.length > 10) {
    S.players = S.players.slice(0, 10);
    trimmedMsg = ' (залишено перших 10 гравців)';
  }
  renderPlayerList();
  renderRolesGrid();
  renderSettings();
  updateStartBtn();
  toast(`Режим гри «Турнірний» застосовано ✓${trimmedMsg}`);
  saveStorage();
}

function addImmunePlayer() {
  const sel = ge('immunityPickSelect');
  if (!sel || !sel.value) return;
  if (S.settings.immunePlayerIds.length >= 3) { toast('Максимум 3 гравці'); return; }
  S.settings.immunePlayerIds.push(sel.value);
  renderSettings();
  saveStorage();
}

function removeImmunePlayer(id) {
  S.settings.immunePlayerIds = S.settings.immunePlayerIds.filter(x => x !== id);
  renderSettings();
  saveStorage();
}

function renderPlayerList() {
  ge('playerCountBadge').textContent = S.settings.gameMode === 'tournament'
    ? `${S.players.length}/10` : S.players.length;
  const el = ge('playerList');
  if (!S.players.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:.8rem;text-align:center;padding:.5rem">Додайте гравців</div>';
    return;
  }
  el.innerHTML = S.players.map((p, i) => `
    <div class="player-item">
      <div class="player-num">${i + 1}</div>
      <div class="player-name">${esc(p.name)}</div>
      <button class="player-remove" onclick="removePlayer(${i})">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function maxPlayersAllowed() {
  return S.settings.gameMode === 'tournament' ? 10 : 20;
}

function addPlayer() {
  const inp  = ge('playerNameInput');
  const name = inp.value.trim();
  if (!name) return;
  const max = maxPlayersAllowed();
  if (S.players.length >= max) {
    toast(S.settings.gameMode === 'tournament' ? 'Турнірний режим: максимум 10 гравців' : `Максимум ${max} гравців`);
    return;
  }
  if (S.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast("Таке ім'я вже є"); return;
  }
  S.players.push({ id: uid(), name, role: null, status: 'alive', fols: 0 });
  inp.value = '';
  inp.focus();
  renderPlayerList();
  updateRolesSummary();
  updateStartBtn();
}

function removePlayer(idx) {
  S.players.splice(idx, 1);
  renderPlayerList();
  // Якщо ролей більше ніж гравців - прибираємо зайві
  let total = roleTotal();
  while (total > S.players.length) {
    for (const r of [...ROLES_DEF].reverse()) {
      if ((S.roleCounts[r.id] || 0) > 0) {
        S.roleCounts[r.id]--;
        const el = ge(`rc_${r.id}`);
        if (el) el.textContent = S.roleCounts[r.id];
        break;
      }
    }
    total--;
  }
  updateRolesSummary();
  updateStartBtn();
}

// ── КІМНАТИ ───────────────────────────────────────────────
function playerCountStr(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} гравець`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} гравця`;
  return `${n} гравців`;
}
function saveRoom() {
  showModal(
    '💾 Зберегти кімнату',
    `<input class="modal-input" id="saveRoomInput" maxlength="30" placeholder="Назва кімнати" autocomplete="off">`,
    [
      { label: 'Зберегти', cls: 'btn-success', action: () => {
        const val = ge('saveRoomInput').value.trim();
        if (!val) return;
        S.savedRooms.unshift({
          id: Date.now(),
          name: val,
          players:   S.players.map(p => p.name),
          roles:     { ...S.roleCounts },
          settings:  { ...S.settings },
          createdAt: new Date().toLocaleDateString('uk-UA'),
        });
        saveStorage();
        renderSavedRooms();
        closeModal();
        toast('Кімнату збережено ✓');
      }},
      { label: 'Скасувати', cls: 'btn-ghost', action: closeModal },
    ]
  );
  setTimeout(() => {
    const inp = ge('saveRoomInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ge('mact0').click(); } });
    }
  }, 50);
}

function renderSavedRooms() {
  const el    = ge('savedRoomsList');
  const noMsg = ge('noRoomsMsg');
  if (!S.savedRooms.length) { el.innerHTML = ''; noMsg.style.display = 'block'; return; }
  noMsg.style.display = 'none';
  el.innerHTML = S.savedRooms.map((r, i) => `
    <div class="room-item" onclick="loadRoom(${i})">
      <div style="flex:1;min-width:0">
        <div class="room-item-name">${esc(r.name)}</div>
        <div class="room-item-info">${playerCountStr(r.players.length)} · ${r.createdAt}</div>
      </div>
      <button class="btn-icon" onclick="renameRoom(event,${i})" title="Перейменувати">
        <i class="fas fa-pen"></i>
      </button>
      <button class="btn-icon" onclick="deleteRoom(event,${i})" title="Видалити">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}

function renameRoom(e, idx) {
  e.stopPropagation();
  const room = S.savedRooms[idx];
  showModal(
    '✏️ Перейменувати кімнату',
    `<input class="modal-input" id="renameInput" value="${esc(room.name)}" maxlength="30" placeholder="Назва кімнати">`,
    [
      { label: 'Зберегти', cls: 'btn-success', action: () => {
        const val = ge('renameInput').value.trim();
        if (!val) return;
        S.savedRooms[idx].name = val;
        saveStorage();
        renderSavedRooms();
        closeModal();
        toast('Назву змінено ✓');
      }},
      { label: 'Скасувати', cls: 'btn-ghost', action: closeModal },
    ]
  );
  setTimeout(() => {
    const inp = ge('renameInput');
    if (inp) {
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ge('mact0').click(); } });
    }
  }, 50);
}

function loadRoom(idx) {
  const r = S.savedRooms[idx];
  S.players    = r.players.map(name => ({ id: uid(), name, role: null, status: 'alive', fols: 0 }));
  S.roleCounts = { ...r.roles };
  // Захист: кімнати, збережені до появи обмеження "лише 1 копія", могли мати більше
  SINGLE_INSTANCE_ROLES.forEach(id => { if ((S.roleCounts[id] || 0) > 1) S.roleCounts[id] = 1; });
  if (r.settings) S.settings = { ...S.settings, ...r.settings };
  renderPlayerList();
  renderRolesGrid();
  renderSettings();
  updateStartBtn();
  document.querySelector('[data-tab="start"]').click();
  toast(`Кімнату "${r.name}" завантажено`);
}

function deleteRoom(e, idx) {
  e.stopPropagation();
  S.savedRooms.splice(idx, 1);
  saveStorage();
  renderSavedRooms();
}

// ── ЗНАЙОМСТВО З РОЛЯМИ ───────────────────────────────────
function startIntro() {
  // Shuffle and assign roles
  const arr = [];
  ROLES_DEF.forEach(r => {
    for (let i = 0; i < (S.roleCounts[r.id] || 0); i++) arr.push(r.id);
  });
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  S.players.forEach((p, i) => { p.role = arr[i]; p.status = 'alive'; p.fols = 0; });

  S.introIdx      = 0;
  S.phase         = 'night';
  S.round         = 0;
  S.log           = [];
  S.voteCandidates = [];
    S.voteRevote = false;
    S.dayVoteConcluded = false;
  S.na            = freshNightActions();
  S.stats         = { nightsPlayed: 0, daysPlayed: 0, killed: 0, eliminated: 0 };
  S.firstKillUsed  = false;
  S.suicideWon     = false;
  S.doctorLastSaved = null;
  S.doctorSelfUsed  = false;
  S.currentSpeaker  = '';

  showScreen('intro');
  renderIntroCard();
}

function renderIntroCard() {
  const idx   = S.introIdx;
  const total = S.players.length;
  ge('roleCard').classList.remove('flipped');

  if (idx >= total) {
    // Всі гравці переглянули - показуємо фінальний екран ведучого
    ge('introCurrentName').textContent = 'Ведучий';
    ge('introProgress').textContent    = '';
    ge('cardFrontContent').innerHTML   =
      `<div style="font-size:3rem">🎭</div>
       <div style="font-family:'Oswald',sans-serif;font-size:1.2rem;color:var(--accent);margin-top:.5rem">
         Всі ролі роздано
       </div>`;
    setTimeout(() => ge('roleCard').classList.add('flipped'), 50);
    ge('introNextBtn').style.visibility       = 'hidden';
    ge('introStartGameBtn').style.visibility  = 'visible';
    return;
  }

  const p  = S.players[idx];
  const rd = roleDef(p.role);
  ge('introCurrentName').textContent = p.name;
  ge('introProgress').textContent    = `(${idx + 1} / ${total})`;
  ge('cardFrontContent').innerHTML   = `
    <div class="card-role-emoji">${rd.emoji}</div>
    <div class="card-role-name" style="color:${rd.color}">${rd.label}</div>
    <div class="card-role-team ${rd.team === 'mafia' ? 'team-mafia' : 'team-civil'}">
      ${rd.team === 'mafia' ? '⚫ Мафія' : '🔴 Мирні'}
    </div>
    <div class="card-role-desc">${rd.desc}</div>`;
  ge('introNextBtn').style.visibility      = 'hidden';
  ge('introStartGameBtn').style.visibility = 'hidden';
}

function flipIntroCard() {
  const card = ge('roleCard');
  if (!card.classList.contains('flipped')) {
    card.classList.add('flipped');
    if (S.introIdx < S.players.length)
      ge('introNextBtn').style.visibility = 'visible';
  }
}

function introNext() {
  // Спершу перевертаємо картку на сорочку, і лише після завершення
  // анімації підставляємо дані наступного гравця - інакше на мить
  // встигає промигнути роль наступного гравця на ще не перевернутій картці.
  ge('roleCard').classList.remove('flipped');
  ge('introNextBtn').style.visibility = 'hidden';
  setTimeout(() => {
    S.introIdx++;
    saveStorage();
    renderIntroCard();
  }, 550);
}

// ── СТАРТ ГРИ ─────────────────────────────────────────────
function startGame() {
  S.gameStarted = true;
  // Замінюємо #intro на #game - картки більше не існують в history
  history.replaceState({ screen: 'game' }, '', '#game');
  showScreen('game', false);
  ge('notesArea').value = S.notes;
  if (S.settings.night0) {
    S.phase = 'night';
    S.round = 0;
    addLog('info', '🎮 Гру розпочато. Ніч 0 - знайомство мафії.');
  } else {
    S.phase = 'day';
    S.round = 1;
    S.na = freshNightActions();
    addLog('info', '🎮 Гру розпочато. Ніч 0 вимкнена - одразу День 1.');
  }
  updatePhaseBar();
  renderGame();
}

// ── РЕНДЕР ГРИ ────────────────────────────────────────────
function renderGame() {
  renderPlayersGrid();
  renderNightActions();
  renderDayVoting();
  updatePhaseBar();
  updateAliveCount();
  if (ge('statsTab').style.display !== 'none') renderStats();
}

function updateAliveCount() {
  const alive = S.players.filter(p => p.status === 'alive').length;
  const dead  = S.players.filter(p => p.status !== 'alive').length;
  ge('aliveCountLabel').textContent = `${alive}/${S.players.length}`;
  ge('deadCountLabel').textContent  = dead ? `${dead}` : '';
}

// Порядок груп для сортування "За ролями": спершу мафія (головна
// загроза), потім нейтральний Маніяк, далі активні мирні ролі
// (від найважливішої до найменш), Самогубець окремо, мирні - останні.
const ROLE_SORT_ORDER = [
  'don', 'mafia',                          // мафія
  'maniac',                                // нейтральна загроза
  'sheriff', 'doctor', 'lover', 'witness', 'lawyer', // активні мирні ролі
  'suicide',                               // нейтральний
  'civilian',                              // мирні без здібностей - останні
];

function sortedPlayers(list) {
  if (S.settings.sortMode !== 'role') return list;
  return [...list].sort((a, b) => {
    const ra = ROLE_SORT_ORDER.indexOf(a.role);
    const rb = ROLE_SORT_ORDER.indexOf(b.role);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
      || S.players.indexOf(a) - S.players.indexOf(b);
  });
}

function renderPlayersGrid() {
  const alive = sortedPlayers(S.players.filter(p => p.status === 'alive'));
  const dead  = sortedPlayers(S.players.filter(p => p.status !== 'alive'));
  ge('alivePlayersGrid').innerHTML = alive.map(p => playerCardHTML(p, false)).join('');
  ge('deadPlayersGrid').innerHTML  = dead.map(p  => playerCardHTML(p, true)).join('');
  ge('deadSection').style.display  = dead.length ? 'block' : 'none';
  updateAliveCount();
}

function playerCardHTML(p, isDead) {
  const rd         = roleDef(p.role) || { emoji: '❓', color: 'var(--border2)', label: '-' };
  const num        = S.players.indexOf(p) + 1;
  const statusIcon = p.exitIcon || (p.status === 'dead' ? '💀' : p.status === 'eliminated' ? '🚫' : '');
  const isVote     = S.voteCandidates.some(c => c.id === p.id);
  const isTalk     = S.currentSpeaker === p.id;

  let cls = 'player-card';
  if (isDead)  cls += ' ' + p.status;
  if (isVote)  cls += ' selected-for-vote';
  if (isTalk)  cls += ' active-speaker';

  let actions = '';
  if (!isDead) {
    if (S.phase === 'day') {
      actions += `<button class="pc-btn talk${isTalk ? ' on' : ''}" onclick="setSpeaker('${p.id}')">🎤</button>`;
      actions += `<button class="pc-btn vote${isVote ? ' on' : ''}" onclick="toggleVote('${p.id}')">✋</button>`;
    }
    actions += `<button class="pc-btn kill" onclick="quickKill('${p.id}')">🚪</button>`;
  } else {
    actions += `<button class="pc-btn revive" onclick="revivePlayer('${p.id}')">↩</button>`;
  }

  const dots = [1, 2, 3].map(i =>
    `<div class="fol-dot ${p.fols >= i ? (p.fols >= 3 ? 'disq' : p.fols === 2 ? 'active' : 'step1') : ''}"></div>`
  ).join('');

  return `
    <div class="${cls}" id="pc_${p.id}">
      <div class="player-card-num">${num}</div>
      <div class="player-card-status">${statusIcon}</div>
      <div class="player-card-avatar" style="border-color:${rd.color}">${rd.emoji}</div>
      <div class="player-card-name">${esc(p.name)}</div>
      <div class="player-card-role">${rd.label}</div>
      <div class="fol-dots">${dots}</div>
      <div class="player-card-actions">${actions}</div>
      ${S.settings.fols ? `<button class="fol-btn" onclick="addFol('${p.id}')">F+</button>` : ''}
    </div>`;
}

// ── КАРТКА РОЗКРИТТЯ РОЛІ ─────────────────────────────────
function showRoleRevealOverlay(p, reason) {
  const rd = roleDef(p.role);
  const teamOnly = S.settings.deathReveal === 'team';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:350;background:#0d0d0f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;cursor:pointer;';
  overlay.innerHTML = `
    <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text3)">${reason}</div>
    <div style="font-size:1.1rem;font-weight:700;color:var(--text)">№${S.players.indexOf(p)+1} ${esc(p.name)}</div>
    <div style="width:200px;height:280px;background:var(--surface2);
      border:2px solid ${rd?.color||'var(--border2)'};border-radius:16px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:.75rem;padding:1.5rem;">
      <div style="font-size:4rem">${teamOnly ? (rd?.team==='mafia'?'⚫':'🔴') : (rd?.emoji||'❓')}</div>
      ${teamOnly ? '' : `<div style="font-family:'Oswald',sans-serif;font-size:1.4rem;font-weight:700;
        color:${rd?.color||'var(--text)'};text-align:center">${rd?.label||'-'}</div>`}
      <div class="card-role-team ${rd?.team==='mafia'?'team-mafia':'team-civil'}">
        ${rd?.team==='mafia'?'⚫ Мафія':'🔴 Мирні'}
      </div>
      ${teamOnly ? '' : `<div style="font-size:.7rem;color:var(--text2);text-align:center;line-height:1.4">${rd?.desc||''}</div>`}
    </div>
    <div style="font-size:.75rem;color:var(--text3)">Торкнись щоб закрити</div>`;
  document.body.appendChild(overlay);
  overlay.onclick = () => overlay.remove();
}

// ── ДІЇ З ГРАВЦЯМИ ────────────────────────────────────────

// Централізоване вибуття гравця - ЄДИНА точка для будь-якого
// сценарію вибування (вбитий вночі, вигнаний голосуванням,
// дискваліфікований за фоли, тощо). Гарантує що налаштування
// "Розкриття ролей" (full/team/hidden) працює однаково для УСІХ
// сценаріїв, а не лише для деяких.
function eliminatePlayer(pid, { status, reason = '', logType = 'info', logText = '', revealNow = true, countStat = true } = {}) {
  const p = S.players.find(x => x.id === pid);
  if (!p || p.status !== 'alive') return null;
  p.status = status;
  if (logText) p.exitIcon = logText.trim().split(' ')[0];
  if (countStat) { if (status === 'dead') S.stats.killed++; else S.stats.eliminated++; }
  if (logText) addLog(logType, logText);
  if (revealNow && S.settings.deathReveal !== 'hidden') showRoleRevealOverlay(p, reason);
  return p;
}

function quickKill(pid) {
  const p = S.players.find(x => x.id === pid);
  if (!p || p.status !== 'alive') return;
  const isNight = S.phase === 'night';
  showConfirm(`${p.name} покидає гру?`, () => {
    eliminatePlayer(pid, {
      status:  isNight ? 'dead' : 'eliminated',
      reason:  'покинув гру',
      logType: 'info',
      logText: `🚪 ${p.name} (${roleName(p.role)}) покинув гру.`,
      countStat: false,
    });
    renderGame();
    checkWin();
  });
}

function revivePlayer(pid) {
  const p = S.players.find(x => x.id === pid);
  if (!p) return;
  p.status = 'alive';
  addLog('info', `↩ ${p.name} повернутий в гру.`);
  renderGame();
}

// Мікрофон/таймер мовця. Повторний клік по тій самій картці ОБОВ'ЯЗКОВО
// зупиняє таймер (раніше лише знімалась підсвітка, а таймер продовжував
// працювати у фоні).
function setSpeaker(pid) {
  if (S.currentSpeaker === pid) {
    S.currentSpeaker = '';
    stopTimer();
    renderPlayersGrid();
    renderDayVoting();
    return;
  }
  S.currentSpeaker = pid;
  renderPlayersGrid();
  renderDayVoting();
  const p = S.players.find(x => x.id === pid);
  addLog('info', `🎤 Говорить №${S.players.indexOf(p) + 1} ${p.name}`);
  startTimer(60, () => {
    // По завершенню таймера - знімаємо підсвічування
    S.currentSpeaker = '';
    renderPlayersGrid();
    renderDayVoting();
  });
}

function toggleVote(pid) {
  const idx = S.voteCandidates.findIndex(c => c.id === pid);
  if (idx >= 0) {
    S.voteCandidates.splice(idx, 1);
  } else {
    S.voteCandidates.push({ id: pid, votes: 0 });
    addLog('vote', `✋ ${S.players.find(x => x.id === pid)?.name} виставлений на голосування`);
  }
  renderPlayersGrid();
  renderDayVoting();
  saveStorage();
}

function addFol(pid) {
  const p = S.players.find(x => x.id === pid);
  if (!p || p.status !== 'alive') return;
  p.fols++;
  addLog('info', `⚠️ Фол ${p.fols} - ${p.name}`);
  if (p.fols >= 4) {
    eliminatePlayer(pid, {
      status:  'eliminated',
      reason:  'дискваліфікований (4 фоли)',
      logType: 'info',
      logText: `❌ Дискваліфікація: ${p.name}`,
    });
    renderGame(); checkWin();
  } else {
    renderPlayersGrid();
    if (ge('statsTab').style.display !== 'none') renderStats();
  }
}


// ── НІЧНА ПАНЕЛЬ ──────────────────────────────────────────
// Оновлює нічну дію і одразу зберігає стан (для ролей-«перевірок»
// Дон/Шериф/Свідок - сам результат показується явною кнопкою "👁")
function naSet(key, value) {
  S.na[key] = value;
  saveStorage();
}

// ── МИТТЄВЕ ЗАСТОСУВАННЯ НІЧНИХ ДІЙ ──────────────────────
// КЛЮЧОВИЙ ФІКС: раніше всі нічні дії (блокування Коханки, захист
// Адвоката, обрання цілі Мафією/Маніяком, лікування) фіксувались
// у стані лише всередині resolveNight() - тобто аж після натискання
// "Завершити ніч". Лог також писався лише тоді. Тепер кожна дія
// застосовується і логується ОДРАЗУ при виборі цілі, а наступні
// ролі (які прокидаються пізніше, згідно порядку рядків нижче)
// вже бачать актуальний стан (хто заблокований і т.д.).
//
// Примітка щодо порядку: Коханка та Адвокат завжди розташовані
// вище Мафії/Маніяка/Лікаря в панелі (відповідає черговості
// пробудження ролей вночі), тому на момент вибору цілі Мафією
// блокування Коханки вже відоме. Якщо ведучий вносить дані не по
// порядку - фінальний результат ночі (resolveNight) все одно
// рахується коректно "з нуля" на момент натискання "Завершити ніч".

// 💋 Коханка - блокує дію цілі. Перераховується заново при кожній
// зміні (не накопичується від попередніх ночей чи попередніх вибору).
function onNaLover(value) {
  const prevBlocked = S.na.blocked.length > 0;
  S.na.loverTarget = value;
  S.na.blocked = value ? [value] : [];
  if (value) {
    const t = S.players.find(x => x.id === value);
    addLog('night', `💋 Коханка відвідала ${t?.name} - його нічна дія заблокована (якщо є).`);
  } else if (prevBlocked) {
    addLog('night', `💋 Коханка: ціль знята, блокування скасоване.`);
  }
  renderNightActions(); // оновити бейджі 🔒 та раніше показані результати перевірок
}

// ⚖️ Адвокат - захищає мафіозі від перевірки Шерифа
function onNaLawyer(value) {
  S.na.lawyerTarget = value;
  if (!value) { S.na.lawyerProtected = null; saveStorage(); renderNightActions(); return; }
  const lw = aliveOfRole('lawyer')[0];
  if (lw && isPlayerBlocked(lw.id)) {
    S.na.lawyerProtected = null;
    addLog('night', `⚖️ Адвокат заблокований Коханкою - захист не спрацював.`);
    renderNightActions();
    return;
  }
  const target = S.players.find(x => x.id === value);
  if (target && ['mafia', 'don'].includes(target.role)) {
    S.na.lawyerProtected = value;
    addLog('night', `⚖️ Адвокат захистив ${target.name} - Шериф побачить його як мирного.`);
  } else {
    S.na.lawyerProtected = null;
    addLog('night', `⚖️ Адвокат обрав ${target?.name} - ціль не з мафії, захист не діє.`);
  }
  renderNightActions();
}

// 🔫 Мафія - обирає жертву (команда стріляє один раз; сам постріл
// застосовується при завершенні ночі, але вибір логується одразу)
function onNaMafia(value) {
  S.na.mafiaTarget = value;
  if (!value) { saveStorage(); renderNightActions(); return; }
  const aliveMafia = S.players.filter(p => ['mafia', 'don'].includes(p.role) && p.status === 'alive');
  const allBlocked  = isMafiaShotBlocked(aliveMafia);
  const t = S.players.find(x => x.id === value);
  if (allBlocked) {
    addLog('night', `🔫 Мафія заблокована Коханкою - постріл не відбудеться.`);
  } else {
    addLog('night', `🔫 Мафія обрала жертву: ${t?.name}.`);
  }
  saveStorage();
  renderNightActions();
}

// 🔪 Маніяк - обирає жертву незалежно від мафії
function onNaManiac(value) {
  S.na.maniacTarget = value;
  if (!value) { saveStorage(); renderNightActions(); return; }
  const mn = aliveOfRole('maniac')[0];
  const t  = S.players.find(x => x.id === value);
  if (mn && isPlayerBlocked(mn.id)) {
    addLog('night', `🔪 Маніяк заблокований Коханкою - напад скасовано.`);
  } else {
    addLog('night', `🔪 Маніяк обрав жертву: ${t?.name}.`);
  }
  saveStorage();
  renderNightActions();
}

// Централізована перевірка обмежень Лікаря - використовується і для
// миттєвого попередження (onNaDoctor), і для фінального застосування
// (resolveNight), щоб логіка не дублювалась і не розходилась.
function doctorRestrictionReason(value, doc) {
  if (!value) return null;
  const isSelf = doc && value === doc.id;
  if (isSelf) {
    if (S.settings.doctorSelfHeal === 'forbidden') return 'self-forbidden';
    if (S.settings.doctorSelfHeal === 'once' && S.doctorSelfUsed) return 'self-used';
  }
  if (S.settings.doctorRepeatHeal === 'forbidden' && value === S.doctorLastSaved) return 'repeat';
  return null;
}

// 🩺 Лікар - рятує, з миттєвою перевіркою обмежень (двічі поспіль /
// повторне самолікування). Сам факт "врахування" фіксується лише
// при завершенні ночі (бо могло змінитись), але попередження видається зараз.
function onNaDoctor(value) {
  S.na.doctorSave = value;
  if (!value) { saveStorage(); renderNightActions(); return; }
  const doc = aliveOfRole('doctor')[0];
  const t   = S.players.find(x => x.id === value);
  const reason = doctorRestrictionReason(value, doc);
  if (doc && isPlayerBlocked(doc.id)) {
    addLog('night', `🩺 Лікар заблокований Коханкою - лікування скасовано.`);
  } else if (reason === 'repeat') {
    addLog('night', `🩺 Лікар не може рятувати ${t?.name} двічі поспіль - дія не врахується.`);
  } else if (reason === 'self-used') {
    addLog('night', `🩺 Лікар вже використав самолікування - рятувати себе знову не можна.`);
  } else if (reason === 'self-forbidden') {
    addLog('night', `🩺 Самолікування заборонено правилами - дія не врахується.`);
  } else {
    addLog('night', `🩺 Лікар рятує ${t?.name} цієї ночі.`);
  }
  saveStorage();
  renderNightActions();
}

// Кроки нічних дій у правильному порядку (з урахуванням donOrder) -
// самодостатня функція, щоб її можна було викликати і при повному
// перерендері панелі, і для точкового оновлення самої підказки.
function buildNightSteps() {
  const alive = S.players.filter(p => p.status === 'alive');
  const configuredOf = ids => ids.some(id => (S.roleCounts[id] || 0) > 0);
  const aliveCountOf = ids => ids.reduce((s, id) => s + alive.filter(p => p.role === id).length, 0);
  const rowState = ids => {
    const actionable = aliveCountOf(ids) > 0;
    const visible     = S.settings.deathReveal !== 'hidden' ? actionable : configuredOf(ids);
    return { visible, actionable };
  };
  const idsOf = role => alive.filter(p => p.role === role).map(p => p.id);
  const mafiaAliveList = alive.filter(p => ['mafia', 'don'].includes(p.role));
  const isAllBlocked = (ids, isMafiaRow = false) =>
    isMafiaRow ? isMafiaShotBlocked(mafiaAliveList) : (ids.length > 0 && ids.every(id => S.na.blocked.includes(id)));

  const donSt     = rowState(['don']);
  const sheriffSt = rowState(['sheriff']);
  const doctorSt  = rowState(['doctor']);
  const maniacSt  = rowState(['maniac']);
  const loverSt   = rowState(['lover']);
  const witnessSt = rowState(['witness']);
  const lawyerSt  = rowState(['lawyer']);
  const mafiaSt   = rowState(['mafia', 'don']);

  const donIds     = idsOf('don');
  const lawyerIds  = idsOf('lawyer');
  const mafiaIds   = alive.filter(p => ['mafia', 'don'].includes(p.role)).map(p => p.id);
  const maniacIds  = idsOf('maniac');
  const sheriffIds = idsOf('sheriff');
  const doctorIds  = idsOf('doctor');
  const witnessIds = idsOf('witness');

  const donBefore = S.settings.donOrder === 'before';

  const donStep = {
    who: 'Дон', visible: donSt.visible, actionable: donSt.actionable,
    blocked: isAllBlocked(donIds), done: S.na.donRevealed,
    hint: 'Розбудіть Дона, він обирає кого перевірити на Шерифа, потім натисніть 👁 біля кнопки «Дон», щоб побачити результат.',
  };

  return [
    { who: 'Коханка', visible: loverSt.visible, actionable: loverSt.actionable,
      blocked: false, done: !!S.na.loverTarget,
      hint: 'Розбудіть Коханку - хай вкаже, до кого йде цієї ночі (це і є її блокування).' },
    { who: 'Адвокат', visible: lawyerSt.visible, actionable: lawyerSt.actionable,
      blocked: isAllBlocked(lawyerIds), done: !!S.na.lawyerTarget,
      hint: 'Розбудіть Адвоката - хай обере, кого з мафії захистити від перевірки Шерифа цієї ночі.' },
    ...(donBefore ? [donStep] : []),
    { who: 'Мафія', visible: mafiaSt.visible, actionable: mafiaSt.actionable,
      blocked: isAllBlocked(mafiaIds, true), done: !!S.na.mafiaTarget,
      hint: 'Розбудіть Мафію - хай мовчки вкажуть спільну ціль пострілу.' },
    ...(!donBefore ? [donStep] : []),
    { who: 'Маніяк', visible: maniacSt.visible, actionable: maniacSt.actionable,
      blocked: isAllBlocked(maniacIds), done: !!S.na.maniacTarget,
      hint: 'Розбудіть Маніяка - хай обере свою ціль на цю ніч.' },
    { who: 'Шериф', visible: sheriffSt.visible, actionable: sheriffSt.actionable,
      blocked: isAllBlocked(sheriffIds), done: S.na.sheriffRevealed,
      hint: 'Розбудіть Шерифа, він обирає кого перевірити, потім натисніть 👁 біля кнопки «Шериф», щоб показати йому результат.' },
    { who: 'Лікар', visible: doctorSt.visible, actionable: doctorSt.actionable,
      blocked: isAllBlocked(doctorIds), done: !!S.na.doctorSave,
      hint: 'Розбудіть Лікаря - хай обере, кого лікувати цієї ночі.' },
    { who: 'Свідок', visible: witnessSt.visible, actionable: witnessSt.actionable,
      blocked: isAllBlocked(witnessIds), done: S.na.witnessRevealed,
      hint: 'Розбудіть Свідка, він обирає за ким спостерігати, потім натисніть 👁 біля кнопки «Свідок», щоб показати результат.' },
  ];
}

// 💡 Підказки для ведучого - покроковий гід по порядку пробудження.
// Роль, чий гравець вибув з гри при вимкненому розкритті ролей,
// лишається ВИДИМОЮ в списку (щоб інші не здогадались по тиші, хто
// саме вибув) - для таких ролей підказка радить лише зробити вигляд
// пробудження, не чекаючи реального вибору.
function nightHintHTML() {
  if (!S.settings.hints) return '';
  const steps = buildNightSteps();
  const idx = steps.findIndex(s => s.visible && s.actionable && !s.blocked && !s.done);

  // Йдучи назад від поточного кроку, збираємо все, що ведучий повинен
  // мовчки "пропустити": вибулих (зробити вигляд пробудження) і
  // заблокованих Коханкою (просто сказати спати) - в порядку появи.
  const collectSkips = fromIdx => {
    const items = [];
    for (let i = fromIdx; i >= 0; i--) {
      const s = steps[i];
      if (!s.visible) continue;
      if (!s.actionable) { items.unshift({ who: s.who, type: 'dead' }); continue; }
      if (s.blocked)     { items.unshift({ who: s.who, type: 'blocked' }); continue; }
      break;
    }
    return items;
  };

  const skipItems = collectSkips(idx === -1 ? steps.length - 1 : idx - 1);
  const feminineRoles = new Set(['Мафія', 'Коханка']);
  const accusative = {
    'Коханка': 'Коханку', 'Адвокат': 'Адвоката', 'Дон': 'Дона', 'Мафія': 'Мафію',
    'Маніяк': 'Маніяка', 'Шериф': 'Шерифа', 'Лікар': 'Лікаря', 'Свідок': 'Свідка',
  };
  // Групуємо лише СУСІДНІ кроки одного типу, щоб не порушувати
  // реальний порядок пробудження (напр. мертвий → заблокований → мертвий
  // лишаться трьома окремими рядками, а не двома згрупованими).
  const segments = [];
  for (const item of skipItems) {
    const last = segments[segments.length - 1];
    if (last && last.type === item.type) last.whos.push(item.who);
    else segments.push({ type: item.type, whos: [item.who] });
  }
  const skipLines = segments.map(seg => {
    if (seg.type === 'dead') {
      const names = seg.whos.map(w => accusative[w] || w).join(', ');
      return `Зробіть вигляд, що будите ${names}.`;
    }
    const ending = seg.whos.length > 1 ? 'і' : (feminineRoles.has(seg.whos[0]) ? 'а' : 'ий');
    return `${seg.whos.join(', ')} заблокован${ending} Коханкою - розбудіть як завжди, зробіть вигляд вибору.`;
  });
  const skipHTML = skipLines.length
    ? `<div class="hint-skip">${skipLines.map((l, i) => `${i + 1}. 👻 ${l}`).join('<br>')}</div>`
    : '';

  if (idx === -1) {
    return `<div class="hint-banner" id="nightHintBanner">${skipHTML}<div>💡 Розбудіть місто і натисніть «Завершити ніч».</div></div>`;
  }
  return `<div class="hint-banner" id="nightHintBanner">${skipHTML}<div>💡 <strong>${steps[idx].who}:</strong> ${steps[idx].hint}</div></div>`;
}

// Точкове оновлення лише банера підказки (не чіпаючи вже показані
// бейджі результатів перевірок Дона/Шерифа/Свідка на екрані).
function refreshNightHint() {
  const banner = ge('nightHintBanner');
  if (!banner) return;
  banner.outerHTML = nightHintHTML();
}

function renderNightActions() {
  const el = ge('nightActionsSection');
  if (S.phase !== 'night') { el.innerHTML = ''; return; }
  if (S.round === 0)       { el.innerHTML = night0HTML(); return; }

  const alive = S.players.filter(p => p.status === 'alive');

  // Режим "random": перший раз цієї ночі таємно обираємо одного живого
  // мафіозі/Дона "виконавцем" - саме його блокування Коханкою скасує
  // постріл. Ведучому ця особа НЕ показується (рахунок суто внутрішній).
  if (S.settings.loverMafiaBlock === 'random' && !S.na.mafiaExecutorId) {
    const candidates = alive.filter(p => isMafiaTeam(p.role) && p.role !== 'lawyer');
    if (candidates.length) {
      S.na.mafiaExecutorId = candidates[Math.floor(Math.random() * candidates.length)].id;
      saveStorage();
    }
  }

  // Для кожної ролі: actionable = реально можна виконати дію (гравець
  // живий); visible = чи показувати рядок взагалі.
  // - "Розкривати роль" УВІМКНЕНО → роль вже розкрита картою при
  //   вибутті, ховати рядок сенсу немає секрету немає → visible = actionable.
  // - "Розкривати роль" ВИМКНЕНО → рядок лишається на місці навіть для
  //   вибулої ролі (інакше гравці зрозуміють по тиші хто вибув), просто
  //   дія недоступна - visible = роль взагалі була в грі (count > 0).
  const configuredOf = ids => ids.some(id => (S.roleCounts[id] || 0) > 0);
  const aliveCountOf = ids => ids.reduce((s, id) => s + alive.filter(p => p.role === id).length, 0);
  const rowState = ids => {
    const actionable = aliveCountOf(ids) > 0;
    const visible     = S.settings.deathReveal !== 'hidden' ? actionable : configuredOf(ids);
    return { visible, actionable };
  };

  const donSt     = rowState(['don']);
  const sheriffSt = rowState(['sheriff']);
  const doctorSt  = rowState(['doctor']);
  const maniacSt  = rowState(['maniac']);
  const loverSt   = rowState(['lover']);
  const witnessSt = rowState(['witness']);
  const lawyerSt  = rowState(['lawyer']);
  const mafiaSt   = rowState(['mafia', 'don']);

  const opts = '<option value="">- не вибрано -</option>' +
    alive.map(p => `<option value="${p.id}">${S.players.indexOf(p) + 1}. ${esc(p.name)}</option>`).join('');

  // Лікар - окремий список опцій без цілей, заборонених поточними
  // правилами (самолікування вже використане/заборонене, повторне
  // лікування тієї ж людини). Гравець просто не з'явиться у списку,
  // замість помилки постфактум у лозі.
  const doctorAliveP = aliveOfRole('doctor')[0];
  const doctorOpts = '<option value="">- не вибрано -</option>' +
    alive.filter(p => !doctorRestrictionReason(p.id, doctorAliveP))
      .map(p => `<option value="${p.id}">${S.players.indexOf(p) + 1}. ${esc(p.name)}</option>`).join('');

  const donBefore = S.settings.donOrder === 'before';

  // Бейджі 🔒 - наочно показують що роль заблокована Коханкою ПРЯМО ЗАРАЗ
  const idsOf = role => alive.filter(p => p.role === role).map(p => p.id);
  const mafiaIds   = alive.filter(p => ['mafia', 'don'].includes(p.role)).map(p => p.id);
  const mafiaAliveList = alive.filter(p => ['mafia', 'don'].includes(p.role));
  const maniacIds  = idsOf('maniac');
  const doctorIds  = idsOf('doctor');
  const donIds     = idsOf('don');
  const sheriffIds = idsOf('sheriff');
  const witnessIds = idsOf('witness');
  const lawyerIds  = idsOf('lawyer');
  const badge = ids => {
    const blockedNow = ids[0] === 'mafia-team' ? isMafiaShotBlocked(mafiaAliveList) : (ids.length && ids.every(id => S.na.blocked.includes(id)));
    return blockedNow ? ' <span style="color:var(--red2);font-size:.62rem" title="Заблоковано Коханкою">🔒</span>' : '';
  };
  // 💤 - показується ведучому (тільки на його екрані), коли роль вибула,
  // а "Розкривати роль" вимкнено: рядок лишили на місці для вигляду.
  const deadBadge = ' <span style="color:var(--text3);font-size:.62rem" title="Гравець вибув - покличте роль для вигляду, дія не виконається">💤</span>';

  const fakeOpt    = '<option value="">- недоступно -</option>';
  const blockedOpt = '<option value="">- заблоковано 🔒 -</option>';

  // Будує <select>: активний / заблокований Коханкою / недоступний (вибув)
  // Коли всі актори ролі заблоковані - select виглядає так само як "недоступно"
  // (disabled, сірий), але з текстом "заблоковано" щоб ведучий розумів різницю.
  const isAllBlocked = (ids, isMafiaRow = false) =>
    isMafiaRow ? isMafiaShotBlocked(mafiaAliveList) : (ids.length > 0 && ids.every(id => S.na.blocked.includes(id)));
  const selectHTML = (id, st, onchangeAttr, roleIds = [], isMafiaRow = false, customOpts = null) => {
    if (!st.actionable)                return `<select class="action-select" id="${id}" disabled>${fakeOpt}</select>`;
    if (isAllBlocked(roleIds, isMafiaRow)) return `<select class="action-select" id="${id}" disabled>${blockedOpt}</select>`;
    return `<select class="action-select" id="${id}" ${onchangeAttr}>${customOpts ?? opts}</select>`;
  };

  // Рядки ролей у правильному порядку
  const donRow = donSt.visible ? `<div class="action-row">
        <div class="action-role">👑 Дон${!donSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_don', donSt, `onchange="naSet('donCheck',this.value)"`, donIds)}
        <span id="donResult" class="action-result miss" style="display:none"></span>
      </div>` : '';

  el.innerHTML = `
    <div class="night-panel">
      <div class="night-panel-title">🌃 Порядок пробудження</div>
      ${nightHintHTML()}
      ${loverSt.visible   ? `<div class="action-row">
        <div class="action-role">💋 Коханка${!loverSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_lover', loverSt, `onchange="onNaLover(this.value)"`, idsOf('lover'))}
      </div>` : ''}
      ${lawyerSt.visible  ? `<div class="action-row">
        <div class="action-role">⚖️ Адвокат${!lawyerSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_lawyer', lawyerSt, `onchange="onNaLawyer(this.value)"`, lawyerIds)}
      </div>` : ''}
      ${donBefore ? donRow : ''}
      ${mafiaSt.visible ? `<div class="action-row">
        <div class="action-role">🔫 Мафія${!mafiaSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_mafia', mafiaSt, `onchange="onNaMafia(this.value)"`, mafiaIds, true)}
      </div>` : ''}
      ${!donBefore ? donRow : ''}
      ${maniacSt.visible  ? `<div class="action-row">
        <div class="action-role">🔪 Маніяк${!maniacSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_maniac', maniacSt, `onchange="onNaManiac(this.value)"`, maniacIds)}
      </div>` : ''}
      ${sheriffSt.visible ? `<div class="action-row">
        <div class="action-role">⭐ Шериф${!sheriffSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_sheriff', sheriffSt, `onchange="naSet('sheriffCheck',this.value)"`, sheriffIds)}
        <span id="sheriffResult" class="action-result miss" style="display:none"></span>
      </div>` : ''}
      ${doctorSt.visible  ? `<div class="action-row">
        <div class="action-role">🩺 Лікар${!doctorSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_doctor', doctorSt, `onchange="onNaDoctor(this.value)"`, doctorIds, false, doctorOpts)}
      </div>` : ''}
      ${witnessSt.visible ? `<div class="action-row">
        <div class="action-role">👁️ Свідок${!witnessSt.actionable ? deadBadge : ''}</div>
        ${selectHTML('na_witness', witnessSt, `onchange="naSet('witnessTarget',this.value)"`, witnessIds)}
        <span id="witnessResult" class="action-result miss" style="display:none"></span>
      </div>` : ''}
      <div class="night-btns">
        ${donSt.actionable     ? `<button class="btn-ghost btn-sm" onclick="doRevealDon()"><i class="fas fa-eye"></i> Дон</button>` : ''}
        ${sheriffSt.actionable ? `<button class="btn-ghost btn-sm" onclick="doRevealSheriff()"><i class="fas fa-eye"></i> Шериф</button>` : ''}
        ${witnessSt.actionable ? `<button class="btn-ghost btn-sm" onclick="doRevealWitness()"><i class="fas fa-eye"></i> Свідок</button>` : ''}
        <button class="btn-success btn-sm" onclick="resolveNight()">
          <i class="fas fa-forward"></i> Завершити ніч
        </button>
      </div>
    </div>`;

  // Відновлюємо вибрані значення після перерендеру / F5
  const restoreMap = {
    na_mafia: 'mafiaTarget', na_don: 'donCheck', na_sheriff: 'sheriffCheck',
    na_doctor: 'doctorSave', na_maniac: 'maniacTarget', na_lover: 'loverTarget',
    na_witness: 'witnessTarget', na_lawyer: 'lawyerTarget',
  };
  Object.entries(restoreMap).forEach(([id, key]) => {
    if (S.na[key]) { const s = ge(id); if (s) s.value = S.na[key]; }
  });

  // Відновлюємо результати перевірок (з урахуванням актуального блокування)
  if (S.na.donRevealed && S.na.donCheck) {
    const p = S.players.find(x => x.id === S.na.donCheck);
    const donPlayer = alive.find(x => x.role === 'don');
    const elD = ge('donResult');
    if (p && elD) {
      if (donPlayer && S.na.blocked.includes(donPlayer.id)) {
        elD.style.display = 'inline-block'; elD.className = 'action-result miss'; elD.textContent = 'Заблоковано';
      } else {
        const isSheriff = p.role === 'sheriff';
        elD.style.display = 'inline-block'; elD.className = `action-result ${isSheriff ? 'civil' : 'miss'}`;
        elD.textContent = isSheriff ? '⭐ Шериф!' : 'Не Шериф';
      }
    }
  }
  if (S.na.sheriffRevealed && S.na.sheriffCheck) {
    const p = S.players.find(x => x.id === S.na.sheriffCheck);
    const sheriffPlayer = alive.find(x => x.role === 'sheriff');
    const elS = ge('sheriffResult');
    if (p && elS) {
      if (sheriffPlayer && S.na.blocked.includes(sheriffPlayer.id)) {
        elS.style.display = 'inline-block'; elS.className = 'action-result miss'; elS.textContent = 'Заблоковано';
      } else {
        const lawyerProtects = S.na.lawyerProtected === p.id && ['mafia', 'don'].includes(p.role);
        const { resultLabel, resultClass } = sheriffCheckResult(p, lawyerProtects);
        elS.style.display = 'inline-block'; elS.className = `action-result ${resultClass}`; elS.textContent = resultLabel;
      }
    }
  }
}

function night0HTML() {
  const mafia = S.players.filter(p => ['mafia', 'don'].includes(p.role));
  return `
    <div class="night-panel">
      <div class="night-panel-title"><i class="fas fa-moon"></i> Ніч 0 - Знайомство мафії</div>
      <div style="font-size:.82rem;color:var(--text2);margin-bottom:.65rem">
        Мафія прокидається і знайомиться. Дон позначає себе.
      </div>
      <div style="background:var(--surface2);border:1px solid rgba(142,26,26,.4);border-radius:var(--radius);padding:.5rem .75rem;margin-bottom:.6rem">
        <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.07em">
          Команда мафії (тільки ведучий бачить)
        </div>
        ${mafia.map((p, i) => `
          <div style="font-size:.85rem;padding:.18rem 0;border-bottom:${i < mafia.length - 1 ? '1px solid var(--border)' : 'none'}">
            ${p.role === 'don' ? '👑' : '🔫'} №${S.players.indexOf(p) + 1} ${esc(p.name)} - ${roleName(p.role)}
          </div>`).join('')}
      </div>
      <button class="btn-success btn-sm" onclick="endNight0()">
        <i class="fas fa-sun"></i> Завершити Ніч 0 → День 1
      </button>
    </div>`;
}

function endNight0() {
  S.na = freshNightActions();
  doTransitionToDay({ night0: true });
}

// ── ПЕРЕВІРКИ ─────────────────────────────────────────────
// Дон: перевіряє чи є гравець Шерифом
// Картка результату перевірки (для ведучого)
function showCheckCard(roleEmoji, title, playerName, result, isDanger) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:350;background:#0d0d0f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;cursor:pointer;';
  overlay.innerHTML = `
    <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text3)">${title}</div>
    <div style="font-size:1.1rem;color:var(--text2)">Гравець: <strong style="color:var(--text)">${esc(playerName)}</strong></div>
    <div style="width:200px;height:240px;background:var(--surface2);
      border:3px solid ${isDanger?'var(--red2)':'var(--green2)'};border-radius:16px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;">
      <div style="font-size:4rem">${roleEmoji}</div>
      <div style="font-family:'Oswald',sans-serif;font-size:2rem;font-weight:700;
        color:${isDanger?'var(--red2)':'var(--green2)'};">${esc(result)}</div>
    </div>
    <div style="font-size:.75rem;color:var(--text3)">Торкнись щоб закрити</div>`;
  document.body.appendChild(overlay);
  overlay.onclick = () => overlay.remove();
}

function doRevealDon() {
  const sel = ge('na_don');
  if (!sel) return;
  const pid = sel.value;
  if (!pid) { toast('Вибери гравця'); return; }
  S.na.donCheck    = pid;
  S.na.donRevealed = true;
  saveStorage();
  refreshNightHint();
  const p = S.players.find(x => x.id === pid);

  const donPlayer = aliveOfRole('don')[0];
  if (donPlayer && isPlayerBlocked(donPlayer.id)) {
    addLog('check', `👑 Дон заблокований Коханкою - перевірка не відбулась.`);
    const el = ge('donResult');
    if (el) { el.style.display = 'inline-block'; el.className = 'action-result miss'; el.textContent = 'Заблоковано'; }
    showCheckCard('👑', 'Перевірка Дона', p?.name || '-', 'ЗАБЛОКОВАНО', false);
    return;
  }

  const isSheriff = p?.role === 'sheriff';
  const el        = ge('donResult');
  if (el) {
    el.style.display = 'inline-block';
    el.className     = `action-result ${isSheriff ? 'civil' : 'miss'}`;
    el.textContent   = isSheriff ? '⭐ Шериф!' : 'Не Шериф';
  }
  addLog('check', `👑 Дон перевірив ${p.name}: ${isSheriff ? '⭐ ЦЕ ШЕРИФ!' : 'не Шериф'}`);
  showCheckCard('👑', 'Перевірка Дона', p.name, isSheriff ? 'ШЕРИФ' : 'НЕ ШЕРИФ', isSheriff);
}

// Шериф: перевіряє чи є гравець мафією
// Єдина точка розрахунку результату перевірки Шерифа - використовується
// і одразу при перевірці (doRevealSheriff), і при відновленні стану після
// перерендеру/F5, щоб логіка не розходилась між двома місцями.
function sheriffCheckResult(p, lawyerProtects) {
  const mode = S.settings.sheriffMode;
  let isThreat, resultLabel, resultClass, cardText;
  if (lawyerProtects) {
    isThreat = false; resultLabel = mode === 'mafia' ? '🔴 Мирний' : '🟢 Свій';
    resultClass = 'civil'; cardText = 'МИРНИЙ';
  } else if (mode === 'mafia') {
    isThreat = ['mafia', 'don'].includes(p?.role);
    resultLabel = isThreat ? '⚫ Мафія!' : '🔴 Мирний'; resultClass = isThreat ? 'mafia' : 'civil';
    cardText = isThreat ? 'МАФІЯ' : 'МИРНИЙ';
  } else {
    isThreat = ['mafia', 'don', 'maniac'].includes(p?.role);
    resultLabel = isThreat ? '⚠️ Ворог!' : '🟢 Свій'; resultClass = isThreat ? 'mafia' : 'civil';
    cardText = isThreat ? 'ВОРОГ' : 'СВІЙ';
  }
  if (!lawyerProtects && p?.role === 'suicide') {
    if (S.settings.suicideCheckResult === 'black') {
      isThreat = true; resultLabel = mode === 'mafia' ? '⚫ Мафія!' : '⚠️ Ворог!';
      resultClass = 'mafia'; cardText = mode === 'mafia' ? 'МАФІЯ' : 'ВОРОГ';
    } else if (S.settings.suicideCheckResult === 'special') {
      isThreat = false; resultLabel = '🎭 Особливий статус'; resultClass = 'civil'; cardText = 'ОСОБЛИВИЙ СТАТУС';
    }
  }
  if (!lawyerProtects && S.settings.roleVisibility === 'exact' && p) {
    const rd2 = roleDef(p.role);
    isThreat = isMafiaTeam(p.role);
    resultLabel = `${rd2.emoji} ${rd2.label}`;
    resultClass = isThreat ? 'mafia' : 'civil';
    cardText = rd2.label.toUpperCase();
  }
  return { isThreat, resultLabel, resultClass, cardText };
}

function doRevealSheriff() {
  const sel = ge('na_sheriff');
  if (!sel) return;
  const pid = sel.value;
  if (!pid) { toast('Вибери гравця'); return; }
  S.na.sheriffCheck    = pid;
  S.na.sheriffRevealed = true;
  saveStorage();
  refreshNightHint();
  const p = S.players.find(x => x.id === pid);

  // Шериф заблокований Коханкою - перевірка не спрацьовує
  const sheriffPlayer = aliveOfRole('sheriff')[0];
  if (sheriffPlayer && isPlayerBlocked(sheriffPlayer.id)) {
    addLog('check', `⭐ Шериф заблокований Коханкою - перевірка не відбулась.`);
    const el = ge('sheriffResult');
    if (el) { el.style.display = 'inline-block'; el.className = 'action-result miss'; el.textContent = 'Заблоковано'; }
    showCheckCard('⭐', 'Перевірка Шерифа', p?.name || '-', 'ЗАБЛОКОВАНО', false);
    return;
  }

  // Адвокат захистив - показуємо як мирного
  const lawyerProtects = S.na.lawyerProtected === pid && ['mafia','don'].includes(p?.role);
  if (lawyerProtects) addLog('check', `⚖️ Адвокат захистив ${p.name} - Шериф бачить «мирний».`);

  const { isThreat, resultLabel, resultClass, cardText } = sheriffCheckResult(p, lawyerProtects);
  const el = ge('sheriffResult');
  if (el) {
    el.style.display = 'inline-block';
    el.className     = `action-result ${resultClass}`;
    el.textContent   = resultLabel;
  }
  addLog('check', `⭐ Шериф перевірив ${p.name}: ${resultLabel}`);
  showCheckCard('⭐', 'Перевірка Шерифа', p.name, cardText, isThreat);
}


// Свідок: бачить хто приходив до вибраного гравця
function doRevealWitness() {
  const sel = ge('na_witness');
  if (!sel || !sel.value) { toast('Вибери гравця для стеження'); return; }
  const pid = sel.value;
  S.na.witnessTarget = pid;
  S.na.witnessRevealed = true;
  saveStorage();
  refreshNightHint();
  const target = S.players.find(x => x.id === pid);

  const witnessPlayer = aliveOfRole('witness')[0];
  if (witnessPlayer && isPlayerBlocked(witnessPlayer.id)) {
    addLog('check', `👁️ Свідок заблокований Коханкою - спостереження скасовано.`);
    const el = ge('witnessResult');
    if (el) { el.style.display = 'inline-block'; el.className = 'action-result miss'; el.textContent = 'Заблоковано'; }
    showCheckCard('👁️', 'Звіт Свідка', target?.name || '-', 'ЗАБЛОКОВАНО', false);
    return;
  }

  // Хто прийшов до цього гравця тієї ночі - Свідок бачить ІМ'Я того,
  // хто приходив, а не його роль (інакше це миттєво розкривало б
  // команду/роль гостя - сенс Свідка саме в тому, щоб довелось
  // самостійно вгадувати хто це був). Рахуємо лише тих, чия власна
  // дія не була сама заблокована Коханкою.
  const visitors = [];
  const mafiaActors = S.players.filter(p => ['mafia','don'].includes(p.role) && p.status === 'alive' && !isPlayerBlocked(p.id));
  if (mafiaActors.length && S.na.mafiaTarget === pid) {
    const randomMafia = mafiaActors[Math.floor(Math.random() * mafiaActors.length)];
    visitors.push(randomMafia.name);
  }
  const maniacP = aliveOfRole('maniac')[0];
  if (maniacP && !isPlayerBlocked(maniacP.id) && S.na.maniacTarget === pid) visitors.push(maniacP.name);
  const loverP = aliveOfRole('lover')[0];
  if (loverP && S.na.loverTarget === pid) visitors.push(loverP.name);
  const doctorP = aliveOfRole('doctor')[0];
  if (doctorP && !isPlayerBlocked(doctorP.id) && S.na.doctorSave === pid) visitors.push(doctorP.name);
  const lawyerP = aliveOfRole('lawyer')[0];
  if (lawyerP && !isPlayerBlocked(lawyerP.id) && S.na.lawyerTarget === pid) visitors.push(lawyerP.name);

  const result = visitors.length ? visitors.join(', ') : 'Ніхто не приходив';
  const el = ge('witnessResult');
  if (el) { el.style.display='inline-block'; el.className=`action-result ${visitors.length?'mafia':'civil'}`; el.textContent=result; }
  addLog('check', `👁️ Свідок стежив за ${target.name}: ${result}`);
  showCheckCard('👁️', 'Звіт Свідка', target.name, visitors.length ? visitors.join(', ') : 'ЧИСТО', visitors.length > 0);
}

// ── РОЗВ'ЯЗАННЯ НОЧІ ──────────────────────────────────────
// ПРИМІТКА: блокування Коханки (S.na.blocked), захист Адвоката
// (S.na.lawyerProtected) та обмеження Лікаря вже застосовані й
// залоговані одразу під час вибору цілей (див. onNaLover/onNaLawyer/
// onNaDoctor вище) - тут лише фіксується ФІНАЛЬНИЙ результат ночі
// (хто помирає), що рахується "з нуля" на момент натискання кнопки,
// тож коректний навіть якщо ведучий вносив дані не строго по порядку.
function resolveNight() {
  // Зчитуємо всі селекти в S.na (про випадок якщо onchange не встиг)
  const selMap = {
    mafiaTarget: 'na_mafia', maniacTarget: 'na_maniac',
    loverTarget: 'na_lover', lawyerTarget: 'na_lawyer',
    donCheck: 'na_don', sheriffCheck: 'na_sheriff',
    doctorSave: 'na_doctor', witnessTarget: 'na_witness',
  };
  Object.entries(selMap).forEach(([key, id]) => {
    const s = ge(id);
    if (s) S.na[key] = s.value;
  });

  const na   = S.na;
  const find = id => S.players.find(x => x.id === id);

  // 🔫 МАФІЯ
  const aliveMafia       = S.players.filter(p => ['mafia','don'].includes(p.role) && p.status === 'alive');
  const allMafiaBlocked  = isMafiaShotBlocked(aliveMafia);
  let mafiaKillId = null;
  if (aliveMafia.length === 0) {
    addLog('night', `🔫 Мафія: в живих не залишилось - постріл пропущено.`);
  } else if (!allMafiaBlocked && na.mafiaTarget) {
    mafiaKillId = na.mafiaTarget;
  } else if (!allMafiaBlocked && !na.mafiaTarget) {
    addLog('night', `🔫 Мафія: ціль не обрана - промах.`);
  }
  // (якщо allMafiaBlocked - попередження вже залоговане одразу при виборі цілі)

  // 🔪 МАНІЯК
  const maniacPlayer = aliveOfRole('maniac')[0];
  const maniacKillId = (na.maniacTarget && !(maniacPlayer && isPlayerBlocked(maniacPlayer.id)))
    ? na.maniacTarget : null;

  // 🩺 ЛІКАР - фіксуємо обмеження саме зараз (раніше це робилось тут же,
  // лишаємо тут, бо це є остаточне закріплення "використано")
  const docPlayer        = aliveOfRole('doctor')[0] || null;
  const doctorIsBlocked  = docPlayer && isPlayerBlocked(docPlayer.id);
  const doctorReason     = doctorRestrictionReason(na.doctorSave, docPlayer);
  let doctorActive = false, doctorSaveId = null;
  if (!doctorIsBlocked && na.doctorSave && !doctorReason) {
    doctorActive = true;
    doctorSaveId = na.doctorSave;
    if (docPlayer && na.doctorSave === docPlayer.id) S.doctorSelfUsed = true;
    S.doctorLastSaved = na.doctorSave;
  }
  let doctorSaveConsumed = false; // для doctorPower==='single' - рятує лише від ОДНОГО нападу

  // 🛡️ ІМУНІТЕТ ПЕРШОЇ НОЧІ - застосовується саме до першої бойової
  // ночі (Ніч 0 - без дій, тож "перша ніч" - це перша ніч з можливими
  // вбивствами; nightsPlayed вже інкрементовано на момент входу в ніч).
  const isFirstCombatNight = S.stats.nightsPlayed === 1;
  const immuneIds = (S.settings.firstNightImmunity && isFirstCombatNight)
    ? (S.settings.immunePlayerIds || []) : [];

  // ── Розв'язання: хто вмирає? ──
  const nightDeaths = [];

  if (mafiaKillId) {
    const t = find(mafiaKillId);
    if (immuneIds.includes(mafiaKillId)) {
      addLog('save', `🛡️ ${t?.name} мав імунітет першої ночі - постріл мафії не подіяв.`);
    } else if (doctorActive && doctorSaveId === mafiaKillId && (S.settings.doctorPower === 'full' || !doctorSaveConsumed)) {
      addLog('save', `🩺 Лікар врятував ${t?.name} від пострілу мафії!`);
      doctorSaveConsumed = true;
    } else if (t && t.status === 'alive') {
      nightDeaths.push({ id: mafiaKillId, by: 'mafia' });
    }
  }

  if (maniacKillId) {
    const t = find(maniacKillId);
    const alreadyDead = nightDeaths.some(d => d.id === maniacKillId);
    if (immuneIds.includes(maniacKillId) && !alreadyDead) {
      addLog('save', `🛡️ ${t?.name} мав імунітет першої ночі - напад Маніяка не подіяв.`);
    } else if (doctorActive && doctorSaveId === maniacKillId && (S.settings.doctorPower === 'full' || !doctorSaveConsumed) && !alreadyDead) {
      addLog('save', `🩺 Лікар врятував ${t?.name} від Маніяка!`);
      doctorSaveConsumed = true;
    } else if (t && t.status === 'alive' && !alreadyDead) {
      nightDeaths.push({ id: maniacKillId, by: 'maniac' });
    } else if (alreadyDead) {
      addLog('night', `🔪 Маніяк також атакував ${t?.name} - подвійний удар.`);
    }
  }

  // 💋 СЕРЦЕВИЙ НАПАД КОХАНКИ - взаємна смерть Коханки і її цілі цієї
  // ночі, якщо одну з цих двох осіб вбили вночі мафія/маніяк.
  if (S.settings.loverHeartAttack && na.loverTarget) {
    const loverP = aliveOfRole('lover')[0];
    if (loverP) {
      const loverDied  = nightDeaths.some(d => d.id === loverP.id);
      const targetDied = nightDeaths.some(d => d.id === na.loverTarget);
      if (loverDied && !targetDied && na.loverTarget !== loverP.id && find(na.loverTarget)?.status === 'alive') {
        nightDeaths.push({ id: na.loverTarget, by: 'heartattack' });
      } else if (targetDied && !loverDied && na.loverTarget !== loverP.id && loverP.status === 'alive') {
        nightDeaths.push({ id: loverP.id, by: 'heartattack' });
      }
    }
  }

  // Застосовуємо смерті через централізовану функцію (статус/статистика/
  // лог - одразу), але саму картку розкриття ролі НЕ показуємо тут:
  // вона має з'явитись лише ПІСЛЯ того, як ведучий проклацає екран
  // "настав день", а не одразу при натисканні "Завершити ніч".
  const pendingReveals = [];
  nightDeaths.forEach(({ id, by }) => {
    const p = find(id);
    if (!p || p.status !== 'alive') return;
    const reason = by === 'maniac' ? 'вбитий маніяком вночі'
      : by === 'heartattack' ? 'помер від серцевого нападу'
      : 'вбитий мафією вночі';
    const killedByLabel = by === 'maniac' ? 'вбитий Маніяком'
      : by === 'heartattack' ? 'помер від серцевого нападу через Коханку'
      : 'вбитий мафією';
    eliminatePlayer(id, {
      status:    'dead',
      reason,
      logType:   'kill',
      logText:   `💀 ${p.name} (${roleName(p.role)}) ${killedByLabel}.`,
      revealNow: false,
    });
    pendingReveals.push({ p, reason });
  });

  // ── Підготовка переходу до дня ──
  const firstKillId      = nightDeaths[0]?.id || null;
  const safe              = nightDeaths.length === 0;
  const doctorSavedMafia  = mafiaKillId && doctorActive && doctorSaveId === mafiaKillId;
  const isFirstKill       = firstKillId && S.stats.nightsPlayed === 1 && !S.firstKillUsed && S.settings.bestMove;
  if (isFirstKill) S.firstKillUsed = true;

  S.na = freshNightActions();
  doTransitionToDay({
    safe:        safe && !doctorSavedMafia,
    doctorSaved: !!doctorSavedMafia,
    killedId:    firstKillId,
    pendingReveals,
    extraKilled: nightDeaths.slice(1).map(d => d.id),
    bestMove:    !!isFirstKill,
  });
}


// ── ПЕРЕХОДИ МІЖ ФАЗАМИ ───────────────────────────────────
function doTransitionToDay({
  safe = false, night0 = false,
  doctorSaved = false, savedName = '',
  killedId = null, extraKilled = [], bestMove = false,
  pendingReveals = [],
} = {}) {
  const overlay = ge('dayOverlay');
  const iconEl  = ge('dayOverlayIcon');
  const resEl   = ge('dayOverlayResult');

  let resClass = 'safe', resHTML = '';
  if (night0) {
    iconEl.textContent = '☀️';
    resHTML = `<div style="color:var(--green2);font-weight:700">Місто прокидається</div>
               <div style="color:var(--text2);font-size:.82rem;margin-top:.2rem">День 1 - почніть обговорення</div>`;
  } else if (doctorSaved && !killedId) {
    iconEl.textContent = '💚';
    resHTML = `<div style="color:var(--green2);font-weight:700">💚 Лікар врятував гравця!</div>
               <div style="color:var(--text2);font-size:.82rem;margin-top:.2rem">Ніхто не загинув цієї ночі</div>`;
  } else if (safe) {
    iconEl.textContent = '☀️';
    resHTML = `<div style="color:var(--green2);font-weight:700">Місто спокійне</div>
               <div style="color:var(--text2);font-size:.82rem;margin-top:.2rem">Ніхто не загинув цієї ночі</div>`;
  } else if (killedId) {
    resClass = 'killed';
    iconEl.textContent = '💀';
    const allDead = [killedId, ...extraKilled];
    resHTML = allDead.map(id => {
      const kp = S.players.find(x => x.id === id);
      return `<div style="color:var(--red2);font-weight:700">Вбитий: №${S.players.indexOf(kp)+1} ${esc(kp?.name)}</div>`;
    }).join('');
    if (bestMove) resHTML += `<div style="color:var(--accent);font-size:.78rem;margin-top:.25rem">⭐ Право на "Кращий хід" - 20с</div>`;
  }
  resEl.className = `t-overlay-result ${resClass}`;
  resEl.innerHTML = resHTML;
  overlay.style.display = 'flex';

  const dayNumber = S.round === 0 ? 1 : S.round + 1;

  overlay.onclick = () => {
    overlay.onclick       = null;
    overlay.style.display = 'none';
    S.phase          = 'day';
    S.round          = dayNumber;
    S.stats.daysPlayed++;
    S.currentSpeaker = '';
    stopTimer();
    S.voteCandidates = [];
    S.voteRevote = false;
    S.dayVoteConcluded = false;
    renderGame();
    addLog('day', `☀️ День ${S.round} розпочато.`);
    // Картки розкриття ролі вбитих вночі - показуємо ТІЛЬКИ зараз,
    // після того як ведучий проклацав екран "настав день" (не до нього).
    if (S.settings.revealRole) {
      pendingReveals.forEach(({ p, reason }) => showRoleRevealOverlay(p, reason));
    }
    if (bestMove && killedId) setTimeout(() => showBestMoveModal(killedId), 400);
    checkWin();
  };
}

function doTransitionToNight() {
  const nextRound = S.round; // ніч N іде після дня N і має той самий номер
  const overlay   = ge('nightOverlay');
  ge('nightOverlayText').textContent = `НІЧ ${nextRound}`;
  overlay.style.display = 'flex';
  overlay.onclick = () => {
    overlay.onclick       = null;
    overlay.style.display = 'none';
    S.phase          = 'night';
    S.round          = nextRound;
    S.stats.nightsPlayed++;
    S.currentSpeaker = '';
    stopTimer();
    S.voteCandidates = [];
    S.voteRevote = false;
    S.dayVoteConcluded = false;
    S.na = freshNightActions();
    S.doctorLastSaved = null;
    renderGame();
    addLog('night', `🌙 Ніч ${S.round} - місто засинає.`);
  };
}

// ── КРАЩИЙ ХІД ────────────────────────────────────────────
function showBestMoveModal(killedId) {
  const kp = S.players.find(x => x.id === killedId);
  if (!kp) return;
  const candidates = S.players.filter(p => p.id !== killedId && p.status === 'alive');
  showModal(
    `⭐ Кращий хід - ${esc(kp.name)}`,
    `<div style="font-size:.84rem;color:var(--text2);margin-bottom:.7rem">
       Вбитий у першу бойову ніч. 20 секунд - назвати 3 гравців, яких вважає мафією.
     </div>
     <div id="bmBoxes" style="display:flex;flex-direction:column;gap:.35rem">
       ${candidates.map(p => `
         <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;cursor:pointer;padding:.2rem 0">
           <input type="checkbox" value="${p.id}" onchange="bmCount()">
           №${S.players.indexOf(p) + 1} ${esc(p.name)}
         </label>`).join('')}
     </div>
     <div style="margin-top:.5rem;font-size:.78rem;color:var(--accent)" id="bmCountEl">Вибрано: 0/3</div>`,
    [
      {
        label: 'Прийняти', cls: 'btn-success',
        action: () => {
          const checked = [...document.querySelectorAll('#bmBoxes input:checked')];
          const names   = checked.map(cb => {
            const p = S.players.find(x => x.id === cb.value);
            return p ? `${S.players.indexOf(p) + 1}. ${p.name}` : '';
          });
          addLog('check', `⭐ Кращий хід від ${kp.name}: [${names.join(', ') || '-'}]`);
          closeModal();
        },
      },
      { label: 'Пропустити', cls: 'btn-ghost', action: closeModal },
    ]
  );
  startTimer(20);
}

function bmCount() {
  const checked = document.querySelectorAll('#bmBoxes input:checked');
  if (checked.length > 3) { event.target.checked = false; return; }
  const el = ge('bmCountEl');
  if (el) el.textContent = `Вибрано: ${checked.length}/3`;
}

// 💡 Покроковий гід ведучому на голосуванні
function dayHintHTML() {
  if (!S.settings.hints) return '';
  let tip;
  if (S.dayVoteConcluded) {
    tip = 'Голосування цього дня завершено. Переходьте до ночі - кнопка вгорі «Ніч ' + S.round + '».';
  } else if (S.currentSpeaker) {
    const p = S.players.find(x => x.id === S.currentSpeaker);
    tip = `Зараз говорить <strong>${p ? '№' + (S.players.indexOf(p) + 1) + ' ' + esc(p.name) : '-'}</strong>. Коли закінчить - натисни 🎤 ще раз (або передай слово наступному).`;
  } else if (S.voteCandidates.length === 0) {
    tip = 'Дай слово гравцям по черзі (🎤 на картці кожного). Після обговорення виставляй підозрюваних на голосування - ✋ на картці гравця.';
  } else if (S.voteCandidates.every(c => c.votes === 0)) {
    tip = 'Проведи голосування: піднятими руками порахуй голоси за кожного кандидата і внеси число кнопками − / +.';
  } else {
    tip = 'Коли проголосували всі присутні гравці - натисни «Вирок». Одноосібний лідер вибуває одразу; при нічиї почнеться переголосування серед лідерів.';
  }
  return `<div class="hint-banner">💡 ${tip}</div>`;
}

// ── ГОЛОСУВАННЯ ───────────────────────────────────────────
function renderDayVoting() {
  const el = ge('dayVotingSection');
  if (S.phase !== 'day') { el.innerHTML = ''; return; }

  const maxV     = S.voteCandidates.length
    ? Math.max(...S.voteCandidates.map(c => c.votes))
    : 0;

  const candidatesHTML = S.voteCandidates.length === 0
    ? `<div style="font-size:.8rem;color:var(--text3);text-align:center;padding:.4rem">
         Виставте кандидатів - натисніть ✋ на картці гравця
       </div>`
    : S.voteCandidates.map(c => {
        const p    = S.players.find(x => x.id === c.id);
        const lead = c.votes === maxV && maxV > 0;
        return `
          <div class="vc-row${lead ? ' leading' : ''}">
            <div class="vc-name">№${S.players.indexOf(p) + 1} ${esc(p?.name)}</div>
            <div class="vc-votes">
              <button class="vote-adj" onclick="adjVote('${c.id}',-1)">−</button>
              <span class="vote-count-display">${c.votes}</span>
              <button class="vote-adj" onclick="adjVote('${c.id}',1)">+</button>
            </div>
            <button class="vc-elim" onclick="elimByVote('${c.id}')">Вигнати</button>
            <button class="vc-rm"   onclick="removeVoteCand('${c.id}')">✕</button>
          </div>`;
      }).join('');

  el.innerHTML = `
    <div class="voting-panel">
      <div class="voting-title"><i class="fas fa-vote-yea"></i> Голосування </div>
      ${dayHintHTML()}
      ${candidatesHTML}
      <div class="vote-add-row" style="margin-top:.5rem">
        ${S.voteCandidates.length > 0
          ? `<button class="btn-danger btn-sm" onclick="announceResult()"><i class="fas fa-gavel"></i> Вирок</button>`
          : ''}
      </div>
    </div>`;
}

function adjVote(pid, delta) {
  const c = S.voteCandidates.find(x => x.id === pid);
  if (!c) return;
  c.votes = Math.max(0, c.votes + delta);
  saveStorage();
  renderDayVoting();
}

function removeVoteCand(pid) {
  S.voteCandidates = S.voteCandidates.filter(c => c.id !== pid);
  renderPlayersGrid();
  renderDayVoting();
  saveStorage();
}

function elimByVote(pid) {
  const p = S.players.find(x => x.id === pid);
  if (!p) return;
  showConfirm(`Вигнати ${p.name} голосуванням?`, () => {
    S.voteCandidates = [];
    S.voteRevote = false;
    S.dayVoteConcluded = true;
    eliminatePlayer(pid, {
      status:  'eliminated',
      reason:  'вигнаний голосуванням',
      logType: 'elim',
      logText: `🚫 ${p.name} (${roleName(p.role)}) вигнаний голосуванням.`,
    });
    renderGame();
    checkWin();
  });
}

function announceResult() {
  if (!S.voteCandidates.length) return;
  const maxV    = Math.max(...S.voteCandidates.map(c => c.votes));
  const leaders = S.voteCandidates.filter(c => c.votes === maxV);

  if (leaders.length === 1) {
    elimByVote(leaders[0].id);
    return;
  }

  const names = leaders.map(l => S.players.find(x => x.id === l.id)?.name).filter(Boolean).join(', ');

  if (S.voteRevote) {
    // Нічия й після переголосування - цього дня нікого не виганяють.
    addLog('vote', `📊 Повторна нічия між: ${names} (по ${maxV} гол.) - цього дня нікого не вигнано.`);
    toast(`Повторна нічия! Нікого не вигнано.`);
    S.voteCandidates = [];
    S.voteRevote     = false;
    S.dayVoteConcluded = true;
    renderPlayersGrid();
    renderDayVoting();
    return;
  }

  // Перша нічия - лишаємо тільки тих, хто в нічиї, обнуляємо голоси, переголосування.
  S.voteCandidates = leaders.map(l => ({ id: l.id, votes: 0 }));
  S.voteRevote     = true;
  addLog('vote', `📊 Нічия між: ${names} (по ${maxV} гол.) - переголосування!`);
  toast(`Нічия! Переголосування: ${names}`);
  renderPlayersGrid();
  renderDayVoting();
}

// ── ПАНЕЛЬ ФАЗ ────────────────────────────────────────────
function updatePhaseBar() {
  const bar   = ge('phaseBar');
  const title = ge('phaseTitle');
  const lbl   = ge('nextPhaseLabel');
  const btn   = ge('nextPhaseBtn');
  if (S.phase === 'night') {
    bar.className   = 'phase-bar night';
    title.className = 'phase-title night';
    title.innerHTML = `<i class="fas fa-moon"></i> Ніч ${S.round}`;
    lbl.textContent = `День ${S.round + 1}`;
    btn.disabled    = true;
    btn.title       = 'Завершіть ніч кнопкою в панелі дій нижче';
  } else {
    bar.className   = 'phase-bar day';
    title.className = 'phase-title day';
    title.innerHTML = `<i class="fas fa-sun"></i> День ${S.round}`;
    lbl.textContent = `Ніч ${S.round}`;
    btn.disabled    = false;
    btn.title       = '';
  }
}

// ── ТАЙМЕР ────────────────────────────────────────────────
function startTimer(secs, onEnd = null) {
  clearInterval(S.timer._iv);
  S.timer._iv     = null;
  S.timer.secs    = secs;
  S.timer.running = true;
  S.timer.onEnd   = onEnd;
  updateTimerDisplay();
  ge('timerStartBtn').innerHTML = '<i class="fas fa-pause"></i>';
  ge('timerStartBtn').classList.add('active');
  S.timer._iv = setInterval(() => {
    if (S.timer.secs <= 0) { finishTimer(); return; }
    S.timer.secs--;
    updateTimerDisplay();
    if (S.timer.secs <= 0) finishTimer();
  }, 1000);
  saveStorage();
}

// Природне завершення (досягнення нуля) - ГАРАНТОВАНО очищає
// стан (зокрема onEnd) ПЕРЕД викликом callback, щоб підсвітка
// мікрофона не могла залишитись "завислою" після пауза→продовжити→0.
function finishTimer() {
  const cb = S.timer.onEnd;
  clearInterval(S.timer._iv);
  S.timer._iv     = null;
  S.timer.running = false;
  S.timer.onEnd   = null;
  ge('timerStartBtn').innerHTML = '<i class="fas fa-play"></i>';
  ge('timerStartBtn').classList.remove('active');
  updateTimerDisplay();
  saveStorage();
  if (cb) cb();
}

// Пауза вручну (кнопка ▶️/⏸ або зняття підсвітки мікрофона) -
// ЗБЕРІГАЄ onEnd, щоб toggleTimer() міг коректно продовжити з того
// самого callback'у (раніше onEnd просто не існував у стані і
// губився при кожній паузі/продовженні).
function stopTimer() {
  clearInterval(S.timer._iv);
  S.timer._iv     = null;
  S.timer.running = false;
  ge('timerStartBtn').innerHTML = '<i class="fas fa-play"></i>';
  ge('timerStartBtn').classList.remove('active');
  updateTimerDisplay();
  saveStorage();
}

function toggleTimer() {
  S.timer.running ? stopTimer() : startTimer(S.timer.secs, S.timer.onEnd);
}

function resetTimer() {
  stopTimer();
  S.timer.secs  = 60;
  S.timer.onEnd = null;
  if (S.currentSpeaker) {
    S.currentSpeaker = '';
    renderPlayersGrid();
  }
  updateTimerDisplay();
  saveStorage();
}

function updateTimerDisplay() {
  const s   = S.timer.secs;
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  const el  = ge('timerDisplay');
  el.textContent = `${m}:${String(sec).padStart(2, '0')}`;
  el.className   = 'timer-display' +
    (s <= 10 && S.timer.running ? ' urgent' : S.timer.running ? '' : ' stopped');
}

// ── УМОВА ПЕРЕМОГИ ────────────────────────────────────────
function checkWin() {
  const alive    = S.players.filter(p => p.status === 'alive');
  const dead     = S.players.filter(p => p.status !== 'alive');
  const n        = alive.length;

  // ── Повне взаємне знищення - живих не залишилось ──
  if (n === 0 && S.players.length > 0) {
    const had = id => S.players.some(p => p.role === id);
    if (S.settings.mutualDestruction === 'civil') {
      showEndSpecial('civil', { name: 'Місто' });
    } else if (S.settings.mutualDestruction === 'dark') {
      const darkWinner = !had('maniac') ? 'mafia' : !had('mafia') ? 'maniac' : S.settings.finalMafiaVsManiac;
      if (darkWinner === 'draw') { showEndSpecial('draw', { name: 'Нічия' }); }
      else showEndSpecial(darkWinner, { name: darkWinner === 'mafia' ? 'Мафія' : 'Маніяк' });
    } else {
      showEndSpecial('draw', { name: 'Нічия' });
    }
    return;
  }

  const mafiaAlive   = alive.filter(p => isMafiaTeam(p.role));
  const maniacAlive  = alive.filter(p => p.role === 'maniac');
  // "Мирна сторона" для умов перемоги = всі хто не мафія і не маніяк
  // (включає mирних, шерифа, лікаря, коханку, свідка, самогубця тощо).
  // Раніше використовувався лише isCivilTeam() - самогубець (team:'neutral')
  // не потрапляв у цей лічильник, і при ситуації мафія+маніяк+самогубець
  // civilCount=0 хибно тригерив перемогу мафії хоча вдень ще можна голосувати.
  const civilAlive   = alive.filter(p => !isMafiaTeam(p.role) && p.role !== 'maniac');

  const mafiaCount  = mafiaAlive.length;
  const maniacCount = maniacAlive.length;
  const civilCount  = civilAlive.length;

  // ── Самогубець - перемагає якщо вигнаний голосуванням ──
  if (!S.suicideWon) {
    const suicideWon = dead.find(p => p.role === 'suicide' && p.status === 'eliminated');
    if (suicideWon) {
      S.suicideWon = true;
      addLog('info', `🎭 ${suicideWon.name} (Самогубець) переміг - його вигнали голосуванням! Гра триває.`);
      toast(`🎭 ${suicideWon.name} переміг як Самогубець!`);
      saveStorage();
      // ☠️ Помста Самогубці - забирає з собою ще одного гравця
      if (S.settings.suicideRevenge) {
        setTimeout(() => showSuicideRevengeModal(), 350);
      }
      // Гра НЕ завершується - продовжуємо
    }
  }

  // ── Маніяк - перемагає якщо залишився один або 1 на 1 з мирним
  // (без мафії і без інших нейтралів - якщо живий самогубець, то
  // ситуація ще не вирішена, може він буде вигнаний)
  if (maniacCount > 0 && mafiaCount === 0) {
    const pureAliveCount = maniacCount + civilCount; // без самогубця якщо він ще не переміг
    const suicideAlive = alive.filter(p => p.role === 'suicide').length;
    const effectiveN   = n - suicideAlive; // не рахуємо самогубця в умові маніяка
    if (suicideAlive === 0 && (n === 1 || (n === 2 && civilCount >= 1))) {
      showEndSpecial('maniac', maniacAlive[0]);
      return;
    }
  }

  // ── Фінал: Мафія проти Маніяка - мирних 0, обидві сторони живі ──
  // Раніше ця ситуація з maniacCount > mafiaCount просто "зависала"
  // без жодного автоматичного результату. Тепер керується налаштуванням.
  if (civilCount === 0 && mafiaCount > 0 && maniacCount > 0) {
    const finalWinner = S.settings.finalMafiaVsManiac;
    if (finalWinner === 'draw') { showEndSpecial('draw', { name: 'Нічия' }); return; }
    showEnd(finalWinner, mafiaCount, civilCount);
    return;
  }

  // ── Мафія перемагає ──
  // Без маніяка: класичне правило - мафія ≥ мирних (як і завжди було).
  // З маніяком живим: гра ще не вирішена просто по перевазі кількості,
  // бо маніяк - непередбачуваний "третій гравець" (може вбити саму
  // мафію, його можуть вигнати/вбити пізніше). Поки лишається бодай
  // один мирний - нічого автоматично не завершуємо. Лише коли мирних
  // вже 0 (їхня частина гри вирішена) і мафія матчиться з маніяком
  // (або переважає) - оголошуємо перемогу мафії.
  const mafiaCanWin = maniacCount === 0
    ? mafiaCount >= civilCount
    : (civilCount === 0 && mafiaCount >= maniacCount);
  if (mafiaCount > 0 && mafiaCanWin) {
    showEnd('mafia', mafiaCount, civilCount);
    return;
  }

  // ── Мирні перемагають - вся мафія і маніяк знищені ──
  if (mafiaCount === 0 && maniacCount === 0) {
    showEnd('civil', mafiaCount, civilCount);
    return;
  }
}

// ☠️ Помста Самогубці - після вигнання забирає ще одного гравця
function showSuicideRevengeModal() {
  const alive = S.players.filter(p => p.status === 'alive');
  if (!alive.length) return;
  const options = alive.map(p => `<option value="${p.id}">${S.players.indexOf(p)+1}. ${esc(p.name)}</option>`).join('');
  showModal(
    '🎭 Помста Самогубці',
    `<p style="font-size:.85rem;color:var(--text2);margin-bottom:.6rem">Самогубець забирає з собою ще одного гравця. Кого саме?</p>
     <select class="action-select" id="revengeSelect" style="width:100%">${options}</select>`,
    [
      { label: 'Підтвердити', cls: 'btn-danger', action: () => {
          const sel = ge('revengeSelect');
          const pid = sel?.value;
          closeModal();
          if (!pid) return;
          const p = S.players.find(x => x.id === pid);
          eliminatePlayer(pid, {
            status:  'eliminated',
            reason:  'забраний помстою Самогубця',
            logType: 'elim',
            logText: `🎭 ${p.name} (${roleName(p.role)}) забраний помстою Самогубця.`,
          });
          renderGame();
          checkWin();
        } },
      { label: 'Пропустити', cls: 'btn-ghost', action: closeModal },
    ]
  );
}

function showEndSpecial(type, player) {
  stopTimer();
  S.gameStarted = false;
  S.notes = '';
  S.lastWinner = type;
  clearGameStorage();
  history.replaceState({ screen: 'end' }, '', '#end');
  showScreen('end', false);
  const wd = winDisplay(type);
  ge('winBadge').textContent    = wd.badge;
  ge('winTitle').textContent    = wd.title;
  ge('winTitle').style.color    = wd.color;
  ge('winSubtitle').textContent = type === 'draw'
    ? 'Гру завершено без переможця.'
    : `${player.name} - ${wd.title.toLowerCase()}`;
  addLog('info', `🏁 Гру завершено. Переможець: ${wd.title}`);
  ge('winSummary').innerHTML = buildWinSummaryHTML(type);
}

function buildWinSummaryHTML(winner) {
  return `
    <div class="win-row"><span>Ночей зіграно</span><span>${S.stats.nightsPlayed}</span></div>
    <div class="win-row"><span>Вбито вночі</span><span>${S.stats.killed}</span></div>
    <div class="win-row"><span>Вигнано голосуванням</span><span>${S.stats.eliminated}</span></div>
    <div style="margin-top:.6rem">
      ${S.players.map(p => {
        const rd  = roleDef(p.role);
        const suicideWonHere = S.suicideWon && p.role === 'suicide' && p.status === 'eliminated';
        const won = suicideWonHere || isPlayerWinner(p, winner);
        const displayColor = suicideWonHere ? '#90a4ae' : rd?.color;
        return `<div class="win-row">
          <span style="${p.status !== 'alive' ? 'color:var(--text3)' : ''}">${rd?.emoji} ${esc(p.name)}</span>
          <span style="color:${displayColor}">${rd?.label} ${won ? '🏆' : ''}</span>
        </div>`;
      }).join('')}
    </div>`;
}

function showEnd(winner, mafiaCount, civCount) {
  stopTimer();
  S.gameStarted = false;
  S.notes = '';
  S.lastWinner = winner;
  clearGameStorage();
  history.replaceState({ screen: 'end' }, '', '#end');
  showScreen('end', false);
  const wd = winDisplay(winner);
  ge('winBadge').textContent    = wd.badge;
  ge('winTitle').textContent    = wd.title;
  ge('winTitle').style.color    = wd.color;
  const civil = winner === 'civil';
  ge('winSubtitle').textContent = civil
    ? 'Вся мафія знищена. Місто врятоване!'
    : winner === 'mafia'
      ? `Мафія ${mafiaCount} ≥ решти гравців. Місто захоплено.`
      : wd.subtitle + '.';
  addLog('info', `🏁 Гру завершено. Переможці: ${wd.title}`);
  ge('winSummary').innerHTML = buildWinSummaryHTML(winner);
}

// ── ЛОГ ПОДІЙ ────────────────────────────────────────────
function addLog(type, text) {
  const now = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  S.log.push({ type, text, time: now });
  saveStorage();
  renderLog();
}

function renderLog() {
  const el = ge('eventLog');
  if (!el) return;
  const labels = {
    night: 'НІЧ', day: 'ДЕНЬ', kill: 'ВБИТО', vote: 'ГОЛОС',
    save: 'ВРЯТОВАНО', check: 'ПЕРЕВІРКА', elim: 'ВИГНАНО', info: 'ІНФО',
  };
  el.innerHTML = [...S.log].reverse().map(e => `
    <div class="log-entry">
      <div class="log-time">${e.time}</div>
      <div class="log-text">
        <span class="log-tag ${e.type}">${labels[e.type] || e.type.toUpperCase()}</span>${esc(e.text)}
      </div>
    </div>`).join('');
}

// ── СТАТИСТИКА ────────────────────────────────────────────
function renderStats() {
  const alive = S.players.filter(p => p.status === 'alive');
  const mafA  = alive.filter(p => isMafiaTeam(p.role)).length;
  const civA  = alive.filter(p => isCivilTeam(p.role)).length;
  // Для відображення: при перемозі маніяка остання жертва теж показується
  // як вибула (маніяк її "добиває" своєю перемогою)
  const w = S.lastWinner;
  const effectiveDead = pid => {
    const p = S.players.find(x => x.id === pid);
    if (!p) return false;
    if (p.status !== 'alive') return true;
    if (w === 'maniac' && p.role !== 'maniac') return true;
    return false;
  };
  ge('statsTab').innerHTML = `
    <div class="stats-item"><span class="stats-label">Живих гравців</span><span class="stats-val">${alive.length}/${S.players.length}</span></div>
    <div class="stats-item"><span class="stats-label">🔫 Мафія жива</span><span class="stats-val" style="color:var(--red2)">${mafA}</span></div>
    <div class="stats-item"><span class="stats-label">🔴 Мирних живих</span><span class="stats-val" style="color:var(--green2)">${civA}</span></div>
    <div class="stats-item"><span class="stats-label">Ніч / День</span><span class="stats-val">Н${S.stats.nightsPlayed} / Д${S.stats.daysPlayed}</span></div>
    <div class="stats-item"><span class="stats-label">Вбито вночі</span><span class="stats-val">${S.stats.killed}</span></div>
    <div class="stats-item"><span class="stats-label">Вигнано</span><span class="stats-val">${S.stats.eliminated}</span></div>
    <div style="margin-top:.65rem">
      ${S.players.map(p => {
        const rd   = roleDef(p.role);
        const dead = effectiveDead(p.id);
        return `<div class="stats-item">
          <span class="stats-label" style="${dead ? 'text-decoration:line-through;color:var(--text3)' : ''}">
            №${S.players.indexOf(p) + 1} ${esc(p.name)}
          </span>
          <span class="stats-val" style="font-size:.7rem;color:${rd?.color}">
            ${rd?.emoji} ${p.exitIcon || (p.status === 'dead' ? '💀' : p.status === 'eliminated' ? '🚫' : dead ? '💀' : '')}${p.fols ? ` F${p.fols}` : ''}
          </span>
        </div>`;
      }).join('')}
    </div>`;
}

// ── МОДАЛЬНІ ВІКНА ────────────────────────────────────────
function showModal(title, body, actions) {
  ge('modalTitle').innerHTML  = title;
  ge('modalBody').innerHTML   = body;
  ge('modalActions').innerHTML = actions
    .map((a, i) => `<button class="${a.cls}" id="mact${i}">${a.label}</button>`)
    .join('');
  actions.forEach((a, i) => { ge(`mact${i}`).onclick = a.action; });
  ge('modalOverlay').style.display = 'flex';
}

function closeModal() {
  ge('modalOverlay').style.display = 'none';
}

function showConfirm(text, onYes) {
  showModal(
    'Підтвердження',
    `<p style="font-size:.9rem;color:var(--text2)">${esc(text)}</p>`,
    [
      { label: 'Так', cls: 'btn-danger', action: () => { closeModal(); onYes(); } },
      { label: 'Ні',  cls: 'btn-ghost',  action: closeModal },
    ]
  );
}

function toast(msg) {
  let t = ge('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText = [
      'position:fixed', 'bottom:1.2rem', 'left:50%', 'transform:translateX(-50%)',
      'background:var(--surface)', 'border:1px solid var(--border2)', 'color:var(--text)',
      'padding:.5rem 1.1rem', 'border-radius:var(--radius)', 'font-size:.82rem',
      'z-index:999', 'transition:opacity .3s', 'pointer-events:none', 'white-space:nowrap',
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ── СКРІНШОТ ──────────────────────────────────────────────
function saveScreenshot() {
  const W = 1080, H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const C = {
    bg:      '#0d0d0f',
    surface: '#161618',
    surf2:   '#1e1e21',
    border:  '#2e2e33',
    border2: '#3a3a40',
    text:    '#f0f0f2',
    text2:   '#a0a0aa',
    text3:   '#606068',
    accent:  '#c8973a',
    accent2: '#e8b050',
    red:     '#e85050',
    green:   '#45e085',
  };

  const winner = S.lastWinner;
  const wd     = winDisplay(winner);
  const PAD    = 64;

  // Колір акценту переможця для градієнту та підсвічування рядків
  const winColor = wd.color;

  // ── Фон ──
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, H * 0.55);
  grad.addColorStop(0, wd.grad);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Хелпер: rounded rect ──
  function rr(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  let curY = 60;

  // ── Назва ──
  ctx.font = 'bold 56px Arial';
  const w1 = ctx.measureText('МАФ').width;
  const w2 = ctx.measureText('ІЯ').width;
  const tx = (W - w1 - w2) / 2;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = C.accent;  ctx.fillText('МАФ', tx, curY);
  ctx.fillStyle = C.text2;   ctx.fillText('ІЯ', tx + w1, curY);
  curY += 70;

  ctx.strokeStyle = C.border2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, curY); ctx.lineTo(W - PAD, curY); ctx.stroke();
  curY += 50;

  // ── Badge + переможець ──
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '88px serif';
  ctx.fillText(wd.badge, W/2, curY);
  curY += 108;

  ctx.font      = 'bold 80px Arial';
  ctx.fillStyle = winColor;
  ctx.fillText(wd.shortTitle, W/2, curY);
  curY += 92;

  ctx.font      = '34px Arial';
  ctx.fillStyle = C.text2;
  ctx.fillText(wd.subtitle, W/2, curY);
  curY += 60;

  // ── Статистика - 3 плитки ──
  const sw  = (W - PAD * 2 - 32) / 3;
  const sh  = 108;
  const stats = [
    { label: 'Ночей зіграно', value: String(S.stats.nightsPlayed) },
    { label: 'Вбито вночі',   value: String(S.stats.killed) },
    { label: 'Вигнано',       value: String(S.stats.eliminated) },
  ];
  stats.forEach((s, i) => {
    const sx = PAD + i * (sw + 16);
    rr(sx, curY, sw, sh, 14, C.surf2, C.border);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold 56px Arial'; ctx.fillStyle = C.accent;
    ctx.fillText(s.value, sx + sw / 2, curY + 12);
    ctx.font = '24px Arial'; ctx.fillStyle = C.text3;
    ctx.fillText(s.label, sx + sw / 2, curY + 74);
  });
  curY += sh + 36;

  ctx.strokeStyle = C.border; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, curY); ctx.lineTo(W - PAD, curY); ctx.stroke();
  curY += 24;

  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = 'bold 26px Arial'; ctx.fillStyle = C.text3;
  ctx.fillText('ГРАВЦІ', PAD, curY);
  curY += 36;

  // ── Список гравців (1 або 2 колонки залежно від кількості) ──
  const useTwoCols = S.players.length > 10;
  const cols       = useTwoCols ? 2 : 1;
  const colGap     = 16;
  const colW       = useTwoCols ? (W - PAD * 2 - colGap) / 2 : W - PAD * 2;
  const rowH       = useTwoCols ? 52 : 70;
  const fontSize   = useTwoCols ? 20 : 26;
  const emojiSize  = useTwoCols ? 22 : 30;
  const nameSize   = useTwoCols ? 21 : 28;

  S.players.forEach((p, i) => {
    const rd    = roleDef(p.role);
    const suicideWonHere = S.suicideWon && p.role === 'suicide' && p.status === 'eliminated';
    const isWin = suicideWonHere || isPlayerWinner(p, winner);
    const isDead = p.status !== 'alive' || (winner === 'maniac' && !isWin);

    const col = useTwoCols ? i % cols : 0;
    const row = useTwoCols ? Math.floor(i / cols) : i;
    const rx  = PAD + col * (colW + colGap);
    const ry  = curY + row * rowH;

    // Колір рамки: самогубець-переможець → сірий, решта переможців → winColor, інші → border
    const borderColor = suicideWonHere ? '#90a4ae' : isWin ? winColor : C.border;
    rr(rx, ry + 2, colW, rowH - 6, 10, C.surf2, borderColor);

    ctx.globalAlpha = isDead ? 0.4 : 1;

    const midY = ry + rowH / 2;
    const numX = rx + (useTwoCols ? 14 : 20);
    const emojiX = rx + (useTwoCols ? 44 : 62);
    const nameX  = rx + (useTwoCols ? 76 : 112);

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `${fontSize}px Arial`; ctx.fillStyle = C.text3;
    ctx.fillText(String(i + 1), numX, midY);

    ctx.font = `${emojiSize}px serif`;
    ctx.fillText(rd?.emoji || '?', emojiX, midY - 2);

    ctx.font      = isDead ? `${nameSize}px Arial` : `bold ${nameSize}px Arial`;
    ctx.fillStyle = isDead ? C.text3 : C.text;
    ctx.fillText(p.name, nameX, midY);

    const roleX = isWin ? rx + colW - (useTwoCols ? 30 : 44) : rx + colW - (useTwoCols ? 10 : 20);
    ctx.textAlign = 'right';
    ctx.font      = `${fontSize}px Arial`;
    // Колір ролі: самогубець-переможець → сірий, інші → колір ролі
    ctx.fillStyle = suicideWonHere ? '#90a4ae' : rd?.color || C.text2;
    ctx.fillText(rd?.label || '-', roleX, midY);

    if (isWin) {
      ctx.globalAlpha = 1;
      ctx.font = `${useTwoCols ? 20 : 28}px serif`; ctx.textAlign = 'right';
      ctx.fillText('🏆', rx + colW - (useTwoCols ? 6 : 14), midY - 2);
    }

    ctx.globalAlpha = 1;
  });

  // ── Підпис ──
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = '26px Arial'; ctx.fillStyle = C.text3;
  ctx.fillText('Мафія - система ведучого', W / 2, H - 28);

  // ── Скачати ──
  const link    = document.createElement('a');
  link.href     = canvas.toDataURL('image/png');
  link.download = 'mafia-result.png';
  link.click();
  toast('Фото збережено ✓');
}

// ── ІНІЦІАЛІЗАЦІЯ ─────────────────────────────────────────

// Відновлює активну вкладку сайдбару
function restoreSidebarTab() {
  const tab = S.activeTab || 'log';
  document.querySelectorAll('.stab').forEach(x => x.classList.remove('active'));
  const btn = document.querySelector(`.stab[data-stab="${tab}"]`);
  if (btn) btn.classList.add('active');
  ge('logTab').style.display   = tab === 'log'   ? 'block' : 'none';
  ge('statsTab').style.display = tab === 'stats' ? 'block' : 'none';
  ge('notesTab').style.display = tab === 'notes' ? 'flex'  : 'none';
  if (tab === 'stats') renderStats();
}

// Відновлює правильний екран після F5 або повернення з history
function restoreScreen(screenName) {
  const screen = screenName || 'setup';
  if (screen === 'game') {
    showScreen('game', false);
    ge('notesArea').value = S.notes;
    renderGame();
    renderLog();
    restoreSidebarTab();
    if (S.timer.running && S.timer.secs > 0) {
      // onEnd (функція) не зберігається в localStorage - відновлюємо
      // той самий callback, якщо на момент збереження мовець був активний.
      const rebuiltOnEnd = S.currentSpeaker
        ? () => { S.currentSpeaker = ''; renderPlayersGrid(); }
        : null;
      startTimer(S.timer.secs, rebuiltOnEnd);
    } else {
      if (S.currentSpeaker) { S.currentSpeaker = ''; renderPlayersGrid(); }
      updateTimerDisplay();
    }
  } else if (screen === 'end') {
    clearGameStorage();
    initSetup();
  } else if (screen === 'intro') {
    showScreen('intro', false);
    renderIntroCard();
  } else {
    initSetup();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const hasSaved = loadStorage();

  const initialScreen = hasSaved ? S.screen : 'setup';
  history.replaceState({ screen: initialScreen }, '', '#' + initialScreen);

  if (hasSaved && initialScreen !== 'setup') {
    restoreScreen(initialScreen);
  } else {
    // Завжди скидаємо ролі і налаштування до дефолту на екрані setup
    S.roleCounts = { ...ROLE_COUNTS_DEFAULT };
    S.settings = { revealRole: true, bestMove: false, fols: true, sheriffMode: 'mafia', donOrder: 'before' };
    initSetup();
  }

  // popstate - кнопки «Назад» / «Вперед» браузера
  window.addEventListener('popstate', e => {
    const target = e.state?.screen || 'home';

    // З активної гри або карток - підтвердження, потім setup
    if (S.screen === 'game' || S.screen === 'intro') {
      showConfirm('Повернутись до налаштувань? Гра буде завершена.', () => {
        stopTimer();
        clearGameStorage();
        S.players = []; S.roleCounts = { ...ROLE_COUNTS_DEFAULT };
        S.notes = '';
        history.replaceState({ screen: 'setup' }, '', '#setup');
        initSetup();
      });
      history.pushState({ screen: S.screen }, '', '#' + S.screen);
      return;
    }

    // З екрану переможця - setup, чистимо все
    if (S.screen === 'end') {
      clearGameStorage();
      history.replaceState({ screen: 'setup' }, '', '#setup');
      initSetup();
      return;
    }

    restoreScreen(target);
  });

  // Home - тепер немає homeScreen в game.html, newGameBtn не існує тут

  // Nav лого - це <a href> посилання, але якщо гра активна - перехоплюємо
  ge('navLogo').addEventListener('click', e => {
    if (S.screen === 'game' || S.screen === 'intro') {
      e.preventDefault();
      showConfirm('Повернутись на головну? Гра буде завершена.', () => {
        stopTimer();
        clearGameStorage();
        S.notes = '';
        window.location.href = 'index.html';
      });
    } else if (S.screen === 'end') {
      clearGameStorage();
      // дозволяємо звичайний перехід
    }
  });
  // Setup
  ge('addPlayerBtn').onclick = addPlayer;
  ge('playerNameInput').addEventListener('keypress', e => { if (e.key === 'Enter') addPlayer(); });
  ge('startIntroBtn').onclick = startIntro;
  ge('saveRoomBtn').onclick   = saveRoom;

  document.querySelectorAll('.setup-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.setup-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ge('tabStart').style.display = t.dataset.tab === 'start' ? 'block' : 'none';
    ge('tabRooms').style.display = t.dataset.tab === 'rooms' ? 'block' : 'none';
  }));

  // Intro
  ge('roleCard').onclick          = flipIntroCard;
  ge('introNextBtn').onclick      = introNext;
  ge('introStartGameBtn').onclick = startGame;
  ge('introSkipBtn').onclick      = startGame;

  // Timer
  ge('timerStartBtn').onclick = toggleTimer;
  ge('timerReset').onclick    = resetTimer;
  ge('timerPlus').onclick  = () => { S.timer.secs = Math.min(600, S.timer.secs + 15); updateTimerDisplay(); };
  ge('timerMinus').onclick = () => { S.timer.secs = Math.max(0,   S.timer.secs - 15); updateTimerDisplay(); };

  // Phase transition button
  ge('nextPhaseBtn').onclick = () => {
    if (S.phase === 'night') {
      if (S.round === 0) endNight0();
      else               resolveNight();
    } else {
      doTransitionToNight();
    }
  };

  // End game
  ge('endGameBtn').onclick = () => {
    showConfirm('Завершити гру?', () => {
      stopTimer();
      const alive  = S.players.filter(p => p.status === 'alive');
      const mafA   = alive.filter(p => isMafiaTeam(p.role)).length;
      const civA   = alive.filter(p => isCivilTeam(p.role)).length;
      const manA   = alive.filter(p => p.role === 'maniac').length;
      // Те саме правило, що й в checkWin(): з живим маніяком мафія не
      // вважається автоматичним переможцем, поки лишається хоч один мирний.
      const mafiaWins = manA === 0 ? (mafA >= civA) : (civA === 0 && mafA >= manA);
      showEnd(mafA > 0 && mafiaWins ? 'mafia' : 'civil', mafA, civA);
    });
  };

  // Sidebar tabs
  document.querySelectorAll('.stab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    S.activeTab = t.dataset.stab;
    ge('logTab').style.display   = t.dataset.stab === 'log'   ? 'block' : 'none';
    ge('statsTab').style.display = t.dataset.stab === 'stats' ? 'block' : 'none';
    ge('notesTab').style.display = t.dataset.stab === 'notes' ? 'flex'  : 'none';
    if (t.dataset.stab === 'stats') renderStats();
    saveStorage();
  }));

  // Notes autosave
  ge('notesArea').addEventListener('input', e => { S.notes = e.target.value; saveStorage(); });

  // End screen
  ge('saveScreenshotBtn').onclick = saveScreenshot;

  ge('newGameAfterBtn').onclick = () => {
    clearGameStorage();
    S.players = []; S.roleCounts = { ...ROLE_COUNTS_DEFAULT }; S.notes = '';
    initSetup();
  };

  // Закриття модалки по кліку за межами
  ge('modalOverlay').addEventListener('click', e => {
    if (e.target === ge('modalOverlay')) closeModal();
  });
});
