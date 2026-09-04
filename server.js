// ══════════════════════════════════════════════════════════════
//  Research Portal API – Full Feature Implementation
//  Includes ElevenLabs Hausa Text-to-Speech
//  Serves frontend from /public folder (same origin)
// ══════════════════════════════════════════════════════════════

'use strict';
require('dotenv').config();

const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// ============================================================
// LLM Configuration (for Logic Tutor)
// ============================================================
const { Groq } = require('groq-sdk');
const { OpenAI } = require('openai');

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'groq';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MODELS = {
  groq: process.env.LLM_MODEL_GROQ || 'groq/compound',
  deepseek: process.env.LLM_MODEL_DEEPSEEK || 'deepseek-chat',
  openai: process.env.LLM_MODEL_OPENAI || 'gpt-4o-mini'
};

// ============================================================
// ElevenLabs Configuration
// ============================================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is missing from .env");
}

if (!ELEVENLABS_VOICE_ID) {
    throw new Error("ELEVENLABS_VOICE_ID is missing from .env");
}

const express = require('express');
const cors = require('cors');
const session = require('express-session');

const pg = require('pg');
const pgSession = require('connect-pg-simple')(session);

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const axios = require('axios');          // ElevenLabs API
const fs = require('fs');                // Cache audio files
const crypto = require('crypto');        // Generate cache filenames

const path = require('path');

const app = express();
app.set('trust proxy', 1);

// ============================================================
// ADDED: ElevenLabs audio cache folder
// ============================================================

const AUDIO_CACHE_DIR = path.join(
    __dirname,
    'public',
    'audio',
    'cache'
);

if (!fs.existsSync(AUDIO_CACHE_DIR)) {
    fs.mkdirSync(AUDIO_CACHE_DIR, {
        recursive: true
    });
}

// CORS (allow localhost and Render origin)
const allowedOrigins = [
  'http://localhost:3000',
  'https://research-portalc.onrender.com'
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));
// ADDED: Support form-encoded request bodies
app.use(express.urlencoded({
  extended: true,
  limit: '8mb'
}));

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL session store
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  family: 4
});
sessionPool.on('error', (err) => console.error('PG Pool Error:', err.code));

app.use(session({
  store: new pgSession({ pool: sessionPool, tableName: 'session', createTableIfMissing: true, ttl: 60 * 60 * 8 }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8,
    sameSite: 'lax'
  }
}));

// Supabase client
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.');
  process.exit(1);
}
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// ========== EMAIL using Resend ==========
let resendClient = null;
if (process.env.RESEND_API_KEY) {
  resendClient = new Resend(process.env.RESEND_API_KEY);
  console.log('Resend email client configured');
} else {
  console.warn('RESEND_API_KEY not set – email reminders and code recovery disabled');
}

async function sendEmail(to, subject, html) {
  if (!resendClient) return false;
  try {
    const { data, error } = await resendClient.emails.send({
      from: process.env.EMAIL_FROM || '"Research Portal" <noreply@example.com>',
      to: [to],
      subject,
      html
    });
    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    console.log(`Email sent to ${to} (ID: ${data?.id})`);
    return true;
  } catch (err) {
    console.error('Email error:', err);
    return false;
  }
}
// =========================================

// ============================================================
// TUTOR FUNCTIONS – LLM Logic for TunaniGini
// ============================================================

