import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), "api/.env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalize(value) {
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value.entries()) out[String(k)] = normalize(v);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => normalize(v));
  return value;
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type,x-api-key",
  });
  res.end(JSON.stringify(data));
}

function notFound(res) {
  json(res, 404, { error: "not_found" });
}

function unauthorized(res) {
  json(res, 401, { error: "unauthorized" });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildClient({ forWrite = false } = {}) {
  const chain = (process.env.GENLAYER_CHAIN || "studionet").toLowerCase();
  const endpoint = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
  const serverAccount = process.env.GENLAYER_SERVER_ACCOUNT;
  const config = {
    chain: chain === "localnet" ? localnet : studionet,
    endpoint,
  };

  if (forWrite && serverAccount) config.account = serverAccount;
  return createClient(config);
}

function requireWriteConfig() {
  if (!process.env.GENLAYER_SERVER_ACCOUNT) {
    throw new Error("GENLAYER_SERVER_ACCOUNT is required for write endpoints");
  }
}

async function writeAndWait(client, contractAddress, functionName, args) {
  const txHash = await client.writeContract({
    address: contractAddress,
    functionName,
    args,
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: "ACCEPTED",
    retries: 40,
    interval: 3000,
  });

  return receipt;
}

loadEnvFile();

const API_PORT = Number(process.env.API_PORT || 8080);
const API_KEY = process.env.API_KEY || "";
const CONTRACT_ADDRESS = process.env.GENLAYER_CONTRACT_ADDRESS || "";

if (!CONTRACT_ADDRESS) {
  console.error("Missing GENLAYER_CONTRACT_ADDRESS in env");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "Content-Type,x-api-key",
      });
      res.end();
      return;
    }

    const needsAuth = method !== "GET";
    if (needsAuth && API_KEY) {
      const header = req.headers["x-api-key"];
      if (header !== API_KEY) return unauthorized(res);
    }

    if (method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "proofpay-api",
        contract_address: CONTRACT_ADDRESS || "",
        chain: (process.env.GENLAYER_CHAIN || "studionet").toLowerCase(),
        has_server_account: !!process.env.GENLAYER_SERVER_ACCOUNT,
      });
    }

    if (method === "GET" && url.pathname === "/auto-settle/status") {
      const statusPath = resolve(process.cwd(), "api/auto-settle-status.json");
      if (!existsSync(statusPath)) {
        return json(res, 200, {
          ok: false,
          running: false,
          message: "auto-settle status file not found (worker may be offline)",
        });
      }
      const raw = readFileSync(statusPath, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      return json(res, 200, { ok: true, ...parsed });
    }

    if (method === "GET" && url.pathname === "/policies") {
      const client = buildClient();
      const all = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_all_policies",
        args: [],
      });
      const normalized = normalize(all);
      const list = Object.values(normalized || {});
      return json(res, 200, { policies: list });
    }

    if (method === "GET" && url.pathname.startsWith("/policies/")) {
      const policyId = decodeURIComponent(url.pathname.split("/")[2] || "");
      if (!policyId) return json(res, 400, { error: "missing_policy_id" });
      const client = buildClient();
      const data = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_policy",
        args: [policyId],
      });
      return json(res, 200, { policy: normalize(data) });
    }

    if (method === "GET" && url.pathname.startsWith("/buyers/") && url.pathname.endsWith("/policies")) {
      const wallet = decodeURIComponent(url.pathname.split("/")[2] || "").toLowerCase();
      if (!wallet) return json(res, 400, { error: "missing_wallet" });
      const client = buildClient();
      const all = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_all_policies",
        args: [],
      });
      const normalized = normalize(all);
      const list = Object.values(normalized || {}).filter((p) => {
        const buyer = String(p?.buyer || "").toLowerCase();
        const provider = String(p?.provider || "").toLowerCase();
        return buyer === wallet || provider === wallet;
      });
      return json(res, 200, { policies: list });
    }

    if (method === "GET" && url.pathname.startsWith("/buyers/") && url.pathname.endsWith("/balance")) {
      const wallet = decodeURIComponent(url.pathname.split("/")[2] || "");
      if (!wallet) return json(res, 400, { error: "missing_wallet" });
      const client = buildClient();
      const balance = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_withdrawable_balance",
        args: [wallet],
      });
      return json(res, 200, { wallet, withdrawable_balance: Number(balance || 0) });
    }

    if (method === "POST" && url.pathname === "/policies") {
      requireWriteConfig();
      const body = await readJsonBody(req);
      const client = buildClient({ forWrite: true });
      const policyType = String(body.policy_type || "weather_drought");
      const fn =
        policyType === "validator_downtime"
          ? "create_validator_policy_offer"
          : "create_policy_offer";
      const args =
        policyType === "validator_downtime"
          ? [
              body.policy_id,
              body.buyer_address || "",
              body.validator_address,
              body.start_date,
              body.end_date,
              Number(body.threshold_uptime_bps),
              Number(body.payout_amount),
              Number(body.premium_amount),
              Number(body.collateral_amount ?? body.payout_amount),
            ]
          : [
              body.policy_id,
              body.buyer_address || "",
              body.region,
              body.start_date,
              body.end_date,
              Number(body.threshold_mm),
              Number(body.payout_amount),
              Number(body.premium_amount),
              Number(body.collateral_amount ?? body.payout_amount),
            ];
      const receipt = await writeAndWait(client, CONTRACT_ADDRESS, fn, args);
      return json(res, 200, { status: "accepted", receipt: normalize(receipt) });
    }

    if (method === "POST" && /^\/policies\/[^/]+\/activate$/.test(url.pathname)) {
      requireWriteConfig();
      const policyId = decodeURIComponent(url.pathname.split("/")[2] || "");
      const body = await readJsonBody(req);
      const mode = (body.mode || "buyer").toLowerCase();
      const premium = Number(body.premium_payment);
      const fn = mode === "sponsor" ? "pay_premium_for_buyer" : "pay_premium";
      const client = buildClient({ forWrite: true });
      const receipt = await writeAndWait(client, CONTRACT_ADDRESS, fn, [policyId, premium]);
      return json(res, 200, { status: "accepted", mode, receipt: normalize(receipt) });
    }

    if (method === "POST" && /^\/policies\/[^/]+\/verify$/.test(url.pathname)) {
      requireWriteConfig();
      const policyId = decodeURIComponent(url.pathname.split("/")[2] || "");
      const body = await readJsonBody(req);
      const client = buildClient({ forWrite: true });
      const policyType = String(body.policy_type || "weather_drought");
      const fn =
        policyType === "validator_downtime"
          ? "verify_and_settle_validator_policy"
          : "verify_and_settle_policy";
      const args =
        policyType === "validator_downtime"
          ? [
              policyId,
              body.source_a_url,
              body.source_b_url,
              Number(body.tolerance_bps ?? 50),
              body.current_date,
            ]
          : [
              policyId,
              body.source_a_url,
              body.source_b_url,
              Number(body.tolerance_mm ?? 5),
              body.current_date,
            ];
      const receipt = await writeAndWait(client, CONTRACT_ADDRESS, fn, args);
      return json(res, 200, { status: "accepted", policy_type: policyType, receipt: normalize(receipt) });
    }

    return notFound(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return json(res, 500, { error: message });
  }
});

server.listen(API_PORT, () => {
  console.log(`Proofpay API listening on http://localhost:${API_PORT}`);
});
