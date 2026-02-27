@echo off
echo.
echo === Colaba services check ===
echo.

echo Backend http://localhost:8001/health
curl -s -o nul -w "  HTTP %%{http_code}\n" http://localhost:8001/health 2>nul
if errorlevel 1 echo  No response

echo Frontend http://localhost:4000
curl -s -o nul -w "  HTTP %%{http_code}\n" http://localhost:4000 2>nul
if errorlevel 1 echo  No response

echo.
echo Containers:
docker ps --filter "name=leadgen" --format "  {{.Names}} {{.Status}}" 2>nul
echo.
echo Done. Frontend: http://localhost:4000  Backend: http://localhost:8001