// ── LLM response generator ──
async function getLLMResponse(messages) {
  try {
    if (LLM_PROVIDER === 'groq') {
      const client = new Groq({ apiKey: GROQ_API_KEY });
      const response = await client.chat.completions.create({
        model: MODELS.groq,
        messages,
        temperature: 0.7,
        max_tokens: 500
      });
      return response.choices[0].message.content;
    } else if (LLM_PROVIDER === 'deepseek') {
      const client = new OpenAI({ apiKey: DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' });
      const response = await client.chat.completions.create({
        model: MODELS.deepseek,
        messages,
        temperature: 0.7,
        max_tokens: 500
      });
      return response.choices[0].message.content;
    } else { // openai
      const client = new OpenAI({ apiKey: OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: MODELS.openai,
        messages,
        temperature: 0.7,
        max_tokens: 500
      });
      return response.choices[0].message.content;
    }
  } catch (err) {
    console.error('LLM error:', err);
    throw new Error(`LLM request failed: ${err.message}`);
  }
}

// ── Topic detection ──
function inferTopic(userMsg) {
  const userLower = userMsg.toLowerCase();
  const topics = {
    condition: ['if', 'else', 'condition', 'sharadi', 'idan'],
    loop: ['loop', 'for', 'while', 'madauki', 'maimaita'],
    sequence: ['sequence', 'order', 'jeri', 'mataki'],
    variable: ['variable', 'int', 'string', 'canji'],
    function: ['function', 'def', 'aiki'],
    array: ['array', 'list', 'jeri bayanai']
  };
  let detected = 'general';
  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(kw => userLower.includes(kw))) {
      detected = topic;
      break;
    }
  }
  return detected;
}

// ── Struggle detection ──
function detectStruggle(assistantReply) {
  const strugglePhrases = ['try again', 'mistake', 'error', "let's review", 'kuskure', 'sake dubawa', 'ba daidai ba'];
  const lower = assistantReply.toLowerCase();
  return strugglePhrases.some(phrase => lower.includes(phrase));
}

// ── System prompts ──
function getSystemPrompt(lang) {
  if (lang === 'en') {
    return `You are a patient bilingual (English-Hausa) logic tutor for novice Nigerian higher education computing students.

FORMATTING RULES (MANDATORY - FOLLOW STRICTLY):
- When listing algorithm steps, ALWAYS put EACH step on a NEW LINE using the \n character.
- ALWAYS wrap step numbers in **bold** using double asterisks. Example: **Step 1:** not Step 1:
- ALWAYS wrap variable names in **bold**. Example: store in **L** not store in L.
- NEVER write steps as a single paragraph or separated only by commas.
- Use this exact format for steps:
  **Step 1:** Do this and store in **variable**
  **Step 2:** Do that
  **Step 3:** Do something else
- Separate each step with a line break (\n).
- Use a blank line between your introduction and the first step.

TUTOR RULES:
1. NEVER give full code. Break problems into small steps.
2. Track the student's current step and past mistakes.
3. If student asks for full code twice: "Let's review the logic you already have. What is the first condition?"
4. Use local examples: JAMB score, CGPA, BVN age verification, grade checking.
5. If student mixes Hausa/English, gently correct.
6. If student is stuck (same error 3 times), offer a simpler parallel example.
7. If student replies only in Hausa for 2 turns, switch to full Hausa but keep programming keywords in English with Hausa translation (e.g., 'loop (madauki)').
8. Keep the overall response under 5 sentences total (excluding the step list).
9. Always end with an encouraging question or next small step.
10. If the student sends a long message, encourage them to break it down into smaller steps and send one at a time.
`;
  } else {
    return `Kai mai haƙuri ne mai koyar da dabaru da harsuna biyu (Turanci-Hausa) ga ɗaliban kwamfuta na manyan makarantu a Najeriya.

DOKOKIN TSARA (MANDATORY - KA BISU SOSAI):
- Idan kana jera matakai, ka sanya KOWANE mataki a SABON LAYI ta amfani da \n.
- Koyaushe ka sanya lambobin matakai a **bold** ta amfani da tauraro biyu. Misali: **Mataki 1:** ba Mataki 1: ba.
- Koyaushe ka sanya sunayen masu canji (variables) a **bold**. Misali: ajiye a **L** ba ajiye a L ba.
- KADA ka rubuta matakai a layi ɗaya ko kuma da waƙafi (comma) tsakaninsu.
- Ka yi amfani da wannan tsari:
  **Mataki 1:** Yi wannan ka ajiye a **mai_canji**
  **Mataki 2:** Yi wancan
  **Mataki 3:** Yi wani abu
- Ka raba kowane mataki da sabon layi (\n).
- Ka bar layi ɗaya tsakanin gabatarwa da mataki na farko.

DOKOKIN KOYARWA:
1. KADA KA ba da cikakken code. Raba matsalar zuwa ƙananan matakai.
2. Ka bi matakin da ɗalibi yake ciki da kurakuran da ya riga ya yi.
3. Idan ɗalibi ya nemi cikakken code sau biyu: "Bari mu sake duba dabaru da ka riga ka samu. Menene sharudi na farko?"
4. Ka yi amfani da misalai na gida: JAMB, CGPA, BVN, duba maki.
5. Idan ɗalibi ya haɗa Hausa da Turanci ba daidai ba, ka gyara a hankali.
6. Idan ɗalibi ya makale (kuskure iri ɗaya sau 3), ka ba shi misali mafi sauƙi.
7. Idan ɗalibi ya amsa da Hausa kawai sau 2, ka canza zuwa Hausa gaba ɗaya amma ka bar kalmomin shirye-shirye cikin Turanci tare da fassarar Hausa (misali 'loop (madauki)').
8. Ka rage jimlar amsa (ba tare da jerin matakai ba) zuwa jumla 5 ko ƙasa.
9. Koyaushe ka ƙare da tambaya mai ƙarfafawa ko mataki na gaba kaɗan.
10. Idan ɗalibi ya aika saƙo mai tsawo, ka ƙarfafa su su raba shi zuwa ƙananan matakai su aika ɗaya bayan ɗaya.
`;
  }
}

