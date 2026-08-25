// scripts/send-reflection-reminders.js
// Daily cron job to send email reminders for pending reflections.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// ── Initialise Supabase client ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Initialise Resend ──
const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || '"Research Portal" <noreply@example.com>';

// ── Helper: Send email ──
async function sendEmail(to, subject, html) {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
    });
    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    console.log(`✅ Email sent to ${to} (ID: ${data?.id})`);
    return true;
  } catch (err) {
    console.error('Email error:', err);
    return false;
  }
}

// ── Check if a reflection is considered "submitted" ──
function isReflectionSubmitted(ref) {
  if (!ref || typeof ref !== 'object') return false;
  if (ref._submittedAt !== undefined) return true;
  return Object.keys(ref).some(k => k !== '_submittedAt' && ref[k] !== undefined && ref[k] !== '');
}

// ── Backfill missing _submittedAt for legacy reflections ──
function backfillSubmittedAt(progress, config) {
  const reflections = progress.metrics?.reflections;
  if (!reflections || !Array.isArray(reflections)) return;

  const startDate = progress.metrics?.studyStartDate
    ? new Date(progress.metrics.studyStartDate)
    : new Date();
  const reflectionDays = config.reflectionDays || [0, 7, 7, 7];

  reflections.forEach((ref, idx) => {
    if (ref && typeof ref === 'object' && ref._submittedAt === undefined) {
      const hasAnswers = Object.keys(ref).some(k => k !== '_submittedAt' && ref[k] !== undefined && ref[k] !== '');
      if (hasAnswers) {
        const estimatedDate = new Date(startDate);
        let cumulative = 0;
        for (let i = 0; i <= idx; i++) {
          cumulative += reflectionDays[i] || 7;
        }
        estimatedDate.setDate(estimatedDate.getDate() + cumulative);
        reflections[idx]._submittedAt = estimatedDate.getTime();
      }
    }
  });
}

// ── Check if a reflection is available (hybrid logic) ──
function isReflectionAvailable(progress, config, weekIdx) {
  if (weekIdx === 0) return true;

  const startDate = progress.metrics?.studyStartDate
    ? new Date(progress.metrics.studyStartDate)
    : new Date();
  const daysCumulative = config.reflectionDays || [0, 7, 7, 7];
  let cumulative = 0;
  for (let i = 0; i <= weekIdx; i++) {
    cumulative += daysCumulative[i] || 0;
  }
  const timeLocked = new Date(startDate);
  timeLocked.setDate(timeLocked.getDate() + cumulative);

  const prev = progress.metrics?.reflections?.[weekIdx - 1]?._submittedAt;
  let submissionLocked = null;
  if (prev) {
    const cooldown = config.reflectionCooldownDays ?? 7;
    submissionLocked = new Date(prev);
    submissionLocked.setDate(submissionLocked.getDate() + cooldown);
  }

  const now = new Date();
  if (submissionLocked && submissionLocked > timeLocked) {
    return now >= submissionLocked;
  }
  return now >= timeLocked;
}

// ── Main ──
async function main() {
  console.log('🔍 Checking for pending reflection reminders...');

  // 1. Fetch all studies with reflections
  const { data: studies, error: studiesErr } = await supabase
    .from('studies')
    .select('id, study_key, title_en, config')
    .not('config->reflections', 'is', null);

  if (studiesErr) {
    console.error('Failed to fetch studies:', studiesErr);
    process.exit(1);
  }
  console.log(`📚 Found ${studies.length} studies with reflections.`);

  const studyIds = studies.map(s => s.id);

  // 2. Fetch active enrolments
  const { data: enrolments, error: enrolErr } = await supabase
    .from('enrolments')
    .select(`
      id,
      participant_id,
      data,
      study_id,
      reflection_reminder_sent,
      participant:participant_id ( name, email, participant_code )
    `)
    .in('study_id', studyIds)
    .in('status', ['enrolled', 'in_progress']);

  if (enrolErr) {
    console.error('Failed to fetch enrolments:', enrolErr);
    process.exit(1);
  }
  console.log(`👥 Found ${enrolments.length} active enrolments.`);

  let remindersSent = 0;

  for (const enrol of enrolments) {
    const config = studies.find(s => s.id === enrol.study_id)?.config;
    if (!config) continue;

    const progress = enrol.data || {};
    const sent = enrol.reflection_reminder_sent || {};

    // ── CRITICAL: Skip if pre‑survey is not yet completed ──
    if (!progress.completedPhases?.survey) {
      console.log(`⏭️ Skipping participant ${enrol.participant_id} – pre‑survey not completed.`);
      continue;
    }

    // ── Backfill legacy reflections ──
    backfillSubmittedAt(progress, config);

    const reflections = progress.metrics?.reflections || [];

    // ── Find the first incomplete reflection ──
    let pendingWeek = -1;
    for (let i = 0; i < config.reflections.length; i++) {
      const ref = reflections[i];
      const isSubmitted = isReflectionSubmitted(ref);
      if (!isSubmitted) {
        pendingWeek = i;
        break;
      }
    }
    if (pendingWeek === -1) continue; // all done

    // ── Check availability ──
    if (!isReflectionAvailable(progress, config, pendingWeek)) continue;

    // ── Check if reminder already sent ──
    if (sent[pendingWeek]) continue;

    const email = enrol.participant?.email;
    if (!email) {
      console.log(`⚠️ No email for participant ${enrol.participant_id}`);
      continue;
    }

    const name = enrol.participant?.name || 'Participant';
    const code = enrol.participant?.participant_code || 'N/A';
    const studyTitle = config.title_en || 'the study';
    const weekNum = pendingWeek + 1;
    const resumeLink = `https://research-portalc.onrender.com?resume=${code}`;

    const subject = `Reminder: Reflection ${weekNum} for "${studyTitle}"`;
    const html = `
      <h2>Research Reflection Reminder</h2>
      <p>Dear ${name},</p>
      <p>This is a reminder that <strong>Reflection ${weekNum}</strong> for the study <strong>"${studyTitle}"</strong> is now available.</p>
      <p>Please log in to the Research Portal and complete your reflection.</p>
      <p><a href="${resumeLink}">Click here to resume your study</a></p>
      <p><strong>Participant code:</strong> ${code}</p>
      <hr>
      <small>If you have already completed this reflection, please ignore this email.</small>
    `;

    const sentOk = await sendEmail(email, subject, html);
    if (sentOk) {
      sent[pendingWeek] = true;
      await supabase
        .from('enrolments')
        .update({ reflection_reminder_sent: sent })
        .eq('id', enrol.id);
      remindersSent++;
      console.log(`✅ Reminder sent to ${email} for week ${pendingWeek+1}`);
    }
  }

  console.log(`📧 Sent ${remindersSent} reminder(s).`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});