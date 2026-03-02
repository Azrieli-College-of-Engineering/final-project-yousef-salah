const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionParser = session({
  secret: 'demo-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // fine for localhost HTTP
    sameSite: 'lax'
  }
});

app.use(sessionParser);
app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const username = req.body.username;

  if (!username || !username.trim()) {
    return res.status(400).send('Username is required');
  }

  req.session.user = username.trim();
  res.redirect('/chat');
});

app.get('/chat', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ loggedIn: false });
  }

  res.json({
    loggedIn: true,
    user: req.session.user
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

function broadcast(data) {
  const message = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

server.on('upgrade', (req, socket, head) => {
  console.log('--- WebSocket upgrade request ---');
  console.log('Path:', req.url);
  console.log('Origin:', req.headers.origin || 'none');
  console.log('Cookie:', req.headers.cookie || 'none');

  // Parse the existing session from the upgrade request
  sessionParser(req, {}, () => {
    if (!req.session || !req.session.user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Intentionally NO Origin validation here yet
    console.log('Authenticated WebSocket user:', req.session.user);

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = req.session.user;
      wss.emit('connection', ws, req);
    });
  });
});

wss.on('connection', (ws, req) => {
  console.log(`WebSocket connected: ${ws.user}`);

  ws.send(
    JSON.stringify({
      type: 'system',
      text: `Connected as ${ws.user}`
    })
  );

  broadcast({
    type: 'system',
    text: `${ws.user} joined the chat`
  });

  ws.on('message', (messageBuffer) => {
    try {
      const raw = messageBuffer.toString();
      const data = JSON.parse(raw);

      if (data.type === 'chat' && typeof data.text === 'string') {
        const cleanText = data.text.trim();

        if (!cleanText) {
          return;
        }

        // IMPORTANT: server uses user identity from session, not client input
        broadcast({
          type: 'chat',
          user: ws.user,
          text: cleanText
        });
      }
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: 'error',
          text: 'Invalid message format'
        })
      );
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket disconnected: ${ws.user}`);
    broadcast({
      type: 'system',
      text: `${ws.user} left the chat`
    });
  });
});

server.listen(PORT, () => {
  console.log(`Victim app running at http://localhost:${PORT}`);
});