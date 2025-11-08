// Program.cs
using System;
using System.Collections.Generic;
using System.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

// Usaremos Microsoft.Data.SqlClient (não misturar com System.Data.SqlClient)
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

// ===== Identity + EF (somente para as tabelas do ASP.NET Identity) =====
builder.Services.AddDbContext<IdentityDbContext>(opt =>
    opt.UseSqlServer(Helpers.CONNECTION_STRING));

builder.Services.AddIdentityCore<IdentityUser>()
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<IdentityDbContext>()
    .AddSignInManager();

// ===== JWT =====
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = Helpers.JWT_ISSUER,
        ValidAudience = Helpers.JWT_AUDIENCE,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Helpers.JWT_SECRET)),
        ClockSkew = TimeSpan.FromMinutes(2)
    };
});

builder.Services.AddAuthorization();

// logging padrão de console
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var app = builder.Build();

// ===== CORS DEV =====
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
    ctx.Response.Headers["Access-Control-Allow-Headers"] = "*";
    ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS";
    if (ctx.Request.Method == "OPTIONS") { ctx.Response.StatusCode = 200; return; }
    await next();
});

app.UseAuthentication();
app.UseAuthorization();

// Fixar a porta 5080 (opcional). Se preferir, rode: dotnet run --urls "http://localhost:5080"
app.Urls.Clear();
app.Urls.Add("http://localhost:5080");

// ===== Seed Identity (cria schema e usuário admin) =====
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
    db.Database.EnsureCreated();

    var userMgr = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
    var roleMgr = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

    if (!await roleMgr.RoleExistsAsync("Admin"))
        await roleMgr.CreateAsync(new IdentityRole("Admin"));

    var admin = await userMgr.FindByEmailAsync("admin@guardiao.local");
    if (admin == null)
    {
        admin = new IdentityUser
        {
            UserName = "admin@guardiao.local",
            Email = "admin@guardiao.local",
            EmailConfirmed = true
        };
        var created = await userMgr.CreateAsync(admin, "Admin@123!");
        if (created.Succeeded)
            await userMgr.AddToRoleAsync(admin, "Admin");
    }
}

// ===== Health =====
app.MapGet("/api/ping", () => Results.Ok(new { ok = true, time = DateTime.UtcNow }));

// ===== AUTH =====
app.MapPost("/api/auth/login", async (LoginReq req, UserManager<IdentityUser> userMgr) =>
{
    var user = await userMgr.FindByEmailAsync(req.email);
    if (user == null) return Results.Unauthorized();
    if (!await userMgr.CheckPasswordAsync(user, req.password)) return Results.Unauthorized();

    var roles = await userMgr.GetRolesAsync(user);
    var token = Helpers.CreateJwt(user, roles);
    return Results.Ok(new TokenRes(token));
});

app.MapPost("/api/auth/register", async (RegisterReq req, UserManager<IdentityUser> userMgr) =>
{
    var exists = await userMgr.FindByEmailAsync(req.email);
    if (exists != null) return Results.BadRequest("Usuário já existe.");
    var user = new IdentityUser { UserName = req.email, Email = req.email, EmailConfirmed = true };
    var res = await userMgr.CreateAsync(user, req.password);
    if (!res.Succeeded) return Results.BadRequest(string.Join("; ", res.Errors.Select(e => e.Description)));
    return Results.Ok();
}).RequireAuthorization();

// ===== EMPLOYEES =====

// Listar
app.MapGet("/api/employees", async () =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(
        "SELECT Id, Nome, CPF, Posto, Admissao, Score FROM dbo.Employees ORDER BY Nome", conn);

    await using var rd = await cmd.ExecuteReaderAsync();
    var list = new List<Employee>();
    while (await rd.ReadAsync())
    {
        list.Add(new Employee(
            rd.GetInt32(0),
            rd.GetString(1),
            rd.GetString(2),
            rd.IsDBNull(3) ? null : rd.GetString(3),
            rd.IsDBNull(4) ? null : rd.GetDateTime(4),
            rd.GetInt32(5)
        ));
    }
    return Results.Ok(list);
}).RequireAuthorization();

