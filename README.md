# Telegram Venue Swipe Mini-App

Это Telegram mini-app для ежедневного выбора заведения:

- люди заходят через Telegram;
- входят через Telegram-аккаунт;
- каждый день создается новая сессия;
- заведения свайпаются как в Tinder;
- вправо = да;
- влево = нет;
- вверх / ветто = точно нет;
- если хотя бы один человек поставил заведению ветто, оно не может победить.

Ниже инструкция с самого начала. Иди строго по порядку.

## Что должно получиться

В конце у тебя будет:

1. GitHub-репозиторий с кодом приложения.
2. Supabase-база данных, где хранятся пользователи, голоса и сессии.
3. Railway-хостинг, где запущено приложение.
4. Telegram bot, внутри которого открывается mini-app.

## Что тебе понадобится

Перед началом должны быть аккаунты:

- GitHub
- Supabase
- Railway
- Telegram bot, созданный через BotFather

Еще нужен токен бота от BotFather. Он выглядит примерно так:

```txt
1234567890:AAExampleExampleExample
```

Никому его не отправляй и не загружай в GitHub.

## Шаг 1. Подготовить папку проекта

Открой папку проекта на компьютере:

```txt
C:\Users\Alex\Documents\Alex Alex
```

В ней должны быть файлы:

```txt
server.js
package.json
README.md
.env.example
.gitignore
lib/
public/
```

Если там есть папка `data` или файл `data/db.json`, это не страшно. Они не должны попасть в GitHub.

## Шаг 2. Создать репозиторий на GitHub

1. Открой `https://github.com`.
2. Войди в аккаунт.
3. В правом верхнем углу нажми `+`.
4. Выбери `New repository`.
5. В поле `Repository name` напиши, например:

```txt
telegram-venue-swipe
```

6. Выбери `Private` или `Public`.

Можно `Private`. Railway сможет подключиться, если ты дашь доступ.

7. Не ставь галочки:
   - Add a README file
   - Add .gitignore
   - Choose a license

8. Нажми `Create repository`.

GitHub покажет страницу нового пустого репозитория.

## Шаг 3. Загрузить код в GitHub

Открой терминал в папке проекта:

```txt
C:\Users\Alex\Documents\Alex Alex
```

Выполни команды по очереди.

Сначала создай git-репозиторий:

```powershell
git init
```

Добавь все файлы:

```powershell
git add .
```

Создай первый commit:

```powershell
git commit -m "Initial mini app"
```

Подключи GitHub-репозиторий. GitHub покажет тебе URL. Он будет похож на:

```txt
https://github.com/YOUR_USERNAME/telegram-venue-swipe.git
```

Вставь свой URL в команду:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/telegram-venue-swipe.git
```

Переименуй ветку в `main`:

```powershell
git branch -M main
```

Отправь код на GitHub:

```powershell
git push -u origin main
```

Если GitHub попросит логин, войди в GitHub.

После этого обнови страницу репозитория в браузере. Там должны появиться файлы проекта.

Проверь, что в GitHub есть:

```txt
server.js
package.json
lib/
public/
```

Проверь, что в GitHub НЕТ:

```txt
.env
data/db.json
node_modules/
```

## Шаг 4. Создать проект в Supabase

Теперь создаем базу данных.

1. Открой `https://supabase.com`.
2. Войди в аккаунт.
3. Нажми `New project`.
4. Если Supabase просит выбрать Organization, выбери свою или создай новую.
5. Заполни поля:

Project name:

```txt
venue-swipe
```

Database Password:

```txt
придумай пароль
```

Важно: сохрани этот пароль. Он понадобится через пару минут.

Region:

```txt
выбери ближайший регион
```

6. Нажми `Create new project`.
7. Подожди, пока Supabase создаст проект. Это может занять несколько минут.

Ничего в SQL Editor делать не нужно.

## Шаг 5. Получить DATABASE_URL в Supabase

Теперь нужно взять строку подключения к базе.

1. Открой созданный проект Supabase.
2. В верхней части страницы найди кнопку `Connect`.
3. Нажми `Connect`.
4. Найди раздел с connection string.
5. Выбери `Session pooler`.

