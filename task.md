ВАРИАНТ №14. ИССЛЕДОВАНИЕ ПРОИЗВОДИТЕЛЬНОСТИ NODE.JS ПРИ ОБРАБОТКЕ БОЛЬШОГО КОЛИЧЕСТВА ЗАПРОСОВ В ОДНОПОТОЧНОЙ И МНОГОПОТОЧНОЙ СРЕДЕ

Задача: сравнить Express, Fastify и NestJS при высокой нагрузке в режимах Event Loop, cluster и worker_threads.

Технологии: Node.js, Express, Fastify, NestJS, cluster, worker_threads, k6.

Этапы:
1. Три одинаковых HTTP-сервера с одним набором REST-эндпоинтов.
2. Типовые сценарии в single process.
3. Версии с cluster и worker_threads.
4. Нагрузочные тесты k6, рост RPS до насыщения.
5. Таблицы, графики, выводы.

Метрики: RPS, avg/med/p95, CPU, RAM.

Кейсы: static GET, transform POST, io-simulate, hash, compute, concurrency stress.
