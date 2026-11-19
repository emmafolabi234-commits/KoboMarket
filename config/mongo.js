const mongoose = require('mongoose');
require('dotenv').config();

async function initMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected');
}

module.exports = { initMongo };