// ============================================================
// Helper functions (existing)
// ============================================================

function generateParticipantCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'AL-' + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function assignRandomisationGroup() {
  return Math.random() < 0.5 ? 'treatment' : 'control';
}
function computeMissingDataFlags(progress, studyConfig) {
  const flags = {
    incomplete_survey: false,
    attention_failed: false,
    too_fast: false,
    missing_puzzles: false,
    survey_missing_fields: []
  };
  const survey = progress.surveyAnswers || {};
  const totalSurvey = (studyConfig?.surveyFields || []).length;
  if (totalSurvey > 0 && Object.keys(survey).length < totalSurvey) {
    flags.incomplete_survey = true;
    flags.survey_missing_fields = Object.keys(studyConfig.surveyFields).filter(f => !survey[f.id]);
  }
  if (progress.preAttentionPassed === false || progress.postAttentionPassed === false) flags.attention_failed = true;
  const durationMs = progress.durationMs || (progress.completedAt ? (new Date(progress.completedAt) - new Date(progress.startedAt)) : 0);
  if (durationMs < 15 * 60 * 1000) flags.too_fast = true;
  const puzzles = progress.puzzles || {};
  const totalPuzzles = (studyConfig?.puzzles || []).length;
  const completedPuzzles = Object.values(puzzles).filter(p => p.completed).length;
  if (completedPuzzles < totalPuzzles) flags.missing_puzzles = true;
  return flags;
}

async function generateUniqueParticipantCode() {
  let code;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 20;

  while (exists && attempts < maxAttempts) {
    code = generateParticipantCode();
    const { data, error } = await sb
      .from('participants')
      .select('participant_code')
      .eq('participant_code', code)
      .maybeSingle();

    if (error) {
      console.error('Error checking participant code uniqueness:', error);
      const fallbackCode = `AL-${Date.now().toString(36).toUpperCase()}`;
      return fallbackCode;
    }

    if (!data) {
      exists = false;
    }
    attempts++;
  }

  if (attempts >= maxAttempts) {
    return `AL-${Date.now().toString(36).toUpperCase()}`;
  }

  return code;
}

function formatDateForNigeria(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    return date.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return dateString;
  }
}

