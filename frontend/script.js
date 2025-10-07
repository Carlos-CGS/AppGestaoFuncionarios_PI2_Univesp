const API_BASE = "http://localhost:5080/api";
let token = localStorage.getItem('jwt');

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

function authH(){ return token ? { 'Authorization': 'Bearer ' + token } : {}; }

async function api(path, opts = {}) {
  const headers = Object.assign({'Content-Type':'application/json'}, authH(), opts.headers || {});
  try {
    const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
    if (res.status === 401) {
      alert('Sessão expirada. Faça login novamente.');
      localStorage.removeItem('jwt');
      location.reload();
      return res; // não vai chegar aqui, mas ok.
    }
    return res;
  } catch (e) {
    console.error('NETWORK/JS ERROR on', path, e);
    throw e; // deixa o caller cair no catch e mostrar "Erro de rede/JS ao salvar."
  }
}


// Login
qs('#btn-login').addEventListener('click', async ()=>{
  const email = qs('#email').value.trim();
  const password = qs('#password').value.trim();
  const msg = qs('#login-msg');
  msg.textContent = 'Entrando...';
  const res = await api('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) , headers: {'Content-Type':'application/json'} });
  if(!res.ok){ msg.textContent = 'Credenciais inválidas.'; return; }
  const data = await res.json();
  token = data.token; localStorage.setItem('jwt', token);
  hide(qs('#view-login')); show(qs('#view-app'));
  await loadAll();
});

qs('#btn-logout').addEventListener('click', ()=>{ localStorage.removeItem('jwt'); location.reload(); });

// Nav
function openPanel(id){ ['#panel-insert','#panel-evaluate','#panel-admin','#panel-list','#panel-reports'].forEach(s=> hide(qs(s))); if(id) show(qs(id)); }
qs('#btn-open-insert').addEventListener('click', ()=> openPanel('#panel-insert'));
qs('#btn-open-evaluate').addEventListener('click', ()=> openPanel('#panel-evaluate'));
qs('#btn-open-admin').addEventListener('click', ()=> openPanel('#panel-admin'));
qs('#btn-open-list').addEventListener('click', ()=> openPanel('#panel-list'));
qs('#btn-open-reports').addEventListener('click', ()=> openPanel('#panel-reports'));

// KPIs & selects
async function refreshKPIs(){
  const res = await api('/employees/summary'); if(!res.ok) return;
  const k = await res.json();
  qs('#kpi-count').textContent = k.count;
  qs('#kpi-avg').textContent = (k.avgScore ?? '-').toString().slice(0,5);
  qs('#kpi-last').textContent = k.lastAction ?? '—';
}

async function fillSelects(){
  const res = await api('/employees');
  const rows = await res.json();
  const sel1 = qs('#ev-emp'), sel2 = qs('#ad-emp');
  sel1.innerHTML=''; sel2.innerHTML='';
  rows.forEach(r=>{
    const o1=document.createElement('option'); o1.value=r.id; o1.textContent=`${r.nome} — ${r.cpf}`; sel1.appendChild(o1);
    const o2=document.createElement('option'); o2.value=r.id; o2.textContent=`${r.nome} — ${r.cpf}`; sel2.appendChild(o2);
  });
}

// Inserir colaborador
qs('#btn-insert').addEventListener('click', async ()=>{
  const nome = qs('#in-nome').value.trim();
  const cpf = qs('#in-cpf').value.trim().replace(/\D/g, '');
  const posto = qs('#in-posto').value.trim();
  const admissao = qs('#in-adm').value || null;
  const score = Number(qs('#in-score').value || 1000);
  const msg = qs('#insert-msg');
  msg.textContent = 'Salvando...';

  try {
    const res = await api('/employees', {
      method: 'POST',
      body: JSON.stringify({ nome, cpf, posto, admissao, score })
    });

    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      console.error('API /employees error', res.status, text);
      msg.textContent = `Falha ao salvar: ${text || ('HTTP '+res.status)}`;
      return;
    }

    msg.textContent = 'Colaborador cadastrado!';
    await Promise.all([refreshKPIs(), fillSelects(), searchEmployees('')]);
  } catch (e) {
    // cai aqui só em erro de REDE/JS (fetch rejeitado, CORS duro, etc)
    msg.textContent = 'Erro de rede/JS ao salvar (veja o console).';
  }
});


// Avaliar
const POINTS = { falta:-10, atestado:-1, advertencia:-5, suspensao:-30, atraso:-1, elogio:+5, bonificacao:+10, extra:+1 };
qs('#btn-ev-save').addEventListener('click', async ()=>{
  const employeeId = Number(qs('#ev-emp').value);
  const tipo = qs('#ev-type').value;
  const descricao = qs('#ev-desc').value.trim();
  const res = await api('/evaluations', { method:'POST', body: JSON.stringify({ employeeId, tipo, descricao }) });
  const msg = qs('#ev-msg');
  if(!res.ok){ msg.textContent = 'Falha ao lançar.'; return; }
  msg.textContent = `Lançado: ${tipo} (${POINTS[tipo]>0?'+':''}${POINTS[tipo]}).`;
  qs('#ev-desc').value='';
  await refreshKPIs();
  await searchEmployees(qs('#search').value);
});

