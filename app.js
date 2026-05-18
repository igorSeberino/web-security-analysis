/* =============================================================================
   Sistema de Ocorrências Acadêmicas — versão endurecida (AP01)
   -----------------------------------------------------------------------------
   Esta é a versão FINAL da entrega. Mantém a estrutura de controles introduzida
   na entrega parcial (PERMISSIONS, hasPermission, escapeHTML, sanitizeInput,
   timeout de sessão, mascaramento de PII, validações, restrição de exportação
   e changeRole) e adiciona as correções necessárias para tornar o sistema
   minimamente seguro a ponto de ser utilizado:

     - senhas armazenadas como SHA-256 (Web Crypto API), nunca em texto puro;
     - remoção do FAKE_API_TOKEN exposto;
     - sessão no localStorage NÃO contém senha nem hash;
     - throttling de tentativas de login (proteção básica contra brute-force);
     - eliminação de onclick inline (mitiga XSS residual na renderização);
     - busca filtrada (não percorre CPF, telefone, e-mail ou observação interna);
     - logs com retenção limitada e payload truncado;
     - exportação respeita o perfil (ADMIN exporta ocorrências e logs;
       PROFESSOR exporta apenas ocorrências; ALUNO não exporta).

   IMPORTANTE: tudo isto continua sendo front-end. Um usuário com DevTools
   pode inspecionar e alterar o código. Em produção seria indispensável back-end
   real (ver seção "Limitações" do relatório técnico).
   ============================================================================= */

'use strict';

/* ---------------------------------------------------------------------------
   Constantes e configurações
--------------------------------------------------------------------------- */

// Hashes SHA-256 das senhas. Em produção: bcrypt/Argon2 + salt único + back-end.
const USERS = [
  {
    id: 1,
    name: "Ana Souza",
    email: "aluno@faculdade.local",
    // SHA-256("Aluno@2026")
    passwordHash: "62d1cc9bf2bbd4a9270b754bff21fe9f44c7b255f938a6630689102666f3aa19",
    role: "ALUNO",
    studentId: "202400001"
  },
  {
    id: 2,
    name: "Prof. Carlos Lima",
    email: "professor@faculdade.local",
    // SHA-256("Prof@2026")
    passwordHash: "bfa92de5fc8010d3f721f6288eb969fa63244da77d358f53d31ca3c861a5a68d",
    role: "PROFESSOR",
    classes: ["5A", "5B"]
  },
  {
    id: 3,
    name: "Administrador Geral",
    email: "admin@faculdade.local",
    // SHA-256("Admin@2026")
    passwordHash: "a36aef5a11c4073fbe60314fc9df530a9d5f986533594d1f5190742ff9e0e408",
    role: "ADMIN"
  }
];

const STORAGE_KEYS = {
  session: "ocorrencias_sessao",
  occurrences: "ocorrencias_registros",
  audit: "ocorrencias_logs",
  loginThrottle: "ocorrencias_login_tentativas"
};

const SESSION_TIMEOUT_MS = 10 * 60 * 1000;    // 10 minutos
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 5 * 60 * 1000;          // 5 minutos
const MAX_LOG_ENTRIES = 500;
const LOG_DETAIL_MAX_CHARS = 240;

// Mapa de permissões por perfil.
const PERMISSIONS = {
  ALUNO: {
    create: true, view: true, changeStatus: false, delete: false,
    export: false, reset: false, clearLogs: false, changeRole: false,
    revealSensitive: false, seeInternalNote: false, seeAllOccurrences: false
  },
  PROFESSOR: {
    create: true, view: true, changeStatus: true, delete: false,
    export: true, reset: false, clearLogs: false, changeRole: false,
    revealSensitive: false, seeInternalNote: true, seeAllOccurrences: true
  },
  ADMIN: {
    create: true, view: true, changeStatus: true, delete: true,
    export: true, reset: true, clearLogs: true, changeRole: true,
    revealSensitive: true, seeInternalNote: true, seeAllOccurrences: true
  }
};