Нам нужен именно `Session pooler`, а не `Direct connection`.

Строка будет выглядеть примерно так:

```txt
postgres://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:5432/postgres
```

Скопируй эту строку.

Теперь замени в ней:

```txt
[YOUR-PASSWORD]
```

на пароль базы, который ты придумал при создании Supabase-проекта.

Например было:

```txt
postgres://postgres.abcxyz:[YOUR-PASSWORD]@aws-0-eu.pooler.supabase.com:5432/postgres
```

Стало:

```txt
postgres://postgres.abcxyz:mydatabasepassword@aws-0-eu.pooler.supabase.com:5432/postgres
```

Это и есть твой `DATABASE_URL`.

Если в пароле есть символы типа `@`, `#`, `:`, `/` или пробел, лучше поменяй пароль базы на простой пароль из букв и цифр. Так меньше шансов сломать URL.

## Шаг 6. Создать проект на Railway

Теперь запускаем приложение.

1. Открой `https://railway.app`.
2. Войди в аккаунт.
3. Нажми `New Project`.
4. Выбери `Deploy from GitHub repo`.
5. Railway попросит подключить GitHub.
6. Разреши Railway доступ к GitHub.

Если GitHub спросит, к каким репозиториям дать доступ, выбери репозиторий:

```txt
telegram-venue-swipe
```

7. В Railway выбери этот репозиторий.

Если Railway пишет `Failed to fetch repository files`, почти всегда причина одна из этих:

- Railway не получил доступ к этому репозиторию;
- репозиторий пустой;
- код не был отправлен через `git push`;
- ты выбрал не тот репозиторий;
- репозиторий private, а Railway не дали permission.

Что сделать:

1. Открой GitHub-репозиторий в браузере.
2. Убедись, что там видны `server.js` и `package.json`.
3. В Railway заново подключи GitHub.
4. Если GitHub спрашивает доступ, выбери `Only select repositories` и отметь нужный repo.

## Шаг 7. Добавить переменные в Railway

Когда Railway создал сервис из GitHub, открой его настройки.

1. В Railway открой свой project.
2. Нажми на сервис приложения.
3. Открой вкладку `Variables`.
4. Добавь переменные.

Переменная 1:

```env
BOT_TOKEN=токен_который_дал_BotFather
```

Пример:

```env
BOT_TOKEN=1234567890:AAExampleExampleExample
```

Переменная 2:

```env
DEMO_MODE=false
```

Переменная 3:

```env
APP_URL=https://твой-проект.up.railway.app
```

Это публичный Railway URL mini-app. Он нужен, чтобы бот мог присылать сообщения с кнопкой открытия приложения.

Переменная 4:

```env
APP_TIMEZONE=Asia/Yekaterinburg
```

Переменная 5:

```env
DATABASE_URL=строка_из_Supabase
```

Пример:

```env
DATABASE_URL=postgres://postgres.abcxyz:mydatabasepassword@aws-0-eu.pooler.supabase.com:5432/postgres
```

Переменная 6:

```env
ADMIN_TELEGRAM_IDS=твой_telegram_id
```

Пример:

```env
ADMIN_TELEGRAM_IDS=123456789
```

Если админов несколько, перечисли через запятую:

```env
ADMIN_TELEGRAM_IDS=123456789,987654321
```

Свой Telegram ID можно узнать у бота вроде `@userinfobot`. Это не username, а именно число.

После добавления переменных Railway обычно сам перезапустит deploy.

Если не перезапустил:

1. Открой вкладку `Deployments`.
2. Нажми на последний deploy.
3. Нажми `Redeploy`.

## Шаг 8. Проверить Railway deploy

Открой вкладку `Deployments` в Railway.

Если все хорошо, статус будет примерно:

```txt
Success
```

Если статус красный или Failed:

1. Открой failed deploy.
2. Посмотри logs.

Частые ошибки:

`password authentication failed`

Значит неправильный пароль в `DATABASE_URL`.

`getaddrinfo` или ошибка подключения к host

