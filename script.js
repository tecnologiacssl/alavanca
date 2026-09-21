(function(){
"use strict";
const $ = s => document.querySelector(s);

/* ================= Configuração ================= */
const LS_KEY = "alavanca:v2";
const LS_SESSION = "alavanca:session";
const LS_LEGACY = "simulador-alavancagem:v1";
const LIMITS = {bankMin:0.01, bankMax:1e6, daysMin:1, daysMax:365, oddMin:1.01, oddMax:20};
const PRESETS = [
  {key:"d15", name:"15 dias", kicker:"Sprint", days:15, odd:1.50, color:"orange", giant:"15"},
  {key:"m1",  name:"1 mês", kicker:"Clássico", days:30, odd:1.30, color:"violet", giant:"30"},
  {key:"m3",  name:"3 meses", kicker:"Constância", days:90, odd:1.10, color:"teal", giant:"90"},
  {key:"m5",  name:"5 meses", kicker:"Longo prazo", days:150, odd:1.05, color:"rose", giant:"150"},
  {key:"cst", name:"Personalizado", kicker:"Do seu jeito", days:45, odd:1.20, color:"blue", giant:"+"}
];
const STATUS = {ativo:"Em andamento", falhou:"Red · falhou", resgatado:"Lucro resgatado", concluido:"Concluído", abandonado:"Encerrado"};
const DEFAULT_BANK = 5;

/* ================= Formatação ================= */
const brl = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const brlBig = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",notation:"compact",maximumFractionDigits:2});
const intFmt = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0});
const dec2 = new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const money = v => (v == null || !isFinite(v)) ? "—" : (Math.abs(v) >= 1e12 ? brlBig.format(v) : brl.format(v));
const mult = v => v >= 1e6 ? intFmt.format(v) + "×" : (v >= 100 ? intFmt.format(v) : dec2.format(v)) + "×";
const round2 = v => Math.round(v*100)/100;
const dateFmt = ts => new Date(ts).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
function chance(p){
  if(!(p > 0)) return "—";
  if(p >= 0.01) return (p*100).toLocaleString("pt-BR",{maximumFractionDigits:1}) + "%";
  const inv = 1/p; return inv > 1e12 ? "praticamente nula" : "1 em " + intFmt.format(inv);
}
function parseNum(str){
  const s = String(str).trim().replace(/\s|R\$/g,"");
  if(!s) return NaN;
  const n = s.includes(",") ? s.replace(/\./g,"").replace(",",".") : s;
  return /^\d*\.?\d+$/.test(n) ? Number(n) : NaN;
}
const fmtInput = v => String(v).replace(".", ",");

/* ================= Cálculo ================= */
function buildSchedule(initial, days, odd){
  const rows = []; let bank = initial, p = 1;
  for(let d = 1; d <= days; d++){
    const stake = bank;                // aposta = banca acumulada do dia anterior (all-in)
    const ret = round2(stake * odd);   // retorno = aposta × odd
    if(!isFinite(ret)) return null;
    p /= odd;
    bank = ret;                        // banca acumulada = retorno
    rows.push({day:d, stake, ret, bank, p});
  }
  return rows;
}
function validate(initial, days, odd){
  const e = [];
  if(!isFinite(initial) || initial < LIMITS.bankMin || initial > LIMITS.bankMax) e.push("Banca entre R$ 0,01 e R$ 1.000.000.");
  if(!Number.isInteger(days) || days < LIMITS.daysMin || days > LIMITS.daysMax) e.push("Dias: número inteiro de 1 a 365.");
  if(!isFinite(odd) || odd < LIMITS.oddMin || odd > LIMITS.oddMax) e.push("Odd entre 1,01 e 20.");
  if(!e.length && !buildSchedule(initial, days, odd)) e.push("Valores grandes demais. Reduza os dias ou a odd.");
  return e;
}

/* ================= Armazenamento ================= */
const isStore = s => s && typeof s === "object" && s.accounts && typeof s.accounts === "object";
function loadLocal(){ try{ const s = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return isStore(s) ? s : null; }catch(e){ return null; } }
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch(e){} }
function getSession(){ try{ return localStorage.getItem(LS_SESSION); }catch(e){ return null; } }
function setSession(v){ try{ v ? localStorage.setItem(LS_SESSION, v) : localStorage.removeItem(LS_SESSION); }catch(e){} }