// Administrativo
qs('#btn-ad-save').addEventListener('click', async ()=>{
  const employeeId = Number(qs('#ad-emp').value);
  const tipo = qs('#ad-type').value;
  const descricao = qs('#ad-desc').value.trim();
  const res = await api('/adminrecords', { method:'POST', body: JSON.stringify({ employeeId, tipo, descricao }) });
  const msg = qs('#ad-msg');
  if(!res.ok){ msg.textContent='Falha ao salvar.'; return; }
  msg.textContent='Registro salvo.'; qs('#ad-desc').value='';
});

// Lista/Edição
qs('#btn-search').addEventListener('click', ()=> searchEmployees(qs('#search').value));
async function searchEmployees(q){
  const res = await api('/employees/search?q=' + encodeURIComponent(q||''));
  const rows = await res.json();
  const tb = qs('#table-emps tbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.nome}</td><td>${r.cpf}</td><td>${r.posto||'-'}</td><td>${r.admissao? new Date(r.admissao).toLocaleDateString('pt-BR'):''}</td><td><b>${r.score}</b></td>
    <td><button class="btn" data-id="${r.id}">Editar</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=> openEdit(b.dataset.id)));
}

async function openEdit(id){
  const res = await api('/employees/' + id);
  if(!res.ok) return;
  const e = await res.json();
  qs('#ed-id').value = e.id;
  qs('#ed-nome').value = e.nome;
  qs('#ed-cpf').value = e.cpf;
  qs('#ed-posto').value = e.posto || '';
  qs('#ed-adm').value = e.admissao ? e.admissao.split('T')[0] : '';
  openPanel('#panel-list');
}

qs('#btn-save-edit').addEventListener('click', async ()=>{
  const id = Number(qs('#ed-id').value);
  const nome = qs('#ed-nome').value.trim();
  const cpf = qs('#ed-cpf').value.trim();
  const posto = qs('#ed-posto').value.trim();
  const admissao = qs('#ed-adm').value;
  const msg = qs('#edit-msg');
  const res = await api('/employees/' + id, { method:'PUT', body: JSON.stringify({ nome, cpf, posto, admissao }) });
  if(!res.ok){ msg.textContent = 'Falha ao salvar (verifique o CPF).'; return; }
  msg.textContent = 'Alterações salvas!';
  await searchEmployees(qs('#search').value);
  await refreshKPIs();
});

// Excluir colaborador
qs('#btn-delete').addEventListener('click', async ()=>{
  const id = Number(qs('#ed-id').value);
  if(!id) return;
  if(!confirm('Tem certeza que deseja excluir este colaborador? Esta ação não pode ser desfeita.')) return;
  const msg = qs('#edit-msg');
  msg.textContent = 'Excluindo...';
  const res = await api('/employees/' + id, { method:'DELETE' });
  if(!res.ok){ msg.textContent = 'Falha ao excluir colaborador.'; return; }
  msg.textContent = 'Colaborador excluído!';
  // Limpa campos de edição
  qs('#ed-id').value = '';
  qs('#ed-nome').value = '';
  qs('#ed-cpf').value = '';
  qs('#ed-posto').value = '';
  qs('#ed-adm').value = '';
  await searchEmployees(qs('#search').value);
  await refreshKPIs();
});

// Relatórios
qs('#btn-run-report').addEventListener('click', async ()=>{
  const start = qs('#rp-start').value;
  const end = qs('#rp-end').value;
  const posto = qs('#rp-posto').value.trim();
  const tipo = qs('#rp-tipo').value.trim();
  const url = `/reports/evaluations?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&posto=${encodeURIComponent(posto)}&tipo=${encodeURIComponent(tipo)}`;
  const res = await api(url);
  if(!res.ok){ alert('Falha ao gerar relatório'); return; }
  const data = await res.json();
  const tbody = qs('#rp-table tbody'); tbody.innerHTML='';
  data.items.forEach(x=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(x.data).toLocaleString('pt-BR')}</td><td>${x.colaborador}</td><td>${x.cpf}</td><td>${x.posto||'-'}</td><td>${x.tipo}</td><td>${x.pontos}</td><td>${x.descricao||''}</td>`;
    tbody.appendChild(tr);
  });
  qs('#rp-summary').innerHTML = `<p><b>Registros:</b> ${data.totalRegistros} — <b>Soma de pontos:</b> ${data.somaPontos} — <b>Por tipo:</b> ${Object.entries(data.porTipo).map(([k,v])=>k+': '+v).join(' | ')}</p>`;
});

async function loadAll(){
  await Promise.all([refreshKPIs(), fillSelects(), searchEmployees('')]);
}

(async function init(){
  if(token){ hide(qs('#view-login')); show(qs('#view-app')); await loadAll(); }
})();