async function logAdminAction(req, action, targetType, targetId, details) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  await sb.from('admin_audit_log').insert({
    admin_pin: req.session?.admin ? 'authenticated' : 'unknown',
    action,
    target_type: targetType,
    target_id: String(targetId),
    details: details || {},
    ip_address: ip
  });
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
function isAdminLoggedIn(req) {
  return req.session && req.session.admin === true;
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ============================================================
// TUTOR CHAT ENDPOINT
// ============================================================
app.post('/api/tutor/chat', async (req, res) => {
  const { message, lang = 'ha', rating, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const systemPrompt = getSystemPrompt(lang);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: message }
  ];

  try {
    const reply = await getLLMResponse(messages);
    const topic = inferTopic(message);
    const struggle = detectStruggle(reply);
    res.json({ reply, topic, struggle });
  } catch (err) {
    console.error('Tutor chat error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// ============================================================
// ADMIN AUTHENTICATION (existing)
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.admin = true;
    req.session.save();
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid password' });
});
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});
app.get('/api/admin/check', (req, res) => {
  res.json({ loggedIn: isAdminLoggedIn(req) });
});
function requireAdmin(req, res, next) {
  if (!isAdminLoggedIn(req)) return res.status(401).json({ error: 'Unauthorised – please log in' });
  next();
}


// Participant check and code recovery endpoints
app.get('/api/participant/check', async (req, res) => {
  const { matric } = req.query;
  if (!matric) return res.status(400).json({ error: 'matric required' });
  const { data, error } = await sb
    .from('participants')
    .select('participant_code, email')
    .ilike('matric', matric.trim().toUpperCase())
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (data) {
    return res.json({ exists: true, participantCode: data.participant_code, email: data.email });
  } else {
    return res.json({ exists: false });
  }
});

