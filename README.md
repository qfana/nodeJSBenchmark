# Практика №14 — бенчмарк Node.js

Сравнение Express, Fastify и NestJS в режимах single, cluster и worker_threads.

## Установка

```bash
npm install
npm run build:nestjs
```

Нужен [k6](https://k6.io/docs/get-started/installation/).

## Запуск сервера

```bash
node scripts/start-server.js express single
node scripts/start-server.js fastify cluster
node scripts/start-server.js nestjs workers
```

Порты: Express 3001, Fastify 3002, NestJS 3003.

## Бенчмарк

```bash
npm run benchmark
```

Результаты: `results/benchmark-*.json`, сводка в `results/reports/`.

## Структура

- `shared/` — общая логика API
- `servers/` — три сервера
- `load-tests/` — сценарии k6
- `scripts/` — запуск и сбор метрик
- `results/` — JSON и CSV отчёты
