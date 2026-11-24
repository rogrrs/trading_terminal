# Протокол работы агента с GitHub и батники

Этот файл — единственный, который нужно положить в проект или отдать агенту в чат. Внутри:
протокол работы с токеном и ветками (разделы 1–4) и заготовки батников для запуска,
обновления и удаления программы (раздел 5). Ничего больше докладывать не нужно.

Файл **не содержит токена**. Токен вставляется в сообщение, где нужен пуш, и нигде не хранится.

---

## 1. Токен

- Токен передаётся **в самом сообщении** агенту. Агент использует его только в команде git
  (адрес вида `https://x-access-token:<токен>@github.com/<владелец>/<репо>.git`).
- Токен **не записывается** ни в файлы, ни в `.git/config`, ни в адрес `origin`, ни в коммиты,
  ни в батники, ни в память агента. Переменные окружения и `.env` не используются.
- В выводе команд токен маскируется (`***TOKEN***`). Если он всё же попал в вывод, агент
  сообщает человеку и советует отозвать токен.
- Нет токена в текущем сообщении — агент не пушит. Он продолжает локально и пишет:
  «токена нет, пуш не выполнен».
- Токен, вставленный в чат, считается попавшим в историю. Его лучше отозвать и создать новый.

### Как создать токен (fine-grained, один репозиторий)

1. GitHub → аватар → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Token name**: любое, например `agent`.
3. **Expiration**: срок, например 90 дней. Когда срок истечёт, создайте новый.
4. **Resource owner**: ваш аккаунт или организация, где лежит репозиторий.
5. **Repository access**: **Only select repositories** → отметьте **только нужный репозиторий**.
   Не выбирайте «All repositories».