// CPFs/contatos abaixo são notoriamente fictícios.
const INITIAL_OCCURRENCES = [
  {
    id: "OC-1001",
    studentName: "Marina Alves",
    studentId: "202300145",
    studentCpf: "000.000.000-01",
    studentEmail: "marina.alves@exemplo.local",
    studentPhone: "(47) 90000-1010",
    category: "Nota",
    priority: "Média",
    description: "Solicitação de revisão de nota da avaliação bimestral.",
    internalNote: "Verificar com a coordenação antes de responder.",
    status: "Aberta",
    createdBy: "professor@faculdade.local",
    createdAt: "2026-05-05T18:40:00.000Z"
  },
  {
    id: "OC-1002",
    studentName: "Rafael Martins",
    studentId: "202200771",
    studentCpf: "000.000.000-02",
    studentEmail: "rafael.martins@exemplo.local",
    studentPhone: "(47) 90000-2020",
    category: "Frequência",
    priority: "Alta",
    description: "Aluno contesta lançamento de falta em aula prática.",
    internalNote: "Conferir chamada manual.",
    status: "Em análise",
    createdBy: "professor@faculdade.local",
    createdAt: "2026-05-05T18:50:00.000Z"
  },
  {
    id: "OC-1003",
    studentName: "Beatriz Costa",
    studentId: "202100441",
    studentCpf: "000.000.000-03",
    studentEmail: "beatriz.costa@exemplo.local",
    studentPhone: "(47) 90000-3030",
    category: "Solicitação administrativa",
    priority: "Crítica",
    description: "Solicitação envolvendo documentação acadêmica e prazo de matrícula.",
    internalNote: "Priorizar atendimento.",
    status: "Aberta",
    createdBy: "admin@faculdade.local",
    createdAt: "2026-05-05T19:00:00.000Z"
  }
];

/* ---------------------------------------------------------------------------
   Referências de DOM
--------------------------------------------------------------------------- */

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const occurrenceForm = document.querySelector("#occurrenceForm");
const logoutBtn = document.querySelector("#logoutBtn");
const exportBtn = document.querySelector("#exportBtn");
const clearLogsBtn = document.querySelector("#clearLogsBtn");
const resetBtn = document.querySelector("#resetBtn");
const searchInput = document.querySelector("#search");
const roleSelect = document.querySelector("#roleSelect");
const roleSwitchWrap = document.querySelector("#roleSwitchWrap");
const messageBox = document.querySelector("#message");
const sessionBadge = document.querySelector("#sessionBadge");
const currentUserName = document.querySelector("#currentUserName");
const currentUserDetails = document.querySelector("#currentUserDetails");
const occurrencesTable = document.querySelector("#occurrencesTable");
const auditLog = document.querySelector("#auditLog");
const totalOccurrences = document.querySelector("#totalOccurrences");
const criticalOccurrences = document.querySelector("#criticalOccurrences");
const lastUpdate = document.querySelector("#lastUpdate");
const adminFields = document.querySelector("#adminFields");
const categorySelect = document.querySelector("#category");
const formError = document.querySelector("#formError");

let sessionTimer = null;
let activityEventsBound = false;

/* ---------------------------------------------------------------------------
   Helpers de segurança
--------------------------------------------------------------------------- */

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function sanitizeInput(str) {
  if (str === null || str === undefined) return "";
  // Remove caracteres de controle e tags HTML.
  return String(str)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

async function sha256Hex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------------------------------
   Mascaramento de PII
--------------------------------------------------------------------------- */

function maskCPF(cpf) {
  if (!cpf) return "";
  const digits = cpf.replace(/\D/g, '');
  if (digits.length < 6) return "***";
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

function maskPhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return "***";
  return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
}

function maskEmail(email) {
  if (!email) return "";
  const parts = email.split('@');
  if (parts.length !== 2) return "***";
  const name = parts[0];
  const domain = parts[1];
  const visible = name.length > 0 ? name[0] : '*';
  return `${visible}***@${domain}`;
}

/* ---------------------------------------------------------------------------
   Permissões
--------------------------------------------------------------------------- */

function hasPermission(action) {
  const session = getSession();
  const role = session ? session.role : null;
  if (!role || !PERMISSIONS[role]) return false;
  return !!PERMISSIONS[role][action];
}

function requirePermission(action, detail) {
  if (!hasPermission(action)) {
    showMessage('Acesso negado: você não tem permissão para esta ação.', 'error');
    writeLog('ACESSO_NEGADO', `${action} — ${detail || 'sem detalhe'}`);
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------------------
   Feedback ao usuário
--------------------------------------------------------------------------- */

function showMessage(text, type = 'info', timeout = 4500) {
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.classList.remove('hidden', 'notice-success', 'notice-error');
  if (type === 'success') messageBox.classList.add('notice-success');
  else if (type === 'error') messageBox.classList.add('notice-error');
  clearTimeout(messageBox._timeout);
  messageBox._timeout = setTimeout(() => messageBox.classList.add('hidden'), timeout);
}

function showFormError(text) {
  if (!formError) return;
  formError.textContent = text;
  formError.classList.remove('hidden');
}

function clearFormError() {
  if (!formError) return;
  formError.textContent = "";
  formError.classList.add('hidden');
}

/* ---------------------------------------------------------------------------
   Timeout de sessão
--------------------------------------------------------------------------- */

function bindActivityListeners() {
  if (activityEventsBound) return;
  const resetTimer = () => {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
      const s = getSession();
      if (s) writeLog('SESSAO_EXPIRADA', `Sessão de ${s.email} expirou por inatividade.`);
      localStorage.removeItem(STORAGE_KEYS.session);
      showLogin();
      showMessage('Sessão expirada por inatividade.', 'error');
    }, SESSION_TIMEOUT_MS);
  };
  ['click', 'mousemove', 'keydown', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, resetTimer, { passive: true });
  });
  resetTimer();
  activityEventsBound = true;
}

