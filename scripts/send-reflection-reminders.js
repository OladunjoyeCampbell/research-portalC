// scripts/send-reflection-reminders.js
// Daily cron job to send email reminders for pending reflections.

require('dotenv').config();
const ws = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// ── Initialise Supabase client ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    realtime: { transport: ws },
  }
);

// ── Initialise Resend ──
const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || '"Research Portal" <noreply@example.com>';