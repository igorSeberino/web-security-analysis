# Sistema de Ocorrências Acadêmicas — Versão Endurecida (Entrega Final AP01)

Atividade Prática 01 — Segurança da Informação
Centro Universitário Católica de Santa Catarina
Prof. Edson Vaz Lopes

**Integrantes do grupo:** Renato Colin Neto, Adrian Cesar, Gabriel Carvalho e Igor Thiago Seberino.

---

## 1. O que é este projeto

Versão **endurecida** (final) do protótipo "Sistema de Ocorrências Acadêmicas". O sistema continua sendo
um aplicativo *front-end puro* (HTML/CSS/JS + `localStorage`), conforme exigência da disciplina, mas
recebeu um conjunto de controles compensatórios suficientes para que possa ser **utilizado em laboratório**
sem expor credenciais, sem permitir escalonamento trivial de privilégios e sem armazenar dados sensíveis
fora de seu escopo de exibição.

> **Não usar com dados reais.** Como o sistema não tem back-end, toda a lógica é inspeccionável e
> alterável via DevTools. Esta versão **reduz** o risco, mas não o **elimina**.

---

## 2. Como executar

### Opção A — Localmente

1. Clone o repositório.
2. Abra `index.html` em um navegador moderno (Chrome, Edge, Firefox).
3. Faça login com qualquer um dos usuários de demonstração (ver seção 4).

### Opção B — GitHub Pages

1. Acesse `https://<usuario-github>.github.io/<nome-do-repositorio>/`.
2. Mesma tela de login.

---

## 3. Estrutura

```
/
├── index.html      Marcação principal + CSP via meta-tag + aviso de protótipo
├── style.css       Estilo (base + acréscimos da versão final)
├── app.js          Lógica do sistema (RBAC, hash de senhas, sessão, auditoria)
└── README.md       Este arquivo
```

---

## 4. Usuários de demonstração

| E-mail                          | Senha       | Perfil       |
| ------------------------------- | ----------- | ------------ |
| `aluno@faculdade.local`         | `Aluno@2026` | ALUNO        |
| `professor@faculdade.local`     | `Prof@2026`  | PROFESSOR    |
| `admin@faculdade.local`         | `Admin@2026` | ADMIN        |

As senhas **não** estão armazenadas em texto puro no código-fonte. O que está no `app.js` é o
**hash SHA-256** de cada senha. Em produção, o hash deveria ocorrer no servidor com `bcrypt` ou
`Argon2` + salt único por usuário.

---

## 5. Controles implementados

Esta versão consolida o trabalho da entrega parcial e adiciona as correções necessárias para tornar
o sistema utilizável em laboratório:

### Da entrega parcial (já presentes)

- **RBAC** via mapa `PERMISSIONS` (ALUNO / PROFESSOR / ADMIN) consultado por `hasPermission()` e
  `requirePermission()` em cada handler crítico.
- **Restrição de exclusão** (`deleteOccurrence`) — somente ADMIN.
- **Restrição de troca de perfil** (`changeRole`) — somente ADMIN.
- **Restrição de operações destrutivas** (`clearLogs`, `resetData`) — somente ADMIN.
- **Mascaramento de PII** (`maskCPF`, `maskPhone`, `maskEmail`) na tabela para perfis não-administrativos.
- **Sanitização e escape** (`escapeHTML`, `sanitizeInput`) para mitigar XSS.
- **Timeout de sessão** (10 min de inatividade) com eventos de atividade monitorados.
- **Validações de formulário** (nome, matrícula, CPF, e-mail, telefone, descrição, aceite LGPD).
- **Confirmações** (`confirm()`) em ações destrutivas.
- **Logs expandidos** com perfil, ação, detalhe e timestamp.
- **Feedback visual** via `showMessage()` em vez de `alert()` puro.

### Acrescentados nesta versão final

- **Hash SHA-256 das senhas** via Web Crypto API. O código-fonte não contém mais nenhuma senha em texto puro.
- **Remoção do `FAKE_API_TOKEN`** que estava exposto no front-end.
- **Tela de login limpa** — sem credenciais pré-preenchidas nos inputs; lista de usuários de demonstração
  movida para um bloco `<details>` colapsado, fora do fluxo principal.
- **Sessão sem credenciais** — `saveSession()` agora salva apenas dados de exibição
  (id, name, email, role, classes, timestamp). Nada de hash, senha ou token vai para o `localStorage`.
- **Throttling de login** — 5 tentativas falhas bloqueiam o login por 5 minutos. Mensagem de erro
  genérica ("Credenciais inválidas") para evitar enumeração de usuários.
- **Eliminação de `onclick` inline** — botões da tabela usam `data-act`/`data-id` + delegação de evento.
- **Busca filtrada** — agora pesquisa apenas em nome, matrícula, tipo, prioridade e status.
  Não percorre mais CPF, e-mail, telefone ou observação interna.
- **Logs com retenção limitada** — máximo de 500 entradas, detalhes truncados em 240 caracteres.
- **Exportação por perfil** — ADMIN exporta ocorrências + logs; PROFESSOR exporta apenas ocorrências;
  ALUNO não exporta. **Nunca** exporta `USERS` nem hashes.
- **CSP via `meta`** — restringe origem de scripts e estilos.
- **Aviso permanente de protótipo** — banner topo da página.
- **Robots noindex / referrer no-referrer** — reduz exposição em buscadores.
- **Fieldset condicional** — CPF, e-mail e telefone só aparecem em "Solicitação administrativa"
  (minimização de coleta — LGPD).
- **CPFs e contatos iniciais notoriamente fictícios** (`000.000.000-0X`).

---

## 6. Limitações remanescentes (não resolvíveis sem back-end)

| Limitação | Por que persiste |
| --- | --- |
| Senhas (mesmo como hash) inspecionáveis no código-fonte | Sem servidor, qualquer um lê o `app.js` |
| RBAC contornável por DevTools | Usuário pode editar `PERMISSIONS` no console |
| `localStorage` manipulável | Qualquer usuário pode adicionar/remover registros via console |
| Sessão sem assinatura criptográfica | Sem servidor para emitir e validar JWT |
| Logs locais sem garantia de integridade | Podem ser apagados; sem `WORM` |
| Sem rate limit real | Throttling de login é apenas best-effort no cliente |

Essas limitações são **estruturais** e a única forma adequada de resolvê-las é a introdução de um
back-end real. O relatório técnico discute em detalhes o que isso exigiria.

---

## 7. Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ex.: `seguranca-da-informacao-AP01-final`).
2. Adicione `index.html`, `style.css`, `app.js`, `README.md` e `LICENSE` ao repositório.
3. Vá em **Settings → Pages**.
4. Em **Source**, escolha branch `main` e diretório `/ (root)`.
5. Aguarde alguns minutos. O sistema ficará disponível em
   `https://<usuario>.github.io/<repositorio>/`.

---

## 8. Licença

MIT — ver `LICENSE`.
