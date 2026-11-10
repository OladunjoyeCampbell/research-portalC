// scripts/create-admin.js
// Usage: node scripts/create-admin.js <email> <password> ["Display Name"]
// Creates (or updates) the PI account. Only one PI is expected.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const [,, email, password, nameArg] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> ["Display Name"]');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const password_hash = `${salt}:${hash}`;
const name = nameArg || 'Dr Oladele Campbell';

(async () => {
  // Check whether a PI already exists
  const { data: existingPI } = await sb
    .from('admin_users')
    .select('id, email')
    .eq('role', 'pi')
    .maybeSingle();

  if (existingPI) {
    console.log(`⚠️  A PI account already exists: ${existingPI.email}`);
    console.log('    Updating its email, password, and name instead of creating a second PI.');

    const { error } = await sb
      .from('admin_users')
      .update({ email, name, password_hash, is_active: true })
      .eq('id', existingPI.id);

    if (error) { console.error('Failed:', error.message); process.exit(1); }
    console.log('✅ PI account updated:', email);
    return;
  }

  const { data, error } = await sb
    .from('admin_users')
    .insert({
      email,
      name,
      role: 'pi',
      password_hash
    })
    .select()
    .single();

  if (error) { console.error('Failed:', error.message); process.exit(1); }
  console.log('✅ PI account created:', data.email, '(id', data.id + ')');
})();