function clearSessionTimer() {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
}

/* ---------------------------------------------------------------------------
   Persistência (localStorage)
--------------------------------------------------------------------------- */

function getOccurrences() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.occurrences) || "[]"); }
  catch { return []; }
}
function saveOccurrences(list) {
  localStorage.setItem(STORAGE_KEYS.occurrences, JSON.stringify(list));
}
function getAuditLogs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.audit) || "[]"); }
  catch { return []; }
}
function saveAuditLogs(list) {
  localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify(list));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null"); }
  catch { return null; }
}
function saveSession(user) {
  // IMPORTANTE: a sessão NÃO contém hash de senha nem qualquer credencial.
  const safe = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId,
    classes: user.classes,
    loggedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(safe));
}
function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

function writeLog(action, detail, target) {
  const session = getSession();
  const logs = getAuditLogs();
  const entry = {
    when: new Date().toISOString(),
    user: session ? session.email : "anonimo",
    role: session ? session.role : "SEM_SESSAO",
    action,
    detail: truncate(String(detail || ""), LOG_DETAIL_MAX_CHARS),
    target: target || null
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOG_ENTRIES) logs.length = MAX_LOG_ENTRIES;
  saveAuditLogs(logs);
}

/* ---------------------------------------------------------------------------
   Throttling de login
--------------------------------------------------------------------------- */

function getLoginThrottle() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.loginThrottle) || "{}"); }
  catch { return {}; }
}
function saveLoginThrottle(obj) {
  localStorage.setItem(STORAGE_KEYS.loginThrottle, JSON.stringify(obj));
}

function isLoginBlocked() {
  const t = getLoginThrottle();
  if (!t.blockedUntil) return false;
  if (Date.now() < t.blockedUntil) return true;
  // expirou — limpa
  saveLoginThrottle({});
  return false;
}

function registerLoginFailure() {
  const t = getLoginThrottle();
  t.failures = (t.failures || 0) + 1;
  if (t.failures >= MAX_LOGIN_ATTEMPTS) {
    t.blockedUntil = Date.now() + LOGIN_BLOCK_MS;
    t.failures = 0;
  }
  saveLoginThrottle(t);
}

function clearLoginThrottle() {
  saveLoginThrottle({});
}

/* ---------------------------------------------------------------------------
   Login / Logout
--------------------------------------------------------------------------- */

async function login(email, password) {
  if (isLoginBlocked()) {
    const t = getLoginThrottle();
    const minutes = Math.ceil((t.blockedUntil - Date.now()) / 60000);
    showMessage(`Muitas tentativas. Tente novamente em ~${minutes} min.`, 'error');
    writeLog('LOGIN_BLOQUEADO', `Bloqueio ativo para tentativa de ${email}`);
    return;
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(normalizedEmail)) {
    showMessage('E-mail inválido.', 'error');
    return;
  }

  let hash;
  try { hash = await sha256Hex(password); }
  catch {
    showMessage('Falha ao calcular hash da senha.', 'error');
    return;
  }

  const user = USERS.find(u => u.email === normalizedEmail && u.passwordHash === hash);

  if (!user) {
    registerLoginFailure();
    // Mensagem genérica — não revela se o e-mail existe.
    showMessage('Credenciais inválidas.', 'error');
    writeLog('LOGIN_FALHOU', `Tentativa para ${normalizedEmail}`);
    return;
  }

  clearLoginThrottle();
  saveSession(user);
  writeLog('LOGIN_OK', `Usuário ${user.email} entrou no sistema.`);
  showMessage('Login efetuado com sucesso.', 'success');
  showApp(getSession());
}