let store = loadLocal() || {accounts:{}, updatedAt:0};
let session = getSession();
if(session && !store.accounts[session]) session = null;
let legacyPlans = readLegacyLocal();
let view = "home", openId = null, busy = false;

const account = () => session ? store.accounts[session] : null;
const plans = () => account() ? account().plans : [];
const planById = id => plans().find(p => p.id === id) || null;
const rowsOf = p => buildSchedule(p.initial, p.days, p.odd) || [];
// Cada dia registrado: {r:"G"|"C"|"R", stake, odd, ret} — valores reais informados pelo usuário
const doneDays = p => p.results.filter(e => e.r !== "R").length;
function bankOf(p){
  if(p.status === "falhou") return 0;
  const last = p.results[p.results.length-1];
  return last ? last.ret : p.initial;
}
function migratePlan(p){
  if(!Array.isArray(p.results) || !p.results.some(r => typeof r === "string")) return;
  const rows = rowsOf(p);
  p.results = p.results.map((r,i) => typeof r !== "string" ? r :
    {r, stake: rows[i] ? rows[i].stake : 0, odd: p.odd, ret: (r === "G" && rows[i]) ? rows[i].ret : 0});
}
function migrateStore(s){ Object.values(s.accounts || {}).forEach(a => (a.plans || []).forEach(migratePlan)); }
// Dias já jogados (valores reais) + projeção dos próximos dias com a odd planejada
function planRows(p){
  const rows = []; let bank = p.initial;
  p.results.forEach((e,i) => {
    const b = e.r === "R" ? 0 : e.ret;
    rows.push({day:i+1, stake:e.stake, odd:e.odd, ret:e.r === "R" ? 0 : e.ret, bank:b, kind:e.r});
    bank = b;
  });
  if(p.status === "ativo"){
    let prob = 1;
    for(let d = p.results.length + 1; d <= p.days; d++){
      const stake = bank, ret = round2(stake * p.odd); prob /= p.odd;
      rows.push({day:d, stake, odd:p.odd, ret, bank:ret, kind: d === p.results.length + 1 ? "now" : "after", p:prob});
      bank = ret;
    }
  }
  return rows;
}
function commit(){ store.updatedAt = Date.now(); saveLocal(); queueCloud(); render(); }

function readLegacyLocal(){
  try{
    const s = JSON.parse(localStorage.getItem(LS_LEGACY) || "null");
    return s && Array.isArray(s.plans) ? s.plans : [];
  }catch(e){ return []; }
}
function convertLegacy(list){
  return list.filter(p => p && isFinite(p.initial) && Number.isInteger(p.days) && isFinite(p.odd) && Array.isArray(p.results)).map(p => ({
    id: p.id || uid(), name: p.days + " dias", color: "blue", giant: String(p.days),
    initial: p.initial, days: p.days, odd: p.odd, results: p.results.slice(),
    status: p.status || "ativo", finalBank: p.finalBank ?? null, createdAt: p.createdAt || Date.now(), endedAt: p.endedAt || null
  }));
}
const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

