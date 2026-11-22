#!/usr/bin/env node
/**
 * Setup & Initialize Turso (libSQL) Cloud Database for LifeCare
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/setup-turso.js
 */

const { initDatabase, isTursoConfigured, getDb } = require('../server/db');
const { ensureDemoUser } = require('../server/auth');

async function main() {
  console.log('========================================================');
  console.log('🌿 LifeCare - Turso Database Setup & Health Check');
  console.log('========================================================');

  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.TURBO_DATABASE_URL || process.env.TURSO_URL;
  if (!tursoUrl) {
    console.log('⚠️  Notice: TURSO_DATABASE_URL or TURBO_DATABASE_URL is not set.');
    console.log('   The system will use local SQLite file for local development.');
    console.log('   To connect to Turso cloud, provide:');
    console.log('     TURSO_DATABASE_URL=libsql://<your-db>.turso.io');
    console.log('     TURSO_AUTH_TOKEN=<your-token>');
    console.log('--------------------------------------------------------');
  } else {
    console.log('🔗 Connecting to Turso Cloud at:', tursoUrl);
  }

  try {
    console.log('📦 Initializing schema & running migrations...');
    await initDatabase();

    console.log('🌱 Seeding initial demo data...');
    await ensureDemoUser();

    const db = getDb();
    const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').get();
    const taskCount = await db.prepare('SELECT COUNT(*) as count FROM tasks').get();
    const healthCount = await db.prepare('SELECT COUNT(*) as count FROM health_checkins').get();
    const moodCount = await db.prepare('SELECT COUNT(*) as count FROM mood_checkins').get();

    console.log('✅ Verification Summary:');
    console.log(`   - Users: ${userCount?.count || 0}`);
    console.log(`   - Tasks: ${taskCount?.count || 0}`);
    console.log(`   - Health checkins: ${healthCount?.count || 0}`);
    console.log(`   - Mood reflections: ${moodCount?.count || 0}`);
    console.log('========================================================');
    console.log('🎉 Database setup completed successfully!');
    console.log('========================================================');
  } catch (err) {
    console.error('❌ Database setup error:', err);
    process.exit(1);
  }
}

main();
