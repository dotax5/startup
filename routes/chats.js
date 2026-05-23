const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');

const router = Router();

router.get('/chats', async (req, res) => {
  const db = getDB();
  const chats = await db.collection('chats')
    .find({}, { projection: { messages: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(chats);
});

router.post('/chats', async (req, res) => {
  const db = getDB();
  const chat = {
    title: 'New Chat',
    messages: [],
    createdAt: new Date()
  };
  const result = await db.collection('chats').insertOne(chat);
  res.status(201).json({ _id: result.insertedId, ...chat });
});

router.get('/chats/:id', async (req, res) => {
  const db = getDB();
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }
  const chat = await db.collection('chats').findOne({ _id: id });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(chat);
});

router.patch('/chats/:id', async (req, res) => {
  const db = getDB();
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }
  const result = await db.collection('chats').findOneAndUpdate(
    { _id: id },
    { $set: { title: req.body.title } },
    { returnDocument: 'after', projection: { messages: 0 } }
  );
  if (!result) return res.status(404).json({ error: 'Chat not found' });
  res.json(result);
});

router.delete('/chats/:id', async (req, res) => {
  const db = getDB();
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }
  await db.collection('chats').deleteOne({ _id: id });
  res.status(204).end();
});

router.post('/chats/:id/messages', async (req, res) => {
  const db = getDB();
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

  const msg = {
    role: req.body.role,
    content: req.body.content,
    timestamp: new Date(req.body.timestamp || Date.now())
  };
  if (req.body.responseTime != null) {
    msg.responseTime = req.body.responseTime;
    msg.responseTimestamp = new Date(req.body.responseTimestamp || Date.now());
  }

  const result = await db.collection('chats').findOneAndUpdate(
    { _id: id },
    { $push: { messages: msg } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'Chat not found' });
  res.status(201).json(result);
});

router.delete('/chats/:id/messages/:idx', async (req, res) => {
  const db = getDB();
  let id;
  try { id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }
  const idx = parseInt(req.params.idx);

  const chat = await db.collection('chats').findOne({ _id: id });
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  if (idx < 0 || idx >= chat.messages.length) {
    return res.status(400).json({ error: 'Invalid message index' });
  }

  chat.messages.splice(idx);
  await db.collection('chats').updateOne(
    { _id: id },
    { $set: { messages: chat.messages } }
  );

  res.json(chat);
});

module.exports = router
