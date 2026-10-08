# Первый запуск Forma: Supabase + Vercel

Эта инструкция предназначена для нового проекта без существующих данных. Для обновления рабочей базы используйте раздел README об обновлении и сначала сделайте backup.

## 1. Создать Supabase

1. Создайте проект в [Supabase Dashboard](https://supabase.com/dashboard). Сохраните пароль базы в менеджере паролей.
2. В настройках API скопируйте Project URL и publishable key. Это значения `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Service-role key не требуется.
3. В Connect скопируйте обе строки Supavisor: Transaction pooler на порту 6543 для `DATABASE_URL`, Session pooler на порту 5432 для `DIRECT_URL`. Подставьте пароль базы; специальные символы пароля должны быть URL-encoded.
4. Для первого запуска добавьте к `DATABASE_URL` параметры `pgbouncer=true&connection_limit=1&sslmode=require`, а к `DIRECT_URL` — `sslmode=require`. Если query-параметры уже есть, соединяйте их через `&`.
5. Отключите Data API в настройках Supabase: приложение использует PostgreSQL через Prisma. Supabase Auth продолжает обслуживать вход. Миграции дополнительно включают RLS на таблицах Forma и отзывают клиентские права.
6. В Authentication включите Email/Password и подтверждение email. Настройте [собственный SMTP](https://supabase.com/docs/guides/auth/auth-smtp) для регистрации реальных пользователей.

Никогда не отправляйте пароль базы, SMTP-пароль или секретный AI-ключ в чат и не сохраняйте их в Git. Добавляйте их непосредственно в `.env` и настройки окружения хостинга.

## 2. Создать таблицы

Установите Node.js 24, затем выполните на своём компьютере:

```bash
git clone https://github.com/gianni090/forma-ai-fitness.git
cd forma-ai-fitness
npm ci
```

Скопируйте `.env.example` в `.env`. Укажите `DATABASE_URL` и `DIRECT_URL` из Supabase. Для localhost в разработке можно использовать Session pooler в обоих полях. Затем:

```bash
npm run db:generate
npm run db:deploy
```

Пустой проект получает все миграции автоматически. Не выполняйте `migrate resolve` или `migrate reset` для этого сценария.

## 3. Подключить OpenRouter

Создайте отдельный ключ Forma в [OpenRouter Keys](https://openrouter.ai/settings/keys), настройте бюджет ключа и баланс. Сохраните ключ для переменной `OPENROUTER_API_KEY`.

Начальная модель в коде — `openai/gpt-oss-120b`. Для другой модели нужен провайдер с поддержкой JSON Schema/structured outputs. Приложение требует поддержки параметров и не принимает непроверенный ответ. Доступность конкретного провайдера проверяется первым живым запросом.

## 4. Импортировать GitHub в Vercel

1. В [Vercel](https://vercel.com/new) импортируйте `gianni090/forma-ai-fitness`, выберите ветку `main` и Framework Preset Next.js.
2. Выберите Node.js 24 и регион функций рядом с регионом базы. Оставьте Fluid compute включённым: AI-маршрут допускает до 180 секунд выполнения.
3. `vercel.json` уже задаёт сборку `npm run db:generate && npm run build`. Миграции применяются отдельной командой из предыдущего шага.
4. Добавьте переменные ниже в Production. Секретные значения вводятся без внешних кавычек.

| Переменная | Значение |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler, 6543, с параметрами из шага 1 |
| `DIRECT_URL` | Supabase Session pooler, 5432 |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `AUTH_DEMO_MODE` | `false` |
| `AI_PROVIDER` | `openrouter` |
| `OPENROUTER_API_KEY` | Секретный ключ Forma |
| `OPENROUTER_MODEL` | `openai/gpt-oss-120b` |
| `AI_TIMEOUT_MS` | `90000` |
| `AI_DAILY_LIMIT` | `10` |
| `APP_URL` | `https://ваш-production-домен` без завершающего `/` |

Если production-домен становится известен после первого Deploy, сразу обновите `APP_URL` и выполните Redeploy. Префикс `NEXT_PUBLIC_` используется только для публичных Supabase-настроек; DB и OpenRouter остаются серверными.

Не подключайте Preview к production-базе: для Preview используйте отдельные тестовые сервисы и соответствующий `APP_URL`, либо начните с Production.

## 5. Разрешить ссылки входа

В Supabase Authentication → URL Configuration:

- Site URL: точный `APP_URL`.
- Redirect URLs: `https://ваш-домен/auth/callback` и `https://ваш-домен/auth/callback?next=/reset-password`.
- Для локальной разработки добавьте аналогичные URLs с `http://localhost:3000`.

При смене домена обновите `APP_URL`, Supabase URLs и выполните Redeploy в Vercel. Открывайте письма в том же браузере, в котором запрашивали ссылку: вход использует PKCE.

## 6. Проверить живой сценарий

После публикации проверьте `/api/health` (ответ 200), затем:

1. Создайте аккаунт, подтвердите email и войдите.
2. Создайте стартовый план без AI, выполните и запишите один подход, перезагрузите страницу, завершите тренировку и поставьте оценку.
3. Заполните AI-анкету и сгенерируйте программы для 1, 3 и 7 дней. Проверьте выбранное оборудование и ограничения.
4. Выйдите, войдите другим аккаунтом и убедитесь, что его дневник пуст.
5. Проверьте восстановление пароля и вход с новым паролем.

CI проверяет API, PostgreSQL и интерфейс на desktop/mobile. Настоящие письма, доступность модели и настройки вашего хостинга проверяются этим живым сценарием. После него включите резервное копирование базы и мониторинг `/api/health`; следите за бюджетом OpenRouter и лимитами подключений базы.

## Официальная документация

- [Supabase + Prisma](https://supabase.com/docs/guides/database/prisma)
- [Prisma 6 + Supabase](https://www.prisma.io/docs/orm/v6/overview/databases/supabase)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Импорт GitHub в Vercel](https://vercel.com/docs/git/vercel-for-github)
- [Переменные Vercel](https://vercel.com/docs/environment-variables)
- [Node.js в Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Время выполнения функций](https://vercel.com/docs/functions/configuring-functions/duration)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)