// Por Id
app.MapGet("/api/employees/{id:int}", async (int id) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(
        "SELECT Id, Nome, CPF, Posto, Admissao, Score FROM dbo.Employees WHERE Id=@id", conn);
    cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;

    await using var rd = await cmd.ExecuteReaderAsync();
    if (await rd.ReadAsync())
    {
        return Results.Ok(new Employee(
            rd.GetInt32(0),
            rd.GetString(1),
            rd.GetString(2),
            rd.IsDBNull(3) ? null : rd.GetString(3),
            rd.IsDBNull(4) ? null : rd.GetDateTime(4),
            rd.GetInt32(5)
        ));
    }
    return Results.NotFound();
}).RequireAuthorization();

// Buscar
app.MapGet("/api/employees/search", async (string? q) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(@"
        SELECT Id, Nome, CPF, Posto, Admissao, Score
        FROM dbo.Employees
        WHERE (@q IS NULL OR Nome LIKE '%' + @q + '%' OR CPF LIKE '%' + @q + '%')
        ORDER BY Nome", conn);
    cmd.Parameters.Add("@q", SqlDbType.NVarChar, 200).Value = (object?)q ?? DBNull.Value;

    await using var rd = await cmd.ExecuteReaderAsync();
    var list = new List<Employee>();
    while (await rd.ReadAsync())
    {
        list.Add(new Employee(
            rd.GetInt32(0),
            rd.GetString(1),
            rd.GetString(2),
            rd.IsDBNull(3) ? null : rd.GetString(3),
            rd.IsDBNull(4) ? null : rd.GetDateTime(4),
            rd.GetInt32(5)
        ));
    }
    return Results.Ok(list);
}).RequireAuthorization();

