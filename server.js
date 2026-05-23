require('dotenv').config();
const express = require('express');
const { connectToDB } = require('./db');
const chatsRouter = require('./routes/chats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));
app.use('/api', chatsRouter);

async function start() {
  await connectToDB();
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}

start();
