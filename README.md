# Forma — AI Fitness

Первый рабочий вертикальный срез AI-фитнес-приложения по плану реализации.

## Сейчас работает

- дашборд сегодняшней тренировки;
- список упражнений и целей по подходам;
- старт и завершение тренировочной сессии;
- запись только валидных завершённых подходов (`reps > 0`, `weight >= 0`);
- REST API для упражнений, плана, сессий и подходов;
- Prisma-схема PostgreSQL и подключённое постоянное хранение данных;
- Docker Compose с PostgreSQL.
- AI-эндпоинт `/api/ai/program` с Groq Structured Outputs и локальным Ollama-режимом;
- API обратной связи после тренировки и GitHub Actions CI;
- разделы «История», «Мои планы» и «AI-тренер» с рабочей навигацией;
- сохранение AI-программ, запуск любого дня плана и форма оценки тренировки;
- защита от двойного запуска/завершения и безопасные сообщения об ошибках.

## Запуск

```bash
npm install
cp .env.example .env
npm run dev
```

Для PostgreSQL:

```bash
docker compose up -d db
npm run db:generate
npm run db:push
```

Для AI через Groq добавьте в `.env` ключ `GROQ_API_KEY`. Ключ используется только на серверном API и не попадает в браузер. Для локального бесплатного режима можно установить Ollama, скачать модель и указать `AI_PROVIDER="ollama"`.

Для текущего локального этапа используется демонстрационный пользователь без авторизации. Данные сессий и подходов сохраняются в PostgreSQL; Supabase Auth подключим следующим этапом.

Если после обновления всё ещё появляется `Watchpack ... lstat 'D:\\pagefile.sys'`, полностью остановите старый `npm run dev` (Ctrl+C), удалите только папку `.next` и запустите dev-сервер заново. В актуальном `next.config.ts` корень Turbopack ограничен папкой проекта.

Проверки перед коммитом: `npm run lint`, `npm run typecheck`, `npm run build`.

## Работа через GitHub

`.env` не добавляется в Git, а `.env.example` добавляется как безопасный шаблон. После первого подключения репозитория обновления проекта можно получать командой `git pull`, а свои изменения отправлять командами `git add`, `git commit` и `git push`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
