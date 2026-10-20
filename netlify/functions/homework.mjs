import { createHash, timingSafeEqual } from "node:crypto";

const REPO = "nagaitashouten-star/personal-brain";
const FILE = "Homework/state.json";
const BRANCH = "main";
const ORIGIN = "https://family.nagaita.jp";
const emptyState = () => ({ schema: 1, updatedAt: null, tasks: [], recentOps: [] });
const env = key => globalThis.Netlify?.env?.get(key) || process.env[key];

function reply(data, status = 200, origin = ORIGIN) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "vary": "Origin",
      "x-content-type-options": "nosniff"
    }
  });
}
function equalSecret(given, expected) {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
function authorize(req) {
  const bearer = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "");
  const code = bearer?.[1] || "";
  const parent = env("HOMEWORK_PARENT_CODE");
  const family = env("HOMEWORK_FAMILY_CODE");
  if (!parent || !family || parent.length < 16 || family.length < 16) return "unconfigured";
  if (equalSecret(code, parent)) return "parent";
  if (equalSecret(code, family)) return "family";
  return null;
}
function ghHeaders() {
  return {
    authorization: "Bearer " + env("HOMEWORK_GITHUB_TOKEN"),
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json"
  };
}
const fileUrl = "https://api.github.com/repos/" + REPO + "/contents/" + FILE;
async function readBoard() {
  const res = await fetch(fileUrl + "?ref=" + BRANCH, { headers: ghHeaders(), cache: "no-store" });
  if (res.status === 404) return { state: emptyState(), sha: null };
  if (!res.ok) throw new Error("GitHub read failed (" + res.status + ")");
  const j = await res.json();
  const raw = Buffer.from(j.content.replace(/\s/g, ""), "base64").toString("utf8");
  const state = JSON.parse(raw);
  if (state.schema !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.recentOps)) {
    throw new Error("Invalid state format");
  }
  return { state, sha: j.sha };
}
async function writeBoard(state, sha) {
  const data = {
    message: "Update homework board progress",
    branch: BRANCH,
    content: Buffer.from(JSON.stringify(state, null, 2) + "\n").toString("base64")
  };
  if (sha) data.sha = sha;
  const res = await fetch(fileUrl, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(data) });
  if (res.status === 409 || res.status === 422) return false;
  if (!res.ok) throw new Error("GitHub write failed (" + res.status + ")");
  return true;
}
const safeId = v => typeof v === "string" && /^[a-zA-Z0-9_-]{1,72}$/.test(v);
const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const isBoolean = v => typeof v === "boolean";
const isDate = v => v == null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")));
function validatedTask(t) {
  if (!t || !safeId(t.id) || !str(t.title, 80) || !["english","other"].includes(t.subject) ||
      !["check","steps","count","pages"].includes(t.kind) ||
      !["today","future","old"].includes(t.bucket) ||
      !isDate(t.dueDate) ||
      (t.detail != null && (typeof t.detail !== "string" || t.detail.length > 200))) return null;
  const target = ["count","pages"].includes(t.kind) ? Number(t.target) : 1;
  if (!Number.isInteger(target) || target < 1 || target > 100) return null;
  return {
    id:t.id, title:t.title.trim(), subject:t.subject, detail:(t.detail||"").trim(),
    kind:t.kind, bucket:t.bucket, dueDate:t.dueDate||null, target,
    done:false, steps:[false,false], count:0,
    source:"parent", createdAt:new Date().toISOString()
  };
}
function apply(state, op, role) {
  if (!op || !safeId(op.opId) || !["progress","add","remove","bucket"].includes(op.action)) return "Invalid operation";
  if (state.recentOps.includes(op.opId)) return "already-applied";
  if (state.tasks.length > 300) return "Task limit exceeded";
  if (op.action === "add") {
    if (role !== "parent") return "Parent access required";
    const task = validatedTask(op.task);
    if (!task || state.tasks.some(t=>t.id===task.id)) return "Invalid or duplicate task";
    state.tasks.push(task);
  } else {
    const t = state.tasks.find(t=>t.id===op.taskId);
    if (!t) return "Task not found";
    if (op.action === "remove") {
      if (role !== "parent") return "Parent access required";
      state.tasks = state.tasks.filter(x=>x.id!==t.id);
    } else if (op.action === "bucket") {
      if (role !== "parent" || !["today","future","old"].includes(op.value)) return "Invalid bucket";
      t.bucket = op.value;
    } else if (op.action === "progress") {
      if (t.kind === "check" && op.field === "done" && isBoolean(op.value)) t.done = op.value;
      else if (t.kind === "steps" && [0,1].includes(op.step) && isBoolean(op.value)) {
        if (!Array.isArray(t.steps)) t.steps=[false,false];
        t.steps[op.step] = op.value;
      } else if (["count","pages"].includes(t.kind) && op.field === "increment" &&
        Number.isInteger(op.delta) && [-1,1].includes(op.delta)) {
        t.count = Math.max(0,Math.min(t.target,Number(t.count||0)+op.delta));
      } else return "Invalid progress";
    }
  }
  state.recentOps.push(op.opId);
  state.recentOps = state.recentOps.slice(-500);
  state.updatedAt = new Date().toISOString();
  return null;
}
export default async function handler(req) {
  const origin = req.headers.get("origin");
  if (origin && origin !== ORIGIN) return reply({error:"Origin not allowed"},403);
  if (req.method === "OPTIONS") {
    return new Response(null, {status:204,headers:{
      "access-control-allow-origin":ORIGIN, "access-control-allow-methods":"GET, POST, OPTIONS",
      "access-control-allow-headers":"Authorization, Content-Type",
      "access-control-max-age":"600", "vary":"Origin"
    }});
  }
  if (!["GET","POST"].includes(req.method)) return reply({error:"Method not allowed"},405);
  const token = env("HOMEWORK_GITHUB_TOKEN");
  const role = authorize(req);
  if (!token || token.length < 30 || role === "unconfigured") return reply({error:"Sync has not been configured"},503);
  if (!role) return reply({error:"Invalid access code"},401);
  try {
    if (req.method === "GET") {
      const {state} = await readBoard();
      return reply({role, state:{schema:state.schema,updatedAt:state.updatedAt,tasks:state.tasks}});
    }
    const bodyText = await req.text();
    if (bodyText.length > 5000) return reply({error:"Request too large"},413);
    let operation;try{operation=JSON.parse(bodyText)}catch{return reply({error:"Invalid JSON"},400)}
    for (let n=0;n<4;n++) {
      const {state,sha} = await readBoard();
      const error = apply(state,operation,role);
      if(error === "already-applied")return reply({ok:true,alreadyApplied:true,state:{schema:state.schema,updatedAt:state.updatedAt,tasks:state.tasks}});
      if(error)return reply({error},400);
      const updated = await writeBoard(state,sha);
      if(updated)return reply({ok:true,state:{schema:state.schema,updatedAt:state.updatedAt,tasks:state.tasks}});
    }
    return reply({error:"Save conflict; retry"},409);
  } catch(e) {
    console.error("Homework storage:",e.message);
    return reply({error:"Storage temporarily unavailable"},503);
  }
}
export const config = {rateLimit:{action:"rate_limit", aggregateBy:"ip", windowSize:60, windowLimit:80}};
