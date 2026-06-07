import { promises as fs } from "node:fs";
import path from "node:path";

const STORE_KEY = process.env.RSVP_STORE_KEY || "party:50-50-25:rsvps";
const LOCAL_FILE = process.env.RSVP_LOCAL_FILE || path.join(process.cwd(), ".local-data", "rsvps.json");
const MAX_NAMES = 2;
const ATTENDANCE_OPTIONS = new Set(["full-evening", "walking-dinner", "party-only", "not-coming"]);

export default async function handler(req, res) {
  setJsonHeaders(res);

  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  try {
    if (req.method === "GET") {
      return handleGet(req, res);
    }

    if (req.method === "POST") {
      return handlePost(req, res);
    }

    return send(res, 405, { message: "Deze methode wordt niet ondersteund." });
  } catch (error) {
    return send(res, 500, {
      message: "Er ging iets mis met de aanmeldingen.",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
}

async function handleGet(req, res) {
  const admin = getAdminSecretFromRequest(req);
  const adminSecret = effectiveAdminSecret();

  if (!admin || admin !== adminSecret) {
    return send(res, 401, {
      message: "De admin-code klopt niet."
    });
  }

  if (isProductionWithoutKv()) {
    return send(res, 503, {
      message: "RSVP-opslag is nog niet gekoppeld in Vercel.",
      stats: summarize([])
    });
  }

  const entries = await readEntries();

  return send(res, 200, {
    stats: summarize(entries),
    entries
  });
}

async function handlePost(req, res) {
  if (isProductionWithoutKv()) {
    return send(res, 503, {
      message: "RSVP-opslag is nog niet gekoppeld in Vercel. Voeg eerst Vercel KV toe."
    });
  }

  const body = await readJsonBody(req);

  if (body.website) {
    return send(res, 200, {
      message: "Reactie ontvangen."
    });
  }

  const names = normalizeNames(body.names);
  const attendance = normalizeAttendance(body.attendance);
  const note = String(body.note || "").trim().slice(0, 500);

  if (names.length === 0) {
    return send(res, 400, { message: "Vul minimaal een naam in." });
  }

  if (names.length > MAX_NAMES) {
    return send(res, 400, { message: "Je kunt maximaal 2 namen tegelijk aanmelden." });
  }

  if (!attendance) {
    return send(res, 400, { message: "Kies of jullie erbij zijn." });
  }

  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    names,
    attendance,
    note
  };

  await saveEntry(entry);

  return send(res, 201, {
    message: "Reactie ontvangen."
  });
}

function normalizeNames(names) {
  if (!Array.isArray(names)) return [];

  return names
    .map((name) => String(name || "").trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function normalizeAttendance(attendance) {
  const value = String(attendance || "").trim();
  return ATTENDANCE_OPTIONS.has(value) ? value : "";
}

function summarize(entries) {
  const stats = entries.reduce((summary, entry) => {
    const people = entry.names?.length || 0;
    const attendance = normalizeAttendance(entry.attendance) || "full-evening";

    summary.responseGroups += 1;
    summary.respondentPeople += people;

    if (attendance === "not-coming") {
      summary.declinedGroups += 1;
      summary.declinedPeople += people;
    } else {
      summary.totalGroups += 1;
      summary.totalPeople += people;

      if (attendance === "full-evening" || attendance === "walking-dinner") {
        summary.dinnerPeople += people;
      }

      if (attendance === "full-evening" || attendance === "party-only") {
        summary.partyPeople += people;
      }
    }

    summary.byAttendance[attendance] += people;
    return summary;
  }, {
    totalGroups: 0,
    totalPeople: 0,
    responseGroups: 0,
    respondentPeople: 0,
    dinnerPeople: 0,
    partyPeople: 0,
    declinedGroups: 0,
    declinedPeople: 0,
    byAttendance: {
      "full-evening": 0,
      "walking-dinner": 0,
      "party-only": 0,
      "not-coming": 0
    }
  });

  return {
    ...stats,
    updatedAt: entries.at(-1)?.createdAt || null
  };
}

async function readEntries() {
  if (hasKv()) {
    const result = await kvCommand(["LRANGE", STORE_KEY, "0", "-1"]);
    return (Array.isArray(result) ? result : [])
      .map(parseEntry)
      .filter(Boolean);
  }

  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveEntry(entry) {
  if (hasKv()) {
    await kvCommand(["RPUSH", STORE_KEY, JSON.stringify(entry)]);
    return;
  }

  const entries = await readEntries();
  entries.push(entry);
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function parseEntry(raw) {
  try {
    const entry = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!entry || !Array.isArray(entry.names)) return null;
    return {
      ...entry,
      attendance: normalizeAttendance(entry.attendance) || "full-evening"
    };
  } catch {
    return null;
  }
}

async function kvCommand(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Vercel KV gaf geen geldige response.");
  }

  return payload.result;
}

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isProductionWithoutKv() {
  return Boolean(process.env.VERCEL && !hasKv());
}

function effectiveAdminSecret() {
  return process.env.ADMIN_SECRET || (process.env.LOCAL_DEV ? "local" : "");
}

function getAdminSecretFromRequest(req) {
  const url = new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`);
  return url.searchParams.get("admin") || "";
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw) return {};
  return JSON.parse(raw);
}

function setJsonHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  if (statusCode === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
}
