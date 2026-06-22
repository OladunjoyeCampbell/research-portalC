// ══════════════════════════════════════════════════════════════
//  Research Portal API – Full Feature Implementation (Improved)
//  Serves frontend from /public folder (same origin)
// ══════════════════════════════════════════════════════════════

'use strict';
require('dotenv').config();

const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pg = require('pg');
const pgSession = require('connect-pg-simple')(session);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');  // <-- NEW
const path = require('path');

const app = express();
app.set('trust proxy', 1);

// CORS (allow localhost and Render origin)
const allowedOrigins = [
  'http://localhost:3000',
  'https://research-portalc.onrender.com' // replace with your actual Render URL
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));

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

// Helper functions
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

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ADMIN AUTHENTICATION
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
    const code = generateParticipantCode();
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
    if (error) return res.status(500).json({ error: error.message });
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
  if (study.status !== 'open' && enrolment.status !== 'withdrawn') return res.status(403).json({ error: 'Study is closed – no further progress accepted' });
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
  const rows = data.map(enrol => flatten({ enrolment: enrol, participant: enrol.participant }));
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const csvRows = [ headers.join(','), ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')) ];
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

// CATCH-ALL: serve index.html for client-side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Research Portal API running on http://localhost:${PORT}`));