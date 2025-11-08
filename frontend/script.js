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
function openPanel(id){ ['#panel-kpi','#panel-insert','#panel-evaluate','#panel-admin','#panel-list','#panel-reports'].forEach(s=> hide(qs(s))); if(id) show(qs(id)); }
qs('#btn-open-insert').addEventListener('click', ()=> openPanel('#panel-insert'));
qs('#btn-open-evaluate').addEventListener('click', ()=> openPanel('#panel-evaluate'));
qs('#btn-open-admin').addEventListener('click', ()=> openPanel('#panel-admin'));
qs('#btn-open-list').addEventListener('click', ()=> openPanel('#panel-list'));
qs('#btn-open-reports').addEventListener('click', ()=> openPanel('#panel-reports'));
qs('#btn-open-kpi').addEventListener('click', ()=> openPanel('#panel-kpi'));

// KPIs & selects
async function refreshKPIs(){
  const res = await api('/employees/summary'); if(!res.ok) return;
  const k = await res.json();
  qs('#kpi-count').textContent = k.count;
  qs('#kpi-avg').textContent = (k.avgScore ?? '-').toString().slice(0,5);
  qs('#kpi-last').textContent = k.lastAction ?? '—';
}

let allEmployees = [];

async function fillSelects(){
  const res = await api('/employees');
  const rows = await res.json();
  allEmployees = rows;
  const sel1 = qs('#ev-emp'), sel2 = qs('#ad-emp');
  sel1.innerHTML=''; sel2.innerHTML='';
  rows.forEach(r=>{
    const o1=document.createElement('option'); o1.value=r.id; o1.textContent=`${r.nome} — ${r.cpf}`; sel1.appendChild(o1);
    const o2=document.createElement('option'); o2.value=r.id; o2.textContent=`${r.nome} — ${r.cpf}`; sel2.appendChild(o2);
  });
}

// Filtro de colaboradores na avaliação
qs('#ev-search').addEventListener('input', async function() {
  const q = this.value.trim();
  const sel = qs('#ev-emp');
  sel.innerHTML = '';
  if (!q) {
    // Se vazio, mostra todos
    allEmployees.forEach(r => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = `${r.nome} — ${r.cpf}`;
      sel.appendChild(o);
    });
    return;
  }
  // Busca no backend
  const res = await api('/employees/search?q=' + encodeURIComponent(q));
  if (!res.ok) return;
  const rows = await res.json();
  rows.forEach(r => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.nome} — ${r.cpf}`;
    sel.appendChild(o);
  });
});

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

// Gerar relatório em PDF do colaborador
qs('#btn-pdf').addEventListener('click', async () => {
  const id = Number(qs('#ed-id').value);
  if (!id) return;
  const nome = qs('#ed-nome').value;
  const cpf = qs('#ed-cpf').value;
  const posto = qs('#ed-posto').value;
  const admissao = qs('#ed-adm').value;

  // Busca registros administrativos
  const resAdmin = await api(`/adminrecords/employee/${id}`);
  const adminRecords = resAdmin.ok ? await resAdmin.json() : [];

  // Busca ocorrências (avaliações)
  const resEval = await api(`/evaluations/employee/${id}`);
  const evalRecords = resEval.ok ? await resEval.json() : [];

  // Monta o relatório
  let doc = new window.jspdf.jsPDF();
  doc.setFontSize(18);
  doc.text('Gestão de Funcionários', 105, 20, {align: 'center'});
  doc.setFontSize(14);
  doc.text(`Colaborador: ${nome}`, 20, 35);
  doc.text(`CPF: ${cpf}`, 20, 45);
  doc.text(`Posto: ${posto}`, 20, 55);
  doc.text(`Admissão: ${admissao}`, 20, 65);

  let y = 80;
  doc.setFontSize(16);
  doc.text('Registros Administrativos:', 20, y);
  y += 10;
  doc.setFontSize(12);
  if (adminRecords.length === 0) {
    doc.text('Nenhum registro administrativo.', 20, y);
    y += 10;
  } else {
    adminRecords.forEach(r => {
      doc.text(`${r.tipo} - ${r.descricao} (${new Date(r.createdAt).toLocaleDateString('pt-BR')})`, 20, y);
      y += 8;
    });
  }
  y += 10;
  doc.setFontSize(16);
  doc.text('Ocorrências:', 20, y);
  y += 10;
  doc.setFontSize(12);
  if (evalRecords.length === 0) {
    doc.text('Nenhuma ocorrência.', 20, y);
  } else {
    evalRecords.forEach(r => {
      doc.text(`${r.tipo} - ${r.descricao} (${r.pontos} pts, ${new Date(r.createdAt).toLocaleDateString('pt-BR')})`, 20, y);
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
    });
  }
  doc.save(`relatorio_${nome.replace(/\s/g,'_')}.pdf`);
});

// Novos códigos para relatório PDF por colaborador
let allEmployeesPDF = [];

async function fillPdfSelect() {
  const res = await api('/employees');
  const rows = await res.json();
  allEmployeesPDF = rows;
  const sel = qs('#pdf-emp');
  sel.innerHTML = '';
  rows.forEach(r => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.nome} — ${r.cpf}`;
    sel.appendChild(o);
  });
}

let selectedEmployeePDF = null;

