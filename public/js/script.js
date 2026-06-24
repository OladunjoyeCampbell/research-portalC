// ============================================================
// CONFIGURATION
// ============================================================
const API_BASE = '';   // empty = same origin (backend serves frontend)
const ETHICS_REF = 'REC/NSPoly/CS/2026/___';
const RESEARCHER_CONTACT = 'Dr Oladele Campbell, ocampbell@csnigerpoly.com, 08030968896';

// ============================================================
// THEME (dark mode)
// ============================================================
let theme = localStorage.getItem('theme') || 'light';
function applyTheme() {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
  applyTheme();
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

// ============================================================
// GLOBAL STATE
// ============================================================
let S = {
  phase: 'hero',
  participantCode: null,
  participantName: '',
  participantMatric: '',
  participantEmail: '',
  participantGender: '',
  demographics: {},
  consentGeneral: false,
  gradeConsent: false,
  completedSaved: false,
  currentEnrolmentId: null,
  currentStudyId: null,
  randomisationGroup: null,
  studyConfig: null,
  puzzleIdx: 0,
  available: [], userSeq: [], fadedLocked: [],
  assQ: 0, assAnswers: [], assMode: 'pre',
  surveyAnswers: {},
  reviewQueue: [], reviewIdx: 0,
  metrics: null,
  audioOn: false,
  studyLang: 'en',
  lang: 'en',
  availableStudies: [],
  myEnrolments: [],
  resumeCandidates: [],
  lastInteraction: Date.now(),
  timeoutWarningShown: false,
  timeoutInterval: null,
  isAdminMode: false,
  completedPhases: {
    survey: false,
    pretest: false,
    puzzles: false,
    posttest: false,
    followup: false
  },
  puzzlesCompletedCount: 0,
  totalPuzzles: 0,
  postTestPending: false
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function el(id) { return document.getElementById(id); }
function shuffle(a) { let b = [...a]; for(let i=b.length-1; i>0; i--){ let j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }
function L(obj, key) {
  if (S.studyConfig?.bilingual && obj && (obj[key+'_en'] !== undefined || obj[key+'_ha'] !== undefined))
    return S.studyLang === 'en' ? obj[key+'_en'] : obj[key+'_ha'];
  if (typeof obj === 'string') return obj;
  return obj?.[key+'_en'] ?? obj?.[key] ?? '';
}
function speak(text) {
  if(!S.audioOn || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = S.studyLang === 'ha' ? 'ha' : 'en';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch(e) { console.warn(e); }
}
function showSavedToast(msg) {
  let d = document.querySelector('.saved-toast');
  if(d) d.remove();
  d = document.createElement('div');
  d.className = 'saved-toast';
  d.textContent = msg || 'Progress saved';
  document.body.appendChild(d);
  requestAnimationFrame(()=>d.style.opacity='1');
  setTimeout(()=>{ d.style.opacity='0'; setTimeout(()=>d.remove(),300); },2500);
}
function formatDuration(ms) {
  if (!ms) return 'N/A';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes} min ${seconds} sec`;
}
function formatElapsedTime(ms) {
  if (!ms || ms <= 0) return 'Just started';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return 'Less than a minute';
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}
function getProgrammeType(matric) {
  const prefix = (matric || '').split('/')[0].toUpperCase();
  if (prefix.startsWith('HND')) return 'hnd';
  if (prefix.startsWith('ND')) return 'nd';
  return 'other';
}

// ============================================================
// LOCALSTORAGE KEYS
// ============================================================
function getStorageKey() {
  return `research_${S.participantCode}_${S.currentEnrolmentId}`;
}
function saveLocalProgress(overrides = {}) {
  if (!S.currentEnrolmentId || !S.participantCode) return;
  if (!S.metrics) S.metrics = { puzzles: {} };
  
  const toStore = {
    phase: S.phase,
    puzzleIdx: S.puzzleIdx,
    assQ: S.assQ,
    assAnswers: [...(S.assAnswers || [])],
    assMode: S.assMode,
    surveyAnswers: { ...S.surveyAnswers },
    metrics: JSON.parse(JSON.stringify(S.metrics)),
    reviewQueue: [...(S.reviewQueue || [])],
    reviewIdx: S.reviewIdx,
    available: S.available ? [...S.available] : [],
    userSeq: S.userSeq ? [...S.userSeq] : [],
    fadedLocked: [...(S.fadedLocked || [])],
    studyLang: S.studyLang,
    currentEnrolmentId: S.currentEnrolmentId,
    currentStudyId: S.currentStudyId,
    participantCode: S.participantCode,
    randomisationGroup: S.randomisationGroup,
    consentGeneral: S.consentGeneral,
    gradeConsent: S.gradeConsent,
    audioOn: S.audioOn,
    participantEmail: S.participantEmail,
    participantGender: S.participantGender,
    completedPhases: { ...S.completedPhases },
    puzzlesCompletedCount: S.puzzlesCompletedCount,
    totalPuzzles: S.totalPuzzles,
    postTestPending: S.postTestPending,
    _resumeState: {
      phase: S.phase,
      puzzleIdx: S.puzzleIdx,
      assQ: S.assQ,
      assAnswers: [...(S.assAnswers || [])],
      assMode: S.assMode,
      surveyAnswers: { ...S.surveyAnswers },
      reviewQueue: [...(S.reviewQueue || [])],
      reviewIdx: S.reviewIdx,
      available: S.available ? [...S.available] : [],
      userSeq: S.userSeq ? [...S.userSeq] : [],
      fadedLocked: [...(S.fadedLocked || [])],
      currentEnrolmentId: S.currentEnrolmentId,
      currentStudyId: S.currentStudyId
    }
  };

  // Apply overrides (e.g., { completed: true })
  if (overrides.completed) toStore.completed = true;

  localStorage.setItem(getStorageKey(), JSON.stringify(toStore));
  fetch(`${API_BASE}/api/progress/${S.currentEnrolmentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toStore)
  }).catch(e => console.warn('Server sync failed:', e));
  showSavedToast();
}
function loadLocalProgress() {
  if (!S.currentEnrolmentId || !S.participantCode) return null;
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    Object.assign(S, saved);
    S.metrics = saved.metrics || { puzzles: {} };
    S.surveyAnswers = saved.surveyAnswers || {};
    S.assAnswers = saved.assAnswers || [];
    S.completedPhases = saved.completedPhases || { survey: false, pretest: false, puzzles: false, posttest: false, followup: false };
    S.puzzlesCompletedCount = saved.puzzlesCompletedCount || 0;
    S.totalPuzzles = saved.totalPuzzles || (S.studyConfig?.puzzles?.length || 0);
    S.postTestPending = saved.postTestPending || false;
    S.gradeConsent = saved.gradeConsent || false;
    return saved;
  } catch(e) { console.warn('Failed to parse saved progress', e); return null; }
}