// Inserir
app.MapPost("/api/employees", async (NewEmployee req, IHostEnvironment env) =>
{
    try
    {
        // Normaliza e valida CPF (somente dígitos)
        var cpf = new string((req.cpf ?? "").Where(char.IsDigit).ToArray());
        if (!Helpers.IsValidCPF(cpf))
            return Results.BadRequest("CPF inválido.");

        await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
        await conn.OpenAsync();

        // Checa duplicidade
        await using (var check = new SqlCommand("SELECT 1 FROM dbo.Employees WHERE CPF=@c", conn))
        {
            check.Parameters.Add("@c", SqlDbType.Char, 11).Value = cpf;
            var exists = await check.ExecuteScalarAsync();
            if (exists != null)
                return Results.Conflict("CPF já cadastrado.");
        }

        await using var cmd = new SqlCommand(@"
            INSERT INTO dbo.Employees (Nome, CPF, Posto, Admissao, Score)
            VALUES (@n,@c,@p,@a,@s);
            SELECT CAST(SCOPE_IDENTITY() AS int);", conn);

        cmd.Parameters.Add("@n", SqlDbType.NVarChar, 200).Value = (object?)req.nome ?? DBNull.Value;
        cmd.Parameters.Add("@c", SqlDbType.Char, 11).Value = cpf;
        cmd.Parameters.Add("@p", SqlDbType.NVarChar, 100).Value = (object?)req.posto ?? DBNull.Value;
        cmd.Parameters.Add("@a", SqlDbType.Date).Value = (object?)req.admissao ?? DBNull.Value;
        cmd.Parameters.Add("@s", SqlDbType.Int).Value = (object?)req.score ?? 1000;

        var obj = await cmd.ExecuteScalarAsync();
        if (obj == null || obj == DBNull.Value)
            return Results.Problem("INSERT não retornou ID (SCOPE_IDENTITY nulo).");

        var id = Convert.ToInt32(obj);
        return Results.Created($"/api/employees/{id}", new { id });
    }
    catch (SqlException ex) when (ex.Number is 2601 or 2627)
    {
        return Results.Conflict("CPF já cadastrado.");
    }
    catch (Exception ex)
    {
        Console.WriteLine("ERRO INSERT EMPLOYEE: " + ex);
        return env.IsDevelopment()
            ? Results.Problem($"Erro ao inserir colaborador: {ex.Message}")
            : Results.Problem("Erro ao inserir colaborador.");
    }
}).RequireAuthorization();

// Atualizar
app.MapPut("/api/employees/{id:int}", async (int id, UpdateEmployee req) =>
{
    var cpf = new string((req.cpf ?? "").Where(char.IsDigit).ToArray());
    if (!Helpers.IsValidCPF(cpf)) return Results.BadRequest("CPF inválido.");

    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(@"
        UPDATE dbo.Employees
           SET Nome=@n, CPF=@c, Posto=@p, Admissao=@a
         WHERE Id=@id", conn);
    cmd.Parameters.Add("@n", SqlDbType.NVarChar, 200).Value = req.nome;
    cmd.Parameters.Add("@c", SqlDbType.Char, 11).Value = cpf;
    cmd.Parameters.Add("@p", SqlDbType.NVarChar, 100).Value = (object?)req.posto ?? DBNull.Value;
    cmd.Parameters.Add("@a", SqlDbType.Date).Value = (object?)req.admissao ?? DBNull.Value;
    cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;

    var rows = await cmd.ExecuteNonQueryAsync();
    return rows > 0 ? Results.Ok() : Results.NotFound();
}).RequireAuthorization();

// Delete
app.MapDelete("/api/employees/{id:int}", async (int id) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand("DELETE FROM dbo.Employees WHERE Id=@id", conn);
    cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;

    var rows = await cmd.ExecuteNonQueryAsync();
    return rows > 0 ? Results.Ok() : Results.NotFound();
}).RequireAuthorization();

// ===== EVALUATIONS (altera score) =====
app.MapPost("/api/evaluations", async (EvaluationReq req) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();
    await using var tx = await conn.BeginTransactionAsync();

    try
    {
        var pts = Helpers.Points(req.tipo);

        await using (var insert = new SqlCommand(@"
            INSERT INTO dbo.Evaluations (EmployeeId, Tipo, Descricao, Points, CreatedAt)
            VALUES (@e,@t,@d,@p, SYSUTCDATETIME())", conn, (SqlTransaction)tx))
        {
            insert.Parameters.Add("@e", SqlDbType.Int).Value = req.employeeId;
            insert.Parameters.Add("@t", SqlDbType.NVarChar, 50).Value = req.tipo;
            insert.Parameters.Add("@d", SqlDbType.NVarChar, 1000).Value = (object?)req.descricao ?? DBNull.Value;
            insert.Parameters.Add("@p", SqlDbType.Int).Value = pts;
            await insert.ExecuteNonQueryAsync();
        }

        await using (var upd = new SqlCommand(
            "UPDATE dbo.Employees SET Score = Score + @delta WHERE Id = @id", conn, (SqlTransaction)tx))
        {
            upd.Parameters.Add("@delta", SqlDbType.Int).Value = pts;
            upd.Parameters.Add("@id", SqlDbType.Int).Value = req.employeeId;
            await upd.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return Results.Ok(new { delta = pts });
    }
    catch (Exception ex)
    {
        await tx.RollbackAsync();
        Console.WriteLine("ERRO INSERT EVALUATION: " + ex);
        return Results.Problem("Erro ao lançar avaliação.");
    }
}).RequireAuthorization();

// ===== REGISTROS ADMINISTRATIVOS (não afetam score) =====
app.MapPost("/api/adminrecords", async (AdminRecordReq req) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(@"
        INSERT INTO dbo.AdminRecords (EmployeeId, Tipo, Descricao, CreatedAt)
        VALUES (@e,@t,@d, SYSUTCDATETIME())", conn);
    cmd.Parameters.Add("@e", SqlDbType.Int).Value = req.employeeId;
    cmd.Parameters.Add("@t", SqlDbType.NVarChar, 100).Value = req.tipo;
    cmd.Parameters.Add("@d", SqlDbType.NVarChar, 1000).Value = (object?)req.descricao ?? DBNull.Value;
    await cmd.ExecuteNonQueryAsync();

    return Results.Ok();
}).RequireAuthorization();

// Buscar registros administrativos de um colaborador
app.MapGet("/api/adminrecords/employee/{id:int}", async (int id) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();
    await using var cmd = new SqlCommand(@"
        SELECT Tipo, Descricao, CreatedAt
        FROM dbo.AdminRecords
        WHERE EmployeeId = @id
        ORDER BY CreatedAt DESC", conn);
    cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
    await using var rd = await cmd.ExecuteReaderAsync();
    var list = new List<object>();
    while (await rd.ReadAsync())
    {
        list.Add(new
        {
            tipo = rd.GetString(0),
            descricao = rd.IsDBNull(1) ? null : rd.GetString(1),
            createdAt = rd.GetDateTime(2)
        });
    }
    return Results.Ok(list);
}).RequireAuthorization();

// Buscar ocorrências (avaliações) de um colaborador
app.MapGet("/api/evaluations/employee/{id:int}", async (int id) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();
    await using var cmd = new SqlCommand(@"
        SELECT Tipo, Descricao, Points, CreatedAt
        FROM dbo.Evaluations
        WHERE EmployeeId = @id
        ORDER BY CreatedAt DESC", conn);
    cmd.Parameters.Add("@id", SqlDbType.Int).Value = id;
    await using var rd = await cmd.ExecuteReaderAsync();
    var list = new List<object>();
    while (await rd.ReadAsync())
    {
        list.Add(new
        {
            tipo = rd.GetString(0),
            descricao = rd.IsDBNull(1) ? null : rd.GetString(1),
            pontos = rd.GetInt32(2),
            createdAt = rd.GetDateTime(3)
        });
    }
    return Results.Ok(list);
}).RequireAuthorization();

// ===== KPIs / Summary =====
app.MapGet("/api/employees/summary", async () =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(@"
        SELECT
          (SELECT COUNT(*) FROM dbo.Employees) AS Cnt,
          (SELECT AVG(CAST(Score AS FLOAT)) FROM dbo.Employees) AS AvgScore,
          (SELECT TOP 1 CONCAT(Tipo, ' ', FORMAT(CreatedAt, 'dd/MM HH:mm', 'pt-BR')) FROM dbo.Evaluations ORDER BY CreatedAt DESC) AS Last", conn);

    await using var rd = await cmd.ExecuteReaderAsync();
    if (await rd.ReadAsync())
    {
        return Results.Ok(new
        {
            count = rd.GetInt32(0),
            avgScore = rd.IsDBNull(1) ? (double?)null : rd.GetDouble(1),
            lastAction = rd.IsDBNull(2) ? null : rd.GetString(2)
        });
    }
    return Results.Ok(new { count = 0, avgScore = (double?)null, lastAction = (string?)null });
}).RequireAuthorization();

// ===== Relatórios =====
app.MapGet("/api/reports/evaluations", async (DateTime? start, DateTime? end, string? posto, string? tipo) =>
{
    await using var conn = new SqlConnection(Helpers.CONNECTION_STRING);
    await conn.OpenAsync();

    await using var cmd = new SqlCommand(@"
        SELECT v.CreatedAt, e.Nome, e.CPF, e.Posto, v.Tipo, v.Points, v.Descricao
        FROM dbo.Evaluations v
        INNER JOIN dbo.Employees e ON e.Id = v.EmployeeId
        WHERE (@start IS NULL OR v.CreatedAt >= @start)
          AND (@end   IS NULL OR v.CreatedAt < DATEADD(day, 1, @end))
          AND (@posto IS NULL OR e.Posto = @posto)
          AND (@tipo  IS NULL OR v.Tipo  = @tipo)
        ORDER BY v.CreatedAt DESC", conn);

    cmd.Parameters.Add("@start", SqlDbType.DateTime2).Value = (object?)start ?? DBNull.Value;
    cmd.Parameters.Add("@end", SqlDbType.DateTime2).Value = (object?)end ?? DBNull.Value;
    cmd.Parameters.Add("@posto", SqlDbType.NVarChar, 100).Value = string.IsNullOrWhiteSpace(posto) ? (object)DBNull.Value : posto!;
    cmd.Parameters.Add("@tipo", SqlDbType.NVarChar, 50).Value = string.IsNullOrWhiteSpace(tipo) ? (object)DBNull.Value : tipo!;

    await using var rd = await cmd.ExecuteReaderAsync();
    var items = new List<object>();
    var porTipo = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    int soma = 0, total = 0;

    while (await rd.ReadAsync())
    {
        var dt = rd.GetDateTime(0);
        var nome = rd.GetString(1);
        var cpf = rd.GetString(2);
        var p = rd.IsDBNull(3) ? null : rd.GetString(3);
        var t = rd.GetString(4);
        var pts = rd.GetInt32(5);
        var desc = rd.IsDBNull(6) ? null : rd.GetString(6);

        items.Add(new { data = dt, colaborador = nome, cpf, posto = p, tipo = t, pontos = pts, descricao = desc });
        total++;
        soma += pts;
        porTipo[t] = porTipo.TryGetValue(t, out var c) ? c + 1 : 1;
    }

    return Results.Ok(new { totalRegistros = total, somaPontos = soma, porTipo, items });
}).RequireAuthorization();

// ===== Run =====
app.Run();


// ==================== Models ====================
public record LoginReq(string email, string password);
public record RegisterReq(string email, string password);
public record TokenRes(string token);

public record Employee(int id, string nome, string cpf, string? posto, DateTime? admissao, int score);
public record NewEmployee(string nome, string cpf, string? posto, DateTime? admissao, int? score);
public record UpdateEmployee(string nome, string cpf, string? posto, DateTime? admissao);

public record EvaluationReq(int employeeId, string tipo, string? descricao);
public record AdminRecordReq(int employeeId, string tipo, string? descricao);


// ==================== Helpers ====================
static class Helpers
{
    // Ajuste para seu SQL Server/Instância/DB
    public const string CONNECTION_STRING =
        "Server=.\\SQLEXPRESS;Database=GestaoFunc;Trusted_Connection=True;TrustServerCertificate=True";

    // >= 16 chars
    public const string JWT_SECRET = "c0Kqf9o7Kq0v8kVQ0l2m1r8zK4Y6T2gXh9sJb3Qp1Kc";
    public const string JWT_ISSUER = "GuardiaoGestao";
    public const string JWT_AUDIENCE = "GuardiaoGestaoClients";

    public static bool IsValidCPF(string? cpf)
    {
        if (string.IsNullOrWhiteSpace(cpf)) return false;
        var digits = new string(cpf.Where(char.IsDigit).ToArray());
        if (digits.Length != 11) return false;
        if (new string(digits[0], 11) == digits) return false;

        int[] mult1 = { 10, 9, 8, 7, 6, 5, 4, 3, 2 };
        int[] mult2 = { 11, 10, 9, 8, 7, 6, 5, 4, 3, 2 };
        string temp = digits[..9];
        int sum = 0;
        for (int i = 0; i < 9; i++) sum += (temp[i] - '0') * mult1[i];
        int r = sum % 11;
        int d1 = r < 2 ? 0 : 11 - r;

        temp += d1.ToString();
        sum = 0;
        for (int i = 0; i < 10; i++) sum += (temp[i] - '0') * mult2[i];
        r = sum % 11;
        int d2 = r < 2 ? 0 : 11 - r;

        return digits.EndsWith(d1.ToString() + d2.ToString());
    }

    public static string CreateJwt(IdentityUser user, IEnumerable<string> roles)
    {
        var claims = new List<Claim> {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email ?? ""),
            new Claim(ClaimTypes.Name, user.UserName ?? user.Email ?? "")
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JWT_SECRET));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds
        );
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static int Points(string tipo) => tipo switch
    {
        "falta" => -10,
        "atestado" => -1,
        "advertencia" => -5,
        "suspensao" => -30,
        "atraso" => -1,
        "elogio" => +5,
        "bonificacao" => +10,
        "extra" => +1,
        _ => 0
    };
}
