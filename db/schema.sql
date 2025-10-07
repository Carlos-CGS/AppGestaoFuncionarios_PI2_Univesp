IF DB_ID('GestaoFunc') IS NULL
BEGIN
  CREATE DATABASE GestaoFunc;
END
GO

USE GestaoFunc;
GO

IF OBJECT_ID('dbo.Employees') IS NULL
BEGIN
  CREATE TABLE dbo.Employees (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nome NVARCHAR(120) NOT NULL,
    CPF  NVARCHAR(20) NOT NULL UNIQUE,
    Posto NVARCHAR(80) NULL,
    Admissao DATE NULL,
    Score INT NOT NULL CONSTRAINT DF_Employees_Score DEFAULT (1000)
  );
END
GO

IF OBJECT_ID('dbo.Evaluations') IS NULL
BEGIN
  CREATE TABLE dbo.Evaluations (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES dbo.Employees(Id) ON DELETE CASCADE,
    Tipo NVARCHAR(40) NOT NULL,
    Descricao NVARCHAR(400) NULL,
    Points INT NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID('dbo.AdminRecords') IS NULL
BEGIN
  CREATE TABLE dbo.AdminRecords (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL FOREIGN KEY REFERENCES dbo.Employees(Id) ON DELETE CASCADE,
    Tipo NVARCHAR(60) NOT NULL,
    Descricao NVARCHAR(400) NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

-- Crie no MESMO banco da sua connection string (GestaoFunc)
IF OBJECT_ID('dbo.Employees','U') IS NULL
BEGIN
  CREATE TABLE dbo.Employees(
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nome NVARCHAR(200) NOT NULL,
    CPF  CHAR(11) NOT NULL,
    Posto NVARCHAR(100) NULL,
    Admissao DATE NULL,
    Score INT NOT NULL DEFAULT(1000)
  );
  CREATE UNIQUE INDEX IX_Employees_CPF ON dbo.Employees(CPF);
END
GO

IF OBJECT_ID('dbo.Evaluations','U') IS NULL
BEGIN
  CREATE TABLE dbo.Evaluations(
    Id INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL,
    Tipo NVARCHAR(50) NOT NULL, -- falta, atestado, ...
    Descricao NVARCHAR(1000) NULL,
    Points INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Evaluations_Employees
      FOREIGN KEY(EmployeeId) REFERENCES dbo.Employees(Id) ON DELETE CASCADE
  );
  CREATE INDEX IX_Evaluations_EmployeeId ON dbo.Evaluations(EmployeeId);
  CREATE INDEX IX_Evaluations_CreatedAt ON dbo.Evaluations(CreatedAt);
END
GO

IF OBJECT_ID('dbo.AdminRecords','U') IS NULL
BEGIN
  CREATE TABLE dbo.AdminRecords(
    Id INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL,
    Tipo NVARCHAR(100) NOT NULL, -- aumento, troca de função, posto, etc
    Descricao NVARCHAR(1000) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AdminRecords_Employees
      FOREIGN KEY(EmployeeId) REFERENCES dbo.Employees(Id) ON DELETE CASCADE
  );
  CREATE INDEX IX_AdminRecords_EmployeeId ON dbo.AdminRecords(EmployeeId);
  CREATE INDEX IX_AdminRecords_CreatedAt ON dbo.AdminRecords(CreatedAt);
END
GO


SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Employees'