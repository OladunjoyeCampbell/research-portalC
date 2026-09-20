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
  postSurveyAnswers: {},   // stores answers for the post‑survey
  reflectionWeek: 0,       // 0‑based index of the current weekly reflection
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
    followup: false,
    postSurvey: false   // <-- new 
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
/*function speak(text) {
  if(!S.audioOn || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = S.studyLang === 'ha' ? 'ha' : 'en';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch(e) { console.warn(e); }
} 
*/

// ============================================================
// UPDATED: Speak using ElevenLabs for Hausa,
// Browser speech for English
// ============================================================

let currentAudio = null;

async function speak(text) {

    if (!S.audioOn || !text) return;

    // Stop any browser speech
    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }

    // Stop previous ElevenLabs audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    // ----------------------------
    // English → Browser speech
    // ----------------------------

    if (S.studyLang !== 'ha') {

        if (!window.speechSynthesis) return;

        const u = new SpeechSynthesisUtterance(text);

        u.lang = 'en-GB';

        u.rate = 0.9;

        speechSynthesis.speak(u);

        return;
    }

    // ----------------------------
    // Hausa → ElevenLabs
    // ----------------------------

    try {

        const response = await fetch('/api/speak', {

            method: 'POST',

            headers: {

                'Content-Type': 'application/json'

            },

            body: JSON.stringify({

                text

            })

        });

        if (!response.ok)
            throw new Error("Unable to generate speech.");

        const blob = await response.blob();

        const url = URL.createObjectURL(blob);

        currentAudio = new Audio(url);

        currentAudio.onended = () => {

            URL.revokeObjectURL(url);

            currentAudio = null;

        };

        currentAudio.play();

    }

    catch (err) {

        console.error(err);

        // Fallback to browser speech

        if (window.speechSynthesis) {

            const u = new SpeechSynthesisUtterance(text);

            u.lang = 'ha';

            u.rate = 0.9;

            speechSynthesis.speak(u);

        }

    }

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
// ============================================================
// DATE FORMATTING (for Nigerian participants)
// ============================================================
function formatDateDDMMYYYY(date) {
  if (!(date instanceof Date) || isNaN(date)) return 'N/A';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
function getProgrammeType(matric) {
  const prefix = (matric || '').split('/')[0].toUpperCase();
  if (prefix.startsWith('HND')) return 'hnd';
  if (prefix.startsWith('ND')) return 'nd';
  return 'other';
}

let _completionSyncDone = false;
function getLocalProgressForEnrolment(enrolmentId, participantCode) {
  const key = `research_${participantCode}_${enrolmentId}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function syncCompletionStatus() {
  if (!S.participantCode || !S.myEnrolments) return;

  let updated = false;
  for (const enrol of S.myEnrolments) {
    if (enrol.status === 'completed') continue;
    const local = getLocalProgressForEnrolment(enrol.id, S.participantCode);
    if (local && local.completed === true) {
      try {
        await fetch(`${API_BASE}/api/progress/${enrol.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(local)
        });
        // Update the local status in the array so the UI reflects it immediately
        enrol.status = 'completed';
        updated = true;
        console.log(`Synced completion for enrolment ${enrol.id}`);
      } catch (e) {
        console.warn(`Failed to sync completion for enrolment ${enrol.id}`, e);
      }
    }
  }
  // Optionally, re‑fetch enrolments to be fully in sync (but we already updated the array)
  if (updated) {
    // You can call apiGetMyEnrolments again if you want server‑side changes,
    // but updating the local array is enough for the UI.
  }
}

function isReflectionAvailable(idx) {
  const availableDate = getReflectionAvailableDate(idx);
  return new Date() >= availableDate;
}

function getReflectionAvailableDate(idx) {
  // Week 1 (index 0) is always available immediately
  if (idx === 0) return new Date();

  // ── 1. Time‑locked date ──
  const startDate = new Date(S.metrics?.studyStartDate || Date.now());
  const daysCumulative = S.studyConfig?.reflectionDays || [0, 7, 7, 7];
  let cumulative = 0;
  for (let i = 0; i <= idx; i++) {
    cumulative += daysCumulative[i] || 0;
  }
  const timeLockedDate = new Date(startDate);
  timeLockedDate.setDate(timeLockedDate.getDate() + cumulative);

  // ── 2. Submission‑locked date ──
  const prev = S.metrics?.reflections?.[idx - 1]?._submittedAt;
  let submissionLockedDate = null;
  if (prev) {
    const cooldown = S.studyConfig?.reflectionCooldownDays ?? 7;
    submissionLockedDate = new Date(prev);
    submissionLockedDate.setDate(submissionLockedDate.getDate() + cooldown);
  }

  // ── 3. Availability = the later of the two ──
  if (submissionLockedDate && submissionLockedDate > timeLockedDate) {
    return submissionLockedDate;
  }
  return timeLockedDate;
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
    postSurveyAnswers: { ...S.postSurveyAnswers },
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
    completedPhases: { ...S.completedPhases },   // includes postSurvey
    puzzlesCompletedCount: S.puzzlesCompletedCount,
    totalPuzzles: S.totalPuzzles,
    postTestPending: S.postTestPending,
    reflectionWeek: S.reflectionWeek,
    _resumeState: {
      phase: S.phase,
      puzzleIdx: S.puzzleIdx,
      assQ: S.assQ,
      assAnswers: [...(S.assAnswers || [])],
      assMode: S.assMode,
      surveyAnswers: { ...S.surveyAnswers },
      postSurveyAnswers: { ...S.postSurveyAnswers },   // new
      reviewQueue: [...(S.reviewQueue || [])],
      reviewIdx: S.reviewIdx,
      available: S.available ? [...S.available] : [],
      userSeq: S.userSeq ? [...S.userSeq] : [],
      fadedLocked: [...(S.fadedLocked || [])],
      currentEnrolmentId: S.currentEnrolmentId,
      currentStudyId: S.currentStudyId,
      reflectionWeek: S.reflectionWeek,                // new
      completedPhases: { ...S.completedPhases }        // new
    }
  };

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
    S.postSurveyAnswers = saved.postSurveyAnswers || {};
    S.assAnswers = saved.assAnswers || [];
    S.completedPhases = saved.completedPhases || {
      survey: false, pretest: false, puzzles: false, posttest: false, followup: false, postSurvey: false
    };
    if (S.completedPhases.postSurvey === undefined) {
      S.completedPhases.postSurvey = false;
    }

    // ── FALLBACK: If survey answers exist but survey flag is false, set it to true ──
    if (S.surveyAnswers && Object.keys(S.surveyAnswers).length > 0 && !S.completedPhases.survey) {
      console.log('⚠️ Survey answers found but flag was false – correcting');
      S.completedPhases.survey = true;
      saveLocalProgress();
    }

    S.puzzlesCompletedCount = saved.puzzlesCompletedCount || 0;
    S.totalPuzzles = saved.totalPuzzles || (S.studyConfig?.puzzles?.length || 0);
    S.postTestPending = saved.postTestPending || false;
    S.gradeConsent = saved.gradeConsent || false;
    S.reflectionWeek = saved.reflectionWeek || 0;

    // ── Restore studyStartDate if missing ──
    if (!S.metrics) S.metrics = {};
    if (!S.metrics.studyStartDate && S.metrics.reflections && S.metrics.reflections.length > 0) {
      const first = S.metrics.reflections[0]?._submittedAt;
      if (first) {
        S.metrics.studyStartDate = new Date(first);
      } else {
        S.metrics.studyStartDate = Date.now();
      }
      saveLocalProgress();
    }

    // ── Backfill _submittedAt for legacy reflections ──
    if (S.metrics?.reflections && Array.isArray(S.metrics.reflections)) {
      const startDate = S.metrics.studyStartDate ? new Date(S.metrics.studyStartDate) : new Date();
      const reflectionDays = S.studyConfig?.reflectionDays || [0, 7, 7, 7];
      let updated = false;
      S.metrics.reflections.forEach((ref, idx) => {
        if (ref && typeof ref === 'object' && !ref._submittedAt) {
          const hasAnswers = Object.keys(ref).some(k => k !== '_submittedAt' && ref[k] !== undefined && ref[k] !== '');
          if (hasAnswers) {
            const estimatedDate = new Date(startDate);
            let cumulative = 0;
            for (let i = 0; i <= idx; i++) {
              cumulative += reflectionDays[i] || 7;
            }
            estimatedDate.setDate(estimatedDate.getDate() + cumulative);
            S.metrics.reflections[idx]._submittedAt = estimatedDate.getTime();
            updated = true;
          }
        }
      });
      if (updated) {
        saveLocalProgress();
      }
    }

    return saved;
  } catch(e) {
    console.warn('Failed to parse saved progress', e);
    return null;
  }
}

