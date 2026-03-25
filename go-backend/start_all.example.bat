@echo off
REM Copia este archivo a start_all.bat y rellena valores (start_all.bat no debe subirse a git con secretos).
REM O define variables antes de ejecutar: set DB_HOST=... && start_all.bat

setlocal
if "%DB_HOST%"=="" (
  echo ERROR: Define DB_HOST, DB_USER, DB_PASS, DB_NAME ^(y opcionalmente GMAIL_*^)
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
