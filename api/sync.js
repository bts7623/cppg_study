// Vercel Serverless Function — 아이디별 학습 데이터(형광펜 등) 저장/불러오기
// 저장소: Upstash Redis (Vercel Marketplace) REST API. 의존 패키지 없음.
// GET  /api/sync?u=ID&k=marks            → {ok, exists, data, ver}
// PUT  /api/sync  {u, pin, k, data}       → {ok, ver}   (첫 PUT 때 PIN 등록, 이후 PIN 검증)
// POST /api/sync  {u, pin, op:"check"}   → {ok, exists, pinOk}
const crypto = require("crypto");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEYS = new Set(["marks", "memo", "quiz", "view"]);
// 허용 아이디: api/users.json 의 목록 + 환경변수 CPPG_USERS("a,b,c"). 목록에 없는 아이디는 새로 등록할 수 없음.
let FILE_USERS = [], FILE_ADMINS = [];
try { const j = require("./users.json"); FILE_USERS = j.users || []; FILE_ADMINS = j.admins || []; } catch (_) {}
const ALLOW = new Set([...FILE_USERS, ...String(process.env.CPPG_USERS || "").split(",")].map(x => String(x).trim().toLowerCase()).filter(Boolean));
const ADMINS = new Set(FILE_ADMINS.map(x => String(x).trim().toLowerCase()));
// 허용 = users.json ∪ 환경변수 ∪ Redis 집합 allow(관리자 페이지에서 추가한 아이디)
async function allowed(u) { if (ALLOW.has(u)) return true; return (await redis(["SISMEMBER", "allow", u])) === 1; }
const MAX = 400 * 1024; // 400KB per key

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const hash = (u, pin) => crypto.createHash("sha256").update(`${u}::${pin}::cppg`).digest("hex");
const normU = u => String(u || "").trim().toLowerCase().replace(/[^a-z0-9_\-가-힣]/g, "").slice(0, 32);
const normPin = p => String(p || "").trim().slice(0, 32);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!URL_ || !TOKEN) return res.status(500).json({ ok: false, error: "저장소 환경변수가 없습니다 (KV_REST_API_URL/TOKEN)" });
  try {
    if (req.method === "GET") {
      const u = normU(req.query.u), k = String(req.query.k || "marks");
      if (!u) return res.status(400).json({ ok: false, error: "아이디 없음" });
      if (!KEYS.has(k)) return res.status(400).json({ ok: false, error: "키 없음" });
      const [pinHash, raw, ver] = await Promise.all([redis(["GET", `u:${u}:pin`]), redis(["GET", `u:${u}:${k}`]), redis(["GET", `u:${u}:${k}:ver`])]);
      return res.json({ ok: true, exists: !!pinHash, data: raw ? JSON.parse(raw) : null, ver: ver ? +ver : 0 });
    }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    body = body || {};
    const u = normU(body.u), pin = normPin(body.pin);
    if (!u) return res.status(400).json({ ok: false, error: "아이디 없음" });
    if (pin.length < 4) return res.status(400).json({ ok: false, error: "PIN은 4자리 이상" });
    const stored = await redis(["GET", `u:${u}:pin`]);
    // ---- 관리자 작업: 관리자 아이디의 PIN으로 인증 (users.json의 admins)
    if (req.method === "POST" && ["list", "register", "reset", "delete"].includes(body.op)) {
      if (!ADMINS.has(u)) return res.status(403).json({ ok: false, error: "관리자 아이디가 아닙니다" });
      if (!stored) return res.status(403).json({ ok: false, error: "관리자 아이디를 먼저 일반 연결로 PIN 등록하세요" });
      if (stored !== hash(u, pin)) return res.status(403).json({ ok: false, error: "관리자 PIN이 맞지 않습니다" });
      if (body.op === "list") {
        const extra = (await redis(["SMEMBERS", "allow"])) || [];
        const ids = [...new Set([...ALLOW, ...extra])].sort();
        const rows = [];
        for (const id of ids) { const [ph, ver] = await Promise.all([redis(["GET", `u:${id}:pin`]), redis(["GET", `u:${id}:marks:ver`])]); rows.push({ id, registered: !!ph, admin: ADMINS.has(id), ver: ver ? +ver : 0, fixed: ALLOW.has(id) }); }
        return res.json({ ok: true, users: rows });
      }
      const t = normU(body.target), tp = normPin(body.targetPin);
      if (!t) return res.status(400).json({ ok: false, error: "대상 아이디 없음" });
      if (body.op === "delete") {
        if (ADMINS.has(t)) return res.status(400).json({ ok: false, error: "관리자 아이디는 삭제할 수 없습니다" });
        for (const k of ["pin", "marks", "marks:ver", "memo", "memo:ver", "quiz", "quiz:ver", "view", "view:ver"]) await redis(["DEL", `u:${t}:${k}`]);
        await redis(["SREM", "allow", t]);
        return res.json({ ok: true, deleted: t });
      }
      if (tp.length < 4) return res.status(400).json({ ok: false, error: "PIN은 4자리 이상" });
      await redis(["SADD", "allow", t]);
      await redis(["SET", `u:${t}:pin`, hash(t, tp)]);
      return res.json({ ok: true, user: t, op: body.op });
    }
    if (!stored && !(await allowed(u))) return res.status(403).json({ ok: false, error: "등록되지 않은 아이디입니다. 관리자에게 아이디 등록을 요청하세요." });
    if (req.method === "POST" && body.op === "check") {
      return res.json({ ok: true, exists: !!stored, pinOk: !stored || stored === hash(u, pin) });
    }
    if (req.method !== "PUT") return res.status(405).json({ ok: false, error: "method" });
    const k = String(body.k || "marks");
    if (!KEYS.has(k)) return res.status(400).json({ ok: false, error: "키 없음" });
    if (stored && stored !== hash(u, pin)) return res.status(403).json({ ok: false, error: "PIN이 맞지 않습니다" });
    const raw = JSON.stringify(body.data == null ? {} : body.data);
    if (raw.length > MAX) return res.status(413).json({ ok: false, error: "데이터가 너무 큽니다" });
    const ver = Date.now();
    const cmds = [["SET", `u:${u}:${k}`, raw], ["SET", `u:${u}:${k}:ver`, String(ver)]];
    if (!stored) cmds.push(["SET", `u:${u}:pin`, hash(u, pin)]);
    for (const c of cmds) await redis(c);
    return res.json({ ok: true, ver, created: !stored });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