/* ================= Autenticação local ================= */
async function hashPw(salt, pw){
  const data = new TextEncoder().encode(salt + ":" + pw);
  if(window.crypto && crypto.subtle){
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  }
  let h = 5381; for(const c of data) h = ((h * 33) ^ c) >>> 0; return "f" + h.toString(16);
}
let authMode = "login";
function setAuthMode(m, focus = true){
  authMode = m;
  const signup = m === "signup";
  $("#authTitle").textContent = signup ? "Criar conta" : "Entrar";
  $("#authLead").textContent = signup ? "Leva dez segundos." : "Acompanhe seus desafios dia a dia.";
  $("#fName").classList.toggle("hidden", !signup);
  $("#fAge").classList.toggle("hidden", !signup);
  $("#authBtn").textContent = signup ? "Criar conta" : "Entrar";
  $("#switchText").textContent = signup ? "Já tem conta?" : "Ainda não tem conta?";
  $("#switchBtn").textContent = signup ? "Entrar" : "Criar conta";
  $("#inPass").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  $("#authErr").textContent = "";
  if(focus) (signup ? $("#inName") : $("#inEmail")).focus();
}
$("#switchBtn").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#authErr");
  const email = $("#inEmail").value.trim().toLowerCase();
  const pass = $("#inPass").value;
  const name = $("#inName").value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ err.textContent = "Informe um e-mail válido."; $("#inEmail").focus(); return; }
  if(pass.length < 6){ err.textContent = "A senha precisa ter pelo menos 6 caracteres."; $("#inPass").focus(); return; }
  const btn = $("#authBtn"); btn.disabled = true;
  try{
    if(authMode === "signup"){
      if(!name){ err.textContent = "Informe seu nome."; $("#inName").focus(); return; }
      if(!$("#inAge").checked){ err.textContent = "O Alavanca é exclusivo para maiores de 18 anos."; $("#inAge").focus(); return; }
      if(store.accounts[email]){ err.textContent = "Já existe uma conta com esse e-mail. Entre com sua senha."; return; }
      const salt = uid();
      const imported = convertLegacy(legacyPlans);
      imported.forEach(migratePlan);
      store.accounts[email] = {name, email, salt, hash: await hashPw(salt, pass), plans: imported, createdAt: Date.now()};
      legacyPlans = [];
      session = email; setSession(email);
      view = "home"; commit();
      toast(imported.length ? `Bem-vindo, ${name}! Trouxemos ${imported.length} plano(s) da versão anterior.` : `Bem-vindo, ${name}!`);
    } else {
      const acc = store.accounts[email];
      if(!acc || (await hashPw(acc.salt, pass)) !== acc.hash){ err.textContent = "E-mail ou senha incorretos."; return; }
      session = email; setSession(email);
      view = "home"; render();
    }
    $("#authForm").reset();
  } finally { btn.disabled = false; }
});
$("#logoutBtn").addEventListener("click", () => {
  session = null; setSession(null); view = "home"; openId = null;
  setAuthMode("login"); render();
});

/* ================= Ações do desafio ================= */
function registerEntry(planId, dayNumber, entry, opts){
  const p = planById(planId);
  if(!p || p.status !== "ativo"){ toast("Este desafio não está em andamento."); return false; }
  const expected = p.results.length + 1;
  if(dayNumber < expected){ toast(`O dia ${dayNumber} já foi registrado.`); return false; }
  if(dayNumber > expected){ toast(`Registre o dia ${expected} antes do dia ${dayNumber}.`); return false; }
  if(dayNumber > p.days){ toast("Todos os dias já foram registrados."); return false; }
  p.results.push(entry);
  if(entry.r === "R"){ p.status = "falhou"; p.finalBank = 0; p.endedAt = Date.now(); }
  else if(opts && opts.stop){ p.status = "resgatado"; p.finalBank = entry.ret; p.endedAt = Date.now(); }
  else if(p.results.length === p.days){ p.status = "concluido"; p.finalBank = entry.ret; p.endedAt = Date.now(); }
  commit();
  return true;
}
function cashOut(planId){
  const p = planById(planId);
  if(!p || p.status !== "ativo"){ toast("Este desafio já foi encerrado."); return; }
  p.finalBank = bankOf(p); p.status = "resgatado"; p.endedAt = Date.now();
  commit();
}