app.post('/api/participant/send-code', async (req, res) => {
  const { matric } = req.body;
  if (!matric) return res.status(400).json({ error: 'matric required' });
  const { data, error } = await sb
    .from('participants')
    .select('participant_code, email, name')
    .ilike('matric', matric.trim().toUpperCase())
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Participant not found' });
  if (!data.email) return res.status(400).json({ error: 'No email address on file' });
  const subject = 'Your Research Portal Participant Code';
  const html = `
    <h2>Participant Code Recovery</h2>
    <p>Dear ${data.name || 'Participant'},</p>
    <p>You requested your participant code for the Research Portal. Your code is:</p>
    <p style="font-size:24px; font-weight:bold; background:#f0f0f0; padding:12px; text-align:center;">${data.participant_code}</p>
    <p>You can use this code to resume your studies on the portal.</p>
    <hr>
    <small>If you did not request this, please ignore this email.</small>
  `;
  const sent = await sendEmail(data.email, subject, html);
  if (sent) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// PUBLIC ENDPOINTS
app.get('/api/studies', async (req, res) => {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('studies')
    .select('id, study_key, title_en, title_ha, description_en, description_ha, status, capacity')
    .eq('status', 'open')
    .or(`end_date.is.null,end_date.gt.${now}`)
    .order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/studies/:id/config', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await sb
    .from('studies')
    .select('config, instruments, delayed_post_test_weeks')
    .eq('id', id)
    .single();
  if (error) return res.status(404).json({ error: 'Study not found' });
  res.json({ ...data.config, instruments: data.instruments, delayed_post_test_weeks: data.delayed_post_test_weeks });
});

// MODIFIED: /api/enrol – studyId optional
app.post('/api/enrol', async (req, res) => {
  const { name, matric, lang, studyId, demographics, consentGeneral, academicSession, classSection, lecturerId, email, gender } = req.body;

  if (!name || !matric) {
    return res.status(400).json({ error: 'name and matric are required' });
  }

  let participant;
  const { data: existing } = await sb
    .from('participants')
    .select('*')
    .ilike('matric', matric.trim().toUpperCase())
    .maybeSingle();

  if (existing) {
    participant = existing;
    const updates = {};
    if (demographics) updates.demographics = demographics;
    if (consentGeneral !== undefined) updates.consent_general = consentGeneral;
    if (lang) updates.lang = lang;
    if (academicSession) updates.academic_session = academicSession;
    if (classSection) updates.class_section = classSection;
    if (lecturerId) updates.lecturer_id = lecturerId;
    if (email) updates.email = email;
    if (gender) updates.gender = gender;
    if (Object.keys(updates).length) await sb.from('participants').update(updates).eq('id', participant.id);
  } else {
  const code = await generateUniqueParticipantCode();
  const { data: newPart, error } = await sb.from('participants').insert({
    participant_code: code,
    name: name.trim(),
    matric: matric.trim().toUpperCase(),
    lang: lang || 'en',
    demographics: demographics || {},
    consent_general: consentGeneral || false,
    academic_session: academicSession,
    class_section: classSection,
    lecturer_id: lecturerId,
    email: email || null,
    gender: gender || null
  }).select().single();
  if (error) {
    // Check if it's a duplicate code error (just in case)
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({ error: 'System error: duplicate participant code. Please try again.' });
    }
    return res.status(500).json({ error: error.message });
  }
  participant = newPart;
}

  // If no studyId, just return participant info
  if (!studyId) {
    return res.json({
      participantCode: participant.participant_code,
      participantId: participant.id,
    });
  }

  // ---- Study enrolment logic ----
  const { data: study } = await sb
    .from('studies')
    .select('status, capacity, end_date, delayed_post_test_weeks, config')
    .eq('id', studyId)
    .single();
  if (!study) return res.status(404).json({ error: 'Study not found' });
  if (study.status !== 'open') return res.status(403).json({ error: 'Study is not open for enrolment' });
  if (study.end_date && new Date(study.end_date) < new Date()) {
    return res.status(403).json({ error: 'Study enrolment period has expired' });
  }

  const { count: enrolled } = await sb
    .from('enrolments')
    .select('*', { count: 'exact', head: true })
    .eq('study_id', studyId);
  if (enrolled >= study.capacity) return res.status(403).json({ error: 'Study has reached capacity' });

  let enrolment;
  const { data: existingEnrol } = await sb
    .from('enrolments')
    .select('*')
    .eq('participant_id', participant.id)
    .eq('study_id', studyId)
    .maybeSingle();

  if (existingEnrol) {
    enrolment = existingEnrol;
    if (enrolment.status === 'withdrawn') {
      console.log(`Deleting withdrawn enrolment ${enrolment.id} for participant ${participant.id}`);
      const { error: delErr } = await sb
        .from('enrolments')
        .delete()
        .eq('id', enrolment.id);
      if (delErr) {
        console.error('Delete error:', delErr);
        return res.status(500).json({ error: 'Failed to delete withdrawn enrolment' });
      }
      const randomGroup = assignRandomisationGroup();
      const instrumentVersion = study.config?.version || '1.0.0';
      const { data: newEnrol, error } = await sb
        .from('enrolments')
        .insert({
          participant_id: participant.id,
          study_id: studyId,
          status: 'enrolled',
          randomisation_group: randomGroup,
          instrument_version: instrumentVersion,
          data: {}
        })
        .select()
        .single();
      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ error: 'Failed to create new enrolment' });
      }
      enrolment = newEnrol;
      res.json({
        participantCode: participant.participant_code,
        enrolmentId: enrolment.id,
        studyId,
        isNew: true,
        randomisationGroup: enrolment.randomisation_group,
        participantId: participant.id
      });
      return;
    }
    if (enrolment.status === 'completed') {
      return res.status(403).json({ error: 'You have already completed this study' });
    }
  } else {
    const randomGroup = assignRandomisationGroup();
    const instrumentVersion = study.config?.version || '1.0.0';
    const { data: newEnrol, error } = await sb
      .from('enrolments')
      .insert({
        participant_id: participant.id,
        study_id: studyId,
        status: 'enrolled',
        randomisation_group: randomGroup,
        instrument_version: instrumentVersion,
        data: {}
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    enrolment = newEnrol;
  }

  res.json({
    participantCode: participant.participant_code,
    enrolmentId: enrolment.id,
    studyId,
    isNew: !existingEnrol,
    randomisationGroup: enrolment.randomisation_group,
    participantId: participant.id
  });
});

