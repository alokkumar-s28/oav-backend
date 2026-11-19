@echo off
title OAV Mantra - Deploy Edge Function to Supabase
echo ========================================================
echo   OAV MANTRA: SUPABASE BACKEND DEPLOYMENT
echo   Project Reference: bnlymzocydhmpuzmiwlz
echo ========================================================
echo.

cd /d "%~dp0"

echo [Step 1/2] Checking Supabase Login Status...
echo.
echo If a browser window opens, please log into your Supabase account.
echo If you have an Access Token, paste it when prompted.
echo.
cmd /c npx supabase login

echo.
echo [Step 2/2] Deploying Edge Function 'api' to Supabase Cloud...
cmd /c npx supabase functions deploy api --no-verify-jwt --project-ref bnlymzocydhmpuzmiwlz

echo.
echo ========================================================
echo Deployment finished!
echo Edge API URL: https://bnlymzocydhmpuzmiwlz.supabase.co/functions/v1/api
echo ========================================================
pause