async function patchEnrolmentStatus(enrolments) {
  const patched = [];
  for (const enrol of enrolments) {
    if (enrol.status === 'completed') {
      const config = await apiFetchStudyConfig(enrol.study_id);
      if (config) {
        const hasReflections = config.reflections && config.reflections.length > 0;
        const hasPostSurvey = config.postSurveyFields && config.postSurveyFields.length > 0;
        if (hasReflections || hasPostSurvey) {
          let progress = null;
          const local = loadLocalProgress ? loadLocalProgress() : null;
          if (local) {
            progress = local;
          } else {
            const remote = await apiLoadProgress(enrol.id);
            if (remote?.progress) progress = remote.progress;
          }
          if (progress) {
            const reflectionsDone = progress.metrics?.reflections ? progress.metrics.reflections.length : 0;
            const totalReflections = config.reflections ? config.reflections.length : 0;
            const postSurveyDone = progress.completedPhases?.postSurvey || false;
            if (reflectionsDone < totalReflections || !postSurveyDone) {
              const patchedEnrol = { ...enrol, status: 'in_progress' };
              patched.push(patchedEnrol);
              continue;
            }
          }
        }
      }
    }
    patched.push(enrol);
  }
  return patched;
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

async function apiUpdateStudyConfig(studyId, config) {
  const res = await fetch(`${API_BASE}/api/admin/study/${studyId}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ config })
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

  const hasOtherStudies = S.availableStudies.some(study => 
    !S.myEnrolments.some(e => e.study_id === study.id && 
      (e.status === 'enrolled' || e.status === 'in_progress' || e.status === 'completed')
    )
  );
  
  return `<div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <div class="brand-name">
          Dr Oladele Campbell
          <small>Research Portal</small>
        </div>
      </div>
      <div class="topbar-right">
        <button class="pill" id="btnTheme">${themeIcon} ${themeText}</button>
        <button class="pill ${S.audioOn?'pill-green':'pill-gray'}" id="btnAudio">${S.audioOn?'🔊':'🔇'} Audio</button>
        ${insideStudy && hasOtherStudies ? `<button class="pill pill-amber" id="btnOtherStudies">📚 Other studies</button>` : ''}
        ${S.studyConfig?.bilingual === true && insideStudy ? `<button class="pill pill-blue" id="btnLangStudy">${S.studyLang === 'en' ? 'Hausa' : 'English'}</button>` : ''}
        ${insideStudy && S.currentEnrolmentId ? `<button class="pill pill-danger" id="btnWithdraw">🚪 Withdraw & Delete Data</button>` : ''}
        ${S.phase !== 'hero' && !S.isAdminMode ? `<button class="pill pill-gray" id="btnLogoutPortal">🚪 Logout</button>` : ''}
      </div>
    </div>
    ${studyContext}
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
 // ── Build study cards ──
  const studyCards = S.availableStudies.length > 0
    ? S.availableStudies.map(study => {
        const isBilingual = !!study.title_ha;
        const langLabel = isBilingual ? 'EN / HA' : 'EN';
        const estTime = study.estimated_time || '30';
        const isOpen = study.status === 'open';
        const statusLabel = isOpen ? 'Open' : 'Closed';
        const statusClass = isOpen ? 'card-status-open' : 'card-status-closed';
        return `
          <div class="card">
            <div class="card-top">
              <h3>${study.title_en}</h3>
              <span class="card-status ${statusClass}">${statusLabel}</span>
            </div>
            <p>${study.description_en || 'Participate in this research study.'}</p>
            <div class="card-facts">
              <span>~${estTime} min</span>
              <span>${langLabel}</span>
              <span>Solo</span>
            </div>
            <button class="card-cta" data-study-id="${study.id}" data-status="${study.status}" ${!isOpen ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''}>
              ${isOpen ? 'Learn more & enrol →' : '🔒 Closed'}
            </button>
          </div>
        `;
      }).join('')
    : `<div class="card"><p>No studies currently available. Please check back later.</p></div>`;

  return `${topbarHTML()}
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <div class="eyebrow">🔬 Computing education research · Niger State Polytechnic</div>
        <h1 class="headline">Dr Oladele Campbell’s Research Portal</h1>
        <p class="lede">Empowering computing education research through participation. Your 20–40 minutes helps design better teaching for students like you.</p>
        <div class="hero-ctas">
          <button class="btn btn-primary" id="btnStartParticipation">▶ Start Participation</button>
          <button class="btn btn-ghost" id="btnResumeExisting">↻ Resume Existing Study</button>
          <button class="btn btn-ghost" id="btnMyCertificates">📜 Get Certificates for Completed Studies</button>
        </div>
        <div class="hero-meta">
          <span><span class="dot-gold"></span> NDPR‑compliant data handling</span>
          <span><span class="dot-gold"></span> Withdraw &amp; delete anytime</span>
          <span><span class="dot-gold"></span> Fully anonymous participation</span>
        </div>
        <div id="resumePanel" style="display: none; margin-top: 30px; border-top: 2px solid var(--line); padding-top: 20px;">
          <h3>Resume your study</h3>
          <p>Enter your participant code (e.g., AL-7X3K9) to pick up where you left off.</p>
          <div style="display:flex; gap:12px; flex-wrap:wrap; max-width:400px;">
            <input type="text" id="resumeCode" placeholder="Participant code" style="flex:1; padding:10px; border-radius:40px; border:1.5px solid var(--line);">
            <button class="btn btn-primary" id="btnDoResume">Resume →</button>
          </div>
          <p style="margin-top:8px; font-size:0.85rem;">
            <a href="#recover-code" style="color:var(--primary); text-decoration:underline;">Forgot your code? Click here to recover it.</a>
          </p>
          <p id="resumeErr" style="color:var(--danger); text-align:center; margin-top:6px;"></p>
        </div>
      </div>
      <div class="ladder" aria-hidden="true">
        <div class="rung"><div class="rung-num">05</div><div><div class="rung-label">Debugging</div><div class="rung-sub">finding and fixing what breaks</div></div></div>
        <div class="rung"><div class="rung-num">04</div><div><div class="rung-label">Functions</div><div class="rung-sub">naming a plan you can reuse</div></div></div>
        <div class="rung"><div class="rung-num">03</div><div><div class="rung-label">Loops</div><div class="rung-sub">repeating with purpose</div></div></div>
        <div class="rung"><div class="rung-num">02</div><div><div class="rung-label">Selection</div><div class="rung-sub">choosing between paths</div></div></div>
        <div class="rung"><div class="rung-num">01</div><div><div class="rung-label">Sequence</div><div class="rung-sub">the first rung — what happens, in order</div></div></div>
      </div>
    </div>
  </section>

  <div class="trust">
    <div class="trust-inner">
      <div class="trust-item"><span class="ico">◆</span> Affiliated with Niger State Polytechnic, Zungeru</div>
      <div class="trust-item"><span class="ico">EN/HA</span> Some studies available in English and Hausa</div>
      <div class="trust-item"><span class="ico">%</span> Your data never shared beyond the research team</div>
    </div>
  </div>

  <section id="studies">
    <div class="wrap">
      <div class="section-head">
        <div class="section-eyebrow">Active studies</div>
        <h2>Choose a study that fits your time and interests</h2>
        <p class="section-sub">
          <strong>New participants:</strong> click a study to register and start.<br>
          <strong>Already have a participant code?</strong> Use the <strong>“Resume Existing Study”</strong> button above.
        </p>
      </div>
      <div class="studies">
        ${studyCards}
      </div>
    </div>
  </section>

  <section id="recover-code">
    <div class="wrap">
      <div class="section-head" style="text-align:center;">
        <div class="section-eyebrow">Need your participant code?</div>
        <h2>Forgot your participant code?</h2>
        <p class="section-sub">Enter your matric number below and we'll send your participant code to your registered email address.</p>
      </div>
      <div class="recover-box" style="max-width:500px; margin:0 auto; background:var(--paper-raised); padding:24px; border-radius:16px; border:1px solid var(--line);">
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <input type="text" id="homeRecoverMatric" placeholder="Matric number (e.g. NDCS/024/2002)" style="flex:1; padding:10px; border-radius:40px; border:1.5px solid var(--line); background:var(--card-bg); color:var(--text-color);">
          <button class="btn btn-primary" id="btnHomeSendCode">📧 Send my code</button>
        </div>
        <div id="homeRecoveryStatus" style="margin-top:12px; font-size:0.9rem;"></div>
      </div>
    </div>
  </section>

  <section id="how">
    <div class="wrap">
      <div class="section-head">
        <div class="section-eyebrow">How participation works</div>
        <h2>Simple steps, flexible participation</h2>
      </div>
      <div class="journey">
        <div class="journey-steps">
          <div class="jstep"><div class="jnum">01</div><div><h4>Orient &amp; consent</h4><p>Read what the study asks of you in plain language, and give informed consent before anything is recorded.</p></div></div>
          <div class="jstep"><div class="jnum">02</div><div><h4>Quick pre‑check</h4><p>A short baseline task, pre‑survey, or pre‑test – a starting point for the research.</p></div></div>
          <div class="jstep"><div class="jnum">03</div><div><h4>Main activity</h4><p>The core of the study: a puzzle, survey, reflection, or coding task, paced by you.</p></div></div>
          <div class="jstep"><div class="jnum">04</div><div><h4>Post‑test</h4><p>Where applicable, a post‑test or follow‑up to measure the impact of the study.</p></div></div>
          <div class="jstep"><div class="jnum">05</div><div><h4>Debrief &amp; certificate</h4><p>We explain what the study was really testing, and you can download a certificate of participation.</p></div></div>
          <div class="jstep"><div class="jnum">06</div><div><h4>Stay or step off</h4><p>Resume later, complete a study, or withdraw and delete your data – anytime.</p></div></div>
        </div>
      </div>
    </div>
  </section>

  <section id="impact">
    <div class="wrap">
      <div class="section-head">
        <div class="section-eyebrow">Why it matters</div>
        <h2>Research feeding directly back into how computing is taught</h2>
      </div>
      <div class="impact">
        <div><div class="num">${S.availableStudies.length || '—'}</div><div class="lbl">active studies</div></div>
        <div><div class="num">2</div><div class="lbl">languages, equally supported</div></div>
        <div><div class="num">100%</div><div class="lbl">withdrawable, anonymous by default</div></div>
        <div><div class="num">1</div><div class="lbl">shared goal: teaching that meets students where they are</div></div>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap footer-inner">
      <span>© 2026 Dr Oladele Campbell · Dept of AI &amp; Machine Learning, Niger State Polytechnic, Zungeru</span>
      <span><a href="#" id="btnAdminLink">🔐 Admin</a></span>
    </div>
  </footer>`;
}
function bindHero() {
  // ── DOM refs ──
  const startBtn = document.getElementById('btnStartParticipation');
  const resumeBtn = document.getElementById('btnResumeExisting');
  const resumePanel = document.getElementById('resumePanel');
  const doResumeBtn = document.getElementById('btnDoResume');
  const myCertsBtn = document.getElementById('btnMyCertificates');
  const adminLink = document.getElementById('btnAdminLink');

  // ── Code recovery elements ──
  const sendCodeBtn = document.getElementById('btnHomeSendCode');
  const recoveryStatus = document.getElementById('homeRecoveryStatus');

  // ── Initially hide resume panel ──
  if (resumePanel) resumePanel.style.display = 'none';

  // ── Start Participation ──
  startBtn?.addEventListener('click', () => {
    S.phase = 'register';
    go();
  });

  // ── Resume Existing Study (toggle panel) ──
  resumeBtn?.addEventListener('click', () => {
    if (resumePanel) {
      const isVisible = resumePanel.style.display === 'block';
      resumePanel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) resumePanel.scrollIntoView({ behavior: 'smooth' });
    }
  });

    // ── Resume button (inside the panel) ──
  doResumeBtn?.addEventListener('click', async () => {
    const code = document.getElementById('resumeCode')?.value.trim().toUpperCase();
    if (!code) {
      document.getElementById('resumeErr').innerText = 'Please enter your participant code';
      return;
    }
    try {
      // ── 1. Fetch enrolments ──
      let enrolments = await apiGetMyEnrolments(code);
      if (!enrolments.length) throw new Error('No enrolments found for this code');

      // ── 1b. Purge stale local "completed" markers for enrolments the server says are NOT completed ──
      for (const e of enrolments) {
        if (e.status === 'completed') continue;
        const key = `research_${code}_${e.id}`;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const local = JSON.parse(raw);
          if (local.completed === true) {
            console.log('🧹 Purging stale local completed flag for enrolment', e.id);
            delete local.completed;
            localStorage.setItem(key, JSON.stringify(local));
          }
        } catch (err) {
          console.warn('Failed to parse local progress for enrolment', e.id, err);
        }
      }

      // ── 2. PATCH: Show studies with pending reflections/post‑survey as in_progress ──
      const patchedEnrolments = [];
      for (const enrol of enrolments) {
        if (enrol.status === 'completed') {
          const config = await apiFetchStudyConfig(enrol.study_id);
          if (config) {
            const hasReflections = config.reflections && config.reflections.length > 0;
            const hasPostSurvey = config.postSurveyFields && config.postSurveyFields.length > 0;
            if (hasReflections || hasPostSurvey) {
              let progress = null;
              const local = loadLocalProgress ? loadLocalProgress() : null;
              if (local) {
                progress = local;
              } else {
                const remote = await apiLoadProgress(enrol.id);
                if (remote?.progress) progress = remote.progress;
              }
              if (progress) {
                const reflectionsDone = progress.metrics?.reflections ? progress.metrics.reflections.length : 0;
                const totalReflections = config.reflections ? config.reflections.length : 0;
                const postSurveyDone = progress.completedPhases?.postSurvey || false;
                if (reflectionsDone < totalReflections || !postSurveyDone) {
                  const patched = { ...enrol, status: 'in_progress' };
                  patchedEnrolments.push(patched);
                  continue;
                }
              }
            }
          }
        }
        patchedEnrolments.push(enrol);
      }
      enrolments = patchedEnrolments;

      // ── 3. Filter active (enrolled or in_progress) ──
      const active = enrolments.filter(e => e.status === 'enrolled' || e.status === 'in_progress');
      if (active.length === 0) {
        document.getElementById('resumeErr').innerText = 'You have no studies in progress. All are completed or withdrawn.';
        return;
      }

      // ── 4. Set participant details ──
      const participant = active[0].participant || {};
      S.participantCode = code;
      S.participantName = participant.name || 'Participant';
      S.participantMatric = participant.matric || '';
      S.participantEmail = participant.email || '';
      S.participantGender = participant.gender || '';
      S.participantInstitution = participant.institution || '';
      S.participantProgramme = participant.programme || '';

      // ── 5. Handle multiple active studies ──
      if (active.length > 1) {
        S.resumeCandidates = active;
        S.phase = 'resumeSelect';
        go();
        return;
      }

      // ── 6. Single active study – proceed ──
      const enrol = active[0];
      const config = await apiFetchStudyConfig(enrol.study_id);
      if (!config || !config.puzzles) throw new Error('Study configuration missing');
      S.currentEnrolmentId = enrol.id;
      S.currentStudyId = enrol.study_id;
      S.studyConfig = config;
      S.totalPuzzles = config.puzzles.length;

        // ★ Save enrolments for bindResume()
      S.myEnrolments = enrolments;

      let local = loadLocalProgress();
      if (local) Object.assign(S, local);
      else {
        const remote = await apiLoadProgress(enrol.id);
        if (remote?.progress) Object.assign(S, remote.progress);
      }

      const hasPre = config.preQ && config.preQ.length > 0;
      const hasPost = config.postQ && config.postQ.length > 0;
      const hasPuzzles = config.puzzles && config.puzzles.length > 0;
      const hasReflections = config.reflections && config.reflections.length > 0;
      const hasPostSurvey = config.postSurveyFields && config.postSurveyFields.length > 0;
      const isSurveyOnly = !hasPre && !hasPost && !hasPuzzles && !hasReflections && !hasPostSurvey;

      // ── FIX: trust the server-verified status, not the stale local flag ──
      if (isSurveyOnly && enrol.status === 'completed') {
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

  // ── My Certificates ──
  myCertsBtn?.addEventListener('click', () => {
    S.phase = 'certificates';
    go();
  });

  // ── Study card clicks ──
document.querySelectorAll('.card-cta[data-study-id]').forEach(btn => {
  btn.addEventListener('click', () => {
    const studyId = parseInt(btn.dataset.studyId);
    const status = btn.dataset.status;
    if (status !== 'open') {
      alert('🔒 This study is currently closed. Please contact Dr Oladele Campbell (ocampbell@csnigerpoly.com) or check back later when it reopens.');
      return;
    }
    if (S.participantCode) {
      // Already registered → go to study selection
      S.phase = 'studySelect';
      go();
    } else {
      // Not registered → go to registration
      S.phase = 'register';
      go();
    }
  });
});

  // ── Admin link (footer) ──
  adminLink?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = window.location.pathname + '?admin=true';
  });

  // ── Forgot participant code? (home page recovery) ──
  if (sendCodeBtn) {
    sendCodeBtn.addEventListener('click', async () => {
      const matric = document.getElementById('homeRecoverMatric')?.value.trim();
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
  }
}

function renderResume() {
  const m = S.metrics || {};
  const displayName = (S.participantName && S.participantName.trim() !== '') ? S.participantName : 'Participant';

  // ── Determine study type ──
  const hasPuzzles = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
  const hasReflections = S.studyConfig?.reflections && S.studyConfig.reflections.length > 0;
  const hasPostSurvey = S.studyConfig?.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;

  // ── Build resume stats ──
  let statsHtml = '';

  if (hasPuzzles) {
    // Original puzzle-based study stats
    const solved = Object.values(m.puzzles || {}).filter(p => p.completed).length;
    const guided = Object.values(m.puzzles || {}).filter(p => p.guided).length;
    const preScore = (m.preScore !== undefined && m.preScore !== null) ? `${m.preScore}%` : '—';
    const totalPuzzles = S.totalPuzzles || S.studyConfig?.puzzles?.length || 0;
    const totalElapsed = m.startedAt ? (Date.now() - m.startedAt) : 0;
    const elapsedFormatted = formatElapsedTime(totalElapsed);

    statsHtml = `
      <div class="resume-stat"><div class="rnum">${solved}/${totalPuzzles}</div><div class="rlbl">Puzzles solved</div></div>
      <div class="resume-stat"><div class="rnum">${guided}</div><div class="rlbl">Needed guidance</div></div>
      <div class="resume-stat"><div class="rnum">${preScore}</div><div class="rlbl">Pre-test %</div></div>
      <div class="resume-stat"><div class="rnum">${elapsedFormatted}</div><div class="rlbl">Time since you started</div></div>
    `;
  } else {
    // For studies without puzzles (e.g., Study 3)
    const preSurveyDone = S.completedPhases.survey ? '✅' : '⬜';
    const reflectionsDone = S.metrics?.reflections ? S.metrics.reflections.length : 0;
    const totalReflections = hasReflections ? S.studyConfig.reflections.length : 0;
    const postSurveyDone = S.completedPhases.postSurvey ? '✅' : '⬜';

    statsHtml = `
      <div class="resume-stat"><div class="rnum">${preSurveyDone}</div><div class="rlbl">Pre‑survey</div></div>
      ${hasReflections ? `<div class="resume-stat"><div class="rnum">${reflectionsDone}/${totalReflections}</div><div class="rlbl">Reflections completed</div></div>` : ''}
      ${hasPostSurvey ? `<div class="resume-stat"><div class="rnum">${postSurveyDone}</div><div class="rlbl">Post‑survey</div></div>` : ''}
    `;
  }

  return `${topbarHTML()}<div class="main-card"><h2>👋 Welcome back, ${escapeHtml(displayName)}</h2>
    <div class="pcode-box"><p>Your participant code:</p><div class="pcode-num">${S.participantCode}</div></div>
    <div class="resume-grid">${statsHtml}</div>
    <div class="example-box">Pick up exactly where you left off.</div>
    <div class="actions"><button class="btn btn-primary" id="btnResumeContinue">▶ Resume</button>
    <button class="btn btn-secondary" id="btnResumeRestart">↺ Start fresh</button></div></div>`;
}

async function bindResume() {
  // If config is missing, reload it
  if (!S.studyConfig) {
    console.warn('bindResume: studyConfig missing, reloading...');
    const cfg = await apiFetchStudyConfig(S.currentStudyId);
    if (cfg) {
      S.studyConfig = cfg;
      go();
    } else {
      S.phase = 'studySelect';
      go();
    }
    return;
  }

  // ── Get server status (local first, API fallback) ──
  async function getServerStatus() {
    // Try local first
    if (S.myEnrolments && S.currentEnrolmentId) {
      const enrol = S.myEnrolments.find(e => e.id === S.currentEnrolmentId);
      if (enrol) {
        console.log('✅ Server status from local myEnrolments:', enrol.status);
        return enrol.status;
      }
    }
    // Fallback: fetch from server
    try {
      console.log('⚠️ myEnrolments empty – fetching from API...');
      const progress = await apiLoadProgress(S.currentEnrolmentId);
      const status = progress?.status || null;
      console.log('✅ Server status from API:', status);
      return status;
    } catch (e) {
      console.warn('❌ Failed to fetch server status:', e);
      return null;
    }
  }

  const serverStatus = await getServerStatus();
  console.log('bindResume: serverStatus =', serverStatus);

  // ── Reset stale local flags that conflict with server ──
  if (serverStatus === 'in_progress' && S.completedPhases.survey && !S.completedPhases.posttest) {
    console.log('⚠️ Resetting stale local survey flag (server says in_progress)');
    S.completedPhases.survey = false;
    saveLocalProgress();
  }

  const continueBtn = document.getElementById('btnResumeContinue');
  const restartBtn = document.getElementById('btnResumeRestart');

  // ── Determine study type ──
  const hasPre = S.studyConfig?.preQ && S.studyConfig.preQ.length > 0;
  const hasPost = S.studyConfig?.postQ && S.studyConfig.postQ.length > 0;
  const hasPuzzles = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
  const hasReflections = S.studyConfig?.reflections && S.studyConfig.reflections.length > 0;
  const hasPostSurvey = S.studyConfig?.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;

  const isSurveyOnly = !hasPre && !hasPost && !hasPuzzles && !hasReflections && !hasPostSurvey;

  console.log('bindResume init: hasPre =', hasPre, 'hasPuzzles =', hasPuzzles, 'isSurveyOnly =', isSurveyOnly);

  // ── Survey‑only studies ──
  if (isSurveyOnly) {
    // Trust server status
    if (serverStatus === 'completed') {
      console.log('✅ Server says completed → going to complete page');
      S.phase = 'complete';
      go();
      return;
    }

    // Server says in-progress / enrolled → continue
    if (S.consentGeneral) {
      console.log('→ Resuming survey');
      S.phase = 'survey';
    } else {
      console.log('→ Going to consent');
      S.phase = 'consent';
    }
    go();
    return;
  }

  // ── Delayed post‑test waiting ──
  if (S.postTestPending) {
    S.phase = 'complete';
    go();
    return;
  }

  // ── Continue button ──
  continueBtn?.addEventListener('click', async () => {
    console.log('🔍 Continue clicked: S.completedPhases =', S.completedPhases);
    console.log('🔍 S._resumeState =', S._resumeState);
    console.log('🔍 serverStatus =', serverStatus);

    const hasPre2 = S.studyConfig?.preQ && S.studyConfig.preQ.length > 0;
    const hasPost2 = S.studyConfig?.postQ && S.studyConfig.postQ.length > 0;
    const hasPuzzles2 = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
    const hasReflections2 = S.studyConfig?.reflections && S.studyConfig.reflections.length > 0;
    const hasPostSurvey2 = S.studyConfig?.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;

    const isSurveyOnly2 = !hasPre2 && !hasPost2 && !hasPuzzles2 && !hasReflections2 && !hasPostSurvey2;

    // ── Survey‑only ──
    if (isSurveyOnly2) {
      if (serverStatus === 'completed') {
        S.phase = 'complete';
        go();
        return;
      }
      if (S.consentGeneral) {
        S.phase = 'survey';
      } else {
        S.phase = 'consent';
      }
      go();
      return;
    }

    const rs = S._resumeState || S.metrics?._resumeState;

    // If immediate post‑test is done, check for pending reflections/post‑survey
    if (S.completedPhases.posttest) {
      if (hasReflections2 || hasPostSurvey2) {
        const reflectionsDone = S.metrics?.reflections ? S.metrics.reflections.length : 0;
        const totalReflections = S.studyConfig?.reflections ? S.studyConfig.reflections.length : 0;
        if (reflectionsDone < totalReflections) {
          S.reflectionWeek = reflectionsDone;
          S.phase = 'reflection';
          go();
          return;
        } else if (hasPostSurvey2 && !S.completedPhases.postSurvey) {
          S.phase = 'postsurvey';
          go();
          return;
        }
      }
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
        } else if (hasReflections2) {
          const done = S.metrics?.reflections ? S.metrics.reflections.length : 0;
          S.reflectionWeek = done;
          S.phase = 'reflection';
        } else if (hasPostSurvey2) {
          S.phase = 'postsurvey';
        } else {
          S.phase = 'complete';
        }
      } else {
        // ── RESTORE FROM SAVED RESUME STATE ──
        S.phase = rs.phase || 'survey';
        S.puzzleIdx = rs.puzzleIdx || 0;
        S.assQ = rs.assQ || 0;
        S.assAnswers = rs.assAnswers || [];
        S.surveyAnswers = rs.surveyAnswers || {};
        S.postSurveyAnswers = rs.postSurveyAnswers || {};
        S.reviewQueue = rs.reviewQueue || [];
        S.reviewIdx = rs.reviewIdx || 0;
        S.available = rs.available || [];
        S.userSeq = rs.userSeq || [];
        S.fadedLocked = rs.fadedLocked || [];

        const savedReflectionWeek = rs.reflectionWeek;
        if (savedReflectionWeek !== undefined && savedReflectionWeek !== null && savedReflectionWeek > 0) {
          S.reflectionWeek = savedReflectionWeek;
        } else {
          S.reflectionWeek = S.metrics?.reflections ? S.metrics.reflections.length : 0;
        }

        if (rs.completedPhases) {
          S.completedPhases = { ...S.completedPhases, ...rs.completedPhases };
        }
      }
    } else {
      // ── No resume state – determine from progress flags ──
      console.log('⚠️ No resume state – determining from progress flags');

      if (S.completedPhases.posttest) {
        if (hasReflections2 || hasPostSurvey2) {
          const reflectionsDone = S.metrics?.reflections ? S.metrics.reflections.length : 0;
          const totalReflections = S.studyConfig?.reflections ? S.studyConfig.reflections.length : 0;
          if (reflectionsDone < totalReflections) {
            S.reflectionWeek = reflectionsDone;
            S.phase = 'reflection';
            go();
            return;
          } else if (hasPostSurvey2 && !S.completedPhases.postSurvey) {
            S.phase = 'postsurvey';
            go();
            return;
          }
        }
        S.phase = 'complete';
        go();
        return;
      }

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
        S.phase = 'study';
        S.puzzleIdx = S.puzzlesCompletedCount || 0;
        go();
        return;
      }

      if (S.completedPhases.survey && !S.completedPhases.pretest) {
        console.log('✅ Survey done, pre‑test not started – going to pre‑test');
        if (hasPre2) {
          S.phase = 'pre';
          S.assMode = 'pre';
          S.assQ = S.assAnswers.length || 0;
          go();
          return;
        } else if (hasPost2) {
          S.phase = 'post';
          S.assMode = 'post';
          S.assQ = 0;
          S.assAnswers = [];
          go();
          return;
        } else if (hasReflections2) {
          const done = S.metrics?.reflections ? S.metrics.reflections.length : 0;
          S.reflectionWeek = done;
          S.phase = 'reflection';
          go();
          return;
        } else if (hasPostSurvey2) {
          S.phase = 'postsurvey';
          go();
          return;
        } else {
          S.phase = 'complete';
          go();
          return;
        }
      }

      console.log('⚠️ No progress found – starting from orient');
      S.phase = 'orient';
    }
    go();
  });

  // ── Restart button ──
  restartBtn?.addEventListener('click', () => {
    if (confirm('Erase all progress?')) {
      localStorage.removeItem(getStorageKey());
      S.metrics = { startedAt: Date.now(), puzzles: {} };
      S.completedPhases = { survey: false, pretest: false, puzzles: false, posttest: false, followup: false, postSurvey: false };
      S.puzzlesCompletedCount = 0;
      S.surveyAnswers = {};
      S.assAnswers = [];
      S.postTestPending = false;
      S.postSurveyAnswers = {};
      S.reflectionWeek = 0;
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
      <div><label>Gender</label><select id="inpGender"><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></div>
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
  // Show all studies (both open and closed) that are not enrolled
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
      ${availableNotEnrolled.map(study => {
        const isOpen = study.status === 'open';
        const statusLabel = isOpen ? 'Open' : 'Closed';
        const statusClass = isOpen ? 'card-status-open' : 'card-status-closed';
        return `
          <button class="card study-card" data-study-id="${study.id}" data-status="${study.status}" ${!isOpen ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''}>
            <span class="card-emoji">📘</span>
            <div class="card-label">
              <strong>${study.title_en}</strong>
              <div class="card-why">${study.description_en || ''}</div>
              <div style="font-size:0.7rem; margin-top:4px; color:var(--text-muted);">
                <span class="${statusClass}">${statusLabel}</span>
              </div>
            </div>
          </button>
        `;
      }).join('')}
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
  // ── Study card clicks ──
  document.querySelectorAll('.card[data-study-id]').forEach(card => {
    card.onclick = () => {
      const studyId = parseInt(card.dataset.studyId);
      const status = card.dataset.status;
      if (status !== 'open') {
        alert('🔒 This study is currently closed. Please contact Dr Oladele Campbell (ocampbell@csnigerpoly.com) or check back later when it reopens.');
        return;
      }
      onSelectStudy(studyId);
    };
  });

  // ── Resume any ongoing study ──
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

  // ── Start follow‑up (delayed post‑test) ──
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
  // ── Build dynamic steps based on study config ──
  const steps = [];

  // Determine if this is a survey‑only study
  const hasPre = S.studyConfig.preQ && S.studyConfig.preQ.length > 0;
  const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
  const hasPuzzles = S.studyConfig.puzzles && S.studyConfig.puzzles.length > 0;
  const hasReflections = S.studyConfig.reflections && S.studyConfig.reflections.length > 0;
  const hasPostSurvey = S.studyConfig.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;
  const isSurveyOnly = !hasPre && !hasPost && !hasPuzzles && !hasReflections && !hasPostSurvey;

  // Always include the survey step
  const surveyLabel = isSurveyOnly 
    ? 'Survey (approx. 10‑15 minutes)' 
    : 'Background survey (~3 min)';
  steps.push({ icon: '📋', text: surveyLabel });

  // Pre‑test
  const preCount = S.studyConfig.preQ?.length || 0;
  if (preCount > 0) {
    steps.push({ icon: '🧠', text: `Pre‑test (${preCount} questions)` });
  }

  // Puzzles
  const puzzleCount = S.studyConfig.puzzles?.length || 0;
  if (puzzleCount > 0) {
    steps.push({ icon: '🪜', text: `${puzzleCount} scaffolded puzzles (~30 min)` });
    // Review (only if puzzles exist)
    steps.push({ icon: '🔁', text: 'Review of 3 puzzles (~5 min)' });
  }

  // Post‑test
  const postCount = S.studyConfig.postQ?.length || 0;
  if (postCount > 0) {
    steps.push({ icon: '📋', text: `Post‑test (${postCount} questions)` });
  }

  // Weekly reflections (if any)
  const refCount = S.studyConfig.reflections?.length || 0;
  if (refCount > 0) {
    steps.push({ icon: '✍️', text: `${refCount} weekly reflections` });
  }

  // Post‑survey (if any)
  const postSurveyCount = S.studyConfig.postSurveyFields?.length || 0;
  if (postSurveyCount > 0) {
    steps.push({ icon: '📋', text: 'Post‑survey' });
  }

  // If no steps (should not happen), add a generic message
  if (steps.length === 0) {
    steps.push({ icon: '📋', text: 'Complete the study activities' });
  }

  // Build HTML
  const stepsHtml = steps.map(s =>
    `<div class="orient-step"><span class="orient-icon">${s.icon}</span><div class="orient-body"><strong>${s.text}</strong></div></div>`
  ).join('');

  const groupLabel = S.randomisationGroup === 'treatment' ? 'Treatment' :
                     S.randomisationGroup === 'control' ? 'Control' : '';

  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
    <div class="pcode-box">
      <p style="font-size:.82rem">Your participant code:</p>
      <div class="pcode-num">${S.participantCode}</div>
    </div>
    ${groupLabel ? `<p><strong>Group:</strong> ${groupLabel}</p>` : ''}
    <h2>About this study</h2>
    ${stepsHtml}
    <div class="actions"><button class="btn btn-primary" id="btnOrientNext">Continue to consent →</button></div>
  </div>`;
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
// ============================================================
// RENDER SURVEY (PRE‑SURVEY) – with CHECKBOX support
// ============================================================
function renderSurveyDynamic() {
  const fields = S.studyConfig.surveyFields || [];
  const surveyTitle = S.studyConfig.title_en || 'Survey';
  let html = `${topbarHTML()}${phaseStripHTML()}<div class="main-card"><h2>📋 ${surveyTitle}</h2>`;
  
  fields.forEach(f => {
    // ── Section heading ──
    if (f.type === 'section') {
      html += `<div class="survey-section">
        <h3>${f.label_en}</h3>
        ${f.instructions ? `<p>${f.instructions}</p>` : ''}
        ${f.scaleLabels ? `<p class="scale-labels">${f.scaleLabels}</p>` : ''}
      </div>`;
      return;
    }

    // Skip auto‑filled programme field
    if (f.id === 'programme') return;

    // ── SELECT ──
    if (f.type === 'select') {
      const label = L(f, 'label');
      let opts = L(f, 'options');

      // Dynamic level options (unchanged)
      if (f.id === 'level' || f.id === 'demographics_level') {
        const progType = getProgrammeType(S.participantMatric);
        if (f.id === 'demographics_level') {
          if (progType === 'nd') opts = ['ND1', 'ND2'];
          else if (progType === 'hnd') opts = ['HND1', 'HND2'];
          else opts = ['100 level', '200 level', '300 level', '400 level', '500 level / PG', 'Other'];
        } else {
          if (S.studyConfig?.bilingual === true && S.studyLang === 'ha') {
            if (progType === 'nd') opts = ['ND Shekara 1', 'ND Shekara 2'];
            else if (progType === 'hnd') opts = ['HND Shekara 1', 'HND Shekara 2'];
            else opts = ['Shekara 1', 'Shekara 2', 'Shekara 3', 'Shekara 4'];
          } else {
            if (progType === 'nd') opts = ['ND Year 1', 'ND Year 2'];
            else if (progType === 'hnd') opts = ['HND Year 1', 'HND Year 2'];
            else opts = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
          }
        }
      }

      // Preserve selected value
      const currentVal = S.surveyAnswers[f.id];
      const selectedIndex = (currentVal !== undefined && currentVal !== null && currentVal !== '') 
        ? String(currentVal) 
        : '';

      html += `<div class="field-row">
        <label>${label}</label>
        <select data-field="${f.id}" class="sv-sel">
          <option value="">— select —</option>
          ${opts.map((o, i) => `<option value="${i}" ${selectedIndex === String(i) ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>`;

      // ── Conditional text field (if configured) ──
      if (f.conditionalText) {
        const ct = f.conditionalText;
        const ctLabel = L(ct, 'label') || 'Please specify';
        const ctPlaceholder = ct.placeholder || '';
        const ctValue = S.surveyAnswers[ct.fieldId] || '';

        // Determine if the conditional field should be visible now
        const triggerIndex = opts.indexOf(ct.triggerValue);
        const isTriggered = (triggerIndex !== -1) && (selectedIndex === String(triggerIndex));

        html += `<div class="field-row conditional-text" id="cond_${f.id}" style="display:${isTriggered ? 'block' : 'none'}; margin-top:-8px;">
          <label style="display:block; font-weight:600; margin-bottom:6px;">${ctLabel}${ct.required ? ' *' : ''}</label>
          <input type="text" data-field="${ct.fieldId}" class="sv-cond-text" placeholder="${ctPlaceholder}" value="${escapeHtml(ctValue)}" />
        </div>`;
      }
    }

    // ── LIKERT ──
    else if (f.type === 'likert') {
      const label = L(f, 'label');
      let options = L(f, 'options');
      if (!options || options.length === 0) {
        options = ['1', '2', '3', '4', '5'];
        console.warn(`Likert field "${f.id}" had no options; using default 1-5.`);
      }
      const currentVal = S.surveyAnswers[f.id];
      html += `<div class="likert-row"><div class="lq">${label}</div><div class="likert-scale">`;
      options.forEach((opt, idx) => {
        const val = idx + 1;
        const checked = (currentVal == val) ? 'checked' : '';
        html += `<div class="lk-opt">
          <input type="radio" name="${f.id}" id="${f.id}_${val}" value="${val}" data-field="${f.id}" class="sv-lk" ${checked}>
          <label for="${f.id}_${val}"><span class="lk-num">${val}</span><span>${opt}</span></label>
        </div>`;
      });
      html += `</div></div>`;
    }

    // ── CHECKBOX ──
    else if (f.type === 'checkbox') {
      const label = L(f, 'label');
      const options = L(f, 'options') || [];
      const selected = S.surveyAnswers[f.id] || [];
      html += `<div class="field-row"><label>${label}</label><div class="checkbox-group" style="margin-top:6px;">`;
      options.forEach(opt => {
        const checked = selected.includes(opt) ? 'checked' : '';
        html += `<label style="display:block; margin:4px 0;">
          <input type="checkbox" data-field="${f.id}" class="sv-chk" value="${opt}" ${checked}> ${opt}
        </label>`;
      });
      html += `</div></div>`;
    }

    // ── TEXT ──
    else if (f.type === 'text') {
      const label = L(f, 'label');
      const placeholder = L(f, 'placeholder') || 'Write your answer here…';
      const currentVal = S.surveyAnswers[f.id] || '';
      html += `<div class="field-row" style="margin-bottom:20px;">
        <label style="display:block; font-weight:600; margin-bottom:6px;">${label}</label>
        <textarea data-field="${f.id}" class="sv-text" placeholder="${placeholder}" style="width:100%; padding:10px; border-radius:12px; border:1.5px solid var(--border); min-height:80px; font-family:inherit; resize:vertical;">${escapeHtml(currentVal)}</textarea>
      </div>`;
    }
  });
  
  // ── Button label logic ──
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
// ============================================================
// BIND SURVEY (PRE‑SURVEY) – with CHECKBOX handling & new transition
// ============================================================
function bindSurveyDynamic() {
  const fields = S.studyConfig.surveyFields || [];
  const btn = el('btnSurveyNext');
  if (btn) btn.disabled = true;

  // ── Find gender field ──
  const genderField = fields.find(f => f.id === 'gender' || f.id === 'demographics_gender');

  // ── Get gender options from the field ──
  let genderOptions = [];
  if (genderField) {
    genderOptions = L(genderField, 'options') || [];
  }

  // ── Validate gender mismatch ──
  function validateGender() {
    if (!genderField) return true;

    const surveyGenderValue = S.surveyAnswers[genderField.id];
    const enrolmentGender = S.participantGender;

    if (surveyGenderValue === undefined || surveyGenderValue === null || surveyGenderValue === '') return true;
    if (!enrolmentGender) return true;

    // Convert survey value to label
    let surveyGenderLabel = '';
    const surveyValueNum = parseInt(surveyGenderValue);
    if (!isNaN(surveyValueNum) && surveyValueNum >= 0 && surveyValueNum < genderOptions.length) {
      surveyGenderLabel = genderOptions[surveyValueNum];
    } else {
      surveyGenderLabel = String(surveyGenderValue);
    }

    const isMatch = surveyGenderLabel.toLowerCase() === enrolmentGender.toLowerCase();

    let warningEl = document.getElementById('genderWarning');

    if (!warningEl) {
      warningEl = document.createElement('div');
      warningEl.id = 'genderWarning';

      const isDark = document.documentElement.classList.contains('dark');
      warningEl.style.cssText = `
        background: ${isDark ? '#451a03' : '#fef3c7'};
        border: 1px solid ${isDark ? '#d97706' : '#f59e0b'};
        border-radius: 12px;
        padding: 12px 16px;
        margin: 12px 0;
        display: none;
        font-size: 0.95rem;
        color: ${isDark ? '#fbbf24' : '#78350f'};
      `;

      const genderFieldEl = document.querySelector(`[data-field="${genderField.id}"]`)?.closest('.field-row');
      if (genderFieldEl) {
        genderFieldEl.after(warningEl);
      } else {
        const actionsEl = document.querySelector('.actions');
        if (actionsEl) {
          actionsEl.before(warningEl);
        }
      }
    }

    if (!isMatch) {
      warningEl.style.display = 'block';
      warningEl.innerHTML = `
        <strong>⚠️ Gender Mismatch</strong><br>
        You selected <strong>${surveyGenderLabel}</strong> in the survey, but you registered as <strong>${enrolmentGender}</strong> during enrolment.
        <br><small>If this is a mistake, please select the correct option above. If you need to update your enrolment record, please contact the researcher.</small>
      `;
      return false;
    } else {
      warningEl.style.display = 'none';
      return true;
    }
  }

  // ── Toggle conditional text fields based on selected value ──
  function updateConditionalFields() {
    fields.forEach(f => {
      if (f.type === 'select' && f.conditionalText) {
        const sel = document.querySelector(`select[data-field="${f.id}"]`);
        const condWrap = document.getElementById(`cond_${f.id}`);
        if (!sel || !condWrap) return;

        const ct = f.conditionalText;
        const selectedText = sel.options[sel.selectedIndex]?.textContent || '';
        const isTriggered = (selectedText === ct.triggerValue);

        condWrap.style.display = isTriggered ? 'block' : 'none';

        // If no longer triggered, clear the conditional answer
        if (!isTriggered) {
          delete S.surveyAnswers[ct.fieldId];
          const input = condWrap.querySelector('.sv-cond-text');
          if (input) input.value = '';
        }
      }
    });
  }

  const updateBtn = () => {
    // ── Toggle conditional fields first ──
    updateConditionalFields();

    // Capture selections
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
    document.querySelectorAll('.sv-cond-text').forEach(input => {
      if (input.value.trim() !== '') {
        S.surveyAnswers[input.dataset.field] = input.value.trim();
      }
    });
    // Checkboxes: store as array
    document.querySelectorAll('.sv-chk').forEach(chk => {
      const field = chk.dataset.field;
      if (!S.surveyAnswers[field]) S.surveyAnswers[field] = [];
      if (chk.checked) {
        if (!S.surveyAnswers[field].includes(chk.value)) S.surveyAnswers[field].push(chk.value);
      } else {
        S.surveyAnswers[field] = S.surveyAnswers[field].filter(v => v !== chk.value);
      }
    });

    // ── Validate gender ──
    const isGenderValid = validateGender();

    // Check required fields (skip 'programme' and sections)
    const requiredFields = fields.filter(f => f.id && f.id !== 'programme' && f.type !== 'section');
    const allFilled = requiredFields.every(f => {
      const val = S.surveyAnswers[f.id];

      // Checkbox
      if (f.type === 'checkbox') {
        return Array.isArray(val) && val.length > 0;
      }

      // Base select must have a value
      if (val === undefined || val === null || val === '') return false;

      // Conditional text validation
      if (f.type === 'select' && f.conditionalText) {
        const ct = f.conditionalText;
        const opts = L(f, 'options') || [];
        const triggerIdx = opts.indexOf(ct.triggerValue);
        if (triggerIdx !== -1 && String(triggerIdx) === String(val)) {
          const ctVal = S.surveyAnswers[ct.fieldId];
          if (ctVal === undefined || ctVal === null || ctVal === '') return false;
        }
      }

      return true;
    });

    // Button is enabled only if all fields are filled AND gender is valid
    if (btn) btn.disabled = !(allFilled && isGenderValid);

    const msg = el('surveyMsg');
    if (msg) {
      if (!allFilled) {
        msg.textContent = S.lang === 'en' ? 'Please answer all questions.' : 'Don Allah amsa duk tambayoyin.';
      } else if (!isGenderValid) {
        msg.textContent = '⚠️ Please correct the gender mismatch before continuing.';
      } else {
        msg.textContent = '';
      }
    }
  };

  // ── Bind select change handlers ──
  document.querySelectorAll('.sv-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      S.surveyAnswers[sel.dataset.field] = sel.value;
      updateBtn();
      saveLocalProgress();
    });
  });

  // ── Bind likert radio handlers ──
  document.querySelectorAll('.sv-lk').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        S.surveyAnswers[radio.dataset.field] = parseInt(radio.value);
        updateBtn();
        saveLocalProgress();
      }
    });
  });

  // ── Bind textarea handlers ──
  document.querySelectorAll('.sv-text').forEach(textarea => {
    textarea.addEventListener('input', () => {
      S.surveyAnswers[textarea.dataset.field] = textarea.value.trim();
      updateBtn();
      saveLocalProgress();
    });
  });

  // ── Bind conditional text inputs ──
  document.querySelectorAll('.sv-cond-text').forEach(input => {
    input.addEventListener('input', () => {
      S.surveyAnswers[input.dataset.field] = input.value.trim();
      updateBtn();
      saveLocalProgress();
    });
  });

  // ── Bind checkboxes ──
  document.querySelectorAll('.sv-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const field = chk.dataset.field;
      if (!S.surveyAnswers[field]) S.surveyAnswers[field] = [];
      if (chk.checked) {
        if (!S.surveyAnswers[field].includes(chk.value)) S.surveyAnswers[field].push(chk.value);
      } else {
        S.surveyAnswers[field] = S.surveyAnswers[field].filter(v => v !== chk.value);
      }
      updateBtn();
      saveLocalProgress();
    });
  });

  // ── Re-validate when gender field changes ──
  if (genderField) {
    const genderSelect = document.querySelector(`[data-field="${genderField.id}"]`);
    if (genderSelect) {
      genderSelect.addEventListener('change', () => {
        setTimeout(updateBtn, 50);
      });
    }
  }

  // Initial validation pass
  updateBtn();

  // ── Submit / Continue ──
  el('btnSurveyNext')?.addEventListener('click', () => {
    // Final capture
    document.querySelectorAll('.sv-sel').forEach(sel => {
      if (sel.value !== '') S.surveyAnswers[sel.dataset.field] = sel.value;
    });
    document.querySelectorAll('.sv-lk:checked').forEach(radio => {
      S.surveyAnswers[radio.dataset.field] = parseInt(radio.value);
    });
    document.querySelectorAll('.sv-text').forEach(textarea => {
      if (textarea.value.trim() !== '') S.surveyAnswers[textarea.dataset.field] = textarea.value.trim();
    });
    document.querySelectorAll('.sv-cond-text').forEach(input => {
      if (input.value.trim() !== '') S.surveyAnswers[input.dataset.field] = input.value.trim();
    });
    document.querySelectorAll('.sv-chk').forEach(chk => {
      const field = chk.dataset.field;
      if (!S.surveyAnswers[field]) S.surveyAnswers[field] = [];
      if (chk.checked) {
        if (!S.surveyAnswers[field].includes(chk.value)) S.surveyAnswers[field].push(chk.value);
      } else {
        S.surveyAnswers[field] = S.surveyAnswers[field].filter(v => v !== chk.value);
      }
    });

    // ── Final gender validation ──
    const isGenderValid = validateGender();
    if (!isGenderValid) {
      const msg = el('surveyMsg');
      if (msg) msg.textContent = '⚠️ Please correct the gender mismatch before continuing.';
      const warningEl = document.getElementById('genderWarning');
      if (warningEl) warningEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // ── Final conditional text validation ──
    const requiredFields = fields.filter(f => f.id && f.id !== 'programme' && f.type !== 'section');
    for (const f of requiredFields) {
      if (f.type === 'select' && f.conditionalText) {
        const ct = f.conditionalText;
        const opts = L(f, 'options') || [];
        const triggerIdx = opts.indexOf(ct.triggerValue);
        const selectedVal = S.surveyAnswers[f.id];
        if (triggerIdx !== -1 && String(triggerIdx) === String(selectedVal)) {
          const ctVal = S.surveyAnswers[ct.fieldId];
          if (ctVal === undefined || ctVal === null || ctVal === '') {
            const msg = el('surveyMsg');
            if (msg) msg.textContent = `⚠️ Please enter a value for "${ct.label_en || 'Please specify'}".`;
            const condWrap = document.getElementById(`cond_${f.id}`);
            if (condWrap) condWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
        }
      }
    }

    saveLocalProgress();

    S.completedPhases.survey = true;
    S.inProgressPhase = 'pretest';
    saveLocalProgress();

    // ── Transition logic ──
    const hasPre = S.studyConfig.preQ && S.studyConfig.preQ.length > 0;
    const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
    const hasPuzzles = S.studyConfig.puzzles && S.studyConfig.puzzles.length > 0;
    const hasReflections = S.studyConfig.reflections && S.studyConfig.reflections.length > 0;
    const hasPostSurvey = S.studyConfig.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;

    if (!hasPre && !hasPost && !hasPuzzles) {
      // Survey‑only study
      if (hasReflections) {
        S.reflectionWeek = 0;
        S.phase = 'reflection';
      } else if (hasPostSurvey) {
        S.phase = 'postsurvey';
      } else {
        console.log('Survey-only study completed.');
        S.completedSaved = true;
        S.completedPhases.posttest = true;
        saveLocalProgress({ completed: true });
        S.phase = 'debrief';
      }
    } else {
      // Study with puzzles/tests
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
    }
    go();
  });
}

function renderFields(fields, answers, title) {
  let html = `<h2>${title}</h2>`;
  fields.forEach(f => {
    if (f.type === 'section') {
      html += `<div class="survey-section">
        <h3>${f.label_en}</h3>
        ${f.instructions ? `<p>${f.instructions}</p>` : ''}
        ${f.scaleLabels ? `<p class="scale-labels">${f.scaleLabels}</p>` : ''}
      </div>`;
      return;
    }
    if (f.type === 'text') {
      const val = answers[f.id] || '';
      html += `<div class="field-row" style="margin-bottom:16px;">
        <label style="display:block; font-weight:600; margin-bottom:6px;">${f.label_en}</label>
        <textarea data-field="${f.id}" class="ref-text" style="width:100%; padding:10px; border-radius:12px; border:1.5px solid var(--border); min-height:80px; font-family:inherit; resize:vertical;">${escapeHtml(val)}</textarea>
      </div>`;
    } else if (f.type === 'likert_with_na') {
      const options = f.options || ['Never', 'Seldom', 'Sometimes', 'Often', 'Always', 'Not applicable to this course'];
      html += `<div class="likert-row"><div class="lq">${f.label_en}</div><div class="likert-scale">`;
      options.forEach((opt, idx) => {
        const checked = (answers[f.id] === opt) ? 'checked' : '';
        html += `<div class="lk-opt">
          <input type="radio" name="${f.id}" id="${f.id}_${idx}" value="${opt}" data-field="${f.id}" class="ref-lk" ${checked}>
          <label for="${f.id}_${idx}"><span>${opt}</span></label>
        </div>`;
      });
      html += `</div></div>`;
    }
    // Add other types if needed (e.g., select, but not used here)
  });
  return html;
}

function renderReflectionDynamic() {
  // ── Set study start date once ──
  if (!S.metrics) S.metrics = {};
  if (!S.metrics.studyStartDate) {
    S.metrics.studyStartDate = Date.now();
    saveLocalProgress();
  }

  const reflections = S.studyConfig.reflections || [];
  const total = reflections.length;
  const idx = S.reflectionWeek;

  if (idx >= total) {
    return `${topbarHTML()}<div class="main-card">
      <h2>Reflections Complete</h2>
      <p>You have completed all weekly reflections.</p>
      <div class="actions"><button class="btn btn-primary" id="btnGoToPostSurvey">Continue to Post‑Survey →</button></div>
    </div>`;
  }

  const weekData = reflections[idx];
  if (!isReflectionAvailable(idx)) {
    const nextDate = getReflectionAvailableDate(idx);
    return `${topbarHTML()}<div class="main-card">
      <h2>✍️ ${weekData.title}</h2>
      <div class="reflection-waiting">
        <p>⏳ This reflection will be available on <strong>${formatDateDDMMYYYY(nextDate)}</strong>.</p>
        <p>Please return then to continue.</p>
      </div>
      <div class="actions"><button class="btn btn-secondary" id="btnBackToStudies">📚 Back to Studies</button></div>
    </div>`;
  }

  const answers = S.metrics.reflections?.[idx] || {};
  const participantInfo = `<div class="pcode-box" style="margin-bottom:20px;">
    <p><strong>Participant:</strong> ${escapeHtml(S.participantName || '')} (${escapeHtml(S.participantMatric || '')})</p>
    <p><strong>Participant code:</strong> ${escapeHtml(S.participantCode || '')}</p>
  </div>`;

  const fieldsHtml = renderFields(weekData.fields, answers, weekData.title);
  const html = `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
    ${participantInfo}
    ${fieldsHtml}
    <div class="actions"><button class="btn btn-primary" id="btnReflectSubmit">Submit Reflection →</button></div>
    <p id="reflectionMsg" style="color:var(--danger);text-align:center"></p>
  </div>`;
  return html;
}
function bindReflectionDynamic() {
  // Save answers on change (radio / text)
  document.querySelectorAll('.ref-text').forEach(el => {
    el.addEventListener('input', () => {
      const idx = S.reflectionWeek;
      if (!S.metrics.reflections) S.metrics.reflections = [];
      if (!S.metrics.reflections[idx]) S.metrics.reflections[idx] = {};
      S.metrics.reflections[idx][el.dataset.field] = el.value;
      saveLocalProgress();
    });
  });
  document.querySelectorAll('.ref-lk').forEach(el => {
    el.addEventListener('change', () => {
      if (el.checked) {
        const idx = S.reflectionWeek;
        if (!S.metrics.reflections) S.metrics.reflections = [];
        if (!S.metrics.reflections[idx]) S.metrics.reflections[idx] = {};
        S.metrics.reflections[idx][el.dataset.field] = el.value;
        saveLocalProgress();
      }
    });
  });

  // Submit button
  el('btnReflectSubmit')?.addEventListener('click', () => {
    const idx = S.reflectionWeek;
    const fields = S.studyConfig.reflections[idx].fields;

    // Capture all answers from DOM
    document.querySelectorAll('.ref-text').forEach(el => {
      const fieldId = el.dataset.field;
      if (!S.metrics.reflections) S.metrics.reflections = [];
      if (!S.metrics.reflections[idx]) S.metrics.reflections[idx] = {};
      S.metrics.reflections[idx][fieldId] = el.value.trim();
    });
    document.querySelectorAll('.ref-lk:checked').forEach(el => {
      const fieldId = el.dataset.field;
      if (!S.metrics.reflections) S.metrics.reflections = [];
      if (!S.metrics.reflections[idx]) S.metrics.reflections[idx] = {};
      S.metrics.reflections[idx][fieldId] = el.value;
    });

    const answers = S.metrics.reflections?.[idx] || {};
    const requiredFields = fields.filter(f => f.required === true);
    const missing = requiredFields.filter(f => {
      const val = answers[f.id];
      return val === undefined || val === null || val === '' || val.trim() === '';
    });

    if (missing.length) {
      const msg = document.getElementById('reflectionMsg');
      if (msg) msg.textContent = 'Please answer all required questions.';
      return;
    }

    // ── Store submission timestamp ──
    if (!S.metrics.reflections[idx]) S.metrics.reflections[idx] = {};
    S.metrics.reflections[idx]._submittedAt = Date.now();

    // Save and advance
    saveLocalProgress();
    S.reflectionWeek = idx + 1;
    saveLocalProgress();
    go();
  });

  // Continue to post‑survey
  el('btnGoToPostSurvey')?.addEventListener('click', () => {
    S.phase = 'postsurvey';
    go();
  });

  // Back to studies
  el('btnBackToStudies')?.addEventListener('click', () => {
    S.phase = 'studySelect';
    go();
  });
}
function renderPostSurveyDynamic() {
  const fields = S.studyConfig.postSurveyFields || [];
  const surveyTitle = S.studyConfig.title_en + ' – Post-Survey';
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
    if (f.type === 'select') {
      const label = L(f, 'label');
      const opts = L(f, 'options') || [];
      const val = S.postSurveyAnswers[f.id] || '';
      html += `<div class="field-row"><label>${label}</label>
        <select data-field="${f.id}" class="sv-sel-post">
          <option value="">— select —</option>
          ${opts.map((o, i) => `<option value="${i}" ${val == i ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>`;
    } else if (f.type === 'likert') {
      const label = L(f, 'label');
      const options = L(f, 'options') || ['Never', 'Seldom', 'Sometimes', 'Often', 'Always'];
      html += `<div class="likert-row"><div class="lq">${label}</div><div class="likert-scale">`;
      options.forEach((opt, idx) => {
        const val = idx + 1;
        const checked = (S.postSurveyAnswers[f.id] == val) ? 'checked' : '';
        html += `<div class="lk-opt">
          <input type="radio" name="${f.id}" id="${f.id}_${val}" value="${val}" data-field="${f.id}" class="sv-lk-post" ${checked}>
          <label for="${f.id}_${val}"><span class="lk-num">${val}</span><span>${opt}</span></label>
        </div>`;
      });
      html += `</div></div>`;
    } else if (f.type === 'text') {
      const label = L(f, 'label');
      const placeholder = L(f, 'placeholder') || 'Write your answer here…';
      const val = S.postSurveyAnswers[f.id] || '';
      html += `<div class="field-row" style="margin-bottom:20px;">
        <label style="display:block; font-weight:600; margin-bottom:6px;">${label}</label>
        <textarea data-field="${f.id}" class="sv-text-post" placeholder="${placeholder}" style="width:100%; padding:10px; border-radius:12px; border:1.5px solid var(--border); min-height:80px; font-family:inherit; resize:vertical;">${escapeHtml(val)}</textarea>
      </div>`;
    }
  });
  
  html += `<div class="actions"><button class="btn btn-primary" id="btnPostSurveyNext" disabled>Submit Post-Survey →</button></div>
    <p id="postSurveyMsg" style="color:var(--danger);text-align:center"></p></div>`;
  return html;
}

function bindPostSurveyDynamic() {
  const fields = S.studyConfig.postSurveyFields || [];
  const btn = el('btnPostSurveyNext');
  if (btn) btn.disabled = true;

  const updateBtn = () => {
    // Gather all answers
    document.querySelectorAll('.sv-sel-post').forEach(sel => {
      if (sel.value !== '') S.postSurveyAnswers[sel.dataset.field] = parseInt(sel.value);
    });
    document.querySelectorAll('.sv-lk-post:checked').forEach(radio => {
      S.postSurveyAnswers[radio.dataset.field] = parseInt(radio.value);
    });
    document.querySelectorAll('.sv-text-post').forEach(textarea => {
      if (textarea.value.trim() !== '') S.postSurveyAnswers[textarea.dataset.field] = textarea.value.trim();
    });

    const requiredFields = fields.filter(f => f.required === true && f.type !== 'section');
    const allFilled = requiredFields.every(f => {
      const val = S.postSurveyAnswers[f.id];
      return val !== undefined && val !== null && val !== '';
    });
    if (btn) btn.disabled = !allFilled;
    const msg = el('postSurveyMsg');
    if (msg) msg.textContent = allFilled ? '' : 'Please answer all required questions.';
  };

  // Bind events
  document.querySelectorAll('.sv-sel-post, .sv-lk-post, .sv-text-post').forEach(el => {
    el.addEventListener('change', updateBtn);
    el.addEventListener('input', updateBtn);
  });

  updateBtn();

  el('btnPostSurveyNext')?.addEventListener('click', () => {
    // Final capture
    document.querySelectorAll('.sv-sel-post').forEach(sel => {
      if (sel.value !== '') S.postSurveyAnswers[sel.dataset.field] = parseInt(sel.value);
    });
    document.querySelectorAll('.sv-lk-post:checked').forEach(radio => {
      S.postSurveyAnswers[radio.dataset.field] = parseInt(radio.value);
    });
    document.querySelectorAll('.sv-text-post').forEach(textarea => {
      if (textarea.value.trim() !== '') S.postSurveyAnswers[textarea.dataset.field] = textarea.value.trim();
    });
    saveLocalProgress();

    // Mark as complete and send to server
    S.completedPhases.posttest = true;
    S.completedPhases.postSurvey = true;
    saveLocalProgress({ completed: true });   // updates enrolment status to 'completed'

    S.phase = 'debrief';
    go();
  });
}
function renderTutorDynamic() {
  // ── Set tutor start date if not already set ──
  if (!S.metrics.tutorStartDate) {
    S.metrics.tutorStartDate = Date.now();
    saveLocalProgress();
  }

  const tasks = S.studyConfig.tutorTasks || [];
  const totalWeeks = tasks.length;
  const currentWeek = S.metrics.tutorWeek || 0;

  if (totalWeeks === 0 || currentWeek >= totalWeeks) {
    S.phase = 'post';
    S.assMode = 'post';
    S.assQ = 0;
    S.assAnswers = [];
    go();
    return '';
  }

  const task = tasks[currentWeek];
  const lang = S.studyLang || 'en';
  const title = lang === 'en' ? task.title_en : task.title_ha;
  const description = lang === 'en' ? task.description_en : task.description_ha;
  const example = lang === 'en' ? task.example_prompt_en : task.example_prompt_ha;

  const history = S.metrics.tutorHistory || [];
  if (history.length === 0) {
    const greeting = lang === 'en'
      ? `👋 Welcome to Week ${currentWeek + 1} of the Logic Tutor!\n\n**Task: ${title}**\n\n${description}\n\n💡 If you get stuck, try: "${example}"\n\nStart by writing your solution below.`
      : `👋 Sannu da zuwa Mako ${currentWeek + 1} na TunaniGini!\n\n**Aiki: ${title}**\n\n${description}\n\n💡 Idan ka makale, gwada: "${example}"\n\nFara da rubuta mafitarka a kasa.`;
    S.metrics.tutorHistory = [{ role: 'assistant', content: greeting, timestamp: new Date().toISOString() }];
    saveLocalProgress();
  }

  const messagesHtml = (S.metrics.tutorHistory || []).map(msg => {
    const senderClass = msg.role === 'user' ? 'user-message' : 'assistant-message';
    const formatted = msg.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return `<div class="message ${senderClass}">${formatted}</div>`;
  }).join('');

  const userMessages = (S.metrics.tutorHistory || []).filter(m => m.role === 'user').length;
  const canComplete = userMessages >= 3;

  const topbar = topbarHTML();
  const phaseStrip = phaseStripHTML();

  return `${topbar}${phaseStrip}<div class="main-card">
    <h2>🧠 TunaniGini Logic Tutor</h2>
    <p style="margin-bottom:16px; color:var(--text-muted);">
      Week ${currentWeek + 1} of ${totalWeeks}
    </p>
    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      <button class="pill ${lang === 'en' ? 'pill-blue' : ''}" id="tutorLangEn">English</button>
      <button class="pill ${lang === 'ha' ? 'pill-blue' : ''}" id="tutorLangHa">Hausa</button>
      <button class="pill pill-success" id="tutorEndSession" style="margin-left:auto;" ${canComplete ? '' : 'disabled'}>
        ${canComplete ? '✅ Mark as Complete' : 'Send 3+ messages to complete'}
      </button>
      <button class="pill pill-gray" id="tutorExitBtn">📚 Save & Exit</button>
    </div>
    <div class="chat-box" id="tutorChatBox" style="background:var(--gray-50); border-radius:16px; padding:16px; height:400px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
      ${messagesHtml}
    </div>
    <div class="input-area" style="display:flex; gap:12px; margin-top:16px;">
      <input type="text" id="tutorInput" placeholder="${lang === 'en' ? 'Type your solution...' : 'Rubuta mafitarka...'}" style="flex:1; padding:10px 16px; border-radius:40px; border:1.5px solid var(--border); background:var(--input-bg); color:var(--text-color);">
      <button class="btn btn-primary" id="tutorSendBtn">Send ➤</button>
    </div>
    <div id="tutorStatus" style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);"></div>
  </div>`;
}
function bindTutorDynamic() {
  const chatBox = document.getElementById('tutorChatBox');
  const input = document.getElementById('tutorInput');
  const sendBtn = document.getElementById('tutorSendBtn');
  const langEn = document.getElementById('tutorLangEn');
  const langHa = document.getElementById('tutorLangHa');
  const endBtn = document.getElementById('tutorEndSession');
  const exitBtn = document.getElementById('tutorExitBtn');
  const status = document.getElementById('tutorStatus');

  if (!chatBox) return;

  let currentLang = S.studyLang || 'ha';

  // ── Helper: scroll chat to bottom ──
  function scrollChat() {
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // ── Helper: add a message to the UI and save to state ──
  function addMessage(role, content, save = true) {
    const div = document.createElement('div');
    div.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    const formatted = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = formatted;
    chatBox.appendChild(div);
    scrollChat();
    if (save) {
      if (!S.metrics.tutorHistory) S.metrics.tutorHistory = [];
      S.metrics.tutorHistory.push({ role, content, timestamp: new Date().toISOString() });
      saveLocalProgress();
      updateEndButton();
    }
  }

  // ── Helper: update "Mark as Complete" button state ──
  function updateEndButton() {
    const userMessages = (S.metrics.tutorHistory || []).filter(m => m.role === 'user').length;
    if (endBtn) {
      endBtn.disabled = userMessages < 3;
      endBtn.textContent = userMessages >= 3 ? '✅ Mark as Complete' : `Send ${3 - userMessages} more message(s) to complete`;
    }
  }

  // ── If no history (should not happen), add greeting ──
  if (!S.metrics.tutorHistory || S.metrics.tutorHistory.length === 0) {
    const tasks = S.studyConfig.tutorTasks || [];
    const currentWeek = S.metrics.tutorWeek || 0;
    const task = tasks[currentWeek] || {};
    const lang = S.studyLang || 'en';
    const title = lang === 'en' ? task.title_en : task.title_ha;
    const description = lang === 'en' ? task.description_en : task.description_ha;
    const example = lang === 'en' ? task.example_prompt_en : task.example_prompt_ha;
    const greeting = lang === 'en'
      ? `👋 Welcome to Week ${currentWeek + 1} of the Logic Tutor!\n\n**Task: ${title}**\n\n${description}\n\n💡 If you get stuck, try: "${example}"\n\nStart by writing your solution below.`
      : `👋 Sannu da zuwa Mako ${currentWeek + 1} na TunaniGini!\n\n**Aiki: ${title}**\n\n${description}\n\n💡 Idan ka makale, gwada: "${example}"\n\nFara da rubuta mafitarka a kasa.`;
    addMessage('assistant', greeting, true);
  }

  updateEndButton();
  scrollChat();

  // ── Send message ──
  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text, true);
    status.textContent = currentLang === 'en' ? 'TunaniGini is thinking...' : 'TunaniGini yana tunani...';

    try {
      const history = (S.metrics.tutorHistory || []).slice(-10).map(msg => ({ role: msg.role, content: msg.content }));
      const response = await fetch(`${API_BASE}/api/tutor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          lang: currentLang,
          history
        })
      });
      const data = await response.json();
      if (data.reply) {
        addMessage('assistant', data.reply, true);
        if (data.topic) console.log('Topic:', data.topic);
        if (data.struggle) console.log('Struggle detected');
      } else {
        addMessage('assistant', 'Error: ' + (data.error || 'Unknown error'), true);
      }
    } catch (err) {
      addMessage('assistant', 'Network error. Please try again.', true);
    } finally {
      status.textContent = '';
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // ── Language toggle ──
  langEn.addEventListener('click', () => {
    currentLang = 'en';
    S.studyLang = 'en';
    langEn.classList.add('pill-blue');
    langHa.classList.remove('pill-blue');
    input.placeholder = 'Type your solution...';
    saveLocalProgress();
  });
  langHa.addEventListener('click', () => {
    currentLang = 'ha';
    S.studyLang = 'ha';
    langHa.classList.add('pill-blue');
    langEn.classList.remove('pill-blue');
    input.placeholder = 'Rubuta mafitarka...';
    saveLocalProgress();
  });

  // ── End session (Mark as Complete) ──
  endBtn.addEventListener('click', () => {
    const userMessages = (S.metrics.tutorHistory || []).filter(m => m.role === 'user').length;
    if (userMessages < 3) {
      alert(currentLang === 'en' ? 'Please send at least 3 messages before completing this week.' : 'Da fatan za a aika aƙalla saƙo 3 kafin kammala wannan mako.');
      return;
    }
    if (confirm(currentLang === 'en' ? 'Mark this week as complete?' : 'Ka kammala wannan mako?')) {
      // Record session end
      const session = {
        week: (S.metrics.tutorWeek || 0) + 1,
        start: S.metrics.currentSessionStart || new Date().toISOString(),
        end: new Date().toISOString(),
        messageCount: (S.metrics.tutorHistory || []).filter(m => m.role === 'user').length,
        taskCompleted: true
      };
      if (!S.metrics.tutorSessions) S.metrics.tutorSessions = [];
      S.metrics.tutorSessions.push(session);
      S.metrics.currentSessionStart = null;

      // Advance to next week
      const totalWeeks = S.studyConfig.tutorTasks?.length || 0;
      S.metrics.tutorWeek = (S.metrics.tutorWeek || 0) + 1;

      if (S.metrics.tutorWeek >= totalWeeks) {
        // All weeks done → mark tutor complete and move to post‑test
        S.completedPhases.tutor = true;
        saveLocalProgress();
        const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
        if (hasPost) {
          S.phase = 'post';
          S.assMode = 'post';
          S.assQ = 0;
          S.assAnswers = [];
        } else {
          S.phase = 'debrief';
        }
        go();
      } else {
        // Next week – clear history for fresh start
        S.metrics.tutorHistory = [];
        saveLocalProgress();
        S.phase = 'tutor';
        go();
      }
    }
  });

  // ── Save & Exit ──
  exitBtn?.addEventListener('click', () => {
    saveLocalProgress();
    S.phase = 'studySelect';
    go();
  });
}

