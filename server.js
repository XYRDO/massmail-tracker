const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { MongoClient } = require('mongodb');
const dns = require('node:dns');

// Force public DNS to resolve Atlas SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Atlas Connection ──────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in environment variables.');
  process.exit(1);
}
const DB_NAME = 'massmail_tracker';

let db;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      autoSelectFamily: false,
      tls: true,
      tlsAllowInvalidCertificates: true // Bypass local SSL inspection issues
    });
    await client.connect();
    db = client.db(DB_NAME);
    // Create index for fast lookups
    await db.collection('campaigns').createIndex({ id: 1 }, { unique: true });
    console.log('✅ Connected to MongoDB Atlas');
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    return false;
  }
}

// ─── Helper: Get campaigns collection ──────────────────────────────────────
function campaigns() { return db.collection('campaigns'); }

// ─── API Routes ────────────────────────────────────────────────────────────

// Create a new campaign
app.post('/api/campaigns', async (req, res) => {
  try {
    const { name, subject, body, recipientEmail } = req.body;
    if (!name || !subject || !body || !recipientEmail) {
      return res.status(400).json({ error: 'Missing required fields: name, subject, body, recipientEmail' });
    }

    const campaign = {
      id: uuidv4().slice(0, 8),
      name,
      subject,
      body,
      recipientEmail,
      createdAt: new Date().toISOString(),
      totalSent: 0,
      senders: []
    };

    await campaigns().insertOne(campaign);
    io.emit('campaignCreated', campaign);
    res.json(campaign);
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all campaigns
app.get('/api/campaigns', async (req, res) => {
  try {
    const all = await campaigns().find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 }).toArray();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single campaign
app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const campaign = await campaigns().findOne({ id: req.params.id }, { projection: { _id: 0 } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a campaign
app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const result = await campaigns().deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Campaign not found' });
    io.emit('campaignDeleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Record a confirmed send
app.post('/api/campaigns/:id/send', async (req, res) => {
  try {
    const { senderName } = req.body;
    const sendRecord = {
      id: uuidv4().slice(0, 8),
      senderName: senderName || 'Anonymous',
      sentAt: new Date().toISOString()
    };

    const result = await campaigns().findOneAndUpdate(
      { id: req.params.id },
      {
        $push: { senders: sendRecord },
        $inc: { totalSent: 1 }
      },
      { returnDocument: 'after', projection: { _id: 0 } }
    );

    if (!result) return res.status(404).json({ error: 'Campaign not found' });

    // Broadcast real-time update to ALL connected clients
    io.emit('emailSent', {
      campaignId: req.params.id,
      sendRecord,
      totalSent: result.totalSent
    });

    res.json({ success: true, totalSent: result.totalSent, sendRecord });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset campaign stats
app.post('/api/campaigns/:id/reset', async (req, res) => {
  try {
    const result = await campaigns().findOneAndUpdate(
      { id: req.params.id },
      { $set: { senders: [], totalSent: 0 } },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'Campaign not found' });

    io.emit('campaignReset', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve the sender page
app.get('/send/:id', (req, res) => {
  res.sendFile('send.html', { root: path.join(__dirname, 'public') });
});

// Serve dashboard
app.get('/dashboard/:id', (req, res) => {
  res.sendFile('dashboard.html', { root: path.join(__dirname, 'public') });
});

// ─── WebSocket Connection ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  const connected = await connectDB();
  if (!connected) {
    console.error('Cannot start without database. Exiting.');
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`\n🚀 Mass Email Tracker running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`💾 Database: MongoDB Atlas (cloud-persistent)`);
    console.log(`\nPress Ctrl+C to stop.\n`);
  });
}

start();