/* ================= Diálogos ================= */
function confirmBox({title, body, ok, cls}){
  const d = $("#confirmDlg");
  if(typeof d.showModal !== "function") return Promise.resolve(window.confirm(title + "\n\n" + body));
  $("#cfTitle").textContent = title; $("#cfBody").textContent = body;
  const b = $("#cfOk"); b.textContent = ok; b.className = "btn " + (cls || "");
  d.returnValue = "cancel";
  return new Promise(res => { d.addEventListener("close", () => res(d.returnValue === "ok"), {once:true}); d.showModal(); });
}
let setupPreset = null;
function openSetup(preset){
  setupPreset = preset;
  const d = $("#setupDlg");
  $("#setupHead").className = "setup-head c-" + preset.color;
  $("#setupGiant").textContent = preset.giant;
  $("#setupKicker").textContent = preset.kicker;
  $("#setupTitle").textContent = preset.name;
  $("#sBank").value = fmtInput(DEFAULT_BANK.toFixed(2));
  $("#sDays").value = preset.days;
  $("#sOdd").value = fmtInput(preset.odd.toFixed(2));
  $("#sDays").readOnly = preset.key !== "cst";
  $("#setupGo").className = "btn";
  $("#setupGo").style.background = `var(--${preset.color})`;
  $("#setupGo").style.color = "#fff";
  updateSetup();
  d.returnValue = "cancel";
  if(typeof d.showModal === "function") d.showModal(); else d.setAttribute("open","");
  setTimeout(() => $("#sBank").select(), 30);
}
function readSetup(){ return {initial: parseNum($("#sBank").value), days: Number($("#sDays").value.trim()), odd: parseNum($("#sOdd").value)}; }
function updateSetup(){
  const {initial, days, odd} = readSetup();
  const errs = validate(initial, days, odd);
  $("#setupErr").textContent = errs.join(" ");
  $("#setupGo").disabled = errs.length > 0;
  const pv = $("#setupPreview"); pv.textContent = "";
  if(errs.length) return;
  const rows = buildSchedule(initial, days, odd), last = rows[rows.length-1];
  pv.appendChild(el("p", null, `Se todos os ${days} dias derem green`));
  pv.appendChild(el("div", {class:"big num"}, `${money(initial)} → ${money(last.bank)}`));
  pv.appendChild(el("p", null, `Multiplica a banca por ${mult(last.bank / initial)} · chance com odd justa: ${chance(last.p)}`));
}
["#sBank","#sDays","#sOdd"].forEach(s => {
  $(s).addEventListener("input", updateSetup);
  $(s).addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); if(!$("#setupGo").disabled) $("#setupGo").click(); } });
});
$("#setupForm").addEventListener("submit", e => {
  const submitter = e.submitter;
  if(!submitter || submitter.value !== "ok") return; // cancelar fecha normalmente
  const {initial, days, odd} = readSetup();
  if(validate(initial, days, odd).length){ e.preventDefault(); updateSetup(); return; }
  const pr = setupPreset;
  const id = uid();
  account().plans.push({
    id, name: pr.key === "cst" ? `${days} dias` : pr.name, color: pr.color,
    giant: pr.key === "cst" ? String(days) : pr.giant,
    initial: round2(initial), days, odd, results: [], status: "ativo", finalBank: null,
    createdAt: Date.now(), endedAt: null
  });
  openId = id; view = "detail";
  commit();
  window.scrollTo({top:0});
});

let toastTimer;
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
}

