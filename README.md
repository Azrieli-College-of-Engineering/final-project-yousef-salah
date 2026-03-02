# CSWSH Lab Project

A local lab project that demonstrates **Cross-Site WebSocket Hijacking (CSWSH)** using:

- a **vulnerable victim application**
- an **attacker page** running from a different origin
- a **secure victim application** with protections enabled
- a **launcher page** to make the demo easier to run

This project was built for educational purposes as part of a web security course project.

---

## Authors

- **Yousef Salman**
- **Salah Shamasaneh**

---

## Overview

This project demonstrates how a WebSocket-based web application can become vulnerable when it accepts authenticated connections based only on the user's existing session, without performing proper connection validation.

The lab includes:

- a **vulnerable victim application**
- an **attacker application** running on a different origin
- a **secure victim application**
- a **launcher page** for easier navigation

The goal is to show:

- how CSWSH works
- why it is different from regular HTTP request flows
- what impact it can have in a realistic web application
- how to mitigate it properly

---

## What is CSWSH?

**Cross-Site WebSocket Hijacking (CSWSH)** happens when:

1. a victim is already logged into a web application
2. the victim visits a malicious page from a different origin
3. that page causes the victim’s browser to open a WebSocket connection to the legitimate server
4. the server accepts the connection because it trusts the user’s existing session
5. the attacker can send actions or messages through that authenticated socket

In other words, the browser becomes the bridge between the attacker page and the legitimate application.

---

## Project Structure

```text
final-project-yousef-salah/
│
├── victim-app/              # Vulnerable version
│   ├── public/
│   │   ├── login.html
│   │   └── chat.html
│   ├── server.js
│   └── package.json
│
├── secure-victim-app/       # Hardened version
│   ├── public/
│   │   ├── login.html
│   │   └── secure-chat.html
│   ├── secure-server.js
│   └── package.json
│
├── attacker-site/           # Cross-origin attacker page
│   ├── public/
│   │   ├── attack.html
│   │   ├── attack.js
│   │   └── attack.css
│   ├── server.js
│   └── package.json
│
├── launcher.html            # Demo launcher page
├── launcher-server.js       # Serves the launcher page
└── package.json             # Root scripts for running everything
```

---

## Applications and Ports

| Component | Purpose | Port |
|---|---|---:|
| Victim App | Vulnerable WebSocket application | `3000` |
| Attacker Site | Cross-origin attacker page | `4000` |
| Secure Victim App | Protected WebSocket application | `5000` |
| Launcher | Opens the demo pages | `8080` |

---

## Features

### Vulnerable App
- login with session cookie
- protected chat page
- WebSocket chat
- intentionally missing WebSocket security checks

### Attacker Site
- runs from a different origin
- tries to open a WebSocket to the victim app
- sends a controlled attack payload

### Secure App
- strict `Origin` validation
- dedicated WebSocket authentication token
- message-level authorization
- stronger separation between trusted and untrusted connections

---

## Attack Scenario

### Vulnerable Flow

1. The user logs into the vulnerable app on `localhost:3000`
2. The browser stores the session cookie
3. The user opens the attacker page on `localhost:4000`
4. The attacker page opens a WebSocket to `ws://localhost:3000/ws`
5. The vulnerable server accepts the connection
6. The attacker page sends a message through the victim’s authenticated session

### Secure Flow

1. The user logs into the secure app on `localhost:5000`
2. The attacker page tries to connect to `ws://localhost:5000/ws`
3. The server checks the `Origin`
4. The connection is rejected because the origin is not trusted
5. Even same-origin clients must complete token-based WebSocket authentication

---

## Technologies Used

- **Node.js**
- **Express**
- **express-session**
- **ws**
- **HTML**
- **CSS**
- **JavaScript**

---

## Installation

Clone the repository and install dependencies.

### Root project

```bash
npm install
```

### Vulnerable app

```bash
cd victim-app
npm install
cd ..
```

### Secure victim app

```bash
cd secure-victim-app
npm install
cd ..
```

### Attacker site

```bash
cd attacker-site
npm install
cd ..
```

---

## How to Start the App

### Option 1 — Start everything with one command

From the **root folder**:

```bash
npm run start:all
```

This starts:

- vulnerable app on `http://localhost:3000`
- secure app on `http://localhost:5000`
- attacker site on `http://localhost:4000`
- launcher on `http://localhost:8080`

Then open:

```text
http://localhost:8080
```

From the launcher page, you can open:

- Vulnerable App
- Secure App
- Attacker Page

---

### Option 2 — Start each app manually

#### Start the vulnerable app

```bash
cd victim-app
npm start
```

Open:

```text
http://localhost:3000/login
```

#### Start the secure app

```bash
cd secure-victim-app
npm start
```

Open:

```text
http://localhost:5000/login
```

#### Start the attacker site

```bash
cd attacker-site
npm start
```

Open:

```text
http://localhost:4000
```

#### Start the launcher

From the root folder:

```bash
node launcher-server.js
```

Open:

```text
http://localhost:8080
```

---

## Demo Steps

### Vulnerable Demo

1. Start all apps
2. Open the vulnerable app on `http://localhost:3000/login`
3. Log in with any username
4. Open the attacker page on `http://localhost:4000`
5. Connect and send a message
6. Observe that the vulnerable server accepts the WebSocket and processes the message through the victim session

### Secure Demo

1. Open the secure app on `http://localhost:5000/login`
2. Log in with any username
3. Open the attacker page
4. Try to connect to the secure server
5. Observe that the connection is rejected because the `Origin` is not allowed

---

## Security Improvements in the Secure Version

The secure version implements several protections:

- **Origin validation**  
  Only trusted origins are allowed to open WebSocket connections.

- **Dedicated WebSocket token**  
  The client must authenticate the WebSocket connection using a session-bound token.

- **Message-level authorization**  
  Only explicitly allowed message types are accepted.

- **Safer session handling**  
  Connections are tied more carefully to authenticated users and controlled actions.

---

## Example Root Scripts

The root `package.json` includes scripts similar to:

```json
{
  "scripts": {
    "start:victim": "npm --prefix victim-app start",
    "start:secure": "npm --prefix secure-victim-app start",
    "start:attacker": "npm --prefix attacker-site start",
    "start:launcher": "node launcher-server.js",
    "open:launcher": "wait-on tcp:3000 tcp:4000 tcp:5000 tcp:8080 && open-cli http://localhost:8080",
    "start:all": "concurrently -n victim,secure,attacker,launcher,open \"npm run start:victim\" \"npm run start:secure\" \"npm run start:attacker\" \"npm run start:launcher\" \"npm run open:launcher\""
  }
}
```

---

## Notes

- This project is intended for **local educational use only**
- The attack demonstration is performed in a **controlled lab environment**
- The purpose is to understand the vulnerability and its mitigation, not to target real applications

---

## References

- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [MDN - Writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)
- [RFC 6455 - The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

---
