// scripts/create-co-researcher.js
// Usage: node scripts/create-co-researcher.js \
//   <email> <name> <institution> <studyKey1,studyKey2> <password> [can_export:true|false]

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const [,, email, name, institution, studyKeys, password, canExportArg] = process.argv;

if (!email || !name || !institution || !studyKeys || !password) {
  console.error('Usage: node scripts/create-co-researcher.js \\');
  console.error('  <email> <name> <institution> <studyKey1,studyKey2> <password> [can_export:true|false]');
  process.exit(1);
}

const can_export = (canExportArg || '').toLowerCase() === 'true';

(async () => {
  // 1. Resolve study keys -> ids
  const keys = studyKeys.split(',').map(k => k.trim()).filter(Boolean);
  const { data: studies, error: sErr } = await sb
    .from('studies')
    .select('id, study_key')
    .in('study_key', keys);

  if (sErr) { console.error('Failed to look up studies:', sErr.message); process.exit(1); }

  const foundKeys = (studies || []).map(s => s.study_key);
  const missing = keys.filter(k => !foundKeys.includes(k));
  if (missing.length) {
    console.error('❌ One or more study keys not found:', missing.join(', '));
    console.error('   Available keys:', foundKeys.join(', ') || '(none)');
    process.exit(1);
  }

  const scoped_ids = studies.map(s => s.id);

  // 2. Refuse to overwrite an existing account silently
  const { data: existing } = await sb
    .from('admin_users')
    .select('id, role')
    .ilike('email', email.trim())
    .maybeSingle();

  if (existing) {
    console.error(`❌ An account with email ${email} already exists (id ${existing.id}, role ${existing.role}).`);
    console.error('   Use a different email, or update the existing account via SQL:');
    console.error(`   UPDATE admin_users SET scoped_studies = ARRAY[${scoped_ids.join(',')}] WHERE id = ${existing.id};`);
    process.exit(1);
  }

  // 3. Hash password and insert
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');

  const { data, error } = await sb
    .from('admin_users')
    .insert({
      email: email.trim(),
      name,
      institution,
      role: 'co_researcher',
      scoped_studies: scoped_ids,
      can_export,
      password_hash: `${salt}:${hash}`
    })
    .select()
    .single();

  if (error) { console.error('Failed:', error.message); process.exit(1); }

  console.log('✅ Co-researcher created');
  console.log('   Email:        ', data.email);
  console.log('   Name:         ', data.name);
  console.log('   Institution:  ', data.institution);
  console.log('   Scoped to:    ', studies.map(s => s.study_key).join(', '));
  console.log('   can_export:   ', data.can_export, can_export ? '' : '(grant per account when analysis is needed)');
  console.log('   can_manage_portal:', data.can_manage_portal);
  console.log('   can_send_reminders:', data.can_send_reminders);
  console.log('   can_view_participant:', data.can_view_participant);
})();