app.get('/api/enrolments/me', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'participant_code required' });
  const { data: participant, error: pErr } = await sb
    .from('participants')
    .select('id, name, email, gender, participant_code, matric')
    .eq('participant_code', code)
    .single();
  if (pErr || !participant) return res.status(404).json({ error: 'Participant not found' });
  const { data, error } = await sb
    .from('enrolments')
    .select(`*, study:study_id (id, study_key, title_en, title_ha, status)`)
    .eq('participant_id', participant.id);
  if (error) return res.status(500).json({ error: error.message });
  const result = data.map(enrol => ({
    ...enrol,
    participant: {
      name: participant.name,
      email: participant.email,
      gender: participant.gender,
      participant_code: participant.participant_code,
      matric: participant.matric
    }
  }));
  res.json(result);
});

app.get('/api/progress/:enrolmentId', async (req, res) => {
  const { enrolmentId } = req.params;
  const { data, error } = await sb.from('enrolments').select('data, status, study_id').eq('id', enrolmentId).single();
  if (error) return res.status(404).json({ error: 'Enrolment not found' });
  res.json({ progress: data.data || {}, status: data.status, studyId: data.study_id });
});

app.post('/api/progress/:enrolmentId', async (req, res) => {
  const { enrolmentId } = req.params;
  const progressData = req.body;
  const { data: enrolment, error } = await sb.from('enrolments').select('*, study:study_id(*)').eq('id', enrolmentId).single();
  if (error) return res.status(404).json({ error: 'Enrolment not found' });
  const study = enrolment.study;
  
  // Allow completion updates even when study is closed; block all other updates if not open
  if (study.status !== 'open' && !progressData.completed && enrolment.status !== 'withdrawn') {
    return res.status(403).json({ error: 'Study is closed – no further progress accepted' });
  }
  if (enrolment.status === 'withdrawn') return res.status(403).json({ error: 'Participant has withdrawn' });

  let newStatus = enrolment.status;
  if (progressData.completed) {
    newStatus = 'completed';
    const flags = computeMissingDataFlags(progressData, study.config);
    progressData.missingDataFlags = flags;
    progressData.completedAt = new Date().toISOString();
    progressData.durationMs = (new Date() - new Date(enrolment.started_at));
  } else if (newStatus === 'enrolled' && Object.keys(progressData).length > 2) {
    newStatus = 'in_progress';
  }

  const updates = { data: progressData, last_active: new Date(), status: newStatus };
  if (progressData.completedAt) { updates.completed_at = new Date(progressData.completedAt); updates.duration_ms = progressData.durationMs; }
  if (progressData.missingDataFlags) updates.missing_data_flags = progressData.missingDataFlags;
  const { error: updateErr } = await sb.from('enrolments').update(updates).eq('id', enrolmentId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });
  res.json({ saved: true });
});

app.post('/api/enrolment/:enrolmentId/withdraw', async (req, res) => {
  const { enrolmentId } = req.params;
  console.log('Attempting to withdraw enrolment:', enrolmentId);

  const { data: enrolment, error } = await sb.from('enrolments').select('*').eq('id', enrolmentId).single();
  if (error) {
    console.error('Enrolment not found:', error);
    return res.status(404).json({ error: 'Enrolment not found' });
  }

  if (enrolment.status === 'completed' || enrolment.status === 'withdrawn') {
    console.log('Enrolment already completed or withdrawn:', enrolment.status);
    return res.status(400).json({ error: 'Cannot withdraw completed or already withdrawn enrolment' });
  }

  const { error: updateErr } = await sb.from('enrolments')
    .update({ status: 'withdrawn', withdrawn_at: new Date(), data: {} })
    .eq('id', enrolmentId);

  if (updateErr) {
    console.error('Withdrawal update failed:', updateErr);
    return res.status(500).json({ error: 'Withdrawal failed' });
  }

  console.log('Withdrawal successful for enrolment:', enrolmentId);
  res.json({ success: true, enrolmentId });
});

app.get('/api/study/:studyId/average_gain', async (req, res) => {
  const { studyId } = req.params;
  const { data, error } = await sb.from('enrolments').select('data').eq('study_id', studyId).eq('status', 'completed');
  if (error) return res.status(500).json({ error });
  let gains = [];
  data.forEach(e => { const pre = e.data?.preScore, post = e.data?.postScore; if (typeof pre === 'number' && typeof post === 'number') gains.push(post - pre); });
  const avg = gains.length ? gains.reduce((a,b)=>a+b,0)/gains.length : 0;
  res.json({ averageGain: avg, participantCount: gains.length });
});