/* ================= Render ================= */
function el(tag, attrs, text){
  const n = document.createElement(tag);
  if(attrs) for(const k in attrs){ if(k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
  if(text != null) n.textContent = text;
  return n;
}

function renderHome(){
  const acc = account();
  const first = acc.name.split(/\s+/)[0];
  const list = plans();
  const active = list.filter(p => p.status === "ativo");
  const ended = list.filter(p => p.status !== "ativo");
  $("#helloTitle").textContent = active.length ? `${first}, você tem ${active.length} desafio${active.length > 1 ? "s" : ""} rolando.` : `Olá, ${first}. Qual desafio hoje?`;
  $("#stActive").textContent = active.length;
  $("#stBank").textContent = money(active.reduce((s,p) => s + bankOf(p), 0));
  const cashed = ended.filter(p => p.status === "resgatado" || p.status === "concluido" || p.status === "abandonado").reduce((s,p) => s + (p.finalBank - p.initial), 0);
  $("#stProfit").textContent = money(cashed);
  const lost = ended.filter(p => p.status === "falhou").reduce((sum,p) => sum + p.initial, 0);
  $("#stLoss").textContent = money(lost);

  // Seus desafios
  const mine = $("#mine"); mine.textContent = "";
  $("#mineCount").textContent = active.length ? `${active.length} em andamento` : "";
  if(!active.length){
    mine.appendChild(el("div", {class:"empty"}, "Nenhum desafio em andamento. Escolha um card abaixo para começar."));
  }
  active.sort((a,b) => b.createdAt - a.createdAt).forEach(p => {
    const g = doneDays(p), bankNow = bankOf(p);
    const card = el("button", {class:"plan-card c-" + p.color, type:"button", "aria-label": `Abrir desafio ${p.name}`});
    const r1 = el("div", {class:"row"});
    r1.appendChild(el("span", {class:"chip"}, p.name));
    r1.appendChild(el("span", {class:"day-pill"}, `Dia ${g+1} de ${p.days}`));
    const bk = el("div", {class:"bank"});
    bk.appendChild(el("small", null, "Banca atual"));
    bk.appendChild(el("strong", {class:"num"}, money(bankNow)));
    const bar = el("div", {class:"bar"}); const fill = el("i"); fill.style.width = (g / p.days * 100) + "%"; bar.appendChild(fill);
    const foot = el("div", {class:"foot"});
    foot.appendChild(el("span", null, `Hoje: aposte ${money(bankNow)}`));
    foot.appendChild(el("span", null, `odd ${dec2.format(p.odd)}`));
    card.append(r1, bk, bar, foot);
    card.addEventListener("click", () => { openId = p.id; view = "detail"; render(); window.scrollTo({top:0}); });
    mine.appendChild(card);
  });

  // Presets
  const pr = $("#presets"); pr.textContent = "";
  PRESETS.forEach(ps => {
    const b = el("button", {class:"preset c-" + ps.color, type:"button"});
    b.appendChild(el("span", {class:"giant", "aria-hidden":"true"}, ps.giant));
    const top = el("div", {style:"position:relative"});
    top.appendChild(el("span", {class:"kicker"}, ps.kicker));
    top.appendChild(el("h3", null, ps.name));
    const meta = el("div", {class:"meta"});
    if(ps.key === "cst"){
      meta.appendChild(el("span", null, "Defina dias, odd e banca"));
      meta.appendChild(el("b", null, "Até 365 dias"));
    } else {
      const last = buildSchedule(DEFAULT_BANK, ps.days, ps.odd).pop();
      meta.appendChild(el("span", null, `${ps.days} dias · odd ${dec2.format(ps.odd)}`));
      meta.appendChild(el("b", {class:"num"}, `${money(DEFAULT_BANK)} → ${money(last.bank)}`));
    }
    b.append(top, meta, el("span", {class:"go"}, "Configurar"));
    b.addEventListener("click", () => openSetup(ps));
    pr.appendChild(b);
  });

  // Histórico
  $("#histBlock").classList.toggle("hidden", !ended.length);
  const t = $("#histTable"); t.textContent = "";
  if(ended.length){
    const hr = el("tr");
    ["Desafio","Encerrado em","Dias","Odd","Resultado","Banca final","Lucro / perda"].forEach(h => hr.appendChild(el("th", {scope:"col"}, h)));
    const th = el("thead"); th.appendChild(hr);
    const tb = el("tbody");
    ended.sort((a,b) => (b.endedAt||0) - (a.endedAt||0)).forEach(p => {
      const tr = el("tr");
      const c = el("td"); const chip = el("button", {class:"chip link c-" + p.color, type:"button", style:"text-decoration:none"}, p.name);
      chip.addEventListener("click", () => { openId = p.id; view = "detail"; render(); window.scrollTo({top:0}); });
      c.appendChild(chip); tr.appendChild(c);
      tr.appendChild(el("td", null, dateFmt(p.endedAt || p.createdAt)));
      tr.appendChild(el("td", {class:"num"}, `${doneDays(p)}/${p.days}`));
      tr.appendChild(el("td", {class:"num"}, dec2.format(p.odd)));
      tr.appendChild(el("td", {class:"st-" + p.status}, STATUS[p.status]));
      tr.appendChild(el("td", {class:"num"}, money(p.finalBank)));
      const diff = p.finalBank - p.initial;
      tr.appendChild(el("td", {class:"num " + (diff > 0 ? "v-win" : diff < 0 ? "v-loss" : "")}, money(diff)));
      tb.appendChild(tr);
    });
    t.append(th, tb);
  }
}

function renderDetail(p){
  const rows = planRows(p), g = doneDays(p), bank = bankOf(p);
  const active = p.status === "ativo";
  const lostDay = p.status === "falhou" ? p.results.length : 0;
  const last = p.results[p.results.length-1];
  $("#viewDetail").className = "c-" + p.color;

  $("#heroGiant").textContent = active ? String(g+1) : p.giant;
  $("#heroName").textContent = p.name;
  $("#heroBadge").textContent = STATUS[p.status];
  $("#heroDay").textContent = active ? `Dia ${g+1} de ${p.days} · banca atual` : `Banca final · ${p.days} dias, odd planejada ${dec2.format(p.odd)}`;
  $("#heroMoney").textContent = money(active ? bank : p.finalBank);

  const facts = $("#facts"); facts.textContent = "";
  const add = (k, v) => { const d = el("div", {class:"fact"}); d.append(el("dt", null, k), el("dd", {class:"num"}, v)); facts.appendChild(d); };
  if(active){
    add("Aposta de hoje", money(bank));
    add(`Retorno com odd ${dec2.format(p.odd)}`, money(round2(bank * p.odd)));
    add("Lucro até agora", money(bank - p.initial));
    add("Chance de fechar o plano", chance(Math.pow(1/p.odd, p.days - g)));
  } else {
    add("Banca inicial", money(p.initial));
    add("Dias concluídos", `${g} de ${p.days}`);
    const odds = p.results.filter(e => e.r === "G" && e.odd).map(e => e.odd);
    add(odds.length ? "Odd média real" : "Odd planejada", dec2.format(odds.length ? odds.reduce((a,b) => a+b, 0) / odds.length : p.odd));
  }

  $("#actions").classList.toggle("hidden", !active);
  if(active){
    ["#btnGreen","#btnRed","#btnCashOut"].forEach(id => { $(id).dataset.day = String(g+1); $(id).disabled = busy; });
    $("#btnCash").disabled = busy;
  }

  const rb = $("#resultBox"); rb.textContent = "";
  if(!active){
    const box = el("div", {class:"result"});
    const profit = p.finalBank - p.initial;
    if(p.status === "falhou"){
      box.classList.add("lost");
      box.append(el("h3", null, "Mais sorte na próxima vez"), el("p", null, `Red no dia ${lostDay}. A banca simulada foi zerada.`));
    } else if(p.status === "concluido"){
      box.append(el("h3", null, "Parabéns! Desafio completo 🎉"), el("p", null, `Você chegou ao fim dos ${p.days} dias.`));
    } else if(p.status === "resgatado"){
      box.classList.add("cash");
      const msg = last && last.r === "C" ? `Cash out de ${money(last.ret)} no dia ${p.results.length}.` : (g ? `Você parou depois do dia ${g}.` : "Você parou antes da primeira aposta.");
      box.append(el("h3", null, "Parabéns! Lucro resgatado"), el("p", null, msg));
    } else {
      box.classList.add("cash");
      box.append(el("h3", null, "Desafio encerrado"), el("p", null, `Encerrado depois de ${g} dia(s).`));
    }
    const dl = el("dl");
    [["Banca inicial", money(p.initial)], ["Banca final", money(p.finalBank)], [p.status === "falhou" ? "Perda" : "Lucro realizado", money(profit)]]
      .forEach(([k,v]) => { const d = el("div"); d.append(el("dt", null, k), el("dd", {class:"num"}, v)); dl.appendChild(d); });
    box.appendChild(dl);
    rb.appendChild(box);
  }

  const dots = $("#dots"); dots.textContent = "";
  for(let d = 1; d <= p.days; d++){
    const e = p.results[d-1];
    let c = "";
    if(e) c = e.r === "G" ? "done" : e.r === "C" ? "cash" : "lost";
    else if(active && d === g+1) c = "now";
    dots.appendChild(el("i", {class:c, title:"Dia " + d}));
  }
  dots.setAttribute("aria-label", `${g} de ${p.days} dias concluídos`);
  $("#dotsNote").textContent = `${g} de ${p.days} dias concluídos` + (active ? ` · meta projetada ${money(rows[rows.length-1].bank)}` : "");

  const t = $("#schedTable"); t.textContent = "";
  const hr = el("tr");
  ["Dia #","Aposta","Odd","Retorno","Banca acumulada","Resultado"].forEach(h => hr.appendChild(el("th", {scope:"col"}, h)));
  const th = el("thead"); th.appendChild(hr);
  const tb = el("tbody"); const frag = document.createDocumentFragment();
  const KIND = {G:["done","Green"], C:["cash","Cash out"], R:["lost","Red"]};
  rows.forEach(r => {
    const real = KIND[r.kind];
    const tr = el("tr", {class: real ? real[0] : r.kind});
    const oddTd = el("td", null, r.kind === "C" || !r.odd ? "—" : dec2.format(r.odd));
    if(r.kind === "G" && Math.abs(r.odd - p.odd) > 1e-9){ oddTd.classList.add("odd-diff"); oddTd.title = `Planejada: ${dec2.format(p.odd)}`; }
    const resTd = real ? el("td", {class:"res-" + r.kind}, real[1]) : el("td", null, (r.kind === "now" ? "Hoje · " : "") + chance(r.p));
    tr.append(el("td", null, "Dia " + r.day), el("td", null, money(r.stake)), oddTd, el("td", null, money(r.ret)), el("td", null, money(r.bank)), resTd);
    frag.appendChild(tr);
  });
  if(!rows.length){ const tr = el("tr"); tr.appendChild(el("td", {colspan:"6"}, "Nenhum dia registrado.")); frag.appendChild(tr); }
  tb.appendChild(frag); t.append(th, tb);
  const now = t.querySelector("tr.now");
  if(now){ const box = t.parentElement; box.scrollTop = Math.max(0, now.offsetTop - box.clientHeight/2); }
}

function render(){
  const acc = account();
  $("#viewAuth").classList.toggle("hidden", !!acc);
  $("#viewApp").classList.toggle("hidden", !acc);
  if(!acc) return;
  $("#avatar").textContent = (acc.name || "?").trim().charAt(0).toUpperCase();
  const p = openId ? planById(openId) : null;
  if(view === "detail" && !p) view = "home";
  $("#viewHome").classList.toggle("hidden", view !== "home");
  $("#viewDetail").classList.toggle("hidden", view !== "detail");
  if(view === "home") renderHome(); else renderDetail(p);
}

/* ================= Eventos do detalhe ================= */
const toInput = v => v.toFixed(2).replace(".", ",");
function openDlg(d){ d.returnValue = "cancel"; if(typeof d.showModal === "function") d.showModal(); else d.setAttribute("open",""); }
function enterSubmits(inputs, btn){
  inputs.forEach(i => i.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); if(!btn.disabled) btn.click(); } }));
}

