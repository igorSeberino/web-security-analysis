<div align="center">

# Web Security Analysis

### Análise e endurecimento de vulnerabilidades em aplicação web front-end

Protótipo didático de Sistema de Ocorrências Acadêmicas no qual foram identificadas 17+ vulnerabilidades de segurança e aplicados controles compensatórios para tornar o sistema utilizável dentro das restrições arquiteturais (HTML/CSS/JS puro, sem back-end).

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-F7DF1E?logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![Status](https://img.shields.io/badge/status-completed-success)
![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

[**Acessar demo ao vivo**](https://igorSeberino.github.io/web-security-analysis/) · [**Ler relatório técnico (PDF)**](./relatorio-tecnico-final.pdf) · [Reportar problema](https://github.com/igorSeberino/web-security-analysis/issues)

</div>

---

## Sumário

- [Contexto](#contexto)
- [Demonstração](#demonstração)
- [Vulnerabilidades identificadas e correções aplicadas](#vulnerabilidades-identificadas-e-correções-aplicadas)
- [Arquitetura e stack](#arquitetura-e-stack)
- [Como executar localmente](#como-executar-localmente)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Limitações conhecidas](#limitações-conhecidas)
- [Conceitos aplicados](#conceitos-aplicados)
- [Contexto acadêmico](#contexto-acadêmico)
- [Autores](#autores)
- [Licença](#licença)

---

## Contexto

Este repositório documenta a análise técnica de um protótipo deliberadamente vulnerável e a implementação de melhorias de segurança que pudessem ser feitas **exclusivamente no front-end**, sem introduzir back-end.

O exercício serve para demonstrar, de forma prática, **quais defesas o front-end consegue oferecer** (sanitização, mascaramento, RBAC simulado, validações, timeout de sessão, throttling, CSP via meta-tag) e **onde exatamente a arquitetura cliente-servidor se torna indispensável** (autenticação real, integridade de logs, controle de privilégios não-burlável, persistência segura).

> **Aviso:** este sistema é um protótipo acadêmico. Toda a lógica executa no navegador e pode ser inspecionada via DevTools. **Não deve operar com dados pessoais reais.**

---

## Demonstração

**Live demo:** [https://igorSeberino.github.io/web-security-analysis/](https://igorSeberino.github.io/web-security-analysis/)

**Credenciais de teste:**

| Perfil | E-mail | Senha |
| ------ | ------ | ----- |
| Aluno | `aluno@faculdade.local` | `Aluno@2026` |
| Professor | `professor@faculdade.local` | `Prof@2026` |
| Administrador | `admin@faculdade.local` | `Admin@2026` |

> As senhas no código-fonte estão armazenadas como **hash SHA-256**, não em texto puro.

---

## Vulnerabilidades identificadas e correções aplicadas

### Visão geral

| # | Vulnerabilidade | Severidade | Status |
|---|---|---|---|
| 1 | Senhas em texto puro no código-fonte | 🔴 Crítica | ✅ Corrigida (SHA-256) |
| 2 | Token "secreto" exposto no front-end | 🔴 Crítica | ✅ Removida |
| 3 | Credenciais pré-preenchidas nos inputs do HTML | 🔴 Crítica | ✅ Corrigida |
| 4 | Lista pública de usuários/senhas na tela de login | 🔴 Crítica | ✅ Colapsada em `<details>` |
| 5 | Senha persistida em `localStorage` após login | 🔴 Crítica | ✅ Corrigida (sessão sem credenciais) |
| 6 | Escalonamento trivial de privilégios via seletor de perfil | 🔴 Crítica | ✅ Corrigida (RBAC + restrição ADMIN) |
| 7 | Ausência de controle de autorização nos handlers | 🟠 Alta | ✅ Corrigida (mapa `PERMISSIONS`) |
| 8 | XSS via `innerHTML` sem escape | 🟠 Alta | ✅ Corrigida (`escapeHTML` + CSP) |
| 9 | `onclick` inline com IDs concatenados | 🟠 Alta | ✅ Corrigida (event delegation) |
| 10 | Sem proteção contra brute-force | 🟠 Alta | ✅ Throttling (5 tentativas → 5 min) |
| 11 | Dados pessoais visíveis a todos os perfis | 🟠 Alta | ✅ Mascaramento + revelação por permissão |
| 12 | Observação interna visível a alunos | 🟡 Média | ✅ Restrita por perfil |
| 13 | Sem timeout de sessão | 🟡 Média | ✅ 10 min de inatividade |
| 14 | Sem validação de formulário | 🟡 Média | ✅ Validações + LGPD opt-in |
| 15 | Logs persistindo PII completa | 🟡 Média | ✅ Truncados + retenção 500 entries |
| 16 | Busca varrendo CPF e observação interna | 🟡 Média | ✅ Escopo reduzido |
| 17 | Exportação incluía USERS + token + localStorage cru | 🔴 Crítica | ✅ Filtrada por perfil |
| 18 | Sem cabeçalhos defensivos | 🟢 Baixa | ✅ CSP via meta + noindex + no-referrer |
| 19 | Coleta indiscriminada de PII (LGPD) | 🟡 Média | ✅ Minimização (fieldset condicional) |

### Antes vs. depois (exemplos de código)

**Senhas:**

```diff
- password: "123456"
- password: "admin"
+ passwordHash: "62d1cc9bf2bbd4a9270b754bff21fe9f44c7b255f938a6630689102666f3aa19" // SHA-256
```

**Sessão:**

```diff
- saveSession(user)  // salvava { ..., password: "123456" } no localStorage
+ saveSession(user)  // monta objeto seguro sem credenciais:
+ // { id, name, email, role, classes, loggedAt }
```

**RBAC:**

```diff
- function deleteOccurrence(id) {
-   // qualquer usuário podia chamar
- }
+ function deleteOccurrence(id) {
+   if (!requirePermission('delete', `delete ${id}`)) return;
+   if (!confirm('Deseja realmente excluir...?')) return;
+   // ...
+ }
```

**Renderização sem XSS:**

```diff
- innerHTML = `<button onclick="deleteOccurrence('${item.id}')">Excluir</button>`
+ innerHTML = `<button data-act="delete" data-id="${escapeHTML(item.id)}">Excluir</button>`
+ // + event delegation no listener da tabela
```

---

## Arquitetura e stack

### Stack

- **HTML5** — marcação semântica + Content-Security-Policy via meta-tag
- **CSS3** — design system com variáveis CSS, layout responsivo
- **JavaScript (ES2020)** — `async/await`, Web Crypto API (`crypto.subtle.digest`), event delegation
- **localStorage** — persistência client-side (com escopo controlado)
- **Sem dependências externas** — zero `npm install`

### Camadas de defesa

```
┌─────────────────────────────────────────────────────────────┐
│  Camada 1 — Defesa declarativa                              │
│  CSP via meta · referrer no-referrer · robots noindex       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Camada 2 — Autenticação                                    │
│  Hash SHA-256 (Web Crypto) · throttling · msgs genéricas    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Camada 3 — Autorização (RBAC)                              │
│  PERMISSIONS · hasPermission() · requirePermission()        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Camada 4 — Entrada e saída                                 │
│  sanitizeInput() · escapeHTML() · validações · mascaramento │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Camada 5 — Sessão                                          │
│  Timeout 10 min · sem credenciais persistidas               │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Camada 6 — Auditoria                                       │
│  Logs estruturados · retenção limitada · truncamento        │
└─────────────────────────────────────────────────────────────┘
```

---

## Como executar localmente

### Opção 1 — Abrir direto no navegador

```bash
git clone https://github.com/igorSeberino/web-security-analysis.git
cd web-security-analysis
# Abra index.html no navegador (Chrome, Edge, Firefox)
```

### Opção 2 — Servidor HTTP local (recomendado para CSP)

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve .

# Acesse http://localhost:8000
```

---

## Estrutura do repositório

```
web-security-analysis/
├── index.html                       # Estrutura + CSP + banner de protótipo
├── style.css                        # Design system e layout
├── app.js                           # Lógica completa (RBAC, sessão, auditoria)
├── README.md                        # Este arquivo
├── relatorio-tecnico-final.pdf      # Relatório técnico completo (13 páginas)
└── LICENSE                          # MIT
```

---

## Limitações conhecidas

O sistema é estritamente front-end. As limitações abaixo são **estruturais** — não podem ser resolvidas sem introduzir back-end:

| Limitação | Por que persiste | Solução em produção |
|---|---|---|
| Hashes inspecionáveis no código | Qualquer usuário lê o `app.js` | Hash no servidor (bcrypt/Argon2 + salt) |
| RBAC contornável via DevTools | Usuário edita `PERMISSIONS` no console | Autorização exclusivamente no servidor |
| Sessão sem assinatura | Sem servidor para emitir JWT | JWT + cookie HttpOnly + Secure + SameSite |
| Throttling burlável | Estado vive no `localStorage` | Rate limit server-side + CAPTCHA |
| Logs locais sem integridade | Podem ser apagados pelo usuário | SIEM centralizado (Elastic, Splunk) |

O **relatório técnico** detalha um plano de evolução em três fases para uma versão produtiva.

---

## Conceitos aplicados

- **Defesa em profundidade** — múltiplas camadas de proteção independentes
- **Menor privilégio** — cada perfil recebe apenas o necessário
- **Auditoria** — toda ação sensível gera log
- **Minimização de dados (LGPD)** — coleta condicional de PII
- **Falha segura** — em caso de erro, sistema nega por padrão
- **Sanitização e escape** — toda entrada/saída tratada
- **Expiração de sessão** — redução de janela de exposição
- **Segregação por função** — ALUNO ≠ PROFESSOR ≠ ADMIN

---

## Contexto acadêmico

Trabalho desenvolvido para a disciplina **Segurança da Informação** do curso de **Engenharia de Software** do Centro Universitário Católica de Santa Catarina, sob orientação do Prof. Edson Vaz Lopes (Atividade Prática 01, 2026).

A proposta da atividade era analisar um protótipo deliberadamente vulnerável e aplicar melhorias dentro da restrição de não introduzir back-end — exercitando o discernimento sobre quais riscos são mitigáveis no cliente e quais exigem arquitetura de servidor.

---

## Autores

- **Renato Colin Neto**
- **Adrian Cesar**
- **Gabriel Carvalho**
- **Igor Thiago Seberino** — [@igorSeberino](https://github.com/igorSeberino)

---

## Licença

Distribuído sob a licença MIT. Veja [`LICENSE`](./LICENSE) para mais informações.

---

<div align="center">

Se este projeto te ajudou de alguma forma, considere dar uma ⭐!

</div>
