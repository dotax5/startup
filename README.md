# AI Chat

Одностраничное приложение для общения с AI-моделями через OpenRouter API. Клиент на Vanilla JS, сервер на Express + MongoDB.

## Возможности

- Несколько чатов (создание, переключение, удаление)
- Выбор модели из списка (GPT, Nemotron, GLM и др.)
- Отправка сообщений, регенерация ответа, удаление сообщений
- Копирование текста сообщения
- Markdown-рендеринг (через `marked`)
- Подсчёт времени генерации ответа
- Тёмная и светлая темы (сохраняется в localStorage)

## Технологии

| Компонент | Технология |
|-----------|------------|
| Frontend | HTML, CSS, Vanilla JS |
| Backend | Node.js, Express 5 |
| База данных | MongoDB (через `mongodb` драйвер) |
| API моделей | OpenRouter.ai |
| Markdown | `marked` (CDN) |
| Переменные окружения | `dotenv` |

## Структура проекта

```
startup/
├── server.js          # Express-сервер, статика, маршруты
├── db.js              # Подключение к MongoDB
├── routes/chats.js    # REST API для чатов и сообщений
├── main.js            # Клиентская логика (UI, OpenRouter API)
├── index.html         # HTML-каркас
├── style.css          # Стили (светлая/тёмная тема)
├── .env               # MONGO_URI, PORT
├── package.json       # dotenv, express, mongodb
└── .gitignore         # node_modules, .env
```

## REST API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/chats` | Список чатов (без сообщений) |
| POST | `/api/chats` | Создать новый чат |
| GET | `/api/chats/:id` | Получить чат с сообщениями |
| PATCH | `/api/chats/:id` | Обновить заголовок чата |
| DELETE | `/api/chats/:id` | Удалить чат |
| POST | `/api/chats/:id/messages` | Добавить сообщение |
| DELETE | `/api/chats/:id/messages/:idx` | Удалить сообщения с индекса |

## Запуск

```bash
# Установка зависимостей
npm install

# Настройка .env (по умолчанию все настроено, поэтому можно пропустить)
MONGO_URI=mongodb://localhost:27017/ai-chat
PORT=3000

# Запуск
node server.js
```

Открой `http://localhost:3000` в браузере.

## Модели

- `openai/gpt-oss-120b:free`
- `nvidia/nemotron-3-super-120b-a12b:free`
- `z-ai/glm-4.5-air:free`
- `poolside/laguna-m.1:free`