// Green: odd real e valor recebido editáveis
let gCtx = null;
function openGreen(day){
  const p = planById(openId); if(!p) return;
  const stake = bankOf(p);
  gCtx = {day, stake, retTouched:false};
  $("#gTitle").textContent = `Green no dia ${day}`;
  $("#gStake").value = money(stake);
  $("#gOdd").value = toInput(p.odd);
  $("#gRet").value = toInput(round2(stake * p.odd));
  $("#gErr").textContent = "";
  updateGreen();
  openDlg($("#greenDlg"));
  setTimeout(() => $("#gOdd").select(), 30);
}
function readGreen(){
  const odd = parseNum($("#gOdd").value), ret = parseNum($("#gRet").value);
  const errs = [];
  if(!isFinite(odd) || odd < 1.01 || odd > 1000) errs.push("Odd entre 1,01 e 1000.");
  if(!isFinite(ret) || ret < 0.01 || ret > 1e12) errs.push("Informe o valor recebido.");
  return {odd, ret: round2(ret), errs};
}
function updateGreen(){
  if(!gCtx) return;
  const odd = parseNum($("#gOdd").value);
  if(!gCtx.retTouched && isFinite(odd)) $("#gRet").value = toInput(round2(gCtx.stake * odd));
  const {ret, errs} = readGreen();
  $("#gErr").textContent = errs.join(" ");
  $("#gOk").disabled = errs.length > 0;
  $("#gHint").textContent = errs.length ? "" : `Lucro do dia: ${money(ret - gCtx.stake)} · nova banca: ${money(ret)}`;
}
$("#gOdd").addEventListener("input", updateGreen);
$("#gRet").addEventListener("input", () => { if(gCtx) gCtx.retTouched = true; updateGreen(); });
enterSubmits([$("#gOdd"), $("#gRet")], $("#gOk"));
$("#greenForm").addEventListener("submit", e => {
  if(!e.submitter || e.submitter.value !== "ok" || !gCtx) return;
  const {odd, ret, errs} = readGreen();
  if(errs.length){ e.preventDefault(); updateGreen(); return; }
  const ctx = gCtx; gCtx = null;
  if(registerEntry(openId, ctx.day, {r:"G", stake:ctx.stake, odd, ret})){
    const p = planById(openId);
    toast(p.status === "concluido" ? "Último dia registrado. Desafio completo!" : `Green no dia ${ctx.day}! Banca: ${money(ret)}`);
  }
});

