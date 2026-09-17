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
const greens = p => p.results.filter(r => r === "G").length;
function bankOf(p, rows){
  if(p.status === "falhou") return 0;
  const g = greens(p); return g === 0 ? p.initial : (rows || rowsOf(p))[g-1].bank;
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
function registerResult(planId, dayNumber, result){
  const p = planById(planId);
  if(!p || p.status !== "ativo"){ toast("Este desafio não está em andamento."); return false; }
  const expected = p.results.length + 1;
  if(dayNumber < expected){ toast(`O dia ${dayNumber} já foi registrado.`); return false; }
  if(dayNumber > expected){ toast(`Registre o dia ${expected} antes do dia ${dayNumber}.`); return false; }
  if(dayNumber > p.days){ toast("Todos os dias já foram registrados."); return false; }
  const rows = rowsOf(p);
  p.results.push(result);
  if(result === "R"){ p.status = "falhou"; p.finalBank = 0; p.endedAt = Date.now(); }
  else if(p.results.length === p.days){ p.status = "concluido"; p.finalBank = rows[p.days-1].bank; p.endedAt = Date.now(); }
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

  // Seus desafios
  const mine = $("#mine"); mine.textContent = "";
  $("#mineCount").textContent = active.length ? `${active.length} em andamento` : "";
  if(!active.length){
    mine.appendChild(el("div", {class:"empty"}, "Nenhum desafio em andamento. Escolha um card abaixo para começar."));
  }
  active.sort((a,b) => b.createdAt - a.createdAt).forEach(p => {
    const g = greens(p), rows = rowsOf(p);
    const card = el("button", {class:"plan-card c-" + p.color, type:"button", "aria-label": `Abrir desafio ${p.name}`});
    const r1 = el("div", {class:"row"});
    r1.appendChild(el("span", {class:"chip"}, p.name));
    r1.appendChild(el("span", {class:"day-pill"}, `Dia ${g+1} de ${p.days}`));
    const bk = el("div", {class:"bank"});
    bk.appendChild(el("small", null, "Banca atual"));
    bk.appendChild(el("strong", {class:"num"}, money(bankOf(p, rows))));
    const bar = el("div", {class:"bar"}); const fill = el("i"); fill.style.width = (g / p.days * 100) + "%"; bar.appendChild(fill);
    const foot = el("div", {class:"foot"});
    foot.appendChild(el("span", null, `Hoje: aposte ${money(rows[g].stake)}`));
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
    ["Desafio","Encerrado em","Greens","Odd","Resultado","Banca final","Lucro"].forEach(h => hr.appendChild(el("th", {scope:"col"}, h)));
    const th = el("thead"); th.appendChild(hr);
    const tb = el("tbody");
    ended.sort((a,b) => (b.endedAt||0) - (a.endedAt||0)).forEach(p => {
      const tr = el("tr");
      const c = el("td"); const chip = el("button", {class:"chip link c-" + p.color, type:"button", style:"text-decoration:none"}, p.name);
      chip.addEventListener("click", () => { openId = p.id; view = "detail"; render(); window.scrollTo({top:0}); });
      c.appendChild(chip); tr.appendChild(c);
      tr.appendChild(el("td", null, dateFmt(p.endedAt || p.createdAt)));
      tr.appendChild(el("td", {class:"num"}, `${greens(p)}/${p.days}`));
      tr.appendChild(el("td", {class:"num"}, dec2.format(p.odd)));
      tr.appendChild(el("td", {class:"st-" + p.status}, STATUS[p.status]));
      tr.appendChild(el("td", {class:"num"}, money(p.finalBank)));
      tr.appendChild(el("td", {class:"num"}, money(p.finalBank - p.initial)));
      tb.appendChild(tr);
    });
    t.append(th, tb);
  }
}

function renderDetail(p){
  const rows = rowsOf(p), g = greens(p), bank = bankOf(p, rows);
  const active = p.status === "ativo";
  const lostDay = p.status === "falhou" ? p.results.length : 0;
  const color = "c-" + p.color;
  $("#viewDetail").className = color;

  $("#heroGiant").textContent = active ? String(g+1) : p.giant;
  $("#heroName").textContent = p.name;
  $("#heroBadge").textContent = STATUS[p.status];
  $("#heroDay").textContent = active ? `Dia ${g+1} de ${p.days} · banca atual` : `Banca final · ${p.days} dias, odd ${dec2.format(p.odd)}`;
  $("#heroMoney").textContent = money(active ? bank : p.finalBank);

  const facts = $("#facts"); facts.textContent = "";
  const add = (k, v) => { const d = el("div", {class:"fact"}); d.append(el("dt", null, k), el("dd", {class:"num"}, v)); facts.appendChild(d); };
  if(active){
    add("Aposta de hoje", money(rows[g].stake));
    add("Retorno se der green", money(rows[g].ret));
    add("Lucro até agora", money(bank - p.initial));
    add("Chance de fechar o plano", chance(Math.pow(1/p.odd, p.days - g)));
  } else {
    add("Banca inicial", money(p.initial));
    add("Greens", `${g} de ${p.days}`);
    add("Odd fixa", dec2.format(p.odd));
  }

  $("#actions").classList.toggle("hidden", !active);
  if(active){
    $("#btnGreen").dataset.day = $("#btnRed").dataset.day = String(g+1);
    $("#btnGreen").disabled = $("#btnRed").disabled = $("#btnCash").disabled = busy;
  }

  const rb = $("#resultBox"); rb.textContent = "";
  if(!active){
    const box = el("div", {class:"result"});
    const profit = p.finalBank - p.initial;
    if(p.status === "falhou"){
      box.classList.add("lost");
      box.append(el("h3", null, "Mais sorte na próxima vez"), el("p", null, `Red no dia ${lostDay}. A banca simulada foi zerada.`));
    } else if(p.status === "concluido"){
      box.append(el("h3", null, "Parabéns! Desafio completo 🎉"), el("p", null, `Green em todos os ${p.days} dias.`));
    } else if(p.status === "resgatado"){
      box.classList.add("cash");
      box.append(el("h3", null, "Parabéns! Lucro resgatado"), el("p", null, g ? `Você parou depois do dia ${g}.` : "Você parou antes da primeira aposta."));
    } else {
      box.classList.add("cash");
      box.append(el("h3", null, "Desafio encerrado"), el("p", null, `Encerrado depois de ${g} green(s).`));
    }
    const dl = el("dl");
    [["Banca inicial", money(p.initial)], ["Banca final", money(p.finalBank)], [p.status === "falhou" ? "Perda" : "Lucro realizado", money(profit)]]
      .forEach(([k,v]) => { const d = el("div"); d.append(el("dt", null, k), el("dd", {class:"num"}, v)); dl.appendChild(d); });
    box.appendChild(dl);
    rb.appendChild(box);
  }

  const dots = $("#dots"); dots.textContent = "";
  for(let d = 1; d <= p.days; d++){
    let c = "";
    if(d <= g) c = "done"; else if(d === lostDay) c = "lost"; else if(active && d === g+1) c = "now";
    dots.appendChild(el("i", {class:c, title:"Dia " + d}));
  }
  dots.setAttribute("aria-label", `${g} de ${p.days} dias com green`);
  $("#dotsNote").textContent = `${g} de ${p.days} dias com green · meta final ${money(rows[rows.length-1].bank)}`;

  const t = $("#schedTable"); t.textContent = "";
  const hr = el("tr");
  ["Dia #","Valor da aposta","Retorno potencial","Banca acumulada","Chance"].forEach(h => hr.appendChild(el("th", {scope:"col"}, h)));
  const th = el("thead"); th.appendChild(hr);
  const tb = el("tbody"); const frag = document.createDocumentFragment();
  rows.forEach(r => {
    let c = "after";
    if(r.day <= g) c = "done"; else if(r.day === lostDay) c = "lost"; else if(active && r.day === g+1) c = "now";
    const tr = el("tr", {class:c});
    tr.append(el("td", null, "Dia " + r.day), el("td", null, money(r.stake)), el("td", null, money(r.ret)), el("td", null, money(r.bank)), el("td", null, chance(r.p)));
    frag.appendChild(tr);
  });
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
async function onResult(result, btn){
  if(busy || !openId) return;
  const day = Number(btn.dataset.day);
  if(result === "R"){
    const ok = await confirmBox({title:`Registrar red no dia ${day}?`, body:"A banca simulada será zerada e o desafio marcado como falhado. Não dá para desfazer.", ok:"Registrar red", cls:"btn-loss"});
    if(!ok) return;
  }
  busy = true; render();
  try{
    if(registerResult(openId, day, result) && result === "G"){
      const p = planById(openId);
      toast(p.status === "concluido" ? "Último dia registrado. Desafio completo!" : `Green no dia ${day}! Banca: ${money(bankOf(p))}`);
    }
  } finally { busy = false; render(); }
}
$("#btnGreen").addEventListener("click", e => onResult("G", e.currentTarget));
$("#btnRed").addEventListener("click", e => onResult("R", e.currentTarget));
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

$("#year").textContent = new Date().getFullYear();
setAuthMode("login", !session);
render();
})();
