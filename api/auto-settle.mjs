import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile() {
  const candidates = [
    resolve(process.cwd(), "api/.env"),
    resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
    return;
  }
}

loadEnvFile();

const API_BASE = (process.env.AUTO_SETTLE_API_BASE || "http://localhost:8080").replace(/\/$/, "");
const API_KEY = process.env.API_KEY || "";
const INTERVAL_MS = Number(process.env.AUTO_SETTLE_INTERVAL_MS || 60_000);
const ELIGIBLE_STATUSES = new Set(
  String(process.env.AUTO_SETTLE_ELIGIBLE_STATUSES || "ACTIVE")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
);

const WEATHER_SOURCE_A_URL =
  process.env.AUTO_SETTLE_WEATHER_SOURCE_A_URL || "https://open-meteo.com/en/docs/climate-api";
const WEATHER_SOURCE_B_URL =
  process.env.AUTO_SETTLE_WEATHER_SOURCE_B_URL || "https://www.weatherapi.com/docs/";
const VALIDATOR_SOURCE_A_URL =
  process.env.AUTO_SETTLE_VALIDATOR_SOURCE_A_URL || "https://beaconcha.in";
const VALIDATOR_SOURCE_B_URL =
  process.env.AUTO_SETTLE_VALIDATOR_SOURCE_B_URL || "https://rated.network";
const STATUS_PATH = resolve(process.cwd(), "api/auto-settle-status.json");

const inFlight = new Set();
const state = {
  started_at: new Date().toISOString(),
  running: true,
  api_base: API_BASE,
  interval_ms: INTERVAL_MS,
  eligible_statuses: [...ELIGIBLE_STATUSES],
  last_tick_at: null,
  last_success_at: null,
  last_error_at: null,
  last_error: "",
  ticks: 0,
  scan_count: 0,
  settled_count: 0,
  failed_count: 0,
  last_settled_policy_id: "",
};

function saveStatus() {
  try {
    writeFileSync(STATUS_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auto-settle] unable to write status file: ${message}`);
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isEnded(endDate, nowDate) {
  if (!endDate) return false;
  return String(endDate) <= nowDate;
}

async function fetchJson(url, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${data?.error || text || "request_failed"}`);
  }
  return data;
}

function buildVerifyPayload(policy, nowDate) {
  const policyType = String(policy?.policy_type || "weather_drought");
  if (policyType === "validator_downtime") {
    return {
      policy_type: policyType,
      source_a_url: VALIDATOR_SOURCE_A_URL,
      source_b_url: VALIDATOR_SOURCE_B_URL,
      tolerance_bps: Number(process.env.AUTO_SETTLE_TOLERANCE_BPS || 50),
      current_date: nowDate,
    };
  }

  return {
    policy_type: policyType,
    source_a_url: WEATHER_SOURCE_A_URL,
    source_b_url: WEATHER_SOURCE_B_URL,
    tolerance_mm: Number(process.env.AUTO_SETTLE_TOLERANCE_MM || 5),
    current_date: nowDate,
  };
}

async function settlePolicy(policy, nowDate) {
  const policyId = String(policy?.id || "");
  if (!policyId) return;
  if (inFlight.has(policyId)) return;

  const status = String(policy?.status || "").toUpperCase();
  const endDate = String(policy?.end_date || "");
  if (!ELIGIBLE_STATUSES.has(status) || !isEnded(endDate, nowDate)) return;

  inFlight.add(policyId);
  try {
    const payload = buildVerifyPayload(policy, nowDate);
    const data = await fetchJson(`${API_BASE}/policies/${encodeURIComponent(policyId)}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const hash = data?.receipt?.transactionHash || data?.receipt?.hash || "";
    state.settled_count += 1;
    state.last_settled_policy_id = policyId;
    state.last_success_at = new Date().toISOString();
    state.last_error = "";
    saveStatus();
    console.log(`[auto-settle] settled ${policyId} (${status}) tx=${hash || "accepted"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.failed_count += 1;
    state.last_error_at = new Date().toISOString();
    state.last_error = message;
    saveStatus();
    console.error(`[auto-settle] failed ${policyId}: ${message}`);
  } finally {
    inFlight.delete(policyId);
  }
}

async function tick() {
  const nowDate = todayYmd();
  state.ticks += 1;
  state.last_tick_at = new Date().toISOString();
  try {
    const data = await fetchJson(`${API_BASE}/policies`);
    const policies = Array.isArray(data?.policies) ? data.policies : [];
    state.scan_count = policies.length;
    saveStatus();
    await Promise.all(policies.map((policy) => settlePolicy(policy, nowDate)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.last_error_at = new Date().toISOString();
    state.last_error = message;
    saveStatus();
    console.error(`[auto-settle] tick error: ${message}`);
  }
}

console.log(`[auto-settle] started api=${API_BASE} interval_ms=${INTERVAL_MS}`);
saveStatus();
void tick();
setInterval(() => {
  void tick();
}, INTERVAL_MS);
