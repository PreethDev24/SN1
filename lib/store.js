'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONTRACTS_FILE = path.join(DATA_DIR, 'contracts.json');
const SIGNED_FILE = path.join(DATA_DIR, 'signed.json');

const REDIS_CONTRACTS_KEY = 'sn_web:contracts';
const REDIS_SIGNED_KEY = 'sn_web:signed';

function redis() {
  const { Redis } = require('@upstash/redis');
  return Redis.fromEnv();
}

function useRedis() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function loadContracts() {
  if (!useRedis()) {
    ensureDataDir();
    try {
      return JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
    } catch (_) {
      return {};
    }
  }
  const v = await redis().get(REDIS_CONTRACTS_KEY);
  return v && typeof v === 'object' ? v : {};
}

async function saveContracts(data) {
  if (!useRedis()) {
    ensureDataDir();
    fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(data, null, 2));
    return;
  }
  await redis().set(REDIS_CONTRACTS_KEY, data);
}

async function loadSigned() {
  if (!useRedis()) {
    ensureDataDir();
    try {
      return JSON.parse(fs.readFileSync(SIGNED_FILE, 'utf8'));
    } catch (_) {
      return {};
    }
  }
  const v = await redis().get(REDIS_SIGNED_KEY);
  return v && typeof v === 'object' ? v : {};
}

async function saveSigned(data) {
  if (!useRedis()) {
    ensureDataDir();
    fs.writeFileSync(SIGNED_FILE, JSON.stringify(data, null, 2));
    return;
  }
  await redis().set(REDIS_SIGNED_KEY, data);
}

async function removeContractFile(contract) {
  if (!contract || !contract.path) return;
  if (/^https?:\/\//i.test(contract.path)) {
    const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
    if (!token) return;
    const { del } = require('@vercel/blob');
    await del(contract.path, { token });
    return;
  }
  const filePath = path.join(ROOT, contract.path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = {
  useRedis,
  loadContracts,
  saveContracts,
  loadSigned,
  saveSigned,
  removeContractFile,
  ROOT,
};