6. **Permissions → Repository permissions**. Выставьте ровно три пункта:

   | Пункт | Уровень | Для чего |
   |---|---|---|
   | **Contents** | **Read and write** | Repository contents, commits, branches, downloads, releases, and merges. [Подробнее](https://docs.github.com/rest/overview/permissions-required-for-fine-grained-personal-access-tokens#repository-permissions-for-contents) |
   | **Metadata** | **Read-only** (обязательный, выбран сам) | Search repositories, list collaborators, and access repository metadata. [Подробнее](https://docs.github.com/rest/overview/permissions-required-for-fine-grained-personal-access-tokens#repository-permissions-for-metadata) |
   | **Pull requests** | **Read and write** | Pull requests and related comments, assignees, labels, milestones, and merges. [Подробнее](https://docs.github.com/rest/overview/permissions-required-for-fine-grained-personal-access-tokens#repository-permissions-for-pull-requests) |

   Остальные разделы не трогайте.
7. **Generate token**. GitHub покажет токен **один раз**: скопируйте его.
8. Вставьте токен в сообщение агенту вместе с адресом репозитория.

Если токен попал в историю чата, отзовите его: Settings → Personal access tokens → нужный токен
→ **Delete** или **Regenerate**.

---

## 2. Две ветки

| Ветка | Что там лежит | Кто меняет |
|---|---|---|
| `main` | последнее состояние, которое **человек утвердил** | только после слов человека «можно» |
| `delta` | разработка текущего витка: утверждённое + неутверждённые коммиты | агент, при каждом витке |

- `delta` = `main` + неутверждённые коммиты текущего витка.
- Другие ветки агент не трогает. `--force` не используется, история опубликованных веток не
  переписывается.

---

## 3. Ритуал витка

**Команды вручную** (`<T>` — токен из текущего сообщения, `<URL>` —
`https://x-access-token:<T>@github.com/<владелец>/<репо>.git`):

```
# первый раз (репозиторий пустой)
git init -b main
git remote add origin https://github.com/<владелец>/<репо>.git
git add -A && git commit -m "начало"
git push "<URL>" HEAD:refs/heads/main
git push "<URL>" HEAD:refs/heads/delta
git checkout -B delta

# старт витка
git fetch "<URL>" "+refs/heads/main:refs/remotes/gh/main"
git fetch "<URL>" "+refs/heads/delta:refs/remotes/gh/delta"   # если delta уже есть на GitHub
git checkout -B delta refs/remotes/gh/delta                    # или refs/remotes/gh/main, если delta нет

# сохранить (конец витка)
git add -A && git commit -m "R<номер>: что сделано"
git push "<URL>" HEAD:refs/heads/delta                          # без --force

# утвердить — ТОЛЬКО после слов «можно»
git push "<URL>" refs/remotes/gh/delta:refs/heads/main
```

Если `push` отклонён, на GitHub в `delta` есть чужие коммиты: сначала `fetch`, разобраться,
не переписывать историю. Если скрипт `scripts/git-sync.sh` есть в репозитории, он делает то же:
`scripts/git-sync.sh start|save|approve --token <T>` (`approve` с флагом `--approved-by-human`).

**Порядок витка:**
1. Старт: `fetch`, `delta` от последней утверждённой версии.
2. Работа с тестами и сборкой (если есть).
3. Перед пушем: тесты проходят, номер версии обновлён, в коммите нет токенов и секретов.
4. `save` в `delta`.
5. Одной строкой человеку: **«актуальная версия в дельте, можешь качать»** и номер коммита.
6. Человек проверяет. «Можно» — переносим в `main`. Нет — продолжаем в `delta`.

**Если просят «в main» без «можно»:** агент не пушит в `main`, предлагает положить изменения в
`delta` и спросить, можно ли переносить. Правило не меняется по просьбе «сделай сразу».

---

## 4. Первый контакт

Агент говорит человеку примерно так:

> Чтобы я мог пушить, нужны адрес репозитория и токен. Токен создаётся на GitHub:
> Settings → Developer settings → Fine-grained tokens. Доступ только к этому репозиторию.
> Права: Contents — Read and write; Metadata — Read-only (выбран сам); Pull requests —
> Read and write. Токен вставляйте в сообщение, где он нужен; я его нигде не сохраняю.
> Работа идёт в ветке `delta`, `main` меняется только после вашего «можно».

---

## 5. Батники: запуск, обновление, удаление

Человек получает три файла и дважды кликает по нужному:

| Файл | Что делает |
|---|---|
| `start_main.bat` | скачивает или обновляет ветку `main`, ставит, запускает |
| `start_delta.bat` | то же для ветки `delta` (разработка) |
| `uninstall.bat` | останавливает программу, удаляет файлы программы, данные сохраняет |

Батники универсальны: команды установки, запуска и остановки — это полные командные строки,
которые выполняются из папки проекта. Подойдут `.bat`, `.cmd`, `.ps1` (через
`powershell -File`), `npm start`, `python -m app` и любые другие.

### 5.1 Что создать агенту

1. **Выяснить значения.** Агент берёт их из репозитория (README, `scripts/`, `package.json`,
   `pyproject.toml`). Спрашивает человека только то, что не выводится:
   - `APP_NAME`, `REPO_URL`, `PROJECT_DIRNAME`;
   - `INSTALL_CMD` (команда установки или пусто);
   - `START_CMD` (обязательно);
   - `STOP_CMD` (команда остановки или пусто);
   - `STATE_DIR` (папка данных, **обязана быть в `.gitignore`**);
   - список программ для удаления в `uninstall.bat` (`PROGRAM FOLDERS`).
2. **Создать `start_main.bat`:** шаблон 5.2, в SETTINGS `BRANCH=main`,
   `PROJECT_DIRNAME=<repo>-main`, `LOG_NAME=start_main.log`.
3. **Создать `start_delta.bat`:** шаблон 5.2, в SETTINGS `BRANCH=delta`,
   `PROJECT_DIRNAME=<repo>-delta`, `LOG_NAME=start_delta.log`.
4. **Создать `uninstall.bat`:** шаблон 5.3, в SETTINGS и в `PROGRAM FOLDERS` указать реальные
   пути. Все `CHANGE-ME` заменить.
5. **Записать файлы с CRLF и только ASCII.** Кириллицы в `.bat` быть не должно. Если инструмент
   записи пишет LF, перевести: `sed -i 's/$/\r/' start_main.bat` (на файлах без CR).
6. **Проверить** перед выдачей:
   - `grep -n "CHANGE-ME\|OWNER\|REPO\|MyApp" *.bat` ничего не находит;
   - `LC_ALL=C grep -nP "[^\x00-\x7F]" *.bat` ничего не находит;
   - `BRANCH` и имя лога у `start_main.bat` и `start_delta.bat` разные;
   - `INSTALL_CMD`, `START_CMD`, `STOP_CMD` указывают на то, что реально есть в репозитории;
   - `STATE_DIR` есть в `.gitignore`;
   - метки и переходы совпадают: каждый `goto :x` и `call :x` имеет метку `:x`.
7. **Выдать.** Файлы кладутся в папку проекта `launchers/` (или в корень). Человек копирует их
   в любую пустую папку и запускает оттуда.

### 5.2 Шаблон `start_main.bat` / `start_delta.bat` (один файл, два варианта)

```bat
@echo off
rem ============================================================================
rem  LAUNCHER TEMPLATE. Copy this file to start_main.bat (or start_delta.bat),
rem  change the values marked CHANGE in the SETTINGS block, and keep the rest.
rem  Double-click the copy: it downloads, updates, installs and starts the app.
rem
rem  Built-in rules (do not remove them):
rem    - data folders are never deleted by this file;
rem    - local changes to tracked files are saved with git stash, never thrown away;
rem    - if a step fails, the window stays open and the log says why;
rem    - every step is written to the log file next to this file.
rem  Keep this file ASCII only (no Cyrillic) and CRLF line endings.
rem ============================================================================
if /i "%~1"=="--child" goto :main

rem The update may replace this very file, so the work runs from a copy in TEMP.
set "CHILD=%TEMP%\launcher_%RANDOM%%RANDOM%.bat"
copy /y "%~f0" "%CHILD%" >nul 2>&1
if not exist "%CHILD%" goto :main
call "%CHILD%" --child "%~dp0."
set "RC=%ERRORLEVEL%"
del "%CHILD%" >nul 2>&1
exit /b %RC%

:main
rem ============================ SETTINGS ======================================
rem CHANGE: the name shown in messages.
set "APP_NAME=MyApp"
rem CHANGE: the GitHub address of the repository.
set "REPO_URL=https://github.com/OWNER/REPO.git"
rem CHANGE: main for start_main.bat, delta for start_delta.bat.
set "BRANCH=main"
rem CHANGE: folder name used when this file is not inside the clone.
set "PROJECT_DIRNAME=REPO-main"
rem CHANGE: install command line, run inside the project folder. Empty = no install step.
rem   examples: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
rem             scripts\install.bat      npm ci
set "INSTALL_CMD=scripts\install.bat"
rem CHANGE: start command line, run inside the project folder (required).
rem   examples: scripts\start.bat      python -m app      npm start
set "START_CMD=scripts\start.bat"
rem CHANGE: stop command line, run inside the project folder. Empty = nothing to stop.
set "STOP_CMD=scripts\stop.bat"
rem CHANGE: data folder inside the project. It must be listed in .gitignore.
set "STATE_DIR=data"
rem CHANGE: log file name, different for each branch.
set "LOG_NAME=start_main.log"
rem ============================================================================

set "HERE=%~dp0."
if /i "%~1"=="--child" set "HERE=%~2"
for %%I in ("%HERE%") do set "HERE=%%~fI"
set "LOG=%HERE%\%LOG_NAME%"
cd /d "%HERE%"

set "ONLINE=1"
set "INST_SHA="
set "CUR_SHA="
set "TARGET_SHA="
set "CUR_BRANCH="
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
if exist "%HERE%\.git" goto :in_place
set "TARGET=%HERE%\%PROJECT_DIRNAME%"
goto :have_target
:in_place
set "TARGET=%HERE%"
:have_target

call :say "=== %APP_NAME% launcher, branch %BRANCH%, %STAMP% ==="
call :say "Project folder: %TARGET%"

where git >nul 2>&1
if errorlevel 1 goto :err_git

if exist "%TARGET%\.git" goto :repo_present
if exist "%TARGET%" goto :err_notgit
call :say "Not downloaded yet. Cloning branch %BRANCH%. The first time can take a few minutes."
call :say "If GitHub asks you to sign in, use the window that opens."
git clone --branch %BRANCH% "%REPO_URL%" "%TARGET%"
if errorlevel 1 goto :err_clone
goto :repo_ready

:repo_present
git -C "%TARGET%" rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :err_notgit
for /f "delims=" %%B in ('git -C "%TARGET%" rev-parse --abbrev-ref HEAD') do set "CUR_BRANCH=%%B"
if not "%CUR_BRANCH%"=="%BRANCH%" goto :err_branch
call :say "Checking GitHub for a newer version of branch %BRANCH%"
git -C "%TARGET%" fetch --quiet origin %BRANCH%
if errorlevel 1 set "ONLINE=0"
if "%ONLINE%"=="0" call :say "WARNING: GitHub is not reachable. The installed version will be used."

:repo_ready
for /f %%S in ('git -C "%TARGET%" rev-parse HEAD') do set "CUR_SHA=%%S"
set "TARGET_SHA=%CUR_SHA%"
if "%ONLINE%"=="1" for /f %%S in ('git -C "%TARGET%" rev-parse origin/%BRANCH%') do set "TARGET_SHA=%%S"
if exist "%TARGET%\%STATE_DIR%\installed-sha.txt" set /p INST_SHA=<"%TARGET%\%STATE_DIR%\installed-sha.txt"
call :say "Installed commit: %INST_SHA%"
call :say "Commit to run:    %TARGET_SHA%"

if "%CUR_SHA%"=="%TARGET_SHA%" goto :no_update
call :say "A newer version is on GitHub. Updating the code. Your data stays."
call :stop_app
call :save_local_changes
git -C "%TARGET%" reset --hard origin/%BRANCH%
if errorlevel 1 goto :err_reset
set "CUR_SHA=%TARGET_SHA%"
call :say "Code updated to %TARGET_SHA%"
:no_update

set "NEED_INSTALL=0"
if not "%INST_SHA%"=="%TARGET_SHA%" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="1" goto :do_install
call :say "Already installed and up to date."
goto :start_app

:do_install
if "%INSTALL_CMD%"=="" goto :no_install_step
call :say "Installing: %INSTALL_CMD%"
pushd "%TARGET%"
call %INSTALL_CMD%
set "INST_RC=%ERRORLEVEL%"
popd
if not "%INST_RC%"=="0" goto :err_install
:no_install_step
if not exist "%TARGET%\%STATE_DIR%" mkdir "%TARGET%\%STATE_DIR%"
> "%TARGET%\%STATE_DIR%\installed-sha.txt" echo %TARGET_SHA%
call :say "Installation finished. Installed commit: %TARGET_SHA%"

:start_app
set "VER=unknown"
if exist "%TARGET%\VERSION" set /p VER=<"%TARGET%\VERSION"
call :say "Starting %APP_NAME%, version %VER%"
if "%START_CMD%"=="" goto :err_nostart
pushd "%TARGET%"
call %START_CMD%
set "START_RC=%ERRORLEVEL%"
popd
if not "%START_RC%"=="0" goto :err_start
call :say "Started. Details: %LOG%"
exit /b 0

:err_git
call :say "ERROR: git is not installed. Install Git for Windows from https://git-scm.com/download/win and run this file again."
goto :fail
:err_notgit
call :say "ERROR: the folder %TARGET% exists but is not a git copy of this repository. Nothing was changed. Rename or move that folder and run again."
goto :fail
:err_branch
call :say "ERROR: this folder is on branch %CUR_BRANCH%, but this file is for branch %BRANCH%. Put this file into another folder and run it there."
goto :fail
:err_clone
call :say "ERROR: download from GitHub failed. Check the internet and your GitHub access, then run again."
goto :fail
:err_reset
call :say "ERROR: could not apply the new code. Close all windows of the app and run this file again. Data was not touched."
goto :fail
:err_install
call :say "ERROR: installation failed. Read the messages above, fix the cause and run this file again."
goto :fail
:err_nostart
call :say "ERROR: START_CMD is empty. Set the start command in the SETTINGS block."
goto :fail
:err_start
call :say "ERROR: %APP_NAME% did not start. Read the messages above."
goto :fail
:fail
call :say "Stopped. Log: %LOG%"
pause
exit /b 1

rem ---------------------------------------------------------------- subroutines
:stop_app
if "%STOP_CMD%"=="" exit /b 0
call :say "Stopping %APP_NAME% before the update"
pushd "%TARGET%"
call %STOP_CMD%
popd
exit /b 0

:save_local_changes
set "DIRTY=0"
for /f %%C in ('git -C "%TARGET%" status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if "%DIRTY%"=="0" exit /b 0
call :say "Local changes to tracked files are saved with git stash (nothing is lost). See: git stash list"
git -C "%TARGET%" -c user.name=launcher -c user.email=launcher@localhost stash push -m "launcher-%STAMP%"
exit /b 0

:say
echo %~1
>>"%LOG%" echo [%date% %time%] %~1
exit /b 0
```

### 5.3 Шаблон `uninstall.bat`

```bat
@echo off
rem ============================================================================
rem  UNINSTALL TEMPLATE. Copy this file to uninstall.bat next to the launcher,
rem  change the values marked CHANGE, and list the PROGRAM folders in the block
rem  "PROGRAM FOLDERS" (the lines that start with call :remove).
rem
rem  By default it stops the app, removes the program folders listed below and
rem  KEEPS the data folder.
rem
rem    uninstall.bat            stop the app, remove program files, keep data
rem    uninstall.bat /dryrun    show what would be removed, change nothing
rem    uninstall.bat /yes       no questions (for scripts)
rem    uninstall.bat /purge     also remove the data folder (asks you to type DELETE)
rem
rem  Keep this file ASCII only (no Cyrillic) and CRLF line endings.
rem ============================================================================
setlocal
set "ARG_PURGE=0"
set "ARG_YES=0"
set "ARG_DRY=0"
for %%A in (%*) do (
  if /i "%%~A"=="/purge" set "ARG_PURGE=1"
  if /i "%%~A"=="/yes" set "ARG_YES=1"
  if /i "%%~A"=="/dryrun" set "ARG_DRY=1"
)

rem ============================ SETTINGS ======================================
rem CHANGE: the name shown in messages.
set "APP_NAME=MyApp"
rem CHANGE: the project folder name (the same as in the launcher).
set "PROJECT_DIRNAME=REPO-main"
rem CHANGE: stop command line, run inside the project folder. Empty = nothing to stop.
set "STOP_CMD=scripts\stop.bat"
rem CHANGE: data folder inside the project. Removed only with /purge.
set "STATE_DIR=data"
rem ============================================================================

set "PROJECT=%~dp0%PROJECT_DIRNAME%\"
if exist "%~dp0.git" set "PROJECT=%~dp0"

echo.
echo %APP_NAME% uninstall
echo Project folder: %PROJECT%
echo.

if "%ARG_DRY%"=="1" goto :stop_skipped
if "%STOP_CMD%"=="" goto :stop_skipped
pushd "%PROJECT%"
call %STOP_CMD%
popd
:stop_skipped

if "%ARG_YES%"=="1" goto :confirmed
if "%ARG_DRY%"=="1" goto :confirmed
echo This removes the PROGRAM folders listed in this file. Data is kept.
set "ANSWER="
set /p "ANSWER=Continue? (y/n): "
if /i not "%ANSWER%"=="y" goto :cancelled
:confirmed

rem ---------------------------------------------------------------- PROGRAM FOLDERS
rem CHANGE: list the program folders and files of this project. Examples below
rem do nothing until you replace CHANGE-ME with real names. Never list the
rem project folder itself or the data folder here.
call :remove "%PROJECT%CHANGE-ME-venv"
call :remove "%PROJECT%CHANGE-ME-node_modules"
call :remove "%PROJECT%CHANGE-ME-dist"
rem ---------------------------------------------------------------------------

if "%ARG_PURGE%"=="1" goto :purge_data
echo Data kept: %PROJECT%%STATE_DIR%
goto :done

:purge_data
if "%ARG_DRY%"=="1" goto :purge_dry
if "%ARG_YES%"=="1" goto :purge_now
set "ANSWER2="
set /p "ANSWER2=Type DELETE to remove the data folder for good: "
if not "%ANSWER2%"=="DELETE" goto :data_kept
:purge_now
call :remove "%PROJECT%%STATE_DIR%"
goto :done
:purge_dry
echo would remove data: %PROJECT%%STATE_DIR%
goto :done
:data_kept
echo Data kept: %PROJECT%%STATE_DIR%
goto :done

:cancelled
echo Cancelled. Nothing was removed.
exit /b 0

:done
echo.
echo Uninstall finished.
if "%ARG_YES%"=="0" pause
exit /b 0

rem ---------------------------------------------------------------- subroutines
:remove
if "%~1"=="" exit /b 0
if "%~1"=="%PROJECT%" exit /b 0
if "%~1"=="%PROJECT%\" exit /b 0
if not exist "%~1" exit /b 0
if "%ARG_DRY%"=="1" echo would remove: %~1
if "%ARG_DRY%"=="1" exit /b 0
echo removing: %~1
if exist "%~1\" (rd /s /q "%~1") else (del /f /q "%~1")
exit /b 0
```

### 5.4 Правила батников (нельзя ломать)

- **Токен в батниках не хранится.** Для приватного репозитория при первом клоне Git Credential
  Manager спросит вход в своём окне. Агент этого входа не видит.
- **Данные не удаляются.** Запуск не трогает `STATE_DIR`. `uninstall.bat` удаляет данные только
  с `/purge` и после ввода слова `DELETE`.
- **Удаляется только список.** `uninstall.bat` не удаляет корень проекта. Удаляются только
  пути из `PROGRAM FOLDERS`.
- **Локальные правки не теряются.** Перед обновлением — `git stash`, без `checkout --` и `clean`.
- **Лог рядом.** Каждый шаг пишется в `LOG_NAME` рядом с батником. Ошибка оставляет окно
  открытым (`pause`).

### 5.5 Что агент говорит человеку

> Готово: `start_main.bat`, `start_delta.bat`, `uninstall.bat`.
> 1. Положите все три файла в пустую папку на компьютере.
> 2. Дважды кликните `start_delta.bat` (разработка) или `start_main.bat` (утверждённая версия).
>    При первом запуске скачается проект и установится. Это может занять несколько минут.
>    Если GitHub попросит войти, используйте открывшееся окно.
> 3. Ход работы виден в окне и в лог-файле рядом (`start_delta.log` или `start_main.log`).
> 4. Чтобы удалить программу, дважды кликните `uninstall.bat`. Данные сохранятся. Чтобы удалить
>    и данные, запустите его из командной строки с `/purge`.
>
> Я не запускал эти файлы на Windows. При первом запуске проверьте лог. Если что-то падает,
> пришлите текст ошибки из окна или лога.

---

## 6. Чего агент не делает

- не пушит в `main` без слов «можно»;
- не переписывает историю (`--force`, `reset --hard` на опубликованных коммитах);
- не сохраняет токен и не выводит его;
- не меняет `origin` ради токена;
- не выдаёт батники, пока проверки из 5.1 не пройдены;
- не пишет `rd /s /q` на корень проекта;
- не говорит, что батники проверены на Windows, если это не так.