function logout() {
  const session = getSession();
  writeLog('LOGOUT', session ? `${session.email} saiu do sistema.` : 'Sessão encerrada.');
  clearSession();
  clearSessionTimer();
  showMessage('Você saiu do sistema.');
  showLogin();
}

/* ---------------------------------------------------------------------------
   Trocar perfil (somente ADMIN)
--------------------------------------------------------------------------- */

function changeRole(newRole) {
  const session = getSession();
  if (!session) return;
  if (!requirePermission('changeRole', `Tentativa de alterar perfil para ${newRole}`)) return;
  if (!PERMISSIONS[newRole]) {
    showMessage('Perfil inválido.', 'error');
    return;
  }
  session.role = newRole;
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  writeLog("PERFIL_ALTERADO", `Perfil ativo alterado para ${newRole}.`);
  showMessage('Perfil alterado.', 'success');
  showApp(session);
}

/* ---------------------------------------------------------------------------
   Criar / editar / excluir ocorrências
--------------------------------------------------------------------------- */

function createOccurrence(event) {
  event.preventDefault();
  clearFormError();
  const session = getSession();
  if (!session) { showFormError('Você precisa entrar para registrar ocorrências.'); return; }
  if (!requirePermission('create', 'createOccurrence')) return;

  const studentName  = sanitizeInput(document.querySelector('#studentName').value);
  const studentId    = sanitizeInput(document.querySelector('#studentId').value);
  const category     = sanitizeInput(document.querySelector('#category').value);
  const priority     = sanitizeInput(document.querySelector('#priority').value);
  const description  = sanitizeInput(document.querySelector('#description').value);
  const internalNote = sanitizeInput(document.querySelector('#internalNote').value);
  const privacyAck   = document.querySelector('#privacyAck').checked;

  const isAdministrative = category === 'Solicitação administrativa';
  const studentCpf   = isAdministrative ? sanitizeInput(document.querySelector('#studentCpf').value) : '';
  const studentEmail = isAdministrative ? sanitizeInput(document.querySelector('#studentEmail').value) : '';
  const studentPhone = isAdministrative ? sanitizeInput(document.querySelector('#studentPhone').value) : '';

  // Validações
  if (!studentName || studentName.length < 3) { showFormError('Nome do aluno é obrigatório (mín. 3 caracteres).'); return; }
  if (!studentId || studentId.length < 4)     { showFormError('Matrícula inválida (mín. 4 caracteres).'); return; }
  if (!description || description.length < 10){ showFormError('Descrição muito curta (mín. 10 caracteres).'); return; }
  if (!privacyAck)                            { showFormError('É necessário declarar base legal (LGPD).'); return; }

  if (isAdministrative) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (studentCpf && studentCpf.replace(/\D/g, '').length < 11) { showFormError('CPF inválido.'); return; }
    if (studentEmail && !emailRe.test(studentEmail))             { showFormError('E-mail inválido.'); return; }
    if (studentPhone && studentPhone.replace(/\D/g, '').length < 8) { showFormError('Telefone inválido.'); return; }
  }

  const occurrence = {
    id: 'OC-' + Date.now().toString(36).toUpperCase(),
    studentName, studentId,
    studentCpf, studentEmail, studentPhone,
    category, priority,
    description, internalNote,
    status: 'Aberta',
    createdBy: session.email,
    createdAt: new Date().toISOString()
  };

  const occurrences = getOccurrences();
  occurrences.unshift(occurrence);
  saveOccurrences(occurrences);

  writeLog('OCORRENCIA_CRIADA', `Categoria=${category}, prioridade=${priority}`, occurrence.id);
  occurrenceForm.reset();
  toggleAdminFields();
  showMessage('Ocorrência registrada com sucesso.', 'success');
  render();
}

function deleteOccurrence(id) {
  if (!requirePermission('delete', `delete ${id}`)) return;
  if (!confirm('Deseja realmente excluir esta ocorrência? A ação não pode ser desfeita.')) return;
  const updated = getOccurrences().filter(item => item.id !== id);
  saveOccurrences(updated);
  writeLog('OCORRENCIA_EXCLUIDA', 'Ocorrência excluída', id);
  showMessage('Ocorrência excluída.', 'success');
  render();
}

