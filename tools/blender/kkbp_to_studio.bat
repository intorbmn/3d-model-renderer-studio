@echo off
rem Turns KKBP .blend files into <name>_body.glb and <name>_outfitNN.glb (one per outfit) for 3D Model Renderer Studio.
rem Drag one or more .blend files onto this file. Keep export_kkbp_glb.py in the same folder.
rem Blender is looked for in the usual places; set BLENDER to its blender.exe to choose another.
setlocal EnableDelayedExpansion
set "SCRIPT=%~dp0export_kkbp_glb.py"
if not exist "%SCRIPT%" (
  echo export_kkbp_glb.py is missing: put it in the same folder as this file.
  goto end
)
if "%~1"=="" (
  echo Drag one or more .blend files onto this file.
  goto end
)
if defined BLENDER goto found
for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender*") do if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
if not defined BLENDER if exist "%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe" set "BLENDER=%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe"
if not defined BLENDER (
  set /p "BLENDER=Path to blender.exe: "
  set "BLENDER=!BLENDER:"=!"
)
:found
if not exist "%BLENDER%" (
  echo blender.exe not found: %BLENDER%
  goto end
)
echo Using %BLENDER%
for %%F in (%*) do (
  echo.
  echo === %%~nxF
  "%BLENDER%" --background "%%~fF" --python "%SCRIPT%" -- "%%~dpnF" --split | findstr /b /c:"written " /c:"skipped " /c:"meshes:" /c:"Error" /c:"nothing"
  if exist "%%~dpnF_body.glb" (echo Done: %%~nF_body.glb and %%~nF_outfitNN.glb) else (echo FAILED: see the messages above)
)
:end
echo.
pause