// Cash out: valor resgatado manual
let cCtx = null;
function openCashOut(day){
  const p = planById(openId); if(!p) return;
  const stake = bankOf(p);
  cCtx = {day, stake};
  $("#cTitle").textContent = `Cash out no dia ${day}`;
  $("#cLead").textContent = `Informe quanto a casa pagou pelo cash out da aposta de ${money(stake)}.`;
  $("#cVal").value = "";
  document.querySelector('input[name="cAfter"][value="continue"]').checked = true;
  $("#cErr").textContent = "";
  $("#cOk").disabled = true;
  openDlg($("#cashDlg"));
  setTimeout(() => $("#cVal").focus(), 30);
}
function readCash(){
  const v = parseNum($("#cVal").value);
  return {v: round2(v), ok: isFinite(v) && v >= 0.01 && v <= 1e12};
}
$("#cVal").addEventListener("input", () => {
  const {v, ok} = readCash();
  $("#cOk").disabled = !ok;
  $("#cErr").textContent = ok || !$("#cVal").value.trim() ? "" : "Informe um valor a partir de R$ 0,01.";
  if(ok && cCtx) $("#cErr").textContent = "";
  if(ok && cCtx) $("#cLead").textContent = `Aposta de ${money(cCtx.stake)} · resultado do cash out: ${money(v - cCtx.stake)}.`;
});
enterSubmits([$("#cVal")], $("#cOk"));
$("#cashForm").addEventListener("submit", e => {
  if(!e.submitter || e.submitter.value !== "ok" || !cCtx) return;
  const {v, ok} = readCash();
  if(!ok){ e.preventDefault(); return; }
  const stop = document.querySelector('input[name="cAfter"]:checked').value === "stop";
  const ctx = cCtx; cCtx = null;
  if(registerEntry(openId, ctx.day, {r:"C", stake:ctx.stake, odd:null, ret:v}, {stop})){
    const p = planById(openId);
    toast(stop ? `Cash out de ${money(v)} resgatado.` : p.status === "concluido" ? "Último dia registrado. Desafio completo!" : `Cash out registrado. Nova banca: ${money(v)}`);
  }
});