function changeStatus(id, status) {
  if (!requirePermission('changeStatus', `changeStatus ${id} -> ${status}`)) return;
  const occurrences = getOccurrences();
  const occurrence = occurrences.find(item => item.id === id);
  if (!occurrence) return;
  occurrence.status = status;
  occurrence.updatedAt = new Date().toISOString();
  saveOccurrences(occurrences);
  writeLog('STATUS_ALTERADO', `Status alterado para ${status}`, id);
  showMessage('Status atualizado.', 'success');
  render();
}

/* ---------------------------------------------------------------------------
   Exportação por perfil
--------------------------------------------------------------------------- */

function exportEverything() {
  if (!requirePermission('export', 'exportEverything')) return;
  const session = getSession();
  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: session ? session.email : 'desconhecido',
    role: session ? session.role : 'SEM_SESSAO',
    occurrences: getOccurrences()
  };
  // Apenas ADMIN inclui logs.
  if (hasPermission('clearLogs')) payload.logs = getAuditLogs();
  // NUNCA inclui USERS nem hashes.

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ocorrencias-export-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  writeLog('EXPORTACAO', `Exportou ocorrências${payload.logs ? ' + logs' : ''}`);
  showMessage('Exportação concluída.', 'success');
}

function clearLogs() {
  if (!requirePermission('clearLogs', 'clearLogs')) return;
  if (!confirm('Deseja realmente limpar todos os logs?')) return;
  saveAuditLogs([]);
  writeLog('LOGS_LIMPOS', 'Logs limpos pelo usuário');
  showMessage('Logs limpos.', 'success');
  render();
}

function resetData() {
  if (!requirePermission('reset', 'resetData')) return;
  if (!confirm('Deseja realmente restaurar os dados iniciais? Isso apaga ocorrências e logs.')) return;
  localStorage.setItem(STORAGE_KEYS.occurrences, JSON.stringify(INITIAL_OCCURRENCES));
  localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify([]));
  clearSession();
  writeLog('BASE_RESTAURADA', 'Base inicial restaurada pelo usuário');
  showMessage('Dados restaurados.', 'success');
  boot();
}

/* ---------------------------------------------------------------------------
   Renderização
--------------------------------------------------------------------------- */

function render() {
  const term = (searchInput.value || '').toLowerCase().trim();
  const session = getSession();
  const occurrences = getOccurrences();

  // Filtro: busca somente em campos não-sensíveis.
  const filtered = occurrences.filter(item => {
    if (!term) return true;
    const haystack = [
      item.studentName, item.studentId, item.category,
      item.priority, item.status
    ].map(v => String(v || '').toLowerCase()).join(' | ');
    return haystack.includes(term);
  });

  totalOccurrences.textContent = occurrences.length;
  criticalOccurrences.textContent = occurrences.filter(item => item.priority === "Crítica").length;
  lastUpdate.textContent = `Atualizado em ${new Date().toLocaleTimeString("pt-BR")}`;

  const canReveal = hasPermission('revealSensitive');
  const canSeeNote = hasPermission('seeInternalNote');
  const canChange = hasPermission('changeStatus');
  const canDelete = hasPermission('delete');

  // Renderiza linhas SEM onclick inline (eliminamos a fonte residual de XSS).
  occurrencesTable.innerHTML = filtered.map(item => {
    const idAttr = escapeHTML(item.id);
    const name = escapeHTML(item.studentName);
    const mat  = escapeHTML(item.studentId);
    const cpf  = canReveal ? escapeHTML(item.studentCpf || '') : escapeHTML(maskCPF(item.studentCpf));
    const em   = canReveal ? escapeHTML(item.studentEmail || '') : escapeHTML(maskEmail(item.studentEmail));
    const ph   = canReveal ? escapeHTML(item.studentPhone || '') : escapeHTML(maskPhone(item.studentPhone));
    const desc = escapeHTML(item.description);
    const note = canSeeNote ? escapeHTML(item.internalNote || '') : '<em>Restrito</em>';

    const actions = [];
    if (canChange) {
      actions.push(`<button class="btn secondary" data-act="status-analise" data-id="${idAttr}">Em análise</button>`);
      actions.push(`<button class="btn secondary" data-act="status-resolvida" data-id="${idAttr}">Resolver</button>`);
    }
    if (canDelete) {
      actions.push(`<button class="btn danger" data-act="delete" data-id="${idAttr}">Excluir</button>`);
    }

    return `
      <tr>
        <td><strong>${name}</strong><br/><span class="muted-text">${mat}</span></td>
        <td>${cpf || '<span class="muted-text">—</span>'}</td>
        <td>${em || '<span class="muted-text">—</span>'}<br/>${ph || ''}</td>
        <td>${escapeHTML(item.category)}</td>
        <td><span class="priority ${escapeHTML(item.priority)}">${escapeHTML(item.priority)}</span></td>
        <td>${escapeHTML(item.status)}</td>
        <td><strong>Descrição:</strong> ${desc}<br/><strong>Obs. interna:</strong> ${note}</td>
        <td><div class="row-actions">${actions.join('')}</div></td>
      </tr>
    `;
  }).join('');

  // Auditoria
  const logs = getAuditLogs();
  if (logs.length === 0) {
    auditLog.innerHTML = `<div class="notice">Nenhum log registrado.</div>`;
  } else {
    auditLog.innerHTML = logs.slice(0, 100).map(log => `
      <div class="log-item">
        <strong>${escapeHTML(log.when)}</strong><br/>
        usuário=${escapeHTML(log.user || '—')} | perfil=${escapeHTML(log.role || '—')} | ação=${escapeHTML(log.action)}<br/>
        detalhe=${escapeHTML(log.detail)}${log.target ? ' | alvo=' + escapeHTML(log.target) : ''}
      </div>
    `).join('');
  }
}