function renderAssessmentDynamic(mode) {
  // ── Safety guard: if config is missing, redirect ──
  if (!S.studyConfig) {
    console.warn('renderAssessmentDynamic: studyConfig missing, redirecting to studySelect');
    S.phase = 'studySelect';
    go();
    return '';
  }

  // If mode is post but there is no postQ, redirect to studySelect (for Study 3)
  if (mode === 'post' && (!S.studyConfig.postQ || S.studyConfig.postQ.length === 0)) {
    console.warn('renderAssessmentDynamic: post mode called but no postQ – redirecting');
    S.phase = 'studySelect';
    go();
    return '';
  }

  if (mode === 'post' && !canStartPostTest()) {
    const minDays = S.studyConfig?.min_days_between_pretest_posttest || 0;
    const preDate = new Date(S.metrics.preCompletedAt);
    const now = new Date();
    const daysLeft = Math.ceil((preDate.getTime() + minDays * 24*60*60*1000 - now.getTime()) / (24*60*60*1000));
    return `<div class="main-card"><h2>Post‑test not yet available</h2><p>The post‑test will be available after ${minDays} day(s). Please return in ${daysLeft} day(s).</p><div class="actions"><button class="btn btn-primary" id="btnBackToStudies">← Back to studies</button></div></div>`;
  }

  const qs = mode === 'pre' ? S.studyConfig.preQ : S.studyConfig.postQ;
  if (!qs || !qs.length) return `<div class="main-card">No questions</div>`;
  const q = qs[S.assQ];
  const isAnswered = S.assAnswers[S.assQ] !== undefined;
  const chosen = S.assAnswers[S.assQ];
  const isPost = mode === 'post';
  const total = qs.length;

  const questionHtml = q.q_en || q.q || '';
  const formattedQuestion = `<pre class="question-code">${escapeHtml(questionHtml)}</pre>`;

  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
    <div class="prog-wrap">
      <div class="prog-row">
        <span>${mode === 'pre' ? 'Pre‑test' : 'Post‑test'} – Question ${S.assQ+1}/${total}</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${((S.assQ+1)/total)*100}%"></div></div>
    </div>
    <div class="q-wrap">
      <div class="q-text">${formattedQuestion}</div>
      ${(L(q,'opts')).map((opt,i) => {
        let extra = '';
        if (isAnswered && (isPost || q.isAttention)) {
          if (i === q.correct) extra = ' correct-ans';
          else if (i === chosen && chosen !== q.correct) extra = ' wrong-ans';
        } else if (i === chosen) extra = ' selected';
        return `<button class="option-btn${extra}" data-idx="${i}" ${isAnswered ? 'disabled' : ''}>${'ABCD'[i]}. ${opt}</button>`;
      }).join('')}
    </div>
    <div class="actions" style="justify-content: space-between;">
      ${S.assQ > 0 ? `<button class="btn btn-secondary" id="btnAssPrev">← Previous</button>` : ''}
      ${isAnswered ? `<button class="btn btn-primary" id="btnAssNext">${S.assQ < total-1 ? 'Next →' : 'Finish →'}</button>` : ''}
    </div>
  </div>`;
}

function bindAssessmentDynamic(mode) {
  if (!S.studyConfig) {
    console.warn('bindAssessmentDynamic: studyConfig missing – aborting');
    return;
  }
  if (mode === 'post' && (!S.studyConfig.postQ || S.studyConfig.postQ.length === 0)) {
    console.warn('bindAssessmentDynamic: post mode called with no postQ – redirecting');
    S.phase = 'studySelect';
    go();
    return;
  }

  document.querySelectorAll('.option-btn:not([disabled])').forEach(btn => {
    btn.onclick = () => {
      S.assAnswers[S.assQ] = parseInt(btn.dataset.idx);
      saveLocalProgress();
      go();
    };
  });

  el('btnAssPrev')?.addEventListener('click', () => {
    if (S.assQ > 0) {
      S.assQ--;
      go();
    }
  });

  el('btnAssNext')?.addEventListener('click', () => {
    const qs = mode === 'pre' ? S.studyConfig.preQ : S.studyConfig.postQ;
    if (S.assQ < qs.length - 1) {
      S.assQ++;
      go();
    } else {
      const scorable = qs.filter(q => !q.isAttention);
      const total = Math.round((scorable.filter((q, i) => S.assAnswers[qs.indexOf(q)] === q.correct).length / scorable.length) * 100);
      if (!S.metrics) S.metrics = { puzzles: {} };

      if (mode === 'pre') {
        S.completedPhases.pretest = true;
        S.metrics.preScore = total;
        S.metrics.preCompletedAt = new Date().toISOString();
        saveLocalProgress();

        if (S.studyConfig.hasTutor) {
          if (!S.metrics.tutorWeek) S.metrics.tutorWeek = 0;
          if (!S.metrics.tutorHistory) S.metrics.tutorHistory = [];
          if (!S.metrics.tutorSessions) S.metrics.tutorSessions = [];
          if (!S.metrics.tutorStartDate) S.metrics.tutorStartDate = Date.now();
          S.phase = 'tutor';
        } else {
          S.phase = 'study';
          S.puzzleIdx = 0;
        }

        saveLocalProgress();
        go();
      } else {
        // post‑test completion
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
  const hasPre = S.studyConfig?.preQ && S.studyConfig.preQ.length > 0;
  const hasPost = S.studyConfig?.postQ && S.studyConfig.postQ.length > 0;
  const hasPuzzles = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
  const hasReflections = S.studyConfig?.reflections && S.studyConfig.reflections.length > 0;
  const hasPostSurvey = S.studyConfig?.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;

  // Only truly survey‑only studies (no tests, puzzles, reflections, post‑survey)
  const isTrulySurveyOnly = !hasPre && !hasPost && !hasPuzzles && !hasReflections && !hasPostSurvey;

  if (isTrulySurveyOnly) {
    // Original Impostor‑specific debrief (Study 2)
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

  // For all other studies (including those with reflections/post‑survey)
  const gain = (S.metrics?.postScore && S.metrics?.preScore) ? S.metrics.postScore - S.metrics.preScore : null;
  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
    <div class="cert-box">
      <div class="pcode-num">${S.participantCode}</div>
      ${gain !== null ? `<p>Learning gain: ${gain >= 0 ? '+' : ''}${gain}%</p>` : ''}
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="btnDebriefNext">View results →</button>
    </div>
  </div>`;
}
async function renderComplete() {
  // ── Safety guard for post‑survey (Study 3) ──
  const hasPostSurvey = S.studyConfig?.postSurveyFields && S.studyConfig.postSurveyFields.length > 0;
  if (hasPostSurvey && !S.completedPhases.postSurvey) {
    S.phase = 'postsurvey';
    go();
    return '';
  }

  const hasPuzzles = S.studyConfig?.puzzles && S.studyConfig.puzzles.length > 0;
  const hasPreTest = S.studyConfig?.preQ && S.studyConfig.preQ.length > 0;
  const hasPostTest = S.studyConfig?.postQ && S.studyConfig.postQ.length > 0;
  const hasReflections = S.studyConfig?.reflections && S.studyConfig.reflections.length > 0;
  const hasDelayedPostTest = S.studyConfig?.delayed_post_test_weeks > 0;
  const followupCompleted = S.metrics?.followupCompleted === true;
  const followupAvailableAt = S.metrics?.followupAvailableAt ? new Date(S.metrics.followupAvailableAt) : null;

  // ── DETECT STUDY TYPE ──
  const isSurveyOnly = !hasPuzzles && !hasPreTest && !hasPostTest && !hasReflections && !hasPostSurvey;
  const isPuzzleStudy = hasPuzzles;
  const isReflectionStudy = hasReflections || hasPostSurvey;

  // ── CHECK: Did we just complete the follow‑up? ──
  const justCompletedFollowup = followupCompleted && S.completedPhases.followup === true;

        // ── SURVEY‑ONLY STUDY (Study 2) ──
  if (isSurveyOnly && S.completedPhases.survey) {
    // ★ GUARD: only proceed if the SERVER says this enrolment is completed.
    // Prevents stale local flags from re-marking an in-progress enrolment as completed.
    const enrol = S.myEnrolments?.find(e => e.id === S.currentEnrolmentId);
    if (!enrol || enrol.status !== 'completed') {
      console.warn('renderComplete() reached for survey-only, but server status is not "completed" — redirecting to resume');
      S.phase = 'resume';
      go();
      return '';
    }

    if (!S.completedSaved) {
      S.completedSaved = true;
      S.completedPhases.posttest = true;
      
      // ── CRITICAL: Explicitly mark as completed on the server ──
      if (S.currentEnrolmentId && S.participantCode) {
        const toStore = {
          completed: true,
          completedAt: new Date().toISOString(),
          completedPhases: { ...S.completedPhases }
        };
        try {
          const response = await fetch(`${API_BASE}/api/progress/${S.currentEnrolmentId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toStore)
          });
          if (response.ok) {
            console.log('✅ Survey-only study marked as completed on server');
          } else {
            console.warn('Failed to mark as completed on server:', await response.text());
          }
        } catch (e) {
          console.warn('Server sync failed:', e);
        }
      } else {
        console.warn('⚠️ Cannot mark as completed: missing currentEnrolmentId or participantCode');
        // Fallback: try saveLocalProgress anyway
        saveLocalProgress({ completed: true });
      }
    }
    // ... the certificate HTML `return` continues here, unchanged ...
    
    // Show survey completion certificate
    return `${topbarHTML()}<div class="main-card">
      <div style="text-align:center; padding:20px 0;">
        <div style="font-size:4rem;">📋</div>
        <h2>Survey Completed Successfully</h2>
        <p style="font-size:1.1rem; margin:16px 0;">
          Thank you for completing the survey for <strong>${escapeHtml(S.studyConfig.title_en)}</strong>.
        </p>
        <div class="resume-grid" style="max-width:400px; margin:20px auto;">
          <div class="resume-stat">
            <div class="rnum">✅</div>
            <div class="rlbl">Survey completed</div>
          </div>
          <div class="resume-stat">
            <div class="rnum">—</div>
            <div class="rlbl">No tests or puzzles</div>
          </div>
        </div>
        <p style="color:var(--muted);">Your responses have been recorded securely.</p>
        <div class="actions" style="justify-content:center; margin-top:24px;">
          <button class="btn btn-primary" onclick="window.handleDownloadCertificate()">📄 Download Certificate (PDF)</button>
          <button class="btn btn-secondary" onclick="window.handlePrintCertificate()">🖨 Print certificate</button>
          <button class="btn btn-secondary" id="btnBackToStudies">📚 Back to Studies</button>
        </div>
      </div>
    </div>`;
  }
  // ── DELAYED POST‑TEST PENDING (not yet completed) ──
  if (hasDelayedPostTest && !followupCompleted && !justCompletedFollowup) {
    let message = '';
    let buttonHtml = '';
    if (followupAvailableAt && new Date() >= followupAvailableAt) {
      message = 'The delayed post‑test is now available.';
      buttonHtml = `<button class="btn btn-primary" id="btnStartFollowupFromComplete">Start delayed post‑test →</button>`;
    } else {
      if (followupAvailableAt) {
        const formattedDate = formatDateDDMMYYYY(followupAvailableAt);
        message = `The delayed post‑test will be available on <strong>${formattedDate}</strong>. Please return then.`;
      } else {
        message = 'The delayed post‑test will be available after the waiting period. Please check back later.';
      }
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

  // ── POST‑TEST WAITING PERIOD ──
  if (S.postTestPending && S.completedPhases.puzzles && S.studyConfig?.min_days_between_pretest_posttest > 0) {
    const preDate = new Date(S.metrics.preCompletedAt);
    const minDays = S.studyConfig.min_days_between_pretest_posttest;
    const availableDate = new Date(preDate);
    availableDate.setDate(availableDate.getDate() + minDays);
    const formattedDate = formatDateDDMMYYYY(availableDate);
    
    return `${topbarHTML()}<div class="main-card">
      <h2>Post‑test waiting period</h2>
      <p>You have completed the main study. The post‑test will be available on <strong>${formattedDate}</strong>.</p>
      <p>Please return on or after that date to take the post‑test.</p>
      <div class="actions"><button class="btn btn-primary" id="btnBackToStudies">← Back to Studies</button></div>
    </div>`;
  }

  // ── COMPLETION SAVED ──
  if (!S.completedSaved) {
    S.completedSaved = true;
    saveLocalProgress({ completed: true });
  }

  // ── BUILD THE COMPLETION PAGE ──
  let scoreHtml = '';
  let peerHtml = '';

  // ── FOLLOW‑UP WAS JUST COMPLETED ──
  if (justCompletedFollowup) {
    const followupScore = S.metrics?.followupScore || '—';
    scoreHtml = `
      <div class="score-hero">
        <div style="font-size:4rem; margin-bottom:10px;">📋</div>
        <div class="score-big">✅ Delayed Post‑test Completed</div>
        ${followupScore !== '—' ? `<p style="font-size:1.2rem; margin-top:10px;">Score: ${followupScore}%</p>` : ''}
        <p style="font-size:1rem; color:var(--muted); margin-top:8px;">Thank you for completing the delayed post‑test!</p>
      </div>
    `;
  } 
  // ── PUZZLE-BASED STUDY (Study 1) ──
  else if (isPuzzleStudy) {
    const solved = Object.values(S.metrics?.puzzles || {}).filter(p => p.completed).length;
    const total = S.studyConfig.puzzles.length;
    
    scoreHtml = `
      <div class="score-hero">
        <div class="score-big">${solved}/${total}</div>
        <p>puzzles solved</p>
      </div>
    `;

    if (API_BASE !== undefined && S.currentStudyId) {
      const data = await apiAverageGain(S.currentStudyId);
      if (data && data.averageGain !== undefined) {
        const myGain = (S.metrics.postScore || 0) - (S.metrics.preScore || 0);
        const diff = myGain - data.averageGain;
        peerHtml = `<div class="example-box" style="margin-top:14px">📊 Class average learning gain: ${data.averageGain.toFixed(1)}%. ${diff > 0 ? 'You did better than average! 🎉' : diff < 0 ? 'Keep practising – you can improve!' : 'You are on par with your peers.'}</div>`;
      }
    }
  } 
  // ── REFLECTION + POST‑SURVEY STUDY (Study 3) ──
  else if (isReflectionStudy) {
    const preSurveyDone = S.completedPhases.survey ? '✅' : '⬜';
    const reflectionsDone = S.metrics?.reflections ? S.metrics.reflections.length : 0;
    const totalReflections = S.studyConfig?.reflections ? S.studyConfig.reflections.length : 0;
    const postSurveyDone = S.completedPhases.postSurvey ? '✅' : '⬜';
    const postScore = S.metrics?.postScore || '—';

    scoreHtml = `
      <div class="score-hero">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:16px; margin:20px 0;">
          <div class="resume-stat"><div class="rnum">${preSurveyDone}</div><div class="rlbl">Pre‑survey</div></div>
          <div class="resume-stat"><div class="rnum">${reflectionsDone}/${totalReflections}</div><div class="rlbl">Reflections</div></div>
          <div class="resume-stat"><div class="rnum">${postSurveyDone}</div><div class="rlbl">Post‑survey</div></div>
          ${postScore !== '—' ? `<div class="resume-stat"><div class="rnum">${postScore}%</div><div class="rlbl">Post‑test score</div></div>` : ''}
        </div>
        <p style="font-size:1.1rem; color:var(--muted);">Study completed successfully! 🎉</p>
      </div>
    `;
  }

  return `${topbarHTML()}<div class="main-card">
    ${scoreHtml}
    ${peerHtml}
    <div class="actions">
      <button class="btn btn-secondary" id="btnViewDash">📊 Dashboard</button>
      <button class="btn btn-primary" onclick="window.handleDownloadCertificate()">📄 Download Certificate (PDF)</button>
      <button class="btn btn-secondary" onclick="window.handlePrintCertificate()">🖨 Print certificate</button>
      <button class="btn btn-secondary" id="btnBackToStudies">📚 Back to Studies</button>
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
  // Dashboard
  el('btnViewDash')?.addEventListener('click', () => {
    window.location.href = window.location.pathname + '?admin=true';
  });

  // Back to studies (for both certificate and waiting page)
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
  return `${topbarHTML()}<div class="main-card">
    <h2>📊 Researcher Dashboard</h2>
    <p>Select a study to manage.</p>
    <div id="studySelector" style="margin-bottom:20px">
      <select id="adminStudySelect" style="width:100%;padding:10px;border-radius:12px;border:1.5px solid var(--border)">
        <option value="">-- Loading studies --</option>
      </select>
    </div>
    <div id="portalMgmtPanel" class="portal-status-placeholder" style="margin-bottom:20px">Loading...</div>
    <div class="dash-grid" id="statsGrid" style="margin-bottom:20px">...</div>
    <div class="actions">
      <button class="btn btn-secondary" id="btnExportCSV">📊 Export CSV</button>
      <button class="btn btn-secondary" id="btnExportJSON">📥 Export JSON</button>
      <!-- Removed Edit Survey Fields -->
      <button class="btn btn-secondary" id="btnClearLocalData">🗑 Clear local data</button>
      <button class="btn btn-primary" id="btnDashBack">← Back to portal</button>
    </div>
    <!-- Removed configEditorContainer -->
  </div>`;
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

// ============================================================
// RENDER FOLLOW-UP (DELAYED POST-TEST) with Previous button
// ============================================================
function renderFollowupDynamic() {
  // Safety guard: if no postQ, redirect
  if (!S.studyConfig || !S.studyConfig.postQ || S.studyConfig.postQ.length === 0) {
    console.warn('renderFollowupDynamic: No postQ found, redirecting to studySelect');
    S.phase = 'studySelect';
    go();
    return '';
  }

  const qs = S.studyConfig.postQ;
  if (!qs || !qs.length) return `<div class="main-card">No follow‑up questions</div>`;
  
  const q = qs[S.assQ];
  const isAnswered = S.assAnswers[S.assQ] !== undefined;
  const chosen = S.assAnswers[S.assQ];
  
  const questionHtml = q.q_en || q.q || '';
  const formattedQuestion = `<pre class="question-code">${escapeHtml(questionHtml)}</pre>`;

  // Determine if we're on the first or last question
  const isFirst = S.assQ === 0;
  const isLast = S.assQ === qs.length - 1;

  return `${topbarHTML()}${phaseStripHTML()}<div class="main-card">
    <div class="prog-wrap">
      <div class="prog-row">
        <span>Delayed Post‑test – Question ${S.assQ+1}/${qs.length}</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${((S.assQ+1)/qs.length)*100}%"></div></div>
    </div>
    <div class="q-wrap">
      <div class="q-text">${formattedQuestion}</div>
      ${(L(q,'opts')).map((opt,i) => {
        let extra = '';
        if (isAnswered) {
          if (i === q.correct) extra = ' correct-ans';
          else if (i === chosen && chosen !== q.correct) extra = ' wrong-ans';
        } else if (i === chosen) extra = ' selected';
        return `<button class="option-btn${extra}" data-idx="${i}" ${isAnswered ? 'disabled' : ''}>${'ABCD'[i]}. ${opt}</button>`;
      }).join('')}
    </div>
    <div class="actions" style="justify-content: space-between;">
      ${!isFirst ? `<button class="btn btn-secondary" id="btnFollowupPrev">← Previous</button>` : ''}
      ${isAnswered ? `<button class="btn btn-primary" id="btnFollowupNext">${isLast ? 'Finish →' : 'Next →'}</button>` : ''}
    </div>
  </div>`;
}

function bindFollowupDynamic() {
  // Option buttons
  document.querySelectorAll('.option-btn:not([disabled])').forEach(btn => { 
    btn.onclick = () => { 
      S.assAnswers[S.assQ] = parseInt(btn.dataset.idx); 
      saveLocalProgress(); 
      go(); 
    }; 
  });

  // Previous button
  el('btnFollowupPrev')?.addEventListener('click', () => {
    if (S.assQ > 0) {
      S.assQ--;
      go();
    }
  });

  // Next / Finish button
  el('btnFollowupNext')?.addEventListener('click', () => {
    const qs = S.studyConfig.postQ;
    if (S.assQ < qs.length - 1) { 
      S.assQ++; 
      go(); 
    } else {
      // Calculate score
      const scorable = qs.filter(q => !q.isAttention);
      const total = Math.round((scorable.filter((q, i) => S.assAnswers[qs.indexOf(q)] === q.correct).length / scorable.length) * 100);
      
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
// ============================================================
// CERTIFICATE HANDLERS (inline onclick)
// ============================================================
window.handleDownloadCertificate = function() {
  const completionDate = S.metrics?.completedAt || S.metrics?.mainCompletedAt || null;
  const certHtml = generateCertificateHTML(completionDate);
  const blob = new Blob([certHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificate_${S.participantCode || 'participant'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert('Certificate HTML saved. Open it in your browser and print to PDF for a permanent copy.');
};

window.handlePrintCertificate = function() {
  const completionDate = S.metrics?.completedAt || S.metrics?.mainCompletedAt || null;
  const certHtml = generateCertificateHTML(completionDate);
  const win = window.open();
  if (!win) {
    alert('Popup blocked. Please allow popups for this site.');
    return;
  }
  win.document.write(certHtml);
  win.document.close();
  win.focus();
  win.print();
};

// ============================================================
// GENERATE CERTIFICATE HTML (working version from GitHub)
// ============================================================
function generateCertificateHTML(completionDateOverride) {
  const studyTitle = S.studyConfig?.title_en || 'Computing Education Research Study';
  const participantName = S.participantName || 'Participant';
  const participantCode = S.participantCode || 'N/A';
  
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

// ============================================================
// RENDER CERTIFICATES PAGE
// ============================================================
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

// ============================================================
// BIND CERTIFICATES (with filtering for truly completed studies)
// ============================================================
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

  // --- Live search for certificates (with filtering) ---
  codeInput?.addEventListener('input', async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 5) {
      listDiv.innerHTML = '';
      return;
    }
    try {
      const enrolments = await apiGetMyEnrolments(code);
      const trulyCompleted = [];
      for (const enrol of enrolments) {
        if (enrol.status !== 'completed') continue;
        const config = await apiFetchStudyConfig(enrol.study_id);
        if (!config) continue; // skip if config missing (safe)

        const hasReflections = config.reflections && config.reflections.length > 0;
        const hasPostSurvey = config.postSurveyFields && config.postSurveyFields.length > 0;
        if (!hasReflections && !hasPostSurvey) {
          // Truly completed (no pending phases)
          trulyCompleted.push(enrol);
          continue;
        }

        // Load progress to check completion of reflections and post‑survey
        let progress = null;
        const local = loadLocalProgress ? loadLocalProgress() : null;
        if (local) {
          progress = local;
        } else {
          const remote = await apiLoadProgress(enrol.id);
          if (remote?.progress) progress = remote.progress;
        }
        if (!progress) continue; // no progress – skip

        const reflectionsDone = progress.metrics?.reflections ? progress.metrics.reflections.length : 0;
        const totalReflections = config.reflections ? config.reflections.length : 0;
        const postSurveyDone = progress.completedPhases?.postSurvey || false;

        if (reflectionsDone >= totalReflections && (postSurveyDone || !hasPostSurvey)) {
          trulyCompleted.push(enrol);
        }
      }

      if (trulyCompleted.length === 0) {
        listDiv.innerHTML = '<p>No completed studies found for this code.</p>';
        return;
      }

      listDiv.innerHTML = trulyCompleted.map(e => {
        const studyTitle = e.study?.title_en || 'Study';
        const completedDate = e.completed_at ? new Date(e.completed_at).toLocaleDateString() : 'N/A';
        return `<div class="cert-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border);">
          <div><strong>${studyTitle}</strong><br><span style="font-size:0.85rem;color:var(--muted);">Completed: ${completedDate}</span></div>
          <button class="btn btn-primary btn-sm cert-download" data-enrolment="${e.id}" data-code="${code}">📄 Download Certificate</button>
        </div>`;
      }).join('');

      // Bind download buttons for each certificate
      document.querySelectorAll('.cert-download').forEach(btn => {
        btn.addEventListener('click', async () => {
          const enrolId = btn.dataset.enrolment;
          const code = btn.dataset.code;
          const enrol = trulyCompleted.find(e => e.id == enrolId);
          if (!enrol) return;

          // Temporarily switch S to this study's context
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
  if (urlParams.has('admin') && S.phase !== 'dashboard' && !S.isAdminMode) {
    S.isAdminMode = true;
    S.phase = 'adminLogin';
  }

  // ---- Resume from URL parameter (takes priority over admin) ----
const resumeCode = urlParams.get('resume');
if (resumeCode) {
  // If an admin is currently logged in, log them out first
  if (S.isAdminMode || S.phase === 'dashboard' || S.phase === 'adminLogin') {
    console.log('🔓 Admin session detected during resume – logging out admin first');
    try {
      await fetch(`${API_BASE}/api/admin/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('Admin logout failed (continuing anyway):', e);
    }
    S.isAdminMode = false;
    S.phase = 'hero';
    // Reset any admin-related state
    S.participantCode = null;
    S.currentEnrolmentId = null;
    S.currentStudyId = null;
    S.studyConfig = null;
    S.metrics = null;
    S.surveyAnswers = {};
    S.assAnswers = [];
    S.postSurveyAnswers = {};
    S.reflectionWeek = 0;
  }

  if (S.phase === 'hero') {
    console.log('📌 Resume code detected:', resumeCode);

    const attemptResume = () => {
      const inp = document.getElementById('resumeCode');
      const btn = document.getElementById('btnDoResume');
      const panel = document.getElementById('resumePanel');

      if (!inp || !btn) {
        console.warn('Resume elements not found, retrying...');
        setTimeout(attemptResume, 200);
        return;
      }

      if (panel) panel.style.display = 'block';
      inp.value = resumeCode;
      console.log('✅ Filled resume code, clicking button...');
      btn.click();
    };

    setTimeout(attemptResume, 300);
  }
}

  // ---- Reload study config if needed ----
  const phasesNeedingConfig = ['orient','consent','survey','pre','study','faded','attempt','reflect','code','review','post','followup','guided','debrief','complete','resume'];
  if (phasesNeedingConfig.includes(S.phase) && !S.studyConfig && S.currentStudyId) {
    console.log('Reloading study config');
    try {
      S.studyConfig = await apiFetchStudyConfig(S.currentStudyId);
      if (!S.studyConfig) throw new Error('No config');
      S.totalPuzzles = S.studyConfig.puzzles?.length || 0;
    } catch(e) {
      alert('Could not load study. Please try again.');
      S.phase = 'hero';
      go();
      return;
    }
  }

  // ---- Fetch studies when on hero page ----
  if (S.phase === 'hero' && S.availableStudies.length === 0) {
    S.availableStudies = await apiFetchStudies();
  }

  // ---- Refresh enrolments and studies when entering study selection ----
  if (S.phase === 'studySelect') {
    if (S.availableStudies.length === 0) {
      S.availableStudies = await apiFetchStudies();
    }
    if (S.participantCode) {
      let enrolments = await apiGetMyEnrolments(S.participantCode);
      // ── PATCH: Show studies with pending reflections/post‑survey as in_progress ──
      const patchedEnrolments = [];
      for (const enrol of enrolments) {
        if (enrol.status === 'completed') {
          // Check if this study has reflections or post‑survey
          const config = await apiFetchStudyConfig(enrol.study_id);
          if (config) {
            const hasReflections = config.reflections && config.reflections.length > 0;
            const hasPostSurvey = config.postSurveyFields && config.postSurveyFields.length > 0;
            if (hasReflections || hasPostSurvey) {
              // Load progress to see if all phases are done
              let progress = null;
              const local = loadLocalProgress ? loadLocalProgress() : null;
              if (local) {
                progress = local;
              } else {
                const remote = await apiLoadProgress(enrol.id);
                if (remote?.progress) progress = remote.progress;
              }
              if (progress) {
                const reflectionsDone = progress.metrics?.reflections ? progress.metrics.reflections.length : 0;
                const totalReflections = config.reflections ? config.reflections.length : 0;
                const postSurveyDone = progress.completedPhases?.postSurvey || false;
                if (reflectionsDone < totalReflections || !postSurveyDone) {
                  // Copy and change status locally
                  const patched = { ...enrol, status: 'in_progress' };
                  patchedEnrolments.push(patched);
                  continue;
                }
              }
            }
          }
        }
        // Keep original if not patched
        patchedEnrolments.push(enrol);
      }
      S.myEnrolments = patchedEnrolments;
      // await syncCompletionStatus();
    }
  }

  // ---- Check for real progress in puzzle-based phases ----
  const needsProgress = ['pre','study','faded','attempt','reflect','code','review','post'];
  if (needsProgress.includes(S.phase)) {
    const hasRealProgress = S.completedPhases.survey || S.completedPhases.pretest || S.completedPhases.puzzles ||
                            (S.metrics && (Object.keys(S.metrics.puzzles || {}).length > 0 || S.metrics.preScore !== undefined));
    if (!hasRealProgress) {
      console.log('No progress, redirecting to orient');
      S.phase = 'orient';
    }
  }

  // ---- Advance from pre-test if already completed ----
  if (S.phase === 'pre' && S.completedPhases.pretest) {
  if (S.studyConfig?.hasTutor) {
    // Initialise tutor metrics if needed
    if (!S.metrics.tutorWeek) S.metrics.tutorWeek = 0;
    if (!S.metrics.tutorHistory) S.metrics.tutorHistory = [];
    if (!S.metrics.tutorSessions) S.metrics.tutorSessions = [];
    if (!S.metrics.tutorStartDate) S.metrics.tutorStartDate = Date.now();
    S.phase = 'tutor';
  } else {
    S.phase = 'study';
    S.puzzleIdx = S.puzzlesCompletedCount;
  }
}
  // ---- AUTO-ADVANCE FOR REFLECTIONS ----
  if (S.phase === 'reflection') {
    const total = (S.studyConfig?.reflections || []).length;
    const idx = S.reflectionWeek || 0;
    if (idx >= total) {
      if (S.studyConfig?.postSurveyFields && S.studyConfig.postSurveyFields.length > 0) {
        S.phase = 'postsurvey';
      } else {
        S.phase = 'debrief';
      }
    }
  }

// ---- TUTOR TIME-LOCKING ----
if (S.phase === 'tutor') {
  const tasks = S.studyConfig.tutorTasks || [];
  const totalWeeks = tasks.length;
  const idx = S.metrics.tutorWeek || 0;
  if (idx >= totalWeeks) {
    // All done – move to post-test if tutor not already completed
    if (!S.completedPhases.tutor) {
      S.completedPhases.tutor = true;
      saveLocalProgress();
    }
    const hasPost = S.studyConfig.postQ && S.studyConfig.postQ.length > 0;
    if (hasPost) {
      S.phase = 'post';
      S.assMode = 'post';
      S.assQ = 0;
      S.assAnswers = [];
    } else {
      S.phase = 'debrief';
    }
    go();
    return;
  }
  // If week > 0, check availability
  if (idx > 0) {
    const days = S.studyConfig.tutorDays || [0, 7, 7, 7];
    const startDate = new Date(S.metrics.tutorStartDate || Date.now());
    let cumulative = 0;
    for (let i = 0; i <= idx; i++) {
      cumulative += days[i] || 0;
    }
    const availableDate = new Date(startDate);
    availableDate.setDate(availableDate.getDate() + cumulative);
    if (new Date() < availableDate) {
      // Show waiting page
      const formattedDate = formatDateDDMMYYYY(availableDate);
      const app = document.getElementById('app');
      app.innerHTML = `${topbarHTML()}<div class="main-card">
        <h2>⏳ Next Week is Locked</h2>
        <p>Week ${idx + 1} will be available on <strong>${formattedDate}</strong>.</p>
        <p>Please return then to continue with the tutor.</p>
        <div class="actions"><button class="btn btn-secondary" id="btnBackToStudies">📚 Back to Studies</button></div>
      </div>`;
      el('btnBackToStudies')?.addEventListener('click', () => {
        S.phase = 'studySelect';
        go();
      });
      // Skip rendering the actual tutor
      return;
    }
  }
}

  // ---- Render the appropriate view ----
  const app = document.getElementById('app');
  let html = '';
  switch (S.phase) {
    case 'hero': html = renderHero(); break;
    case 'register': html = renderRegister(); break;
    case 'studySelect': html = renderStudySelect(); break;
    case 'resumeSelect': html = renderResumeSelect(); break;
    case 'orient': html = renderOrient(); break;
    case 'consent': html = renderConsent(); break;
    case 'reflection': html = renderReflectionDynamic(); break;
    case 'postsurvey': html = renderPostSurveyDynamic(); break;
    case 'tutor': html = renderTutorDynamic(); break;
    case 'survey': html = renderSurveyDynamic(); break;
    case 'pre':
      if (!S.studyConfig || !S.studyConfig.preQ || S.studyConfig.preQ.length === 0) {
        S.phase = 'studySelect';
        go();
        return;
      }
      html = renderAssessmentDynamic('pre');
      break;
    case 'study': html = renderStudyDynamic(); break;
    case 'faded': html = renderFadedDynamic(); break;
    case 'attempt': html = renderAttemptDynamic(); break;
    case 'reflect': html = renderReflectDynamic(); break;
    case 'code': html = renderCodeDynamic(); break;
    case 'review': html = renderReviewDynamic(); break;
    case 'post':
      if (!S.studyConfig || !S.studyConfig.postQ || S.studyConfig.postQ.length === 0) {
        S.phase = 'studySelect';
        go();
        return;
      }
      html = renderAssessmentDynamic('post');
      break;
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

  // ============================================================
  //  EVENT DELEGATION – ensures all buttons work even after re‑render
  // ============================================================
  // Remove any previous delegated listener to avoid duplicates
  const oldListener = app._delegatedListener;
  if (oldListener) {
    app.removeEventListener('click', oldListener);
  }

  const delegatedHandler = function(e) {
    const target = e.target.closest('button');
    if (!target) return;

    // --- Handle by ID ---
    const id = target.id;
    switch (id) {
      case 'btnStartFollowup':
        e.preventDefault();
        S.assMode = 'post';
        S.assQ = 0;
        S.assAnswers = [];
        S.phase = 'followup';
        go();
        return;

      case 'btnBackToStudies':
      case 'btnDebriefBack':
        e.preventDefault();
        S.studyConfig = null;
        S.phase = 'studySelect';
        go();
        return;

      default:
        const action = target.dataset.action;
        if (action === 'back-to-studies') {
          e.preventDefault();
          S.studyConfig = null;
          S.phase = 'studySelect';
          go();
          return;
        }
    }
  };

  app.addEventListener('click', delegatedHandler);
  app._delegatedListener = delegatedHandler;

  // ---- Re‑attach top‑bar events ----
  el('btnTheme')?.addEventListener('click', () => { toggleTheme(); });
  el('btnAudio')?.addEventListener('click', () => { S.audioOn = !S.audioOn; go(); });
  el('btnOtherStudies')?.addEventListener('click', async () => {
    if (S.participantCode) {
      S.myEnrolments = await apiGetMyEnrolments(S.participantCode);
    }
    S.availableStudies = await apiFetchStudies();
    S.phase = 'studySelect';
    go();
  });
  el('btnLangStudy')?.addEventListener('click', () => {
    if (S.studyConfig?.bilingual) {
      S.studyLang = S.studyLang === 'en' ? 'ha' : 'en';
      saveLocalProgress();
      go();
    }
  });
  el('btnWithdraw')?.addEventListener('click', async () => {
    if (confirm('Withdraw? Progress lost.')) {
      await apiWithdraw(S.currentEnrolmentId);
      localStorage.removeItem(getStorageKey());
      S.phase = 'hero';
      go();
    }
  });
  el('btnLogoutPortal')?.addEventListener('click', () => {
    if (confirm('Logout?')) {
      S.phase = 'hero';
      S.participantCode = null;
      S.participantName = '';
      S.participantMatric = '';
      S.participantEmail = '';
      S.participantGender = '';
      S.participantInstitution = '';
      S.participantProgramme = '';
      S.currentEnrolmentId = null;
      S.currentStudyId = null;
      S.metrics = null;
      S.surveyAnswers = {};
      S.assAnswers = [];
      S.postSurveyAnswers = {};
      S.reflectionWeek = 0;
      go();
    }
  });

  // ---- Timeout timer ----
  const resetTimer = () => { if (S.currentEnrolmentId) resetTimeoutTimer(); };
  window.addEventListener('click', resetTimer);
  window.addEventListener('keydown', resetTimer);
  if (S.currentEnrolmentId && !['hero','studySelect','adminLogin'].includes(S.phase)) {
    resetTimeoutTimer();
  } else if (S.timeoutInterval) {
    clearInterval(S.timeoutInterval);
  }

  // ---- Bind phase‑specific events ----
  switch (S.phase) {
    case 'hero': bindHero(); break;
    case 'register': bindRegister(); break;
    case 'studySelect': bindStudySelect(); break;
    case 'resumeSelect': bindResumeSelect(); break;
    case 'orient': bindOrient(); break;
    case 'consent': bindConsent(); break;
    case 'reflection': bindReflectionDynamic(); break;
    case 'postsurvey': bindPostSurveyDynamic(); break;
    case 'tutor': bindTutorDynamic(); break;
    case 'survey': bindSurveyDynamic(); break;
    case 'pre': bindAssessmentDynamic('pre'); break;
    case 'study': bindStudyDynamic(); break;
    case 'faded': bindFadedDynamic(); break;
    case 'attempt': bindAttemptDynamic(); break;
    case 'reflect': bindReflectDynamic(); break;
    case 'code': bindCodeDynamic(); break;
    case 'review': bindReviewDynamic(); break;
    case 'post': bindAssessmentDynamic('post');
      el('btnBackToStudies')?.addEventListener('click', () => {
        S.phase = 'studySelect';
        go();
      });
      break;
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