// ADMIN ENDPOINTS
app.get('/api/admin/studies', requireAdmin, async (req, res) => {
  const { data, error } = await sb.from('studies').select('*').order('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/admin/control', requireAdmin, async (req, res) => {
  const { study_id, status, capacity } = req.body;
  if (!study_id) return res.status(400).json({ error: 'study_id required' });
  const updates = {};
  if (status) updates.status = status;
  if (capacity) updates.capacity = capacity;
  const { error } = await sb.from('studies').update(updates).eq('id', study_id);
  if (error) return res.status(500).json({ error: error.message });
  await logAdminAction(req, 'portal_control', 'study', study_id, { status, capacity });
  res.json({ updated: true });
});

app.get('/api/admin/status', requireAdmin, async (req, res) => {
  const studyId = req.query.study;
  if (!studyId) return res.status(400).json({ error: 'study query param required' });
  const { data: study } = await sb.from('studies').select('status, capacity, end_date').eq('id', studyId).single();
  if (!study) return res.status(404).json({ error: 'Study not found' });
  const { count: enrolled } = await sb.from('enrolments').select('*', { count: 'exact', head: true }).eq('study_id', studyId);
  const { count: completed } = await sb.from('enrolments').select('*', { count: 'exact', head: true }).eq('study_id', studyId).eq('status', 'completed');
  const { count: inProgress } = await sb.from('enrolments').select('*', { count: 'exact', head: true }).eq('study_id', studyId).eq('status', 'in_progress');
  res.json({ status: study.status, capacity: study.capacity, end_date: study.end_date, enrolled, completed, inProgress });
});

app.get('/api/admin/export/study/:studyId', requireAdmin, async (req, res) => {
  const { studyId } = req.params;
  const { data, error } = await sb
    .from('enrolments')
    .select(`*, participant:participant_id (name, matric, participant_code, demographics, lang, academic_session, class_section, lecturer_id, email, gender)`)
    .eq('study_id', studyId);
  if (error) return res.status(500).json({ error: error.message });

  const flatten = (obj, prefix = '') => {
    let result = {};
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}_${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(result, flatten(obj[key], newKey));
        } else {
          result[newKey] = obj[key];
        }
      }
    }
    return result;
  };

  const rows = data.map(enrol => {
    const flat = flatten({ enrolment: enrol, participant: enrol.participant });
    // Format any field that looks like an ISO date string
    for (const key of Object.keys(flat)) {
      const val = flat[key];
      if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        flat[key] = formatDateForNigeria(val);
      }
    }
    return flat;
  });

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const csvRows = [
    headers.join(','),
    ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="study_${studyId}_export.csv"`);
  res.send(csvRows.join('\n'));
});

app.post('/api/admin/send-reminders', requireAdmin, async (req, res) => {
  const { studyId, daysInactive = 3 } = req.body;
  if (!studyId) return res.status(400).json({ error: 'studyId required' });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysInactive);
  const { data: inactive, error } = await sb
    .from('enrolments')
    .select('id, participant:participant_id(name, email, participant_code), last_active, reminder_count, study:study_id(title_en)')
    .eq('study_id', studyId)
    .in('status', ['enrolled', 'in_progress'])
    .lt('last_active', cutoff.toISOString())
    .lt('reminder_count', 3);
  if (error) return res.status(500).json({ error: error.message });
  const results = [];
  for (const e of inactive) {
    const email = e.participant?.email;
    if (!email) { results.push({ id: e.id, status: 'skipped', reason: 'no email' }); continue; }
    const studyTitle = e.study?.title_en || 'the study';
    const participantName = e.participant?.name || 'Participant';
    const resumeLink = `${process.env.FRONTEND_URL || 'https://research-portalc.onrender.com'}?resume=${e.participant.participant_code}`;
    const subject = `Reminder: Complete "${studyTitle}" – Research Portal`;
    const html = `<h2>Research Participation Reminder</h2><p>Dear ${participantName},</p><p>You started the study <strong>${studyTitle}</strong> but haven't completed it yet. Your progress has been saved.</p><p><strong>Participant code:</strong> ${e.participant.participant_code}</p><p><a href="${resumeLink}">Click here to resume</a> or visit the portal.</p><p>If you no longer wish to participate, you may withdraw via the portal.</p><hr><small>Ethics ref: REC/NSPoly/CS/2026/___</small>`;
    const sent = await sendEmail(email, subject, html);
    if (sent) {
      await sb.from('enrolments').update({ reminder_count: (e.reminder_count || 0) + 1, last_reminder_sent: new Date() }).eq('id', e.id);
      results.push({ id: e.id, status: 'sent', email });
    } else {
      results.push({ id: e.id, status: 'failed', email });
    }
  }
  await logAdminAction(req, 'send_reminders', 'study', studyId, { daysInactive, count: inactive.length, results });
  res.json({ total: inactive.length, results });
});
// ============================================================
// ElevenLabs Hausa Text-to-Speech API
// Cached version (recommended)
// ============================================================

