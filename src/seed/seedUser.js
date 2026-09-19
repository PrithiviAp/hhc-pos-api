/**
 * One-time seed script to create the first login user, since the
 * app has no public signup. Run with: npm run seed:admin
 */
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../config/env');
const User = require('../models/User');

async function run() {
  await mongoose.connect(env.mongoUri);

  const existing = await User.findOne({ username: env.seedAdmin.username });
  if (existing) {
    console.log(`User "${env.seedAdmin.username}" already exists. Skipping.`);
    process.exit(0);
  }

  const passwordHash = await User.hashPassword(env.seedAdmin.password);
  await User.create({
    name: env.seedAdmin.name,
    username: env.seedAdmin.username,
    passwordHash,
    role: 'admin',
  });

  console.log(`Admin user "${env.seedAdmin.username}" created successfully.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