qs('#pdf-search').addEventListener('input', async function() {
  const q = this.value.trim();
  const resultDiv = qs('#pdf-result');
  selectedEmployeePDF = null;
  resultDiv.innerHTML = '';
  if (!q) return;
  const res = await api('/employees/search?q=' + encodeURIComponent(q));
  if (!res.ok) return;
  const rows = await res.json();
  if (rows.length === 0) {
    resultDiv.textContent = 'Nenhum colaborador encontrado.';
    return;
  }
  // Mostra o primeiro resultado
  const r = rows[0];
  resultDiv.innerHTML = `<div style='cursor:pointer; padding:10px; border-radius:8px; background:#222; color:#fff;' id='pdf-result-item'>
    <b>${r.nome}</b><br>CPF: ${r.cpf}<br>Posto: ${r.posto || '-'}<br>Admissão: ${r.admissao ? r.admissao.split('T')[0] : '-'}
  </div>`;
  // Seleciona ao clicar
  document.getElementById('pdf-result-item').onclick = () => {
    selectedEmployeePDF = r;
    resultDiv.innerHTML = `<div style='padding:10px; border-radius:8px; background:#2563eb; color:#fff;'>
      <b>${r.nome}</b><br>CPF: ${r.cpf}<br>Posto: ${r.posto || '-'}<br>Admissão: ${r.admissao ? r.admissao.split('T')[0] : '-'}<br><span style='font-size:12px;'>Selecionado!</span>
    </div>`;
  };
});

async function getLogoBase64() {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = 'img/logo.png';
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = function() { resolve(null); };
  });
}

qs('#btn-pdf-report').addEventListener('click', async () => {
  const r = selectedEmployeePDF;
  if (!r) { alert('Selecione um colaborador!'); return; }
  const id = r.id;
  const nome = r.nome;
  const cpf = r.cpf;
  const posto = r.posto;
  const admissao = r.admissao ? r.admissao.split('T')[0] : '';

  // Busca registros administrativos
  const resAdmin = await api(`/adminrecords/employee/${id}`);
  const adminRecords = resAdmin.ok ? await resAdmin.json() : [];

  // Busca ocorrências (avaliações)
  const resEval = await api(`/evaluations/employee/${id}`);
  const evalRecords = resEval.ok ? await resEval.json() : [];

  // Carrega logo
  const logoBase64 = await getLogoBase64();

  let doc = new window.jspdf.jsPDF();
  // Título com logo
  doc.setFontSize(20);
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 170, 7, 22, 18);
  }
  // Centraliza o título manualmente
  doc.text('Gestão de Funcionários', 105, 20, {align: 'center'});
  doc.setFontSize(14);
  doc.text(`Relatório Geral do Colaborador`, 105, 30, {align: 'center'});
  doc.setLineWidth(0.5);
  doc.line(20, 35, 190, 35);

  // Dados do colaborador
  doc.setFontSize(13);
  // Data admissão formatada
  let admFormat = '-';
  if (admissao) {
    const d = new Date(admissao);
    admFormat = d.toLocaleDateString('pt-BR');
  }
  doc.text(`Nome: ${nome}`, 20, 45);
  doc.text(`CPF: ${cpf}`, 20, 53);
  doc.text(`Posto: ${posto}`, 20, 61);
  doc.text(`Admissão: ${admFormat}`, 20, 69);

  let y = 80;
  doc.setFontSize(15);
  doc.text('Registros Administrativos:', 20, y);
  y += 8;
  doc.setFontSize(11);
  if (adminRecords.length === 0) {
    doc.text('Nenhum registro administrativo.', 20, y);
    y += 8;
  } else {
    adminRecords.forEach(r => {
      doc.text(`• ${r.tipo} - ${r.descricao} (${new Date(r.createdAt).toLocaleDateString('pt-BR')})`, 22, y);
      y += 7;
      if (y > 270) { doc.addPage(); y = 20; }
    });
  }
  y += 10;
  doc.setFontSize(15);
  doc.text('Ocorrências:', 20, y);
  y += 8;
  doc.setFontSize(11);
  if (evalRecords.length === 0) {
    doc.text('Nenhuma ocorrência.', 20, y);
  } else {
    let totalScore = 1000;
    evalRecords.forEach(r => {
      const data = new Date(r.createdAt).toLocaleDateString('pt-BR');
      const tipo = r.tipo;
      const pontos = r.pontos;
      const motivo = r.descricao;
      totalScore += pontos;
      doc.text(`• ${data} — ${tipo} — ${pontos} pts — ${motivo}`, 22, y);
      y += 7;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    y += 15;
    doc.setFontSize(14);
    doc.text(`Score total do colaborador: ${totalScore}`, 22, y);
  }
  // Salva e baixa o PDF
  doc.save(`relatorio_${nome.replace(/\s/g,'_')}.pdf`);
});

// Inicializa select PDF ao abrir painel de relatórios
qs('#btn-open-reports').addEventListener('click', async () => {
  const res = await api('/employees');
  const rows = await res.json();
  allEmployeesPDF = rows;
});

async function loadAll(){
  await Promise.all([refreshKPIs(), fillSelects(), searchEmployees('')]);
}

(async function init(){
  if(token){
    hide(qs('#view-login'));
    show(qs('#view-app'));
    await loadAll();
    openPanel('#panel-kpi'); // Inicia com a tela de Início/KPIs
  }
})();