app.post('/api/speak', async (req, res) => {

    try {

        // -------------------------------
        // Validate input
        // -------------------------------

        const text = (req.body?.text || '').trim();

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'No text supplied.'
            });
        }

        // -------------------------------
        // Configuration
        // -------------------------------

        const MODEL_ID = 'eleven_multilingual_v2';

        const VOICE_SETTINGS = {
            stability: 0.50,
            similarity_boost: 0.75
        };

        // -------------------------------
        // Create cache filename
        // Cache changes automatically if
        // voice or model changes
        // -------------------------------

        const hash = crypto
            .createHash('sha256')
            .update(
                ELEVENLABS_VOICE_ID +
                "|" +
                MODEL_ID +
                "|" +
                JSON.stringify(VOICE_SETTINGS) +
                "|" +
                text
            )
            .digest('hex');

        const cacheFile = path.join(
            AUDIO_CACHE_DIR,
            `${hash}.mp3`
        );

        // -------------------------------
        // Serve cached audio
        // -------------------------------

        if (fs.existsSync(cacheFile)) {

            console.log(`[CACHE] ${text}`);

            return res.sendFile(cacheFile);

        }

        console.log(`[TTS] ${text}`);

        // -------------------------------
        // Generate speech
        // -------------------------------

        const response = await axios({

            method: 'POST',

            url:
                `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,

            responseType: 'arraybuffer',

            headers: {

                'Accept': 'audio/mpeg',

                'Content-Type': 'application/json',

                'xi-api-key': ELEVENLABS_API_KEY

            },

            data: {

                text,

                model_id: MODEL_ID,

                voice_settings: VOICE_SETTINGS

            }

        });

        // -------------------------------
        // Save to cache
        // -------------------------------

        fs.writeFileSync(
            cacheFile,
            response.data
        );

        console.log(
            `[SAVED] ${path.basename(cacheFile)} (${response.data.length} bytes)`
        );

        // -------------------------------
        // Return audio
        // -------------------------------

        res.setHeader('Content-Type', 'audio/mpeg');

        res.setHeader(
            'Cache-Control',
            'public, max-age=31536000'
        );

        return res.send(response.data);

    }

    catch (err) {

        console.log('\n====================================');
        console.log('ELEVENLABS ERROR');
        console.log('====================================');

        console.log('Voice ID:', ELEVENLABS_VOICE_ID);

        console.log('Status:', err.response?.status);

        console.log('Message:', err.message);

        if (Buffer.isBuffer(err.response?.data)) {

            console.log(err.response.data.toString());

        } else {

            console.log(err.response?.data);

        }

        console.log('====================================\n');

        return res.status(500).json({

            success: false,

            error: 'Speech generation failed.',

            detail: Buffer.isBuffer(err.response?.data)
                ? err.response.data.toString()
                : err.response?.data

        });

    }

});


app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Research Portal API running on http://localhost:${PORT}`));