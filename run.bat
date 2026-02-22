@echo off
setlocal

dotnet build src\backend
if %errorlevel% neq 0 (
    echo Backend build failed!
    pause
    exit /b 1
)

cd src\renderer
call npm install
if %errorlevel% neq 0 (
    echo Renderer npm install failed!
    pause
    exit /b 1
)

cd ..\desktop
call npm install
if %errorlevel% neq 0 (
    echo Desktop npm install failed!
    pause
    exit /b 1
)

cd ..\..

start "Angular" cmd /c "cd src\renderer && npm run start"

:waitloop
timeout /t 1 /nobreak >nul
curl -s http://localhost:4200 >nul 2>&1
if %errorlevel% neq 0 goto waitloop

cd src\desktop
call npm start

cd ..\..