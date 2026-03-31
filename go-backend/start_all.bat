@echo off
REM Arranque local: define DB_HOST, DB_USER, DB_PASS, DB_NAME (y GMAIL_* si aplica) en tu entorno.
REM Copia start_all.example.bat y personaliza, o usa el panel de hosting para secretos.
setlocal
if "%DB_HOST%"=="" (
  echo ERROR: Variables DB_HOST, DB_USER, DB_PASS y DB_NAME deben estar definidas.
  echo Ejemplo: set DB_HOST=... ^&^& set DB_USER=... ^&^& set DB_PASS=... ^&^& set DB_NAME=... ^&^& start_all.bat
  echo O copia start_all.example.bat y edita tus valores.
  exit /b 1
)

set CODES_SERVICE_URL=%CODES_SERVICE_URL%
if "%CODES_SERVICE_URL%"=="" set CODES_SERVICE_URL=http://localhost:8001

echo Starting API Gateway (Port 8000)...
cd api-gateway
start /B gateway.exe
cd ..

echo Starting Codes Service (Port 8001)...
cd codes-service
start /B codes.exe
cd ..

echo Starting Store Service (Port 8002)...
cd store-service
start /B store.exe
cd ..

echo All Go Microservices are running in the background.
echo Press any key to stop all services...
pause

taskkill /F /IM gateway.exe
taskkill /F /IM codes.exe
taskkill /F /IM store.exe
echo Microservices stopped.