/* ---------------------------------------------------------------------------
   Mostrar/ocultar views
--------------------------------------------------------------------------- */

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  sessionBadge.textContent = "Sessão não iniciada";
  sessionBadge.classList.add("muted");
  clearSessionTimer();
}

function showApp(user) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  sessionBadge.textContent = `${user.name} — ${user.role}`;
  sessionBadge.classList.remove("muted");

  currentUserName.textContent = user.name;
  currentUserDetails.textContent = `${user.email} | Perfil: ${user.role}`;
  roleSelect.value = user.role;

  // Apenas ADMIN vê e usa o trocador de perfil.
  if (hasPermission('changeRole')) {
    roleSwitchWrap.style.display = '';
    roleSelect.disabled = false;
  } else {
    roleSwitchWrap.style.display = 'none';
    roleSelect.disabled = true;
  }

  exportBtn.style.display    = hasPermission('export') ? '' : 'none';
  clearLogsBtn.style.display = hasPermission('clearLogs') ? '' : 'none';
  resetBtn.style.display     = hasPermission('reset') ? '' : 'none';

  toggleAdminFields();
  bindActivityListeners();
  render();
}

function toggleAdminFields() {
  const isAdministrative = categorySelect && categorySelect.value === 'Solicitação administrativa';
  if (adminFields) adminFields.style.display = isAdministrative ? '' : 'none';
}

/* ---------------------------------------------------------------------------
   Boot
--------------------------------------------------------------------------- */

function boot() {
  if (!localStorage.getItem(STORAGE_KEYS.occurrences)) {
    localStorage.setItem(STORAGE_KEYS.occurrences, JSON.stringify(INITIAL_OCCURRENCES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.audit)) {
    localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify([{
      when: new Date().toISOString(),
      user: "sistema",
      role: "SISTEMA",
      action: "BASE_INICIAL_CRIADA",
      detail: "Dados fictícios carregados no localStorage.",
      target: null
    }]));
  }
  const session = getSession();
  if (session) showApp(session); else showLogin();
}

/* ---------------------------------------------------------------------------
   Bindings (sem onclick inline)
--------------------------------------------------------------------------- */

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.querySelector('#email').value;
  const password = document.querySelector('#password').value;
  await login(email, password);
});

occurrenceForm.addEventListener('submit', createOccurrence);
logoutBtn.addEventListener('click', logout);
exportBtn.addEventListener('click', exportEverything);
clearLogsBtn.addEventListener('click', clearLogs);
resetBtn.addEventListener('click', resetData);
searchInput.addEventListener('input', render);
roleSelect.addEventListener('change', (event) => changeRole(event.target.value));
if (categorySelect) categorySelect.addEventListener('change', toggleAdminFields);

// Delegação para botões dentro da tabela (substitui onclick inline).
occurrencesTable.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (act === 'delete')           deleteOccurrence(id);
  else if (act === 'status-analise')   changeStatus(id, 'Em análise');
  else if (act === 'status-resolvida') changeStatus(id, 'Resolvida');
});

boot();