// ============================================================
// API CALLS
// ============================================================
async function apiFetchStudies() {
  try { const res = await fetch(`${API_BASE}/api/studies`); if(!res.ok) return []; return await res.json(); } catch(e){ return []; }
}
async function apiAdminFetchStudies() {
  try { const res = await fetch(`${API_BASE}/api/admin/studies`, { credentials: 'include' }); if(!res.ok) return []; return await res.json(); } catch(e){ return []; }
}
async function apiFetchStudyConfig(studyId) {
  try { const res = await fetch(`${API_BASE}/api/studies/${studyId}/config`); if(!res.ok) return null; return await res.json(); } catch(e){ return null; }
}
// MODIFIED: studyId is optional. If not provided, only participant is created/updated.
async function apiEnrol(name, matric, lang, studyId, demographics, consentGeneral, academicSession, classSection, lecturerId, email, gender) {
  const body = { name, matric, lang, demographics, consentGeneral, academicSession, classSection, lecturerId, email, gender };
  if (studyId) body.studyId = studyId;
  const res = await fetch(`${API_BASE}/api/enrol`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiGetMyEnrolments(participantCode) {
  const res = await fetch(`${API_BASE}/api/enrolments/me?code=${encodeURIComponent(participantCode)}`);
  if(!res.ok) return [];
  return res.json();
}
async function apiLoadProgress(enrolmentId) {
  const res = await fetch(`${API_BASE}/api/progress/${enrolmentId}`);
  if(!res.ok) return null;
  return res.json();
}
async function apiWithdraw(enrolmentId) {
  if(!API_BASE && API_BASE !== '') return;
  const res = await fetch(`${API_BASE}/api/enrolment/${enrolmentId}/withdraw`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiAverageGain(studyId) {
  try { const res = await fetch(`${API_BASE}/api/study/${studyId}/average_gain`); if(!res.ok) return null; return res.json(); } catch(e){ return null; }
}
async function apiAdminLogin(password) {
  const res = await fetch(`${API_BASE}/api/admin/login`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({password}) });
  if(!res.ok) throw new Error('Login failed');
  return res.json();
}
async function apiExportCSV(studyId) {
  const res = await fetch(`${API_BASE}/api/admin/export/study/${studyId}?format=csv`, { credentials:'include' });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
async function apiExportJSON(studyId) {
  const res = await fetch(`${API_BASE}/api/admin/export/open-science/${studyId}`, { credentials:'include' });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
async function apiPortalStatus(studyId) {
  const res = await fetch(`${API_BASE}/api/admin/status?study=${studyId}`, { credentials:'include' });
  if(!res.ok) return null;
  return res.json();
}
async function apiPortalControl(studyId, status, capacity) {
  const body = { study_id: studyId };
  if(status !== undefined) body.status = status;
  if(capacity !== undefined) body.capacity = capacity;
  await fetch(`${API_BASE}/api/admin/control`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(body) });
}
async function apiSendReminders(studyId, daysInactive = 3) {
  const res = await fetch(`${API_BASE}/api/admin/send-reminders`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({studyId, daysInactive}) });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// NEW API calls for participant check and code recovery
async function apiCheckParticipant(matric) {
  const res = await fetch(`${API_BASE}/api/participant/check?matric=${encodeURIComponent(matric)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiSendCode(matric) {
  const res = await fetch(`${API_BASE}/api/participant/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matric })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ============================================================
// TIMEOUT
// ============================================================
const TIMEOUT_MS = 20*60*1000, WARNING_MS = 1*60*1000;
function resetTimeoutTimer() {
  if(!S.currentEnrolmentId) return;
  S.lastInteraction = Date.now();
  if(S.timeoutWarningShown) { S.timeoutWarningShown=false; document.querySelector('.timeout-warning-toast')?.remove(); }
  if(S.timeoutInterval) clearInterval(S.timeoutInterval);
  S.timeoutInterval = setInterval(checkTimeout, 10000);
}
function checkTimeout() {
  if(!S.currentEnrolmentId) return;
  const elapsed = Date.now()-S.lastInteraction;
  if(!S.timeoutWarningShown && elapsed>=(TIMEOUT_MS-WARNING_MS)) { S.timeoutWarningShown=true; showTimeoutWarning(); }
  if(elapsed>=TIMEOUT_MS) { clearInterval(S.timeoutInterval); S.timeoutInterval=null; saveLocalProgress(); showTimeoutToast(); }
}
function showTimeoutWarning() {
  const div=document.createElement('div'); div.className='saved-toast timeout-warning-toast'; div.style.background='#d97706'; div.style.maxWidth='300px'; div.innerHTML='⚠️ Inactivity. Progress saved. You may close browser.';
  document.body.appendChild(div); requestAnimationFrame(()=>div.style.opacity='1');
  setTimeout(()=>{ div.style.opacity='0'; setTimeout(()=>div.remove(),300); },8000);
}
function showTimeoutToast() {
  const div=document.createElement('div'); div.className='saved-toast'; div.style.background='#166534'; div.innerHTML='💾 Progress saved due to inactivity.';
  document.body.appendChild(div); requestAnimationFrame(()=>div.style.opacity='1');
  setTimeout(()=>{ div.style.opacity='0'; setTimeout(()=>div.remove(),300); },5000);
}

// ============================================================
// RENDER & BIND FUNCTIONS
// ============================================================
function topbarHTML() {
  const themeIcon = theme === 'dark' ? '☀️' : '🌙';
  const themeText = theme === 'dark' ? 'Light' : 'Dark';
  
  const insideStudy = ['orient','consent','survey','pre','study','faded','attempt','reflect','code','review','post','followup','guided','debrief','complete','resume'].includes(S.phase);
  const studyContext = (insideStudy && S.studyConfig && S.studyConfig.title_en) 
    ? `<div style="font-size:0.8rem; color:var(--primary); margin-top:4px;">📖 ${S.studyConfig.title_en}</div>` 
    : '';

  // Determine if there are any other unenrolled studies (for "Other studies" button)
  const hasOtherStudies = S.availableStudies.some(study => 
    !S.myEnrolments.some(e => e.study_id === study.id && (e.status === 'enrolled' || e.status === 'in_progress'))
  );
  
  return `<div class="topbar">
    <div class="brand">
      <h1>🔬 Research Portal</h1>
      <p>Multi‑study research participation hub</p>
      ${studyContext}
    </div>
    <div class="topbar-btns">
      <button class="pill" id="btnTheme">${themeIcon} ${themeText}</button>
      <button class="pill ${S.audioOn?'pill-green':'pill-gray'}" id="btnAudio">${S.audioOn?'🔊':'🔇'} Audio</button>
      ${insideStudy && hasOtherStudies ? `<button class="pill pill-amber" id="btnOtherStudies">📚 Other studies</button>` : ''}
      ${S.studyConfig?.bilingual === true && insideStudy ? `<button class="pill pill-blue" id="btnLangStudy">${S.studyLang === 'en' ? 'Hausa' : 'English'}</button>` : ''}
      ${insideStudy && S.currentEnrolmentId ? `<button class="pill pill-danger" id="btnWithdraw">🚪 Withdraw & Delete Data</button>` : ''}
      ${S.phase !== 'hero' && !S.isAdminMode ? `<button class="pill pill-gray" id="btnLogoutPortal">🚪 Logout</button>` : ''}
    </div>
  </div>`;
}
function phaseStripHTML() {
  const hidePhases = ['hero','studySelect','adminLogin','dashboard','register','resume','certificates'];
  if (hidePhases.includes(S.phase)) return '';

  let phases = S.studyConfig?.phases;
  if (!phases || phases.length === 0) {
    phases = [
      { id: 'pre', label: 'Pre-test', icon: '📋' },
      { id: 'learn', label: 'Learn', icon: '👁' },
      { id: 'review', label: 'Review', icon: '🔁' },
      { id: 'post', label: 'Post-test', icon: '📋' },
      { id: 'complete', label: 'Done', icon: '🎓' }
    ];
  }

  const phaseMap = {
    'orient': 'pre', 'consent': 'pre', 'survey': 'survey',
    'pre': 'pre', 'study': 'learn', 'faded': 'learn', 'attempt': 'learn',
    'reflect': 'learn', 'code': 'learn', 'review': 'review',
    'post': 'post', 'debrief': 'post', 'complete': 'complete',
    'followup': 'post', 'guided': 'learn'
  };
  const mappedPhase = phaseMap[S.phase] || S.phase;
  const order = phases.map(p => p.id);
  const currentIndex = order.indexOf(mappedPhase);
  if (currentIndex === -1) return '';

  return `<div class="phase-strip">${phases.map((p, i) => {
    const st = i < currentIndex ? 'done' : i === currentIndex ? 'active' : '';
    return `<span class="phase-dot ${st}" title="${p.label}">${p.icon}</span>${i < phases.length - 1 ? '<span class="phase-line"></span>' : ''}`;
  }).join('')}<span class="phase-label">${phases[currentIndex].label}</span></div>`;
}
function renderHero() {
  return `${topbarHTML()}
  <div class="main-card hero-container">
    <div class="hero-badge">🔬 Multi‑Study Research Platform</div>
    <h1 class="hero-title">Research Participation Portal</h1>
    <p class="hero-subtitle">Contribute to Computing Education Research</p>
    <div class="hero-features">
      <div class="feature">✓ Multiple studies – choose any that interest you</div>
      <div class="feature">✓ Secure and confidential</div>
      <div class="feature">✓ Ethics approved (REC/NSPoly/CS/2026/___ )</div>
      <div class="feature">✓ Takes about 30–40 minutes per study</div>
      <div class="feature">✓ Receive participation certificate per study</div>
    </div>
    <div class="hero-buttons">
      <button class="btn btn-primary btn-large" id="btnStartParticipation">▶ Start Participation</button>
      <button class="btn btn-secondary btn-large" id="btnResumeExisting">↻ Resume Existing Study</button>
      <button class="btn btn-secondary btn-large" id="btnMyCertificates">📜 My Certificates</button>
    </div>
    <div id="resumePanel" style="display: none; margin-top: 30px; border-top: 2px solid var(--border); padding-top: 24px;">
      <h3>Resume your study</h3>
      <p>Enter your participant code (e.g., AL-7X3K9) to pick up where you left off.</p>
      <div class="input-row" style="max-width: 300px;"><input type="text" id="resumeCode" placeholder="Participant code" /></div>
      <p id="resumeErr" style="color:var(--danger);text-align:center"></p>
      <div class="actions"><button class="btn btn-primary" id="btnDoResume">Resume →</button></div>
    </div>
    <div class="admin-link">
      <a href="?admin">🔐 Admin</a>
    </div>
  </div>`;
}

function bindHero() {
  const startBtn = document.getElementById('btnStartParticipation');
  const resumeBtn = document.getElementById('btnResumeExisting');
  const resumePanel = document.getElementById('resumePanel');
  const doResumeBtn = document.getElementById('btnDoResume');

  if (resumePanel) resumePanel.style.display = 'none';

  startBtn?.addEventListener('click', () => {
    S.phase = 'register';
    go();
  });

  resumeBtn?.addEventListener('click', () => {
    if (resumePanel) resumePanel.style.display = 'block';
    resumePanel?.scrollIntoView({ behavior: 'smooth' });
  });

  doResumeBtn?.addEventListener('click', async () => {
    const code = document.getElementById('resumeCode')?.value.trim().toUpperCase();
    if (!code) {
      document.getElementById('resumeErr').innerText = 'Please enter your participant code';
      return;
    }
    try {
      const enrolments = await apiGetMyEnrolments(code);
      if (!enrolments.length) throw new Error('No enrolments found for this code');
      
      const active = enrolments.filter(e => e.status === 'enrolled' || e.status === 'in_progress');
      if (active.length === 0) {
        document.getElementById('resumeErr').innerText = 'You have no studies in progress. All are completed or withdrawn.';
        return;
      }

      const participant = active[0].participant || {};
      S.participantCode = code;
      S.participantName = participant.name || 'Participant';
      S.participantMatric = participant.matric || '';
      S.participantEmail = participant.email || '';
      S.participantGender = participant.gender || '';

      if (active.length > 1) {
        S.resumeCandidates = active;
        S.phase = 'resumeSelect';
        go();
        return;
      }

      const enrol = active[0];
      const config = await apiFetchStudyConfig(enrol.study_id);
      if (!config || !config.puzzles) throw new Error('Study configuration missing');
      S.currentEnrolmentId = enrol.id;
      S.currentStudyId = enrol.study_id;
      S.studyConfig = config;
      S.totalPuzzles = config.puzzles.length;

      let local = loadLocalProgress();
      if (local) Object.assign(S, local);
      else {
        const remote = await apiLoadProgress(enrol.id);
        if (remote?.progress) Object.assign(S, remote.progress);
      }

      const hasPre = config.preQ && config.preQ.length > 0;
      const hasPost = config.postQ && config.postQ.length > 0;
      const hasPuzzles = config.puzzles && config.puzzles.length > 0;
      const isSurveyOnly = !hasPre && !hasPost && !hasPuzzles;
      if (isSurveyOnly && S.completedPhases.survey) {
        S.phase = 'complete';
        go();
        return;
      }

      S.phase = 'resume';
      go();
    } catch (e) {
      document.getElementById('resumeErr').innerText = e.message;
    }
  });

  // New: My Certificates button
  document.getElementById('btnMyCertificates')?.addEventListener('click', () => {
    S.phase = 'certificates';
    go();
  });
}
function renderResume() {
  const m = S.metrics || {};
  const solved = Object.values(m.puzzles || {}).filter(p => p.completed).length;
  const guided = Object.values(m.puzzles || {}).filter(p => p.guided).length;
  const preScore = (m.preScore !== undefined && m.preScore !== null) ? `${m.preScore}%` : '—';
  const totalPuzzles = S.totalPuzzles || S.studyConfig?.puzzles?.length || 0;
  const totalElapsed = m.startedAt ? (Date.now() - m.startedAt) : 0;
  const elapsedFormatted = formatElapsedTime(totalElapsed);
  const displayName = (S.participantName && S.participantName.trim() !== '') ? S.participantName : 'Participant';
  return `${topbarHTML()}<div class="main-card"><h2>👋 Welcome back, ${escapeHtml(displayName)}</h2>
    <div class="pcode-box"><p>Your participant code:</p><div class="pcode-num">${S.participantCode}</div></div>
    <div class="resume-grid">
      <div class="resume-stat"><div class="rnum">${solved}/${totalPuzzles}</div><div class="rlbl">Puzzles solved</div></div>
      <div class="resume-stat"><div class="rnum">${guided}</div><div class="rlbl">Needed guidance</div></div>
      <div class="resume-stat"><div class="rnum">${preScore}</div><div class="rlbl">Pre-test %</div></div>
      <div class="resume-stat"><div class="rnum">${elapsedFormatted}</div><div class="rlbl">Time since you started</div></div>
    </div>
    <div class="example-box">Pick up exactly where you left off.</div>
    <div class="actions"><button class="btn btn-primary" id="btnResumeContinue">▶ Resume</button>
    <button class="btn btn-secondary" id="btnResumeRestart">↺ Start fresh</button></div></div>`;
}
function bindResume() {
  const continueBtn = document.getElementById('btnResumeContinue');
  const restartBtn = document.getElementById('btnResumeRestart');

  const hasPre = S.studyConfig?.preQ && S.studyConfig.preQ.length > 0;
  const hasPost = S.studyConfig?.postQ && S.studyConfig.postQ.length > 0;
  const hasPuzzles = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
  const isSurveyOnly = !hasPre && !hasPost && !hasPuzzles;

  if (isSurveyOnly) {
    if (S.completedPhases.survey) {
      S.phase = 'complete';
      go();
      return;
    } else {
      S.phase = 'survey';
      go();
      return;
    }
  }

  if (S.postTestPending) {
    S.phase = 'complete';
    go();
    return;
  }

  continueBtn?.addEventListener('click', () => {
    const hasPre2 = S.studyConfig?.preQ && S.studyConfig.preQ.length > 0;
    const hasPost2 = S.studyConfig?.postQ && S.studyConfig.postQ.length > 0;
    const hasPuzzles2 = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
    const isSurveyOnly2 = !hasPre2 && !hasPost2 && !hasPuzzles2;

    if (isSurveyOnly2) {
      if (S.completedPhases.survey) {
        S.phase = 'complete';
        go();
        return;
      } else {
        S.phase = 'survey';
        go();
        return;
      }
    }

    const rs = S._resumeState || S.metrics?._resumeState;

    // --- FIX: If immediate post-test is already done, do not resume into 'post' ---
    if (S.completedPhases.posttest) {
      S.phase = 'complete';
      go();
      return;
    }

    if (rs) {
      if (rs.phase === 'survey' && S.completedPhases.survey) {
        if (hasPre2) {
          S.phase = 'pre';
          S.assMode = 'pre';
          S.assQ = 0;
          S.assAnswers = [];
        } else if (hasPost2) {
          S.phase = 'post';
          S.assMode = 'post';
          S.assQ = 0;
          S.assAnswers = [];
        } else {
          S.phase = 'complete';
        }
      } else {
        S.phase = rs.phase || 'survey';
        S.puzzleIdx = rs.puzzleIdx || 0;
        S.assQ = rs.assQ || 0;
        S.assAnswers = rs.assAnswers || [];
        S.surveyAnswers = rs.surveyAnswers || {};
        S.reviewQueue = rs.reviewQueue || [];
        S.reviewIdx = rs.reviewIdx || 0;
        S.available = rs.available || [];
        S.userSeq = rs.userSeq || [];
        S.fadedLocked = rs.fadedLocked || [];
      }
    } else {
      if (S.completedPhases.posttest) { S.phase='complete'; go(); return; }
      if (S.completedPhases.puzzles && !S.completedPhases.posttest) {
        const minDays = S.studyConfig?.min_days_between_pretest_posttest || 0;
        if (minDays > 0 && S.metrics?.preCompletedAt) {
          const daysSince = (Date.now() - new Date(S.metrics.preCompletedAt)) / (86400000);
          if (daysSince < minDays) {
            S.postTestPending = true;
            S.phase = 'complete';
            saveLocalProgress();
            go();
            return;
          } else {
            S.phase = 'post';
            S.assMode = 'post';
            S.assQ = 0;
            S.assAnswers = [];
            go();
            return;
          }
        } else {
          S.phase = 'post';
          S.assMode = 'post';
          S.assQ = 0;
          S.assAnswers = [];
          go();
          return;
        }
      }
      if (S.completedPhases.pretest && !S.completedPhases.puzzles) {
        S.phase='study';
        S.puzzleIdx=S.puzzlesCompletedCount;
        go();
        return;
      }
      if (S.completedPhases.survey && !S.completedPhases.pretest) {
        if (hasPre2) {
          S.phase = 'pre';
          S.assMode = 'pre';
          S.assQ = S.assAnswers.length;
        } else {
          if (hasPost2) {
            S.phase = 'post';
            S.assMode = 'post';
            S.assQ = 0;
            S.assAnswers = [];
          } else {
            S.phase = 'complete';
          }
        }
        go();
        return;
      }
      S.phase = 'orient';
    }
    go();
  });

  restartBtn?.addEventListener('click', () => {
    if(confirm('Erase all progress?')){
      localStorage.removeItem(getStorageKey());
      S.metrics = { startedAt: Date.now(), puzzles: {} };
      S.completedPhases = { survey: false, pretest: false, puzzles: false, posttest: false, followup: false };
      S.puzzlesCompletedCount = 0;
      S.surveyAnswers = {};
      S.assAnswers = [];
      S.postTestPending = false;
      S.phase = 'orient';
      saveLocalProgress();
      go();
    }
  });
}
// ============================================================
// REGISTRATION (global)
// ============================================================
function renderRegister() {
  return `${topbarHTML()}<div class="main-card">
    <h2>Register as a research participant</h2>
    <p>Please provide your details. You will then be able to choose from available studies.</p>
    <div class="input-row">
      <div><label>Full name *</label><input id="inpName" placeholder="e.g. Amina Bello" /></div>
      <div><label>Student ID / Matric number *</label><input id="inpMatric" placeholder="NDCS/024/2002" /></div>
      <div><label>Email address *</label><input id="inpEmail" type="email" placeholder="a.bello@student.edu" /></div>
      <div><label>Gender</label><select id="inpGender"><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="non-binary">Non-binary</option><option value="other">Other</option></select></div>
      <div><label>Academic session (e.g., 2025/2026)</label><input id="inpSession" placeholder="2025/2026" /></div>
      <div><label>Class section</label><input id="inpSection" placeholder="A/B/C" /></div>
    </div>
    <div id="existingParticipantMsg" style="display:none;" class="example-box">
      <p><strong>⚠️ You are already registered.</strong></p>
      <p>Please use the <strong>“Resume Existing Study”</strong> button on the home page and enter your participant code.</p>
      <p>If you have forgotten your code, click the button below to receive it by email.</p>
      <button class="btn btn-secondary" id="btnSendCodeRecovery">📧 Send my participant code to my email</button>
      <span id="recoveryStatus" style="margin-left:12px;"></span>
    </div>
    <p id="regErr" style="color:var(--danger);text-align:center"></p>
    <div class="actions"><button class="btn btn-primary" id="btnRegisterSubmit">Continue to study selection →</button></div>
  </div>`;
}

function bindRegister() {
  const submitBtn = document.getElementById('btnRegisterSubmit');
  const errEl = document.getElementById('regErr');
  const existingMsg = document.getElementById('existingParticipantMsg');
  const sendCodeBtn = document.getElementById('btnSendCodeRecovery');
  const recoveryStatus = document.getElementById('recoveryStatus');

  submitBtn?.addEventListener('click', async () => {
    const name = document.getElementById('inpName')?.value.trim();
    const matric = document.getElementById('inpMatric')?.value.trim();
    const email = document.getElementById('inpEmail')?.value.trim();
    const gender = document.getElementById('inpGender')?.value;
    if (!name || !matric) {
      if (errEl) errEl.innerText = 'Name and Matric number required';
      return;
    }
    if (!email || !email.includes('@')) {
      if (errEl) errEl.innerText = 'Valid email address required';
      return;
    }
    S.participantName = name;
    S.participantMatric = matric;
    S.participantEmail = email;
    S.participantGender = gender;

    // Check if participant already exists
    try {
      const check = await apiCheckParticipant(matric);
      if (check.exists) {
        // Show existing participant message
        if (existingMsg) existingMsg.style.display = 'block';
        if (errEl) errEl.innerText = '';
        // Optionally, pre-fill email if missing? Not needed.
        // Recovery button will send code.
        return;
      }
    } catch (e) {
      if (errEl) errEl.innerText = 'Error checking registration: ' + e.message;
      return;
    }

    // New participant – create without study enrolment
    try {
      const academicSession = document.getElementById('inpSession')?.value.trim() || '';
      const classSection = document.getElementById('inpSection')?.value.trim() || '';
      // No studyId provided
      const result = await apiEnrol(name, matric, 'en', null, { gender }, false, academicSession, classSection, '', email, gender);
      S.participantCode = result.participantCode;
      // Fetch fresh enrolments (should be empty)
      S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
      // Get available studies
      S.availableStudies = await apiFetchStudies();
      S.phase = 'studySelect';
      go();
    } catch (e) {
      if (errEl) errEl.innerText = e.message || 'Registration failed. Please try again.';
    }
  });

  // Code recovery button
  sendCodeBtn?.addEventListener('click', async () => {
    const matric = document.getElementById('inpMatric')?.value.trim();
    if (!matric) {
      recoveryStatus.textContent = 'Please enter your matric number first.';
      return;
    }
    recoveryStatus.textContent = 'Sending...';
    try {
      await apiSendCode(matric);
      recoveryStatus.textContent = '✅ Code sent to your email.';
    } catch (e) {
      recoveryStatus.textContent = '❌ ' + e.message;
    }
  });
}
function renderStudySelect() {
  // Exclude all non-withdrawn enrolments (including completed)
  const enrolledStudyIds = S.myEnrolments
    .filter(e => e.status !== 'withdrawn')
    .map(e => e.study_id);
  const availableNotEnrolled = S.availableStudies.filter(study => !enrolledStudyIds.includes(study.id));

  let followupHtml = '';
  const mainStudy = S.myEnrolments.find(e => e.status === 'completed');
  if (mainStudy && S.metrics && S.metrics.mainCompletedAt && !S.metrics.followupCompleted && isFollowupAvailable()) {
    followupHtml = `<div class="example-box" style="margin-top:20px;background:#e0f2fe;border-color:#7dd3fc"><strong>📋 Follow‑up post‑test available!</strong> The waiting period has passed. You can now take the delayed post‑test.<div class="actions" style="margin-top:10px"><button class="btn btn-primary" id="btnStartFollowup">Start follow‑up →</button></div></div>`;
  }

  // Ongoing studies (active)
  const ongoing = S.myEnrolments.filter(e => e.status === 'enrolled' || e.status === 'in_progress');

  return `${topbarHTML()}<div class="main-card"><h2>Available Studies</h2>
    <p>${ongoing.length ? 'Select a new study to begin. Your ongoing studies are listed below.' : 'Select a study to begin. You can participate in multiple studies.'}</p>
    <div class="card-grid">
      ${availableNotEnrolled.map(study => `
        <button class="card study-card" data-study-id="${study.id}">
          <span class="card-emoji">📘</span>
          <div class="card-label">
            <strong>${study.title_en}</strong>
            <div class="card-why">${study.description_en || ''}</div>
          </div>
        </button>
      `).join('')}
    </div>
    ${ongoing.length ? `
      <div class="example-box" style="margin-top:20px">
        <strong>Your ongoing studies:</strong>
        <ul>${ongoing.map(e => `<li>${e.study.title_en} – ${e.status === 'in_progress' ? 'In progress' : 'Enrolled'}</li>`).join('')}</ul>
        <button class="btn btn-secondary btn-sm" id="btnResumeAny">Resume a study →</button>
      </div>
    ` : ''}
    ${followupHtml}
  </div>`;
}

function bindStudySelect() {
  document.querySelectorAll('.card[data-study-id]').forEach(card => {
    card.onclick = () => onSelectStudy(parseInt(card.dataset.studyId));
  });

  const resumeBtn = el('btnResumeAny');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      const ongoing = S.myEnrolments.filter(e => e.status === 'enrolled' || e.status === 'in_progress');
      if (ongoing.length) {
        if (ongoing.length === 1) {
          onSelectStudy(ongoing[0].study_id);
          return;
        }
        // If multiple, show resume selection
        S.resumeCandidates = ongoing;
        S.phase = 'resumeSelect';
        go();
      } else {
        alert('No ongoing studies to resume.');
      }
    });
  }

  el('btnStartFollowup')?.addEventListener('click', () => {
    S.assMode = 'post';
    S.assQ = 0;
    S.assAnswers = [];
    S.phase = 'followup';
    go();
  });
}
function renderResumeSelect() {
  if (!S.resumeCandidates || S.resumeCandidates.length === 0) {
    return `${topbarHTML()}<div class="main-card">
      <h2>Resume Study</h2>
      <p>No incomplete studies found.</p>
      <div class="actions"><button class="btn btn-secondary" id="btnBackToHero">← Back</button></div>
    </div>`;
  }
  return `${topbarHTML()}<div class="main-card">
    <h2>Resume a Study</h2>
    <p>You have multiple studies in progress. Select one to continue.</p>
    <div class="card-grid">
      ${S.resumeCandidates.map(enrol => `
        <button class="card study-card" data-enrolment-id="${enrol.id}" data-study-id="${enrol.study_id}">
          <span class="card-emoji">📘</span>
          <div class="card-label">
            <strong>${enrol.study?.title_en || 'Unknown Study'}</strong>
            <div class="card-why">${enrol.status === 'in_progress' ? '🔄 In progress' : '📌 Enrolled'}</div>
          </div>
        </button>
      `).join('')}
    </div>
    <div class="actions"><button class="btn btn-secondary" id="btnBackToHero">← Back</button></div>
  </div>`;
}

function bindResumeSelect() {
  document.querySelectorAll('.card[data-study-id]').forEach(card => {
    card.onclick = async () => {
      const studyId = parseInt(card.dataset.studyId);
      const enrolmentId = parseInt(card.dataset.enrolmentId);
      const enrol = S.resumeCandidates.find(e => e.id === enrolmentId);
      if (!enrol) return;
      try {
        const config = await apiFetchStudyConfig(studyId);
        if (!config || !config.puzzles) throw new Error('Study configuration missing');
        S.currentEnrolmentId = enrolmentId;
        S.currentStudyId = studyId;
        S.studyConfig = config;
        S.totalPuzzles = config.puzzles.length;
        const local = loadLocalProgress();
        if (local) Object.assign(S, local);
        else {
          const remote = await apiLoadProgress(enrolmentId);
          if (remote?.progress) Object.assign(S, remote.progress);
        }
        S.phase = 'resume';
        go();
      } catch (e) { alert(e.message); }
    };
  });
  el('btnBackToHero')?.addEventListener('click', () => {
    S.phase = 'hero';
    S.resumeCandidates = [];
    go();
  });
}

async function onSelectStudy(studyId) {
  try {
    console.log('=== onSelectStudy called ===');
    console.log('studyId:', studyId);
    console.log('S.participantName:', S.participantName);
    console.log('S.participantMatric:', S.participantMatric);
    console.log('S.participantCode:', S.participantCode);

    // Safety net: ensure participant details are present
    if (!S.participantName || !S.participantMatric) {
      console.log('Participant details missing, attempting to fetch...');
      if (S.participantCode) {
        const enrolments = await apiGetMyEnrolments(S.participantCode);
        if (enrolments.length > 0) {
          const p = enrolments[0].participant || {};
          S.participantName = p.name || 'Participant';
          S.participantMatric = p.matric || '';
          S.participantEmail = p.email || '';
          S.participantGender = p.gender || '';
          console.log('Fetched participant details:', S.participantName, S.participantMatric);
        } else {
          console.warn('No enrolments found for code, redirecting to registration');
          alert('Please register first.');
          S.phase = 'register';
          go();
          return;
        }
      } else {
        console.warn('No participant code, redirecting to registration');
        alert('Please register first.');
        S.phase = 'register';
        go();
        return;
      }
    }

    const config = await apiFetchStudyConfig(studyId);
    if (!config || !config.puzzles) throw new Error('Study configuration missing');

    S.studyConfig = config;
    S.studyLang = 'en';
    S.totalPuzzles = config.puzzles.length;

    let enrolment = S.myEnrolments.find(e => e.study_id === studyId);

    // Preserve participant details
    const participantName = S.participantName;
    const participantMatric = S.participantMatric;
    const participantEmail = S.participantEmail;
    const participantGender = S.participantGender;

    // If enrolment is withdrawn, treat as non-existent and refresh list
    if (enrolment && enrolment.status === 'withdrawn') {
      console.log('Found withdrawn enrolment, treating as non-existent:', enrolment.id);
      S.myEnrolments = S.myEnrolments.filter(e => e.id !== enrolment.id);
      enrolment = null;
      S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
    }

    if (enrolment) {
      // Existing active enrolment – load progress
      S.currentEnrolmentId = enrolment.id;
      S.currentStudyId = studyId;
      S.randomisationGroup = enrolment.randomisation_group;

      let local = loadLocalProgress();
      if (local) {
        Object.assign(S, local);
        S.participantName = participantName;
        S.participantMatric = participantMatric;
        S.participantEmail = participantEmail;
        S.participantGender = participantGender;
        S.studyConfig = config;
        S.currentStudyId = studyId;
        S.currentEnrolmentId = enrolment.id;
        S.randomisationGroup = enrolment.randomisation_group;
        S.phase = 'resume';
        go();
        return;
      }

      const remote = await apiLoadProgress(enrolment.id);
      if (remote && remote.progress) {
        Object.assign(S, remote.progress);
        S.participantName = participantName;
        S.participantMatric = participantMatric;
        S.participantEmail = participantEmail;
        S.participantGender = participantGender;
        S.studyConfig = config;
        S.currentStudyId = studyId;
        S.currentEnrolmentId = enrolment.id;
        S.randomisationGroup = enrolment.randomisation_group;
        S.phase = 'resume';
        go();
        return;
      }

      // No progress – start fresh
      S.metrics = { startedAt: Date.now(), puzzles: {} };
      S.completedPhases = { survey: false, pretest: false, puzzles: false, posttest: false, followup: false };
      S.puzzlesCompletedCount = 0;
      S.postTestPending = false;
      S.gradeConsent = false;
      S.surveyAnswers = {};
      S.assAnswers = [];
      S.assQ = 0;
      S.assMode = 'pre';
      S.puzzleIdx = 0;
      S.available = [];
      S.userSeq = [];
      S.fadedLocked = [];
      S.reviewQueue = [];
      S.reviewIdx = 0;
      S.studyConfig = config;
      S.currentStudyId = studyId;
      S.currentEnrolmentId = enrolment.id;
      S.randomisationGroup = enrolment.randomisation_group;
      S.participantName = participantName;
      S.participantMatric = participantMatric;
      S.participantEmail = participantEmail;
      S.participantGender = participantGender;
      saveLocalProgress();
      S.phase = 'orient';
      resetTimeoutTimer();
      go();
    } else {
      // New enrolment – create it
      console.log('Creating new enrolment for study:', studyId);
      console.log('Using name:', participantName, 'matric:', participantMatric);
      const enrolRes = await apiEnrol(
        participantName, participantMatric, 'en', studyId,
        { gender: participantGender }, false, '', '', '',
        participantEmail, participantGender
      );
      S.currentEnrolmentId = enrolRes.enrolmentId;
      S.currentStudyId = studyId;
      S.randomisationGroup = enrolRes.randomisationGroup;
      S.myEnrolments.push({
        id: enrolRes.enrolmentId,
        study_id: studyId,
        status: 'enrolled',
        study: { title_en: S.availableStudies.find(s => s.id === studyId).title_en },
        randomisation_group: S.randomisationGroup
      });
      S.metrics = { startedAt: Date.now(), puzzles: {} };
      S.completedPhases = { survey: false, pretest: false, puzzles: false, posttest: false, followup: false };
      S.puzzlesCompletedCount = 0;
      S.postTestPending = false;
      S.gradeConsent = false;
      S.surveyAnswers = {};
      S.assAnswers = [];
      S.assQ = 0;
      S.assMode = 'pre';
      S.puzzleIdx = 0;
      S.available = [];
      S.userSeq = [];
      S.fadedLocked = [];
      S.reviewQueue = [];
      S.reviewIdx = 0;
      S.studyConfig = config;
      S.participantName = participantName;
      S.participantMatric = participantMatric;
      S.participantEmail = participantEmail;
      S.participantGender = participantGender;
      saveLocalProgress();
      S.phase = 'orient';
      resetTimeoutTimer();
      go();
    }
  } catch (e) {
    console.error('onSelectStudy error:', e);
    alert(e.message);
  }
}
function renderOrient() {
  const steps = [
    {icon:'📋', text:'Background survey (~3 min)'},
    {icon:'🧠', text:`Pre‑test (${S.studyConfig.preQ?.length} questions)`},
    {icon:'🪜', text:`${S.studyConfig.puzzles.length} scaffolded puzzles (~30 min)`},
    {icon:'🔁', text:'Review of 3 puzzles (~5 min)'},
    {icon:'📋', text:`Post‑test (${S.studyConfig.postQ?.length} questions)`}
  ];
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="pcode-box"><p style="font-size:.82rem">Your participant code:</p><div class="pcode-num">${S.participantCode}</div></div>${S.randomisationGroup ? `<p><strong>Group:</strong> ${S.randomisationGroup === 'treatment' ? 'Treatment' : 'Control'}</p>` : ''}<h2>About this study</h2>${steps.map(s=>`<div class="orient-step"><span class="orient-icon">${s.icon}</span><div class="orient-body"><strong>${s.text}</strong></div></div>`).join('')}<div class="actions"><button class="btn btn-primary" id="btnOrientNext">Continue to consent →</button></div></div>`;
}
function bindOrient() { el('btnOrientNext')?.addEventListener('click',()=>{ S.phase='consent'; go(); }); }
function renderConsent() {
  const requiresGrade = S.studyConfig?.requiresGradeConsent === true;
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
    <h2>📜 Informed Consent & Permission</h2>
    <div class="consent-box">
      <h4>Study title</h4><p>${S.studyConfig.title_en}</p>
      <h4>Purpose</h4><p>${S.studyConfig.description_en}</p>
      <h4>Voluntary participation</h4><p>You may stop at any time without penalty.</p>
      <h4>Data and privacy</h4><p>Data is stored securely. All published results are anonymised.</p>
      <h4>Ethics reference: ${ETHICS_REF}</h4>
    </div>

    <div style="margin: 24px 0; padding: 16px; background: var(--gray-50); border-radius: 16px;">
      <p style="font-weight:600; margin-bottom:12px;">Please indicate your choices below:</p>

      <div style="margin-bottom:16px;">
        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
          <input type="checkbox" id="consentChk" style="width: 20px; height: 20px; margin: 0;" />
          <span><strong>1. Consent to use my data in the study.</strong><br>
          <span style="font-size:0.9rem; color:var(--muted);">I voluntarily agree to participate.</span></span>
        </label>
      </div>

      ${requiresGrade ? `
      <div>
        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
          <input type="checkbox" id="gradeConsentChk" style="width: 20px; height: 20px; margin: 0;" />
          <span><strong>2. Permission to access my final grade for the course I will name later.</strong><br>
          <span style="font-size:0.9rem; color:var(--muted);">I give permission for the research team to access my grade in the course I specify in the survey.</span></span>
        </label>
      </div>
      ` : ''}
    </div>

    <div class="actions">
      <button class="btn btn-secondary" id="btnConsentBack">← Back</button>
      <button class="btn btn-primary" id="btnConsentNext" disabled>I consent →</button>
    </div>
  </div>`;
}
function bindConsent() {
  const chk = document.getElementById('consentChk');
  const gradeChk = document.getElementById('gradeConsentChk');
  const nextBtn = document.getElementById('btnConsentNext');
  const backBtn = document.getElementById('btnConsentBack');

  if (!chk || !nextBtn) return;

  const requiresGrade = S.studyConfig?.requiresGradeConsent === true;

  const updateNext = () => {
    if (requiresGrade) {
      if (!gradeChk) return;
      nextBtn.disabled = !(chk.checked && gradeChk.checked);
    } else {
      nextBtn.disabled = !chk.checked;
    }
  };

  chk.addEventListener('change', updateNext);
  if (requiresGrade && gradeChk) {
    gradeChk.addEventListener('change', updateNext);
  }
  updateNext();

  backBtn?.addEventListener('click', () => {
    S.phase = 'orient';
    go();
  });

  nextBtn.addEventListener('click', () => {
    if (!chk.checked) {
      alert('Please check the consent box to continue.');
      return;
    }
    if (requiresGrade && (!gradeChk || !gradeChk.checked)) {
      alert('Please check both boxes to continue.');
      return;
    }
    S.consentGeneral = true;
    S.gradeConsent = requiresGrade ? true : false;
    if (!S.surveyAnswers || Object.keys(S.surveyAnswers).length === 0) {
      S.surveyAnswers = {};
    }
    saveLocalProgress();
    S.phase = 'survey';
    go();
  });
}
function renderSurveyDynamic() {
  const fields = S.studyConfig.surveyFields || [];
  const surveyTitle = S.studyConfig.title_en || 'Survey';
  let html = `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><h2>📋 ${surveyTitle}</h2>`;
  
  fields.forEach(f => {
    if (f.type === 'section') {
      html += `<div class="survey-section">
        <h3>${f.label_en}</h3>
        ${f.instructions ? `<p>${f.instructions}</p>` : ''}
        ${f.scaleLabels ? `<p class="scale-labels">${f.scaleLabels}</p>` : ''}
      </div>`;
      return;
    }
    if (f.id === 'programme') return;
    if (f.type === 'select') {
      const label = L(f, 'label');
      let opts = L(f, 'options');
      
      if (f.id === 'level' || f.id === 'demographics_level') {
        const progType = getProgrammeType(S.participantMatric);
        if (f.id === 'demographics_level') {
          if (progType === 'nd') opts = ['ND1', 'ND2'];
          else if (progType === 'hnd') opts = ['HND1', 'HND2'];
          else opts = ['100 level', '200 level', '300 level', '400 level', '500 level / PG', 'Other'];
        } else {
          if (S.studyConfig?.bilingual === true && S.studyLang === 'ha') {
            if (progType === 'nd') opts = ['ND Shekara 1','ND Shekara 2'];
            else if (progType === 'hnd') opts = ['HND Shekara 1','HND Shekara 2'];
            else opts = ['Shekara 1','Shekara 2','Shekara 3','Shekara 4'];
          } else {
            if (progType === 'nd') opts = ['ND Year 1','ND Year 2'];
            else if (progType === 'hnd') opts = ['HND Year 1','HND Year 2'];
            else opts = ['Year 1','Year 2','Year 3','Year 4'];
          }
        }
      }
      
      html += `<div class="field-row"><label>${label}</label><select data-field="${f.id}" class="sv-sel"><option value="">— select —</option>${opts.map((o,i)=>`<option value="${i}">${o}</option>`).join('')}</select></div>`;
    } else if (f.type === 'likert') {
      const label = L(f, 'label');
      let options = L(f, 'options');
      if (!options || options.length === 0) {
        options = ['1', '2', '3', '4', '5'];
        console.warn(`Likert field "${f.id}" had no options; using default 1-5.`);
      }
      html += `<div class="likert-row"><div class="lq">${label}</div><div class="likert-scale">`;
      options.forEach((opt, idx) => {
        const val = idx + 1;
        html += `<div class="lk-opt">
          <input type="radio" name="${f.id}" id="${f.id}_${val}" value="${val}" data-field="${f.id}" class="sv-lk">
          <label for="${f.id}_${val}"><span class="lk-num">${val}</span><span>${opt}</span></label>
        </div>`;
      });
      html += `</div></div>`;
    } else if (f.type === 'text') {
      const label = L(f, 'label');
      const placeholder = L(f, 'placeholder') || 'Write your answer here…';
      html += `<div class="field-row" style="margin-bottom:20px;">
        <label style="display:block; font-weight:600; margin-bottom:6px;">${label}</label>
        <textarea data-field="${f.id}" class="sv-text" placeholder="${placeholder}" style="width:100%; padding:10px; border-radius:12px; border:1.5px solid var(--border); min-height:80px; font-family:inherit; resize:vertical;"></textarea>
      </div>`;
    }
  });
  
  const hasPre = S.studyConfig.preQ && S.studyConfig.preQ.length > 0;
  const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
  const hasPuzzles = S.studyConfig.puzzles && S.studyConfig.puzzles.length > 0;
  let btnLabel = 'Continue →';
  if (!hasPre && !hasPost && !hasPuzzles) btnLabel = 'Submit Survey';
  else if (hasPre) btnLabel = 'Continue to pre‑test →';
  else if (hasPost) btnLabel = 'Continue to post‑test →';
  else if (hasPuzzles) btnLabel = 'Continue to study →';
  
  html += `<div class="actions"><button class="btn btn-primary" id="btnSurveyNext" disabled>${btnLabel}</button></div>
    <p id="surveyMsg" style="color:var(--danger);text-align:center"></p></div>`;
  return html;
}
function bindSurveyDynamic() {
  const fields = S.studyConfig.surveyFields || [];
  const btn = el('btnSurveyNext');
  if (btn) btn.disabled = true;

  const updateBtn = () => {
    document.querySelectorAll('.sv-sel').forEach(sel => {
      if (sel.value !== '') {
        S.surveyAnswers[sel.dataset.field] = sel.value;
      }
    });
    document.querySelectorAll('.sv-lk:checked').forEach(radio => {
      S.surveyAnswers[radio.dataset.field] = parseInt(radio.value);
    });
    document.querySelectorAll('.sv-text').forEach(textarea => {
      if (textarea.value.trim() !== '') {
        S.surveyAnswers[textarea.dataset.field] = textarea.value.trim();
      }
    });

    const requiredFields = fields.filter(f => f.id && f.id !== 'programme' && f.type !== 'section');
    const allFilled = requiredFields.every(f => {
      const val = S.surveyAnswers[f.id];
      return val !== undefined && val !== null && val !== '';
    });

    if (btn) btn.disabled = !allFilled;
    const msg = el('surveyMsg');
    if (msg) {
      msg.textContent = allFilled ? '' : (S.lang === 'en' ? 'Please answer all questions.' : 'Don Allah amsa duk tambayoyin.');
    }
  };

  document.querySelectorAll('.sv-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      S.surveyAnswers[sel.dataset.field] = sel.value;
      updateBtn();
      saveLocalProgress();
    });
  });

  document.querySelectorAll('.sv-lk').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        S.surveyAnswers[radio.dataset.field] = parseInt(radio.value);
        updateBtn();
        saveLocalProgress();
      }
    });
  });

  document.querySelectorAll('.sv-text').forEach(textarea => {
    textarea.addEventListener('input', () => {
      S.surveyAnswers[textarea.dataset.field] = textarea.value.trim();
      updateBtn();
      saveLocalProgress();
    });
  });

  updateBtn();

  el('btnSurveyNext')?.addEventListener('click', () => {
    document.querySelectorAll('.sv-sel').forEach(sel => {
      if (sel.value !== '') S.surveyAnswers[sel.dataset.field] = sel.value;
    });
    document.querySelectorAll('.sv-lk:checked').forEach(radio => {
      S.surveyAnswers[radio.dataset.field] = parseInt(radio.value);
    });
    document.querySelectorAll('.sv-text').forEach(textarea => {
      if (textarea.value.trim() !== '') S.surveyAnswers[textarea.dataset.field] = textarea.value.trim();
    });
    saveLocalProgress();

    S.completedPhases.survey = true;
    S.inProgressPhase = 'pretest';
    saveLocalProgress();

    const hasPre = S.studyConfig.preQ && S.studyConfig.preQ.length > 0;
    const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
    const hasPuzzles = S.studyConfig.puzzles && S.studyConfig.puzzles.length > 0;

    if (!hasPre && !hasPost && !hasPuzzles) {
      console.log('Survey-only study completed. Saving completion to server.');
      S.completedSaved = true;
      S.completedPhases.posttest = true;
      saveLocalProgress({ completed: true });
    }

    if (hasPre) {
      S.phase = 'pre';
      S.assMode = 'pre';
      S.assQ = 0;
      S.assAnswers = [];
    } else if (hasPost) {
      S.phase = 'post';
      S.assMode = 'post';
      S.assQ = 0;
      S.assAnswers = [];
    } else if (hasPuzzles) {
      S.phase = 'study';
      S.puzzleIdx = 0;
    } else {
      S.phase = 'debrief';
    }
    go();
  });
}
function renderAssessmentDynamic(mode) {
  if (mode === 'post' && !canStartPostTest()) {
    const minDays = S.studyConfig?.min_days_between_pretest_posttest || 0;
    const preDate = new Date(S.metrics.preCompletedAt);
    const now = new Date();
    const daysLeft = Math.ceil((preDate.getTime() + minDays * 24*60*60*1000 - now.getTime()) / (24*60*60*1000));
    return `<div class="main-card"><h2>Post‑test not yet available</h2><p>The post‑test will be available after ${minDays} day(s). Please return in ${daysLeft} day(s).</p><div class="actions"><button class="btn btn-primary" id="btnBackToStudies">← Back to studies</button></div></div>`;
  }
  const qs = mode === 'pre' ? S.studyConfig.preQ : S.studyConfig.postQ;
  if(!qs || !qs.length) return `<div class="main-card">No questions</div>`;
  const q = qs[S.assQ];
  const isAnswered = S.assAnswers[S.assQ] !== undefined;
  const chosen = S.assAnswers[S.assQ];
  const isPost = mode === 'post';
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="prog-wrap"><div class="prog-row"><span>${mode==='pre'?'Pre‑test':'Post‑test'} – Question ${S.assQ+1}/${qs.length}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${((S.assQ+1)/qs.length)*100}%"></div></div></div><div class="q-wrap"><p class="q-text">${L(q,'q')}</p>${(L(q,'opts')).map((opt,i)=>{ let extra=''; if(isAnswered && (isPost || q.isAttention)) { if(i===q.correct) extra=' correct-ans'; else if(i===chosen && chosen!==q.correct) extra=' wrong-ans'; } else if(i===chosen) extra=' selected'; return `<button class="option-btn${extra}" data-idx="${i}" ${isAnswered?'disabled':''}>${'ABCD'[i]}. ${opt}</button>`; }).join('')}</div><div class="actions">${isAnswered ? `<button class="btn btn-primary" id="btnAssNext">${S.assQ<qs.length-1?'Next →':'Finish →'}</button>` : ''}</div></div>`;
}
function bindAssessmentDynamic(mode) {
  document.querySelectorAll('.option-btn:not([disabled])').forEach(btn => { btn.onclick = () => { S.assAnswers[S.assQ] = parseInt(btn.dataset.idx); saveLocalProgress(); go(); }; });
  el('btnAssNext')?.addEventListener('click', () => {
    const qs = mode === 'pre' ? S.studyConfig.preQ : S.studyConfig.postQ;
    if(S.assQ < qs.length-1) { S.assQ++; go(); }
    else {
      const scorable = qs.filter(q=>!q.isAttention);
      const total = Math.round((scorable.filter((q,i)=>S.assAnswers[qs.indexOf(q)]===q.correct).length / scorable.length)*100);
      if(!S.metrics) S.metrics = { puzzles: {} };
      if(mode === 'pre') {
        S.completedPhases.pretest = true;
        S.metrics.preScore = total;
        S.metrics.preCompletedAt = new Date().toISOString();
        saveLocalProgress();
        S.phase = 'study';
        S.puzzleIdx = 0;
        saveLocalProgress();
        go();
      } else {
        S.completedPhases.posttest = true;
        S.metrics.postScore = total;
        S.metrics.postTestTaken = true;
        S.metrics.mainCompletedAt = new Date().toISOString();
        S.postTestPending = false;
        const weeks = S.studyConfig.delayed_post_test_weeks || 0;
        if (weeks > 0) {
          const followupDate = new Date();
          followupDate.setDate(followupDate.getDate() + weeks * 7);
          S.metrics.followupAvailableAt = followupDate.toISOString();
          S.metrics.followupCompleted = false;
        }
        saveLocalProgress();
        S.phase = 'debrief';
        go();
      }
    }
  });
}
function renderStudyDynamic() {
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  const steps = p.correctOrder.map((id,i)=>{ const card = p.cards.find(c=>c.id===id); return `<div class="study-step"><span class="step-num">${i+1}</span><div class="step-body"><div class="step-label">${card.emoji} ${L(card,'label')}</div><div class="step-why">${L(p,`whySteps`)[i]}</div></div></div>`; }).join('');
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="prog-wrap"><div class="prog-row"><span>Puzzle ${S.puzzleIdx+1}/${S.studyConfig.puzzles.length} — Study</span></div><div class="prog-bar"><div class="prog-fill" style="width:${((S.puzzleIdx+1)/S.studyConfig.puzzles.length)*100}%"></div></div></div><h2>👁 Study the correct solution</h2><div class="prompt-box">${L(p,'prompt')}</div>${steps}<div class="example-box">💡 ${L(p,'subtle')}</div><div class="actions"><button class="btn btn-secondary btn-sm" id="btnSpeakStudy">🔊 Read aloud</button><button class="btn btn-primary" id="btnStudyNext">I understand — try →</button></div></div>`;
}
function bindStudyDynamic() {
  el('btnStudyNext')?.addEventListener('click',()=>{ S.phase='faded'; initFadedDynamic(); go(); });
  el('btnSpeakStudy')?.addEventListener('click',()=>{ const p=S.studyConfig.puzzles[S.puzzleIdx]; speak(L(p,'prompt')+'. '+L(p,'subtle')); });
}
function initFadedDynamic() {
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  const fc = p.fadedCount || 2;
  const locked = p.correctOrder.slice(0,fc).map(id=>p.cards.find(c=>c.id===id));
  S.fadedLocked = locked.map(c=>c.id);
  S.userSeq = [...locked];
  S.available = shuffle(p.cards.filter(c=>!S.fadedLocked.includes(c.id)));
}
function renderCardsDynamic() {
  const av = el('availCards'), sq = el('seqCards');
  if(!av||!sq) return;
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  av.innerHTML = S.available.map(c=>`<button class="card" data-id="${c.id}"><span class="card-emoji">${c.emoji}</span><span class="card-label">${L(c,'label')}</span></button>`).join('');
  sq.innerHTML = S.userSeq.map((c,i)=>`<button class="card ${S.fadedLocked.includes(c.id)?'locked':'seq'}" data-id="${c.id}" ${S.fadedLocked.includes(c.id)?'disabled':''}>${S.fadedLocked.includes(c.id)?`<span class="card-lock">🔒</span>`:`<span class="card-num">${i+1}</span>`}<span class="card-emoji">${c.emoji}</span><span class="card-label">${L(c,'label')}</span>${S.fadedLocked.includes(c.id)?'':`<span class="card-remove">✕</span>`}</button>`).join('');
  av.querySelectorAll('.card').forEach(b=>{ b.onclick=()=>{ const c=S.available.find(x=>x.id===b.dataset.id); if(c){ S.available=S.available.filter(x=>x.id!==b.dataset.id); S.userSeq.push(c); renderCardsDynamic(); saveLocalProgress(); } }; });
  sq.querySelectorAll('.card:not([disabled])').forEach(b=>{ b.onclick=(e)=>{ if(e.target.classList && e.target.classList.contains('card-remove')){ const c=S.userSeq.find(x=>x.id===b.dataset.id); if(c&&!S.fadedLocked.includes(c.id)){ S.userSeq=S.userSeq.filter(x=>x!==c); S.available.push(c); renderCardsDynamic(); saveLocalProgress(); } } }; });
}
function renderFadedDynamic() {
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="prog-wrap"><div class="prog-row"><span>Puzzle ${S.puzzleIdx+1}/${S.studyConfig.puzzles.length} — Guided attempt</span></div><div class="prog-bar"><div class="prog-fill" style="width:${((S.puzzleIdx+1)/S.studyConfig.puzzles.length)*100}%"></div></div></div><h2>🔒 Guided attempt</h2><div class="prompt-box">${L(p,'prompt')}</div><div class="areas"><div class="panel"><p class="panel-title">Available steps</p><div class="card-grid" id="availCards"></div></div><div class="panel"><p class="panel-title">Your sequence</p><div class="card-grid" id="seqCards"></div></div></div><div class="actions"><button class="btn btn-secondary" id="btnFadedReset">Reset</button><button class="btn btn-primary" id="btnFadedSubmit">Check →</button></div><div id="fadedFeedback" class="feedback-box fb-neutral"></div><div id="fadedHint" class="hint-box"></div></div>`;
}
function bindFadedDynamic() {
  renderCardsDynamic();
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  el('btnFadedReset')?.addEventListener('click',()=>{ initFadedDynamic(); renderCardsDynamic(); saveLocalProgress(); });
  el('btnFadedSubmit')?.addEventListener('click',()=>{
    const order = S.userSeq.map(c=>c.id);
    const correct = JSON.stringify(order) === JSON.stringify(p.correctOrder);
    const fb = el('fadedFeedback'), hb = el('fadedHint');
    if(correct){
      fb.className='feedback-box fb-ok'; fb.textContent='✅ Correct!';
      hb.style.display='none';
      setTimeout(()=>{ S.phase='attempt'; initAttemptDynamic(); go(); },1000);
    } else {
      fb.className='feedback-box fb-bad'; fb.textContent='❌ Not quite. Try again.';
      hb.textContent='💡 '+(p.misconceptions?.[order.join(',')] || L(p,'subtle')); hb.style.display='block';
    }
    saveLocalProgress();
  });
}
function initAttemptDynamic() {
  S.fadedLocked = [];
  S.available = shuffle([...S.studyConfig.puzzles[S.puzzleIdx].cards]);
  S.userSeq = [];
}
function renderAttemptDynamic(reviewMode = false) {
  const p = reviewMode ? S.studyConfig.puzzles[S.reviewQueue[S.reviewIdx]] : S.studyConfig.puzzles[S.puzzleIdx];
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="prog-wrap"><div class="prog-row"><span>${reviewMode?`Review ${S.reviewIdx+1}/${S.reviewQueue.length}`:`Puzzle ${S.puzzleIdx+1}/${S.studyConfig.puzzles.length}`} — ${reviewMode?'Review':'Your turn'}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${(reviewMode?((S.reviewIdx+1)/S.reviewQueue.length):((S.puzzleIdx+1)/S.studyConfig.puzzles.length))*100}%"></div></div></div><h2>🧠 ${L(p,'title')}</h2><div class="prompt-box">${L(p,'prompt')}</div><p class="subtle-box">${L(p,'subtle')}</p><div class="areas"><div class="panel"><p class="panel-title">Available steps</p><div class="card-grid" id="availCards"></div></div><div class="panel"><p class="panel-title">Your sequence</p><div class="card-grid" id="seqCards"></div></div></div><div class="actions"><button class="btn btn-secondary" id="btnReset">Reset</button><button class="btn btn-primary" id="btnSubmit">Submit</button><button class="btn btn-secondary btn-sm" id="btnPrint">🖨 Print</button></div><div id="attemptFB" class="feedback-box fb-neutral"></div><div id="attemptHint" class="hint-box"></div><div id="attemptMiscon" class="misconception-box"></div><div class="example-box">${L(p,'example')}</div></div>`;
}
function puzMetric(id) {
  if (!S.metrics) S.metrics = { puzzles: {} };
  if (!S.metrics.puzzles) S.metrics.puzzles = {};
  if (!S.metrics.puzzles[id]) {
    S.metrics.puzzles[id] = {
      studyViewed: false,
      fadedAttempts: 0,
      attempts: 0,
      hints: 0,
      wrongs: [],
      reflection: '',
      codeViewed: false,
      completed: false,
      guided: false,
      ms: 0,
      startTs: Date.now()
    };
  }
  return S.metrics.puzzles[id];
}
function bindAttemptDynamic(reviewMode = false) {
  const p = reviewMode ? S.studyConfig.puzzles[S.reviewQueue[S.reviewIdx]] : S.studyConfig.puzzles[S.puzzleIdx];
  if (!p) { console.error('bindAttemptDynamic: puzzle not found'); return; }
  
  const expectedCards = p.cards.map(c=>c.id).sort().join(',');
  const actualCards = [...S.available,...S.userSeq].map(c=>c.id).sort().join(',');
  if (expectedCards !== actualCards) {
    S.fadedLocked = [];
    S.available = shuffle([...p.cards]);
    S.userSeq = [];
    renderCardsDynamic();
  } else { renderCardsDynamic(); }
  
  el('btnReset')?.addEventListener('click',()=>{ S.fadedLocked = []; S.available = shuffle([...p.cards]); S.userSeq = []; renderCardsDynamic(); const fb = el('attemptFB'); if(fb) fb.className='feedback-box fb-neutral'; const hb = el('attemptHint'); if(hb) hb.style.display='none'; const mb = el('attemptMiscon'); if(mb) mb.style.display='none'; saveLocalProgress(); });
  el('btnPrint')?.addEventListener('click',()=>window.print());
  
  const submitBtn = el('btnSubmit');
  if (!submitBtn) { console.error('Submit button not found'); return; }
  const newSubmit = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
  
  newSubmit.onclick = () => {
    const m = reviewMode ? null : puzMetric(p.id);
    if (!reviewMode && !m) return;
    const order = S.userSeq.map(c=>c.id);
    const correct = JSON.stringify(order) === JSON.stringify(p.correctOrder);
    const fb = el('attemptFB'), hb = el('attemptHint'), mb = el('attemptMiscon');
    const key = order.join(',');
    const miscon = p.misconceptions?.[key];
    
    if (correct) {
      if (!reviewMode) {
        if (!S.metrics.puzzles[p.id]) S.metrics.puzzles[p.id] = {};
        S.metrics.puzzles[p.id].completed = true;
        S.metrics.puzzles[p.id].ms = Date.now() - (S.metrics.startedAt || Date.now());
        const completedCount = Object.values(S.metrics.puzzles).filter(pz => pz.completed).length;
        S.puzzlesCompletedCount = completedCount;
        saveLocalProgress();
        if (completedCount === S.totalPuzzles) {
          S.completedPhases.puzzles = true;
          saveLocalProgress();
        }
      }
      fb.className='feedback-box fb-ok'; fb.textContent='✅ Correct! Great thinking.';
      hb.style.display='none'; mb.style.display='none';
      speak('Correct! Well done.');
      setTimeout(()=>{
        if (reviewMode) {
          if (S.reviewIdx < S.reviewQueue.length - 1) {
            S.reviewIdx++;
            const rp = S.studyConfig.puzzles[S.reviewQueue[S.reviewIdx]];
            if (rp) { S.fadedLocked = []; S.available = shuffle(rp.cards); S.userSeq = []; }
            go();
          } else {
            if (canStartPostTest()) {
              S.phase = 'post';
              S.assMode = 'post';
              S.assQ = 0;
              S.assAnswers = [];
              saveLocalProgress();
              go();
            } else {
              S.postTestPending = true;
              S.phase = 'complete';
              saveLocalProgress();
              go();
            }
          }
        } else {
          S.phase = 'reflect';
          go();
        }
      }, 1000);
    } else {
      if (!reviewMode) {
        if (!m.attempts) m.attempts = 0;
        m.attempts++;
        m.wrongs.push(key);
        m.hints++;
        const MAX_ATTEMPTS = 3;
        if (m.attempts >= MAX_ATTEMPTS) {
          m.guided = true;
          m.completed = true;
          m.ms = Date.now() - (m.startTs || Date.now());
          saveLocalProgress();
          fb.className = 'feedback-box fb-bad';
          fb.textContent = 'Showing solution…';
          setTimeout(() => { S.phase = 'guided'; go(); }, 900);
          return;
        }
      }
      fb.className = 'feedback-box fb-bad';
      fb.textContent = `❌ Not yet. Try again. (Attempt ${m?.attempts || '?'} of 3)`;
      if (miscon) { mb.textContent = '⚠️ ' + miscon; mb.style.display = 'block'; } else { mb.style.display = 'none'; }
      hb.textContent = '💡 ' + (p.misconceptions?.[key] || L(p, 'subtle')); hb.style.display = 'block';
      speak('Not quite. Try again.');
      saveLocalProgress();
    }
  };
}
function initReviewDynamic() {
  const completed = S.studyConfig.puzzles.filter((_,idx)=>S.metrics.puzzles[idx]?.completed).map((_,idx)=>idx);
  let pool = completed.slice();
  if(pool.length < 3){
    const incomplete = S.studyConfig.puzzles.map((_,i)=>i).filter(i=>!completed.includes(i));
    const needed = 3 - pool.length;
    pool.push(...incomplete.slice(0, needed));
  }
  S.reviewQueue = shuffle(pool).slice(0,3);
  S.reviewIdx = 0;
  S.phase = 'review';
  saveLocalProgress();
  const rp = S.studyConfig.puzzles[S.reviewQueue[0]];
  if(rp){ S.fadedLocked=[]; S.available=shuffle(rp.cards); S.userSeq=[]; }
}
function renderReviewDynamic() { return renderAttemptDynamic(true); }
function bindReviewDynamic() { bindAttemptDynamic(true); }
function renderReflectDynamic() {
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><h2>✏️ Reflect</h2><div class="reflect-q">💬 ${L(p,'reflectionQ')}</div><textarea id="reflectTxt" placeholder="Write your answer here…"></textarea><div class="actions"><button class="btn btn-secondary" id="btnSkipReflect">Skip →</button><button class="btn btn-success" id="btnSaveReflect">Save & Continue →</button></div></div>`;
}
function bindReflectDynamic() {
  el('btnSaveReflect')?.addEventListener('click',()=>{ const txt = el('reflectTxt')?.value.trim()||''; if(!S.metrics.puzzles[S.puzzleIdx]) S.metrics.puzzles[S.puzzleIdx] = {}; S.metrics.puzzles[S.puzzleIdx].reflection = txt; saveLocalProgress(); S.phase='code'; go(); });
  el('btnSkipReflect')?.addEventListener('click',()=>{ S.phase='code'; go(); });
}
function renderCodeDynamic() {
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><h2>💻 From steps to code</h2><pre class="code-block">${L(p,'pseudocode')}</pre><div class="actions"><button class="btn btn-secondary btn-sm" id="btnSpeakCode">🔊 Read aloud</button><button class="btn btn-primary" id="btnCodeNext">${S.puzzleIdx < S.studyConfig.puzzles.length-1 ? 'Next puzzle →' : 'Go to Review →'}</button></div></div>`;
}
function bindCodeDynamic() {
  el('btnSpeakCode')?.addEventListener('click',()=>{ const p=S.studyConfig.puzzles[S.puzzleIdx]; speak(L(p,'pseudocode')); });
  el('btnCodeNext')?.addEventListener('click',()=>{ if(S.puzzleIdx < S.studyConfig.puzzles.length-1){ S.puzzleIdx++; S.phase='study'; go(); } else { initReviewDynamic(); go(); } });
}
function renderGuided() {
  const p = S.studyConfig.puzzles[S.puzzleIdx];
  const steps = p.correctOrder.map((id,i)=>{ const card = p.cards.find(c=>c.id===id); return `<div class="study-step"><span class="step-num">${i+1}</span><div class="step-body"><div class="step-label">${card.emoji} ${L(card,'label')}</div><div class="step-why">${L(p,'whySteps')[i]}</div></div></div>`; }).join('');
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:14px 16px;margin-bottom:18px"><p style="font-weight:800;color:#9a3412;margin-bottom:4px">⚠️ Maximum attempts reached</p><p style="font-size:.88rem;color:#9a3412">Here is the correct solution with explanations. This puzzle will appear again in the Review phase so you can try independently.</p></div><h2>👁 Correct solution — ${L(p,'title')}</h2><div class="prompt-box">${L(p,'prompt')}</div>${steps}<div class="example-box" style="margin-top:14px">💡 ${L(p,'subtle')}</div><div class="actions"><button class="btn btn-primary" id="btnGuidedNext">I understand — continue →</button></div></div>`;
}
function bindGuided() { el('btnGuidedNext')?.addEventListener('click',()=>{ S.phase='reflect'; go(); }); }
function renderDebrief() {
  const hasPre = S.studyConfig.preQ && S.studyConfig.preQ.length > 0;
  const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
  const hasPuzzles = S.studyConfig.puzzles && S.studyConfig.puzzles.length > 0;
  
  if (!hasPre && !hasPost && !hasPuzzles) {
    return `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
      <div style="text-align:center; padding:20px 0;">
        <div style="font-size:4rem;">✅</div>
        <h2>Survey Completion — Debrief</h2>
        <p style="font-size:1rem; margin:16px 0; text-align:left;">
          <strong>If you submit this, your responses will be recorded and used in the research study if you chose "Yes, I consent" on the first page.</strong>
        </p>
        <div style="text-align:left; background:var(--gray-50); padding:16px; border-radius:12px; margin:16px 0;">
          <p><strong>Before you go:</strong> We want to assure you that it is perfectly normal to experience the feelings of "being an impostor" that were described earlier. These feelings are common and are experienced by many people, including highly successful individuals. We study this phenomenon because it can affect performance and wellbeing.</p>
          <p style="margin-top:12px;">If you want to speak with someone about your experience, please contact your department’s academic advisor or student support services.</p>
          <p style="margin-top:12px; font-style:italic;">Thank you for your participation.</p>
        </div>
        <div class="actions" style="justify-content:center; margin-top:24px;">
          <button class="btn btn-secondary" id="btnDebriefBack">📚 Back to Studies</button>
          <button class="btn btn-primary" id="btnDebriefNext">🎓 View Certificate</button>
        </div>
      </div>
    </div>`;
  }
  
  const gain = (S.metrics?.postScore && S.metrics?.preScore) ? S.metrics.postScore - S.metrics.preScore : null;
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="cert-box"><div class="pcode-num">${S.participantCode}</div>${gain!==null?`<p>Learning gain: ${gain>=0?'+':''}${gain}%</p>`:''}</div><div class="actions"><button class="btn btn-primary" id="btnDebriefNext">View results →</button></div></div>`;
}
async function renderComplete() {
  const hasPuzzles = S.studyConfig.puzzles && S.studyConfig.puzzles.length > 0;
  const hasDelayedPostTest = S.studyConfig.delayed_post_test_weeks > 0;
  const followupCompleted = S.metrics?.followupCompleted === true;
  const followupAvailableAt = S.metrics?.followupAvailableAt ? new Date(S.metrics.followupAvailableAt) : null;

  // --- Survey‑only study (no puzzles) ---
  if (!hasPuzzles && S.completedPhases.survey && !S.completedPhases.puzzles) {
    if (!S.completedSaved) {
      S.completedSaved = true;
      S.completedPhases.posttest = true;
      saveLocalProgress({ completed: true });
    }
    return certificatePage();
  }

  // --- Delayed post‑test is pending ---
  if (hasDelayedPostTest && !followupCompleted) {
    let message = '';
    let buttonHtml = '';
    if (followupAvailableAt && new Date() >= followupAvailableAt) {
      message = 'The delayed post‑test is now available.';
      buttonHtml = `<button class="btn btn-primary" id="btnStartFollowupFromComplete">Start delayed post‑test →</button>`;
    } else {
      const daysLeft = followupAvailableAt
        ? Math.ceil((followupAvailableAt - new Date()) / (1000 * 60 * 60 * 24))
        : 'soon';
      message = `The delayed post‑test will be available in ${daysLeft} day(s). Please return later.`;
    }
    return `${topbarHTML()}<div class="main-card">
      <h2>Study in progress</h2>
      <p>You have completed the main part of the study. ${message}</p>
      ${buttonHtml}
      <div class="actions">
        <button class="btn btn-secondary" id="btnBackToStudiesFromComplete">📚 Back to Studies</button>
      </div>
    </div>`;
  }

  // --- Post‑test waiting period (min_days_between_pretest_posttest) ---
  if (S.postTestPending && S.completedPhases.puzzles && S.studyConfig?.min_days_between_pretest_posttest > 0) {
    const preDate = new Date(S.metrics.preCompletedAt);
    const now = new Date();
    const minDays = S.studyConfig.min_days_between_pretest_posttest;
    const daysSincePre = (now - preDate) / (1000 * 60 * 60 * 24);
    const daysLeft = Math.ceil(minDays - daysSincePre);
    const waitingDays = isNaN(daysLeft) ? minDays : daysLeft;
    return `${topbarHTML()}<div class="main-card">
      <h2>Post‑test waiting period</h2>
      <p>You have completed the main study. The post‑test will be available in <strong>${waitingDays} day(s)</strong>.</p>
      <p>You will be able to take it when you return after ${minDays} days from your pre‑test.</p>
      <div class="actions"><button class="btn btn-primary" id="btnBackToStudies">← Back to Studies</button></div>
    </div>`;
  }

  // --- Completion (no delayed post‑test, or follow‑up already done) ---
  // Mark as completed if not already done
  if (!S.completedSaved) {
    S.completedSaved = true;
    saveLocalProgress({ completed: true });
  }

  // Certificate page (existing code)
  const solved = Object.values(S.metrics?.puzzles || {}).filter(p => p.completed).length;
  let peerHtml = '';
  if (API_BASE !== undefined && S.currentStudyId) {
    const data = await apiAverageGain(S.currentStudyId);
    if (data && data.averageGain !== undefined) {
      const myGain = (S.metrics.postScore || 0) - (S.metrics.preScore || 0);
      const diff = myGain - data.averageGain;
      peerHtml = `<div class="example-box" style="margin-top:14px">📊 Class average learning gain: ${data.averageGain.toFixed(1)}%. ${diff > 0 ? 'You did better than average! 🎉' : diff < 0 ? 'Keep practising – you can improve!' : 'You are on par with your peers.'}</div>`;
    }
  }

  return `${topbarHTML()}<div class="main-card"><div class="score-hero"><div class="score-big">${solved}/${S.studyConfig.puzzles.length}</div><p>puzzles solved</p></div>${peerHtml}<div class="actions"><button class="btn btn-secondary" id="btnViewDash">📊 Dashboard</button><button class="btn btn-primary" id="btnDownloadCertPDF">📄 Download Certificate (PDF)</button><button class="btn btn-secondary" id="btnPrintCert">🖨 Print certificate</button><button class="btn btn-secondary" id="btnBackToStudies">📚 Back to Studies</button></div></div>`;
}

// Helper for survey‑only certificate (kept for clarity)
function certificatePage() {
  return `${topbarHTML()}<div class="main-card">
    <div style="text-align:center; padding:20px 0;">
      <div style="font-size:4rem;">🎓</div>
      <h2>Participation Complete</h2>
      <p>Thank you for your participation in this study.</p>
      <p style="color:var(--muted);">You can download your certificate below.</p>
      <div class="actions" style="justify-content:center; margin-top:24px;">
        <button class="btn btn-primary" id="btnDownloadCertPDF">📄 Download Certificate (PDF)</button>
        <button class="btn btn-secondary" id="btnPrintCert">🖨 Print certificate</button>
        <button class="btn btn-secondary" id="btnBackToStudies">📚 Back to Studies</button>
      </div>
    </div>
  </div>`;
}

function bindDebrief() {
  el('btnDebriefBack')?.addEventListener('click', () => {
    S.studyConfig = null;
    S.phase = 'studySelect';
    go();
  });
  el('btnDebriefNext')?.addEventListener('click', () => {
    S.phase = 'complete';
    go();
  });
}
function bindComplete() {
  el('btnViewDash')?.addEventListener('click', () => {
    window.location.href = window.location.pathname + '?admin=true';
  });

  el('btnDownloadCertPDF')?.addEventListener('click', () => {
    const completionDate = S.metrics?.completedAt || S.metrics?.mainCompletedAt || null;
    const certHtml = generateCertificateHTML(completionDate);
    const blob = new Blob([certHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate_${S.participantCode}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('Certificate HTML saved. Open it in your browser and print to PDF for a permanent copy.');
  });

  el('btnPrintCert')?.addEventListener('click', () => {
    const completionDate = S.metrics?.completedAt || S.metrics?.mainCompletedAt || null;
    const certHtml = generateCertificateHTML(completionDate);
    const win = window.open();
    win.document.write(certHtml);
    win.document.close();
    win.focus();
    win.print();
  });

  // For both certificate and waiting page back buttons
el('btnBackToStudies')?.addEventListener('click', async () => {
  if (S.participantCode) {
    S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
  }
  S.studyConfig = null;
  S.phase = 'studySelect';
  go();
});

el('btnBackToStudiesFromComplete')?.addEventListener('click', async () => {
  if (S.participantCode) {
    S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
  }
  S.studyConfig = null;
  S.phase = 'studySelect';
  go();
});

  // Start delayed post‑test from the waiting page
  el('btnStartFollowupFromComplete')?.addEventListener('click', () => {
    S.assMode = 'post';
    S.assQ = 0;
    S.assAnswers = [];
    S.phase = 'followup';
    go();
  });
}
function renderAdminLogin() {
  return `${topbarHTML()}<div class="main-card"><h2>🔐 Admin Login</h2><p>Please enter the admin password to access the dashboard.</p><div class="input-row" style="max-width:300px"><input type="password" id="adminPassword" placeholder="Password" /></div><div id="loginError" style="color:var(--danger);text-align:center"></div><div class="actions"><button class="btn btn-secondary" id="btnLoginCancel">Cancel</button><button class="btn btn-primary" id="btnLoginSubmit">Login</button></div></div>`;
}
function bindAdminLogin() {
  el('btnLoginSubmit')?.addEventListener('click', async () => { const password = el('adminPassword')?.value; if (!password) return; try { await apiAdminLogin(password); S.isAdminMode = true; S.phase = 'dashboard'; window.history.replaceState({}, '', window.location.pathname); go(); } catch(e) { el('loginError').innerText = 'Invalid password'; } });
  el('btnLoginCancel')?.addEventListener('click', () => { window.history.replaceState({}, '', window.location.pathname); S.phase = 'hero'; go(); });
}
function renderDashboard() {
  return `${topbarHTML()}<div class="main-card"><h2>📊 Researcher Dashboard</h2><p>Select a study to manage.</p><div id="studySelector" style="margin-bottom:20px"><select id="adminStudySelect" style="width:100%;padding:10px;border-radius:12px;border:1.5px solid var(--border)"><option value="">-- Loading studies --</option></select></div><div id="portalMgmtPanel" class="portal-status-placeholder" style="margin-bottom:20px">Loading...</div><div class="dash-grid" id="statsGrid" style="margin-bottom:20px"><div class="stat-card"><div class="stat-num">—</div><div class="stat-label">Enrolled</div></div><div class="stat-card"><div class="stat-num">—</div><div class="stat-label">In progress</div></div><div class="stat-card"><div class="stat-num">—</div><div class="stat-label">Completed</div></div><div class="stat-card"><div class="stat-num">—</div><div class="stat-label">Spaces left</div></div></div><div class="actions"><button class="btn btn-secondary" id="btnExportCSV">📊 Export CSV</button><button class="btn btn-secondary" id="btnExportJSON">📥 Export JSON</button><button class="btn btn-secondary" id="btnClearLocalData">🗑 Clear local data</button><button class="btn btn-primary" id="btnDashBack">← Back to portal</button></div></div>`;
}
function bindDashboard() {
  let currentStudyId = null;
  async function loadStudies() {
    const studies = await apiAdminFetchStudies();
    const select = document.getElementById('adminStudySelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select a study --</option>';
    studies.forEach(study => {
      const option = document.createElement('option');
      option.value = study.id;
      option.textContent = `${study.title_en} (${study.status})`;
      select.appendChild(option);
    });
    select.addEventListener('change', async () => {
      currentStudyId = select.value;
      if (currentStudyId) await refreshPortalStatus(currentStudyId);
    });
  }
  async function refreshPortalStatus(studyId) {
    if (!studyId) return;
    try {
      const status = await apiPortalStatus(studyId);
      if (!status) return;
      const enrolled = status.enrolled || 0, inProgress = status.inProgress || 0, completed = status.completed || 0, capacity = status.capacity || 100, spacesLeft = Math.max(0, capacity - enrolled);
      const grid = document.getElementById('statsGrid'); if (grid) { grid.innerHTML = `<div class="stat-card"><div class="stat-num">${enrolled}</div><div class="stat-label">Enrolled</div></div><div class="stat-card"><div class="stat-num">${inProgress}</div><div class="stat-label">In progress</div></div><div class="stat-card"><div class="stat-num">${completed}</div><div class="stat-label">Completed</div></div><div class="stat-card"><div class="stat-num">${spacesLeft}</div><div class="stat-label">Spaces left</div></div>`; }
      const statusOpen = status.status === 'open';
      const mgmtHtml = `<div class="portal-status ${statusOpen ? 'ps-open' : 'ps-closed'}"><span class="status-badge ${statusOpen ? 'sb-open' : 'sb-closed'}">${statusOpen ? 'OPEN' : 'CLOSED'}</span><span style="font-weight:700">${enrolled}/${capacity} enrolled</span><div class="pipeline-bar" style="flex:1;min-width:120px"><div class="pb-done" style="width:${capacity>0?Math.round((completed/capacity)*100):0}%"></div><div class="pb-prog" style="width:${capacity>0?Math.round(((enrolled-completed)/capacity)*100):0}%"></div><div class="pb-idle" style="flex:1"></div></div><span style="font-size:.82rem">${Math.round((enrolled/capacity)*100)}% capacity</span></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0"><button class="btn btn-success btn-sm" id="btnPortalOpen" ${statusOpen ? 'disabled' : ''}>✅ Open enrolment</button><button class="btn btn-warn btn-sm" id="btnPortalClose" ${!statusOpen ? 'disabled' : ''}>🔒 Close enrolment</button><label style="font-size:.88rem;font-weight:700;display:flex;align-items:center;gap:6px">Capacity: <input id="inpCap" type="number" min="1" max="500" value="${capacity}" style="width:80px;padding:6px;border-radius:10px;border:1.5px solid var(--border)"><button class="btn btn-secondary btn-sm" id="btnSetCap">Set</button></label><button class="btn btn-warn btn-sm" id="btnSendReminders" style="background:#d97706;">📧 Send email reminders (inactive >3 days)</button><span id="reminderStatus" style="margin-left:12px;font-size:0.85rem;"></span></div>`;
      const panel = document.getElementById('portalMgmtPanel'); if (panel) panel.innerHTML = mgmtHtml;
      document.getElementById('btnPortalOpen')?.addEventListener('click', async () => { await apiPortalControl(currentStudyId, 'open', undefined); refreshPortalStatus(currentStudyId); });
      document.getElementById('btnPortalClose')?.addEventListener('click', async () => { await apiPortalControl(currentStudyId, 'closed', undefined); refreshPortalStatus(currentStudyId); });
      document.getElementById('btnSetCap')?.addEventListener('click', async () => { const newCap = parseInt(document.getElementById('inpCap')?.value || '100'); if (newCap > 0) await apiPortalControl(currentStudyId, undefined, newCap); refreshPortalStatus(currentStudyId); });
      const reminderBtn = document.getElementById('btnSendReminders');
      const reminderSpan = document.getElementById('reminderStatus');
      if (reminderBtn) {
        reminderBtn.onclick = async () => {
          if (reminderSpan) reminderSpan.textContent = 'Sending...';
          try {
            const res = await apiSendReminders(currentStudyId, 3);
            if (reminderSpan) reminderSpan.textContent = `Sent ${res.results.filter(r=>r.status==='sent').length} reminders (${res.total} eligible).`;
            showSavedToast(`Reminders sent for study ${currentStudyId}`);
          } catch (err) { if (reminderSpan) reminderSpan.textContent = 'Error sending.'; console.error(err); }
        };
      }
    } catch (e) { console.warn('Failed to load portal status', e); const panel = document.getElementById('portalMgmtPanel'); if (panel) panel.innerHTML = '<div class="example-box">Could not load portal status. Make sure you are logged in as admin.</div>'; }
  }
  el('btnExportCSV')?.addEventListener('click', async () => { if (!currentStudyId) { alert('Please select a study first'); return; } try { const csv = await apiExportCSV(currentStudyId); const blob = new Blob([csv], {type: 'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `study_${currentStudyId}_export.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showSavedToast('CSV exported'); } catch(e) { alert('Export failed: ' + e.message); } });
  el('btnExportJSON')?.addEventListener('click', async () => { if (!currentStudyId) { alert('Please select a study first'); return; } try { const jsonData = await apiExportJSON(currentStudyId); const blob = new Blob([JSON.stringify(jsonData, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `study_${currentStudyId}_export.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showSavedToast('JSON exported'); } catch(e) { alert('Export failed: ' + e.message); } });
  el('btnClearLocalData')?.addEventListener('click', () => { if (confirm('Clear all local enrolment data? This cannot be undone. Data on the server remains unaffected.')) { const keys = Object.keys(localStorage).filter(k => k.startsWith('research_')); keys.forEach(k => localStorage.removeItem(k)); showSavedToast('Local data cleared'); } });
  el('btnDashBack')?.addEventListener('click', () => { S.isAdminMode = false; S.phase = 'hero'; go(); });
  loadStudies();
}
function renderFollowupDynamic() {
  const qs = S.studyConfig.postQ;
  if (!qs || !qs.length) return `<div class="main-card">No follow‑up questions</div>`;
  const q = qs[S.assQ];
  const isAnswered = S.assAnswers[S.assQ] !== undefined;
  const chosen = S.assAnswers[S.assQ];
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><div class="prog-wrap"><div class="prog-row"><span>Delayed Post‑test – Question ${S.assQ+1}/${qs.length}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${((S.assQ+1)/qs.length)*100}%"></div></div></div><div class="q-wrap"><p class="q-text">${L(q,'q')}</p>${(L(q,'opts')).map((opt,i)=>{ let extra=''; if(isAnswered) { if(i===q.correct) extra=' correct-ans'; else if(i===chosen && chosen!==q.correct) extra=' wrong-ans'; } else if(i===chosen) extra=' selected'; return `<button class="option-btn${extra}" data-idx="${i}" ${isAnswered?'disabled':''}>${'ABCD'[i]}. ${opt}</button>`; }).join('')}</div><div class="actions">${isAnswered ? `<button class="btn btn-primary" id="btnFollowupNext">${S.assQ<qs.length-1?'Next →':'Finish →'}</button>` : ''}</div></div>`;
}
function bindFollowupDynamic() {
  document.querySelectorAll('.option-btn:not([disabled])').forEach(btn => { btn.onclick = () => { S.assAnswers[S.assQ] = parseInt(btn.dataset.idx); saveLocalProgress(); go(); }; });
  el('btnFollowupNext')?.addEventListener('click', () => {
    const qs = S.studyConfig.postQ;
    if (S.assQ < qs.length-1) { S.assQ++; go(); }
    else {
      const scorable = qs.filter(q=>!q.isAttention);
      const total = Math.round((scorable.filter((q,i)=>S.assAnswers[qs.indexOf(q)]===q.correct).length / scorable.length)*100);
      S.metrics.followupScore = total;
      S.metrics.followupCompleted = true;
      S.metrics.followupCompletedAt = new Date().toISOString();
      S.completedPhases.followup = true;
      saveLocalProgress();
      S.phase = 'complete';
      go();
    }
  });
}
function isFollowupAvailable() {
  const data = S.metrics || {};
  if (!data.mainCompletedAt) return false;
  if (data.followupCompleted) return false;
  if (!data.followupAvailableAt) return false;
  const availableAt = new Date(data.followupAvailableAt);
  return new Date() >= availableAt;
}
function canStartPostTest() {
  const minDays = S.studyConfig?.min_days_between_pretest_posttest || 0;
  if (minDays === 0) return true;
  if (!S.metrics?.preCompletedAt) return false;
  const preDate = new Date(S.metrics.preCompletedAt);
  const now = new Date();
  return (now - preDate) / (1000*60*60*24) >= minDays;
}
function generateCertificateHTML(completionDateOverride) {
  const studyTitle = S.studyConfig?.title_en || 'Computing Education Research Study';
  const participantName = S.participantName || 'Participant';
  const participantCode = S.participantCode || 'N/A';
  
  // Determine completion date
  let completionDate;
  if (completionDateOverride) {
    completionDate = new Date(completionDateOverride).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } else {
    const dateFromMetrics = S.metrics?.completedAt || S.metrics?.mainCompletedAt;
    if (dateFromMetrics) {
      completionDate = new Date(dateFromMetrics).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      completionDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }

  const ethicsRef = ETHICS_REF;
  const researcherContact = RESEARCHER_CONTACT;
  const verificationData = `${participantCode}|${completionDate}|${S.currentStudyId}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verificationData)}&size=200&margin=2`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Research Participation Certificate</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Georgia', 'Times New Roman', serif;
          background: #f0f2f5;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 40px;
        }
        .certificate {
          max-width: 800px;
          background: white;
          border: 2px solid #1e3a8a;
          border-radius: 24px;
          padding: 48px 40px;
          box-shadow: 0 20px 35px -10px rgba(0,0,0,0.1);
          text-align: center;
          position: relative;
        }
        .certificate::before {
          content: "🎓";
          font-size: 60px;
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 0 20px;
        }
        h1 { font-size: 32px; color: #1e3a8a; margin-top: 20px; margin-bottom: 8px; }
        .subtitle { font-size: 18px; color: #475569; border-bottom: 2px solid #e2e8f0; display: inline-block; padding-bottom: 6px; margin-bottom: 24px; }
        .award-text { font-size: 20px; margin: 30px 0 20px; line-height: 1.5; }
        .participant-name { font-size: 36px; font-weight: bold; margin: 20px 0; color: #0f172a; border-bottom: 1px dashed #cbd5e1; display: inline-block; padding: 0 20px 10px; }
        .details { background: #f8fafc; border-radius: 16px; padding: 20px; margin: 30px 0; text-align: left; font-family: monospace; font-size: 14px; }
        .details p { margin: 8px 0; }
        .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; font-size: 12px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        .qr-code img { width: 80px; height: 80px; }
        @media print {
          body { background: white; padding: 0; margin: 0; }
          .certificate { box-shadow: none; border: 1px solid #ccc; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="certificate">
        <h1>Certificate of Participation</h1>
        <div class="subtitle">Research Portal – Computing Education</div>
        <div class="award-text">This certificate is awarded to</div>
        <div class="participant-name">${escapeHtml(participantName)}</div>
        <div class="award-text">for completing the research study</div>
        <div style="font-weight: bold; font-size: 22px; margin: 10px 0;">${escapeHtml(studyTitle)}</div>
        <div class="details">
          <p><strong>Participant code:</strong> ${participantCode}</p>
          <p><strong>Email:</strong> ${escapeHtml(S.participantEmail || 'Not provided')}</p>
          <p><strong>Completion date:</strong> ${completionDate}</p>
          <p><strong>Ethics reference:</strong> ${ethicsRef}</p>
        </div>
        <div class="footer">
          <div class="ethics"><p>Researcher: ${researcherContact}</p><p>${ethicsRef}</p></div>
          <div class="qr-code"><img src="${qrUrl}" alt="Verification QR"><p>Scan to verify</p></div>
        </div>
      </div>
      <div class="no-print" style="position: fixed; bottom: 20px; right: 20px;">
        <button onclick="window.print()" style="padding: 8px 16px; background: #1e3a8a; color: white; border: none; border-radius: 8px; cursor: pointer;">🖨 Print / Save as PDF</button>
      </div>
    </body>
    </html>
  `;
}
function renderCertificates() {
  return `${topbarHTML()}<div class="main-card">
    <h2>📜 Your Certificates</h2>
    <p>Enter your participant code to view and download certificates for all completed studies.</p>
    <div class="input-row" style="max-width:300px;">
      <input type="text" id="certCode" placeholder="Participant code" />
    </div>
    <div id="certList" style="margin-top:20px;"></div>

    <div style="margin-top:30px; border-top:1px solid var(--border); padding-top:20px;">
      <p><strong>Forgot your participant code?</strong> Enter your matric number below and we'll send it to your registered email.</p>
      <div class="input-row" style="max-width:300px;">
        <input type="text" id="certMatric" placeholder="Matric number (e.g. NDCS/024/2002)" />
        <button class="btn btn-secondary" id="btnSendCodeCert">📧 Send my code</button>
      </div>
      <div id="certRecoveryStatus" style="margin-top:10px; font-size:0.9rem;"></div>
    </div>

    <div class="actions">
      <button class="btn btn-secondary" id="btnCertBack">← Back</button>
    </div>
  </div>`;
}

async function bindCertificates() {
  const codeInput = document.getElementById('certCode');
  const listDiv = document.getElementById('certList');
  const backBtn = document.getElementById('btnCertBack');

  // --- Code recovery ---
  const matricInput = document.getElementById('certMatric');
  const sendBtn = document.getElementById('btnSendCodeCert');
  const recoveryStatus = document.getElementById('certRecoveryStatus');

  sendBtn?.addEventListener('click', async () => {
    const matric = matricInput?.value.trim();
    if (!matric) {
      recoveryStatus.textContent = 'Please enter your matric number.';
      recoveryStatus.style.color = 'var(--danger)';
      return;
    }
    recoveryStatus.textContent = 'Sending...';
    recoveryStatus.style.color = 'var(--text)';
    try {
      const result = await apiSendCode(matric);
      if (result.success) {
        recoveryStatus.textContent = '✅ Code sent to your registered email address.';
        recoveryStatus.style.color = 'var(--success)';
      } else {
        recoveryStatus.textContent = '❌ Failed to send. Please check your matric and try again.';
        recoveryStatus.style.color = 'var(--danger)';
      }
    } catch (e) {
      recoveryStatus.textContent = '❌ ' + (e.message || 'Error sending code.');
      recoveryStatus.style.color = 'var(--danger)';
    }
  });

  // --- Back button ---
  backBtn?.addEventListener('click', () => {
    S.phase = 'hero';
    go();
  });

  // --- Live search for certificates ---
  codeInput?.addEventListener('input', async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 5) {
      listDiv.innerHTML = '';
      return;
    }
    try {
      const enrolments = await apiGetMyEnrolments(code);
      const completed = enrolments.filter(e => e.status === 'completed');
      if (completed.length === 0) {
        listDiv.innerHTML = '<p>No completed studies found for this code.</p>';
        return;
      }
      listDiv.innerHTML = completed.map(e => {
        const studyTitle = e.study?.title_en || 'Study';
        const completedDate = e.completed_at ? new Date(e.completed_at).toLocaleDateString() : 'N/A';
        return `<div class="cert-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border);">
          <div><strong>${studyTitle}</strong><br><span style="font-size:0.85rem;color:var(--muted);">Completed: ${completedDate}</span></div>
          <button class="btn btn-primary btn-sm cert-download" data-enrolment="${e.id}" data-code="${code}">📄 Download Certificate</button>
        </div>`;
      }).join('');

      // Bind download buttons
      document.querySelectorAll('.cert-download').forEach(btn => {
        btn.addEventListener('click', async () => {
          const enrolId = btn.dataset.enrolment;
          const code = btn.dataset.code;
          const enrol = completed.find(e => e.id == enrolId);
          if (!enrol) return;

          // Temporarily set S to this study's data to reuse generateCertificateHTML
          const oldConfig = S.studyConfig;
          const oldMetrics = S.metrics;
          const oldName = S.participantName;
          const oldCode = S.participantCode;
          const oldEmail = S.participantEmail;
          const oldStudyId = S.currentStudyId;

          S.participantCode = code;
          S.participantName = enrol.participant?.name || 'Participant';
          S.participantEmail = enrol.participant?.email || '';
          S.currentStudyId = enrol.study_id;
          const config = await apiFetchStudyConfig(enrol.study_id);
          S.studyConfig = config;
          S.metrics = enrol.data || {};
          if (enrol.duration_ms) {
            S.metrics.durationMs = enrol.duration_ms;
          } else if (S.metrics.startedAt && enrol.completed_at) {
            S.metrics.durationMs = new Date(enrol.completed_at) - new Date(S.metrics.startedAt);
          }

          // const certHtml = generateCertificateHTML();
          const certHtml = generateCertificateHTML(enrol.completed_at);

          // Restore original state
          S.studyConfig = oldConfig;
          S.metrics = oldMetrics;
          S.participantName = oldName;
          S.participantCode = oldCode;
          S.participantEmail = oldEmail;
          S.currentStudyId = oldStudyId;

          const blob = new Blob([certHtml], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `certificate_${code}_${enrol.study_id}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      });
    } catch (e) {
      listDiv.innerHTML = `<p style="color:var(--danger);">Error: ${e.message}</p>`;
    }
  });
}

// ============================================================
// MAIN GO FUNCTION
// ============================================================
async function go() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('admin') && S.phase !== 'dashboard' && !S.isAdminMode) { S.isAdminMode = true; S.phase = 'adminLogin'; }
  const resumeCode = urlParams.get('resume');
  if (resumeCode && S.phase === 'hero') {
    setTimeout(() => { const inp = document.getElementById('resumeCode'); if(inp) { inp.value = resumeCode; document.getElementById('btnDoResume')?.click(); } }, 100);
  }
  const phasesNeedingConfig = ['orient','consent','survey','pre','study','faded','attempt','reflect','code','review','post','followup','guided','debrief','complete','resume'];
  if (phasesNeedingConfig.includes(S.phase) && !S.studyConfig && S.currentStudyId) {
    console.log('Reloading study config');
    try {
      S.studyConfig = await apiFetchStudyConfig(S.currentStudyId);
      if (!S.studyConfig) throw new Error('No config');
      S.totalPuzzles = S.studyConfig.puzzles?.length || 0;
    } catch(e) { alert('Could not load study. Please try again.'); S.phase='hero'; go(); return; }
  }

  // Refresh enrolments and studies when entering study selection
  if (S.phase === 'studySelect') {
    if (S.availableStudies.length === 0) {
      S.availableStudies = await apiFetchStudies();
    }
    if (S.participantCode) {
      S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
    }
  }

  const needsProgress = ['pre','study','faded','attempt','reflect','code','review','post'];
  if (needsProgress.includes(S.phase)) {
    const hasRealProgress = S.completedPhases.survey || S.completedPhases.pretest || S.completedPhases.puzzles || 
                            (S.metrics && (Object.keys(S.metrics.puzzles || {}).length > 0 || S.metrics.preScore !== undefined));
    if (!hasRealProgress) {
      console.log('No progress, redirecting to orient');
      S.phase = 'orient';
    }
  }
  if (S.phase === 'pre' && S.completedPhases.pretest) {
    S.phase = 'study';
    S.puzzleIdx = S.puzzlesCompletedCount;
  }
  const app = document.getElementById('app');
  let html = '';
  switch(S.phase){
    case 'hero': html = renderHero(); break;
    case 'register': html = renderRegister(); break;
    case 'studySelect': html = renderStudySelect(); break;
    case 'resumeSelect': html = renderResumeSelect(); break;
    case 'orient': html = renderOrient(); break;
    case 'consent': html = renderConsent(); break;
    case 'survey': html = renderSurveyDynamic(); break;
    case 'pre': html = renderAssessmentDynamic('pre'); break;
    case 'study': html = renderStudyDynamic(); break;
    case 'faded': html = renderFadedDynamic(); break;
    case 'attempt': html = renderAttemptDynamic(); break;
    case 'reflect': html = renderReflectDynamic(); break;
    case 'code': html = renderCodeDynamic(); break;
    case 'review': html = renderReviewDynamic(); break;
    case 'post': html = renderAssessmentDynamic('post'); break;
    case 'followup': html = renderFollowupDynamic(); break;
    case 'guided': html = renderGuided(); break;
    case 'debrief': html = renderDebrief(); break;
    case 'complete': html = await renderComplete(); break;
    case 'adminLogin': html = renderAdminLogin(); break;
    case 'dashboard': html = renderDashboard(); break;
    case 'resume': html = renderResume(); break;
    case 'certificates': html = renderCertificates(); break;
    default: html = '<div>Error</div>';
  }
  app.innerHTML = html;
  el('btnTheme')?.addEventListener('click',()=>{ toggleTheme(); });
  el('btnAudio')?.addEventListener('click',()=>{ S.audioOn = !S.audioOn; go(); });
  el('btnOtherStudies')?.addEventListener('click', async () => {
    if (S.participantCode) {
      S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
    }
    S.availableStudies = await apiFetchStudies();
    S.phase = 'studySelect';
    go();
  });
  el('btnLangStudy')?.addEventListener('click',()=>{ if(S.studyConfig?.bilingual) { S.studyLang = S.studyLang === 'en' ? 'ha' : 'en'; saveLocalProgress(); go(); } });
  el('btnWithdraw')?.addEventListener('click', async () => { if(confirm('Withdraw? Progress lost.')) { await apiWithdraw(S.currentEnrolmentId); localStorage.removeItem(getStorageKey()); S.phase='hero'; go(); } });
  el('btnLogoutPortal')?.addEventListener('click', () => { if(confirm('Logout?')) { S.phase='hero'; S.participantCode=null; S.participantName=''; S.participantMatric=''; S.participantEmail=''; S.participantGender=''; S.currentEnrolmentId=null; S.currentStudyId=null; S.metrics=null; S.surveyAnswers={}; S.assAnswers=[]; go(); } });
  const resetTimer = () => { if(S.currentEnrolmentId) resetTimeoutTimer(); };
  window.addEventListener('click', resetTimer); window.addEventListener('keydown', resetTimer);
  if (S.currentEnrolmentId && !['hero','studySelect','adminLogin'].includes(S.phase)) resetTimeoutTimer();
  else if (S.timeoutInterval) clearInterval(S.timeoutInterval);
  switch(S.phase){
    case 'hero': bindHero(); break;
    case 'register': bindRegister(); break;
    case 'studySelect': bindStudySelect(); break;
    case 'resumeSelect': bindResumeSelect(); break;
    case 'orient': bindOrient(); break;
    case 'consent': bindConsent(); break;
    case 'survey': bindSurveyDynamic(); break;
    case 'pre': bindAssessmentDynamic('pre'); break;
    case 'study': bindStudyDynamic(); break;
    case 'faded': bindFadedDynamic(); break;
    case 'attempt': bindAttemptDynamic(); break;
    case 'reflect': bindReflectDynamic(); break;
    case 'code': bindCodeDynamic(); break;
    case 'review': bindReviewDynamic(); break;
    case 'post': bindAssessmentDynamic('post'); el('btnBackToStudies')?.addEventListener('click',()=>{ S.phase='studySelect'; go(); }); break;
    case 'followup': bindFollowupDynamic(); break;
    case 'guided': bindGuided(); break;
    case 'debrief': bindDebrief(); break;
    case 'complete': bindComplete(); break;
    case 'adminLogin': bindAdminLogin(); break;
    case 'dashboard': bindDashboard(); break;
    case 'resume': bindResume(); break;
    case 'certificates': bindCertificates(); break;
    default: break;
  }
}
window.addEventListener('DOMContentLoaded', () => { applyTheme(); go(); });