$("#btnGreen").addEventListener("click", e => { if(!busy) openGreen(Number(e.currentTarget.dataset.day)); });
$("#btnCashOut").addEventListener("click", e => { if(!busy) openCashOut(Number(e.currentTarget.dataset.day)); });
$("#btnRed").addEventListener("click", async e => {
  if(busy || !openId) return;
  const day = Number(e.currentTarget.dataset.day);
  const ok = await confirmBox({title:`Registrar red no dia ${day}?`, body:"A banca simulada será zerada e o desafio marcado como falhado. Não dá para desfazer.", ok:"Registrar red", cls:"btn-loss"});
  if(!ok) return;
  const p = planById(openId); if(!p) return;
  registerEntry(openId, day, {r:"R", stake:bankOf(p), odd:p.odd, ret:0});
});
$("#btnCash").addEventListener("click", async () => {
  const p = planById(openId); if(!p || busy) return;
  const bank = bankOf(p);
  const ok = await confirmBox({title:"Parar e resgatar lucro?", body:`O desafio será encerrado com banca de ${money(bank)} (lucro de ${money(bank - p.initial)}).`, ok:"Resgatar lucro"});
  if(ok) cashOut(p.id);
});
$("#backBtn").addEventListener("click", () => { view = "home"; openId = null; render(); window.scrollTo({top:0}); });
$("#clearHist").addEventListener("click", async () => {
  const ok = await confirmBox({title:"Limpar histórico?", body:"Os desafios encerrados serão apagados. Os em andamento continuam.", ok:"Limpar", cls:"btn-loss"});
  if(!ok) return;
  account().plans = plans().filter(p => p.status === "ativo");
  commit();
});

/* ================= Salvamento ================= */
// Os dados ficam no localStorage do navegador.
function queueCloud(){}

migrateStore(store);
$("#year").textContent = new Date().getFullYear();
setAuthMode("login", !session);
render();
})();
