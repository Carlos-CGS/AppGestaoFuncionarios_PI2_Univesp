# Gestão de Funcionários - Projeto PI II Univesp

Sistema web para gestão de funcionários, capaz de registrar e acompanhar o histórico dos colaboradores, aplicando métricas de desempenho que possibilitem a avaliação, a premiação dos melhores e a identificação daqueles com baixo rendimento.

Sistema completo para gestão de colaboradores, desenvolvido para o Trabalho de Projeto Integrador II (PI II) da Univesp. Inclui autenticação segura, validação de CPF, relatórios avançados, painel de KPIs, geração de PDF individual, e interface moderna.

## Funcionalidades

- **Autenticação** por **JWT + ASP.NET Identity** (usuário admin semeado).
- **Validação de CPF** no cadastro/edição de colaborador.
- **Painel de KPIs**: visão geral de colaboradores, score médio e última ação.
- **Lista/Edição** de colaboradores com busca avançada por nome/CPF.
- **Exclusão de colaborador** diretamente pela interface.
- **Relatórios** por período, posto e tipo de avaliação.
- **Geração de relatório individual em PDF** (com logo, dados, registros administrativos e ocorrências).
- **Interface moderna e responsiva** (HTML/CSS/JS puro).

## Estrutura do projeto

```
AppGestaoFuncionarios/
├─ frontend/
│  ├─ index.html
│  ├─ style.css
│  ├─ script.js
│  └─ img/
│      └─ logo.png
├─ backend/
│  ├─ GuardiaoGestao.csproj
│  └─ Program.cs
└─ db/
   ├─ schema.sql
   └─ SQLQuery1.sql
```

> As tabelas do **Identity** (usuários/roles) são criadas automaticamente no primeiro start.

## Pré-requisitos

- **.NET 8 SDK**
- **SQL Server** (LocalDB/Express/Server) + **SSMS**
- Servidor estático simples (ex.: Live Server do VS Code) para o frontend

## Passo 1 — Banco do aplicativo

Abra o **SSMS** e execute `db/schema.sql` para criar o banco `GestaoFunc` e as tabelas principais (`Employees`, `Evaluations`, `AdminRecords`).

## Passo 2 — Backend (.NET 8 + Identity + JWT)

1. Entre na pasta `backend`.
2. Ajuste a **CONNECTION_STRING** no `Program.cs` para seu SQL Server.
3. (Opcional) Altere o `JWT_SECRET` para um valor seguro.
4. Execute:
   ```powershell
   dotnet restore; dotnet run
   ```
   > No primeiro start, o **Identity** cria suas tabelas automaticamente e semeia o usuário **admin**.

### Usuário Admin padrão

- **E-mail**: `admin@guardiao.local`
- **Senha**: `Admin@123!`
- **Papel**: `Admin`

## Passo 3 — Frontend

1. Abra a pasta `frontend` no VS Code e execute o **Live Server** (ou outro servidor estático).
2. Em `script.js`, ajuste `API_BASE` se a porta do backend for diferente de `http://localhost:5080`.
3. Faça login com o admin e utilize todas as funcionalidades.

## Principais endpoints

- `POST /api/auth/login` → { email, password } ⇒ `{ token }`
- `POST /api/auth/register` (protegido; requer token — admin) → { email, password }
- `GET /api/employees` — lista colaboradores
- `GET /api/employees/{id}` — detalhes
- `GET /api/employees/search?q=` — busca avançada
- `POST /api/employees` — valida CPF, cadastra
- `PUT /api/employees/{id}` — valida CPF, edita
- `DELETE /api/employees/{id}` — exclui colaborador
- `POST /api/evaluations` — aplica pontos e atualiza score
- `POST /api/adminrecords` — registro administrativo
- `GET /api/employees/summary` — KPIs
- `GET /api/reports/evaluations?start=YYYY-MM-DD&end=YYYY-MM-DD&posto=...&tipo=...` — relatório avançado
- `GET /api/adminrecords/employee/{id}` — registros administrativos do colaborador
- `GET /api/evaluations/employee/{id}` — ocorrências do colaborador

## Observações

- **CORS liberado** para desenvolvimento; restrinja em produção.
- **JWT_SECRET** deve ser alterado antes de ir para produção.
- O **CPF** é validado por dígitos verificadores (aceita com/sem pontuação).
- Relatórios PDF individuais incluem logo, dados, registros administrativos e ocorrências.
- Interface responsiva e intuitiva.

---

Projeto desenvolvido para o PI II — Univesp. 🚀
