"""
LocalChat Server - FastAPI + WebSockets
Real-time local network chat application
"""

import asyncio
import json
import socket
import logging
import os
import uuid
import shutil
import io
import qrcode
from datetime import datetime
from typing import Dict, Set, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse, Response
import uvicorn


# Logging Setup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


# FastAPI App

app = FastAPI(title="LocalChat", version="1.0.0")

# Serve static files (CSS, JS, sounds)
app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")

# Jinja2 templates
templates = Jinja2Templates(directory="../frontend/templates")



# Connection Manager

class ConnectionManager:
    def __init__(self):
        # Maps username -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        # Maps username -> typing status
        self.typing_users: Set[str] = set()
        # Maps username -> avatar URL (or None)
        self.avatars: Dict[str, Optional[str]] = {}
        # Stores last 100 public chat messages
        self.message_history = []

    def add_to_history(self, message: dict):
        """Append a public chat message to the history buffer, capping at 100 messages."""
        self.message_history.append(message)
        if len(self.message_history) > 100:
            self.message_history.pop(0)

    async def connect(self, websocket: WebSocket, username: str, avatar: Optional[str] = None) -> bool:
        """Accept a new WebSocket connection and register user."""
        await websocket.accept()
        if username in self.active_connections:
            # Username already taken
            await websocket.send_json({
                "type": "error",
                "message": f"Username '{username}' is already taken. Choose another."
            })
            await websocket.close()
            return False

        self.active_connections[username] = websocket
        if avatar:
            self.avatars[username] = avatar
        logger.info(f"[+] {username} connected | Total users: {len(self.active_connections)}")
        return True

    async def disconnect(self, username: str):
        """Remove user from active connections."""
        if username in self.active_connections:
            del self.active_connections[username]
        if username in self.avatars:
            del self.avatars[username]
        self.typing_users.discard(username)
        logger.info(f"[-] {username} disconnected | Total users: {len(self.active_connections)}")

    def get_user_list(self) -> list:
        """Return sorted list of online users."""
        return sorted(self.active_connections.keys())

    async def broadcast(self, message: dict, exclude: Optional[str] = None):
        """Send a message to all connected users (optionally excluding one)."""
        disconnected = []
        for username, ws in self.active_connections.items():
            if username == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(username)

        # Clean up dead connections
        for username in disconnected:
            await self.disconnect(username)

    async def send_to_user(self, target: str, message: dict) -> bool:
        """Send a private message to a specific user."""
        if target in self.active_connections:
            try:
                await self.active_connections[target].send_json(message)
                return True
            except Exception:
                await self.disconnect(target)
        return False

    async def broadcast_user_list(self):
        """Notify all users of the updated user list."""
        users_info = [{"username": name, "avatar": self.avatars.get(name)} for name in self.get_user_list()]
        await self.broadcast({
            "type": "user_list",
            "users": users_info,
            "count": len(self.active_connections)
        })


# Global manager instance
manager = ConnectionManager()



# Helper: Get Local IP

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def make_timestamp() -> str:
    return datetime.now().strftime("%I:%M %p")



# Routes

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the main chat page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/users")
async def get_users():
    """REST endpoint to get current user list."""
    users_info = [{"username": name, "avatar": manager.avatars.get(name)} for name in manager.get_user_list()]
    return {
        "users": users_info,
        "count": len(manager.active_connections)
    }


@app.get("/api/server-info")
async def server_info():
    """Return server info including local IP."""
    return {
        "ip": get_local_ip(),
        "port": 8000,
        "version": "1.0.0"
    }


@app.get("/api/qr")
async def get_qr_code():
    """Generate an SVG QR code pointing to the LAN invite URL."""
    ip = get_local_ip()
    url = f"http://{ip}:8000"
    
    import qrcode.image.svg
    factory = qrcode.image.svg.SvgImage
    img = qrcode.make(url, image_factory=factory)
    
    stream = io.BytesIO()
    img.save(stream)
    svg_content = stream.getvalue()
    
    return Response(content=svg_content, media_type="image/svg+xml")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload file and return its static URL and metadata."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    uploads_dir = os.path.join(base_dir, "..", "frontend", "static", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(uploads_dir, unique_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_size = os.path.getsize(file_path)
    
    return {
        "url": f"/static/uploads/{unique_name}",
        "name": file.filename,
        "type": file.content_type,
        "size": file_size
    }



