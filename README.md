# 🌐 LoTalk

> Real-time chat app for your local WiFi network. No internet required.

---

## 📁 Project Structure

```
localchat/
├── start.py                    ← Run this to start everything
├── README.md
│
├── backend/
│   ├── server.py               ← FastAPI + WebSocket server
│   └── requirements.txt        ← Python dependencies
│
└── frontend/
    ├── templates/
    │   └── index.html          ← Main chat UI (served by backend)
    └── static/
        ├── css/
        │   └── style.css       ← All styles
        └── js/
            └── chat.js         ← WebSocket client + UI logic
```

---

## ⚡ Quick Start

### Step 1 — Install Python
Make sure Python 3.8+ is installed:
```bash
python --version
```

### Step 2 — Run the server
```bash
# From the localchat/ folder:
python start.py
```
This auto-installs all dependencies and starts the server.

**Or manually:**
```bash
cd backend
pip install -r requirements.txt
python server.py
```

### Step 3 — Find your Local IP
The server prints your IP automatically. Or find it manually:

| OS      | Command              |
|---------|----------------------|
| Windows | `ipconfig`           |
| Mac     | `ifconfig`           |
| Linux   | `ip addr` or `hostname -I` |

Look for something like `192.168.x.x`

### Step 4 — Connect from other devices
On any device on the **same WiFi**:
```
Open browser → http://192.168.x.x:8000
```

---

## 🔧 How It Works

```
[Phone/PC Browser]  ←──WebSocket──→  [Python Server]  ←──WebSocket──→  [Other Devices]
        ↑                                    ↑
    HTML+CSS+JS                     FastAPI + Uvicorn
    (served by server)              (runs on your machine)
```

1. Server runs on your machine and listens on all network interfaces (`0.0.0.0:8000`)
2. Other devices connect via browser using your local IP
3. WebSockets enable real-time bidirectional messaging
4. Server manages all connections and broadcasts messages

---

## ✨ Features

| Feature              | Details                              |
|----------------------|--------------------------------------|
| Real-time messaging  | WebSockets (no page refresh needed)  |
| Multiple devices     | Phones + PCs simultaneously          |
| Private messages     | Click user → send DM                 |
| Typing indicators    | See who's typing in real-time        |
| Message timestamps   | Every message has a time             |
| User list            | Live list of online users            |
| Auto-scroll          | Chat always shows latest message     |
| Notification sound   | Soft beep on incoming messages       |
| Mobile responsive    | Works on phones and tablets          |
| No internet needed   | 100% local network                   |

---

## 🧪 Testing

### Two phones on same WiFi:
1. Start server on your PC
2. On Phone 1: open `http://192.168.x.x:8000`, enter name, join
3. On Phone 2: open same URL, enter different name, join
4. Send messages — they appear on both phones instantly!

### Phone + PC:
1. Start server on PC
2. Open `http://localhost:8000` on PC
3. Open `http://192.168.x.x:8000` on phone (same WiFi)
4. Chat between them

### Two browser tabs (quick test):
1. Open `http://localhost:8000` in two different browser tabs
2. Enter different usernames in each tab
3. Send messages — they appear in both

---

## 🛠️ Troubleshooting

| Problem                       | Solution                                       |
|-------------------------------|------------------------------------------------|
| Other device can't connect    | Check firewall — allow port 8000               |
| "Username taken" error        | Choose a different username                    |
| Messages not appearing        | Check browser console for WebSocket errors     |
| Server won't start            | Run `pip install -r backend/requirements.txt`  |
| Wrong IP shown                | Run `ipconfig` / `ifconfig` manually           |

### Windows Firewall (if other devices can't connect):
```
Windows Defender Firewall → Allow an app → Add Python
Or: New Inbound Rule → Port 8000 → Allow
```

---

## 🔐 Security Note
This app has **no authentication** — anyone on your network can join.
Only use on trusted networks (home WiFi, personal hotspot).

---

## 🚀 Future Ideas
- [ ] Persistent message history (SQLite)
- [ ] File/image sharing
- [ ] Multiple chat rooms
- [ ] Password protection
- [ ] User avatars/profile pictures
