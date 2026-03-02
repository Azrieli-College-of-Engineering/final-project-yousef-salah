const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;

const app = express();
const PORT = 5000;

const allowedOrigins = new Set(['http://localhost:5000']);
const connectionsBySessionId = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionParser = session({
  name: 'secure.sid', // different cookie name from vulnerable app
  secret: 'secure-demo-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
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

function generateWsToken() {
  return crypto.randomBytes(32).toString('hex');
}

function safeTokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function addConnection(sessionId, ws) {
  if (!connectionsBySessionId.has(sessionId)) {
    connectionsBySessionId.set(sessionId, new Set());
  }
  connectionsBySessionId.get(sessionId).add(ws);
}

function removeConnection(sessionId, ws) {
  const set = connectionsBySessionId.get(sessionId);
  if (!set) return;

  set.delete(ws);

  if (set.size === 0) {
    connectionsBySessionId.delete(sessionId);
  }
}

function closeSessionConnections(sessionId, code = 1008, reason = 'Session ended') {
  const set = connectionsBySessionId.get(sessionId);
  if (!set) return;

  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(code, reason);
    }
  }

  connectionsBySessionId.delete(sessionId);
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
  req.session.wsToken = generateWsToken();

  req.session.save(() => {
    res.redirect('/secure-chat');
  });
});

app.get('/secure-chat', requireLogin, (req, res) => {
  if (!req.session.wsToken) {
    req.session.wsToken = generateWsToken();
    return req.session.save(() => {
      res.sendFile(path.join(__dirname, 'public', 'secure-chat.html'));
    });
  }

  res.sendFile(path.join(__dirname, 'public', 'secure-chat.html'));
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

app.get('/ws-config', requireLogin, (req, res) => {
  if (!req.session.wsToken) {
    req.session.wsToken = generateWsToken();
    return req.session.save(() => {
      res.json({ wsToken: req.session.wsToken });
    });
  }

  res.json({ wsToken: req.session.wsToken });
});

app.post('/logout', (req, res) => {
  const sessionId = req.sessionID;

  req.session.destroy(() => {
    closeSessionConnections(sessionId, 1008, 'Logged out');
    res.redirect('/login');
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

function broadcast(data) {
  const message = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
      client.send(message);
    }
  });
}

server.on('upgrade', (req, socket, head) => {
  console.log('--- Secure WebSocket upgrade request ---');
  console.log('Path:', req.url);
  console.log('Origin:', req.headers.origin || 'none');

  if (req.url !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;

  if (!origin || !allowedOrigins.has(origin)) {
    console.log('Rejected WebSocket: unauthorized origin');
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  sessionParser(req, {}, () => {
    if (!req.session || !req.session.user || !req.session.wsToken) {
      console.log('Rejected WebSocket: no authenticated session');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = req.session.user;
      ws.session = req.session;
      ws.sessionId = req.sessionID;
      ws.isAuthenticated = false;
      wss.emit('connection', ws, req);
    });
  });
});

wss.on('connection', (ws, req) => {
  console.log(`Secure WebSocket opened for ${ws.user} from ${req.headers.origin}`);

  ws.authTimer = setTimeout(() => {
    if (!ws.isAuthenticated) {
      ws.close(1008, 'WebSocket authentication required');
    }
  }, 5000);

  ws.send(
    JSON.stringify({
      type: 'system',
      text: 'Connection opened. Waiting for WebSocket auth token.'
    })
  );

  ws.on('message', (messageBuffer) => {
    let data;

    try {
      data = JSON.parse(messageBuffer.toString());
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        text: 'Invalid message format'
      }));
      return;
    }

    if (!ws.isAuthenticated) {
      if (data.type !== 'auth' || !safeTokenEquals(data.token, ws.session.wsToken)) {
        console.log(`Rejected invalid WS token for ${ws.user}`);
        ws.close(1008, 'Invalid WebSocket token');
        return;
      }

      ws.isAuthenticated = true;
      clearTimeout(ws.authTimer);
      addConnection(ws.sessionId, ws);

      ws.send(JSON.stringify({
        type: 'auth_ok',
        user: ws.user
      }));

      broadcast({
        type: 'system',
        text: `${ws.user} joined the secure chat`
      });

      return;
    }

    switch (data.type) {
      case 'chat': {
        if (typeof data.text !== 'string') {
          ws.send(JSON.stringify({
            type: 'error',
            text: 'Invalid chat payload'
          }));
          return;
        }

        const cleanText = data.text.trim();

        if (!cleanText) return;

        if (cleanText.length > 300) {
          ws.send(JSON.stringify({
            type: 'error',
            text: 'Message too long'
          }));
          return;
        }

        broadcast({
          type: 'chat',
          user: ws.user,
          text: cleanText
        });
        break;
      }

      default:
        ws.send(JSON.stringify({
          type: 'error',
          text: 'Action not allowed'
        }));
    }
  });

  ws.on('close', () => {
    clearTimeout(ws.authTimer);
    removeConnection(ws.sessionId, ws);

    if (ws.isAuthenticated) {
      console.log(`Secure WebSocket disconnected: ${ws.user}`);
      broadcast({
        type: 'system',
        text: `${ws.user} left the secure chat`
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Secure victim app running at http://localhost:${PORT}`);
});