# WebSocket Endpoint

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    # Sanitize username
    username = username.strip()[:20]
    if not username or not username.replace("_", "").replace("-", "").isalnum():
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Invalid username."})
        await websocket.close()
        return

    # Get optional avatar URL from query parameters
    avatar = websocket.query_params.get("avatar")

    # Register connection
    connected = await manager.connect(websocket, username, avatar)
    if not connected:
        return

    # Announce user joined
    await manager.broadcast({
        "type": "system",
        "message": f"{username} joined the chat 👋",
        "timestamp": make_timestamp()
    })

    # Send current user list to all
    await manager.broadcast_user_list()

    # Send welcome message to new user
    users_info = [{"username": name, "avatar": manager.avatars.get(name)} for name in manager.get_user_list()]
    await manager.send_to_user(username, {
        "type": "welcome",
        "message": f"Welcome, {username}! You are connected.",
        "users": users_info,
        "history": manager.message_history,
        "timestamp": make_timestamp()
    })

    try:
        while True:
            # Wait for incoming message from this client
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "message")

            # ── Public Message ──────────────────────────
            if msg_type == "message":
                text = data.get("text", "").strip()
                file_data = data.get("file")
                if not text and not file_data:
                    continue
                if len(text) > 1000:
                    continue

                logger.info(f"[MSG] {username}: {text[:60] or '[File]'}")

                msg_payload = {
                    "type": "message",
                    "from": username,
                    "avatar": manager.avatars.get(username),
                    "text": text,
                    "file": file_data,
                    "timestamp": make_timestamp()
                }
                manager.add_to_history(msg_payload)
                await manager.broadcast(msg_payload)

            # ── Private Message ─────────────────────────
            elif msg_type == "private":
                target = data.get("to", "").strip()
                text = data.get("text", "").strip()
                file_data = data.get("file")
                if (not text and not file_data) or not target or target == username:
                    continue

                pm_payload = {
                    "type": "private",
                    "from": username,
                    "to": target,
                    "avatar": manager.avatars.get(username),
                    "text": text,
                    "file": file_data,
                    "timestamp": make_timestamp()
                }

                # Send to recipient
                sent = await manager.send_to_user(target, pm_payload)

                # Echo back to sender
                await manager.send_to_user(username, {**pm_payload, "self": True})

                if not sent:
                    await manager.send_to_user(username, {
                        "type": "system",
                        "message": f"⚠️ {target} is not online.",
                        "timestamp": make_timestamp()
                    })

            # ── Update Avatar ───────────────────────────
            elif msg_type == "update_avatar":
                avatar_url = data.get("avatar", "").strip()
                if avatar_url:
                    manager.avatars[username] = avatar_url
                else:
                    manager.avatars.pop(username, None)
                await manager.broadcast_user_list()

            # ── Typing Indicator ────────────────────────
            elif msg_type == "typing":
                is_typing = data.get("typing", False)
                if is_typing:
                    manager.typing_users.add(username)
                else:
                    manager.typing_users.discard(username)

                # Broadcast typing status to others
                await manager.broadcast({
                    "type": "typing",
                    "user": username,
                    "typing": is_typing
                }, exclude=username)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Error for {username}: {e}")
    finally:
        # Cleanup on disconnect
        await manager.disconnect(username)
        await manager.broadcast({
            "type": "system",
            "message": f"{username} left the chat 👋",
            "timestamp": make_timestamp()
        })
        await manager.broadcast_user_list()


# ─────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    local_ip = get_local_ip()
    port = 8000

    
    print("LocalChat Server Starting...")
  
    print(f"Local IP   : {local_ip}")
    print(f"Server URL : http://{local_ip}:{port}")
    print(f"Localhost  : http://127.0.0.1:{port}")
    
    print("Share the Server URL with devices on same WiFi")
    print("Press Ctrl+C to stop the server")
   

    uvicorn.run(
        app,
        host="0.0.0.0",   # Listen on ALL network interfaces
        port=port,
        log_level="warning"
    )
