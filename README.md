# Gestão de Funcionários (v2 — JWT + Identity + CPF + Relatórios)

## O que mudou
- **Autenticação** por **JWT + ASP.NET Identity** (com usuário admin semeado).
- **Validação de CPF** no cadastro/edição de colaborador.
- **Telas de Lista/Edição** de colaboradores (frontend).
- **Relatórios** por período/posto/tipo de avaliações.

## Estrutura
```
projeto_gestao_funcionarios_v2/
├─ frontend/
│  ├─ index.html
│  ├─ style.css
│  └─ script.js
├─ backend/
│  ├─ GuardiaoGestao.csproj
│  └─ Program.cs
└─ db/
   └─ schema.sql   (tabelas do aplicativo)
```
> As tabelas do **Identity** (usuários/roles) são criadas automaticamente no primeiro start (EnsureCreated).

## Pré-requisitos
- **.NET 8 SDK**
- **SQL Server** (LocalDB/Express/Server) + **SSMS**
- Servidor estático simples (ex.: Live Server do VS Code) para o frontend

## Passo 1 — Banco do aplicativo
Abra o **SSMS** e execute `db/schema.sql` (cria `GestaoFunc` + tabelas `Employees`, `Evaluations`, `AdminRecords`).

## Passo 2 — Backend (.NET 8 + Identity + JWT)
1. Entre na pasta `backend`.
2. Ajuste a **CONNECTION_STRING** no `Program.cs` para seu SQL Server.
3. (Opcional) Alterar `JWT_SECRET` para um valor seguro.
4. Rode:
   ```bash
   dotnet restore
   dotnet run
   ```
   > No primeiro start, o **Identity** cria suas tabelas automaticamente e semeia o usuário **admin**.

### Usuário Admin padrão
- **E-mail**: `admin@guardiao.local`
- **Senha**: `Admin@123!`
- **Papel**: `Admin`

## Passo 3 — Frontend
1. Abra a pasta `frontend` no VS Code e execute o **Live Server** (ou outro servidor estático).
2. Em `script.js`, ajuste `API_BASE` se a porta do backend for diferente de `http://localhost:5169`.
3. Faça login com o admin e use normalmente.

## Endpoints novos/alterados
- `POST /api/auth/login` → { email, password } ⇒ `{ token }`
- `POST /api/auth/register` (protegido; requer token — pensado para admin) → { email, password }
- `GET /api/employees` (lista)
- `GET /api/employees/{id}` (detalhe)
- `GET /api/employees/search?q=` (busca)
- `POST /api/employees` (valida CPF, cria)
- `PUT /api/employees/{id}` (valida CPF, edita)
- `POST /api/evaluations` (aplica pontos e atualiza score em transação)
- `POST /api/adminrecords` (registro administrativo, não altera score)
- `GET /api/employees/summary` (KPIs)
- `GET /api/reports/evaluations?start=YYYY-MM-DD&end=YYYY-MM-DD&posto=...&tipo=...` (itens + resumo)

## Observações
- **CORS liberado** para dev; em produção, **restrinja**.
- **JWT_SECRET** deve ser trocado antes de produção.
- O **CPF** é validado por dígitos verificadores (formato livre: com/sem pontuação).

Bom código! 🚀