Проверь, что взял `Session pooler`, а не direct connection.

`Cannot find module`

Проверь, что в GitHub есть `package.json`.

`Telegram login is required`

Это нормально, если ты открываешь API напрямую не из Telegram. Для обычного браузера в продакшене demo-режим выключен.

## Шаг 9. Получить публичный URL Railway

Теперь нужен HTTPS-адрес приложения.

1. В Railway открой сервис приложения.
2. Найди раздел `Settings`.
3. Найди `Networking` или `Public Networking`.
4. Нажми `Generate Domain`, если домен еще не создан.

Railway даст адрес примерно такой:

```txt
https://telegram-venue-swipe-production.up.railway.app
```

Открой этот URL в браузере.

Если видишь экран:

```txt
Куда идем?
```

значит приложение открылось.

В обычном браузере вход может не пройти, потому что `DEMO_MODE=false`. Это нормально. Боевой вход должен происходить из Telegram.

## Шаг 10. Подключить URL в BotFather

Теперь надо сказать Telegram, какой URL открывать как mini-app.

1. Открой Telegram.
2. Открой чат с `@BotFather`.
3. Напиши:

```txt
/mybots
```

4. Выбери своего бота.
5. Нажми `Bot Settings`.
6. Нажми `Configure Mini App`.
7. Нажми `Enable Mini App`.
8. BotFather попросит URL.
9. Вставь Railway URL:

```txt
https://telegram-venue-swipe-production.up.railway.app
```

10. Сохрани.

Если BotFather предлагает настроить название mini-app, напиши что-то вроде:

```txt
Куда идем?
```

## Шаг 11. Добавить кнопку запуска в бота

Чтобы приложение было удобно открыть из чата с ботом:

1. В BotFather снова выбери своего бота через `/mybots`.
2. Открой `Bot Settings`.
3. Найди `Menu Button`.
4. Выбери настройку Web App / Mini App.
5. Вставь тот же Railway URL.
6. Название кнопки:

```txt
Куда идем?
```

После этого в чате с ботом должна появиться кнопка запуска приложения.

## Шаг 12. Первый тест в Telegram

1. Открой своего бота в Telegram.
2. Нажми кнопку mini-app.
3. Должен открыться экран приложения.
4. Нажми `Погнали`.
5. С 10:00 по Екатеринбургу можно нажимать `Погнали`.
6. Когда минимум 2 человека успели записаться, в 11:00 по Екатеринбургу голосование начнется автоматически.
7. Попробуй свайпы:
   - вправо = да;
   - влево = нет;
   - вверх = ветто.
8. Голосовать можно до 11:40 по Екатеринбургу.
9. Если все участники проголосовали раньше, приложение сразу выберет победителя и бот отправит сообщение всем пользователям.
10. Если к 12:00 людей меньше двух или кто-то не успел проголосовать, приложение само выберет случайное заведение и бот отправит результат всем.

## Шаг 13. Как понять, что база работает

Открой Supabase:

1. Зайди в свой проект.
2. Открой `Table Editor`.

После первого запуска приложения там должны появиться таблицы:

```txt
users
invites
invite_uses
venues
sessions
session_active_users
votes
```

После входа пользователя должна появиться запись в `users`.

После активации дня должна появиться запись в `sessions` и `session_active_users`.

После свайпа должна появиться запись в `votes`.

## Шаг 14. Что делать с demo-инвайтом

Инвайт больше не нужен для основного сценария. В продакшене пользователь входит через свой Telegram-аккаунт.

Админ, чей ID указан в `ADMIN_TELEGRAM_IDS`, увидит кнопку `Админ` внутри mini-app. Там можно добавить заведения: название, адрес и URL картинки.

## Локальный запуск на компьютере

Это не нужно для продакшена, но полезно для проверки.

В папке проекта:

```powershell
Copy-Item .env.example .env
npm install
npm start
```

Открой:

```txt
http://localhost:3000
```

Если `DATABASE_URL` пустой, локально приложение хранит данные в `data/db.json`.

Если `DATABASE_URL` задан, приложение подключается к Supabase.
