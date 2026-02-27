@echo off
rem --- Environment Variables for Go Microservices ---
set DB_HOST=srv1845.hstgr.io
set DB_USER=u727938325_adminpagv2strb
set DB_PASS=3*O1iWImas52
set DB_NAME=u727938325_pagv2strbx
set CODES_SERVICE_URL=http://localhost:8001
set GMAIL_EMAIL=cuentastrbx@gmail.com
set GMAIL_IMAP_PASS=stoe ohci bwmj efzz
rem --------------------------------------------------

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
