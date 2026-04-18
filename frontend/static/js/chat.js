
"use strict";


const State = {
  username: "",
  ws: null,
  connected: false,
  typingTimer: null,
  isTyping: false,
  pmTarget: null,           // null = public, "name" = private DM
  typingUsers: new Set(),
};


const $ = id => document.getElementById(id);

const DOM = {
  joinScreen:       $("join-screen"),
  chatScreen:       $("chat-screen"),
  usernameInput:    $("username-input"),
  joinBtn:          $("join-btn"),
  joinError:        $("join-error"),

  youAvatar:        $("you-avatar"),
  youName:          $("you-name"),
  userList:         $("user-list"),
  userCount:        $("user-count"),
  headerCount:      $("header-count"),

  messagesContainer:$("messages-container"),
  messageInput:     $("message-input"),
  sendBtn:          $("send-btn"),

  typingBar:        $("typing-bar"),
  typingText:       $("typing-text"),

  pmBar:            $("pm-bar"),
  pmTargetName:     $("pm-target-name"),
  pmCancel:         $("pm-cancel"),

  connIndicator:    $("conn-indicator"),
  connStatusText:   $("conn-status-text"),
  connDot:          document.querySelector(".connection-info .conn-dot"),

  sidebar:          $("sidebar"),
  menuBtn:          $("menu-btn"),
  sidebarClose:     $("sidebar-close"),
  notifSound:       $("notif-sound"),
};



/** Simple hash to pick avatar color class */
function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return `av-${Math.abs(h) % 8}`;
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

function sanitize(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function scrollToBottom(smooth = true) {
  const c = DOM.messagesContainer;
  c.scrollTo({ top: c.scrollHeight, behavior: smooth ? "smooth" : "instant" });
}

/** Generate a soft notification beep via Web Audio API */
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}



function showJoinError(msg) {
  DOM.joinError.textContent = msg;
  DOM.joinError.classList.remove("hidden");
}

function hideJoinError() {
  DOM.joinError.classList.add("hidden");
}

function setConnectionStatus(status) {
  // status: "connected" | "disconnected" | "connecting"
  const dot = DOM.connIndicator.querySelector(".conn-dot-small");
  dot.className = `conn-dot-small ${status !== "connected" ? status : ""}`;

  if (DOM.connDot) {
    DOM.connDot.className = `conn-dot ${status !== "connected" ? "disconnected" : ""}`;
  }

  const texts = {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Reconnecting..."
  };
  if (DOM.connStatusText) DOM.connStatusText.textContent = texts[status] || status;
}

function appendSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "msg-system";
  el.textContent = text;
  DOM.messagesContainer.appendChild(el);
  scrollToBottom();
}

function appendMessage({ from, text, timestamp, type, self, to }) {
  const isOwn = from === State.username;
  const isPM  = type === "private";

  const wrapper = document.createElement("div");
  wrapper.className = `msg-wrapper ${isOwn ? "sent" : "received"} ${isPM ? "pm" : ""}`;

  if (!isOwn) {
    const sender = document.createElement("div");
    sender.className = "msg-sender";
    sender.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue(`--accent${isPM ? "-purple" : ""}`).trim() || "#25d366";
    sender.textContent = from;
    wrapper.appendChild(sender);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = sanitize(text).replace(/\n/g, "<br>");
  wrapper.appendChild(bubble);

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.innerHTML = `<span class="msg-time">${timestamp}</span>`;

  if (isPM) {
    const tag = document.createElement("span");
    tag.className = "msg-pm-tag";
    tag.textContent = isOwn ? `→ ${to}` : "Private";
    meta.appendChild(tag);
  }

  wrapper.appendChild(meta);
  DOM.messagesContainer.appendChild(wrapper);
  scrollToBottom();

  // Play sound for incoming messages
  if (!isOwn) {
    playNotifSound();
  }
}

function renderUserList(users) {
  DOM.userList.innerHTML = "";
  DOM.userCount.textContent = users.length;
  DOM.headerCount.textContent = users.length;

  users.forEach(name => {
    const item = document.createElement("div");
    item.className = `user-item${name === State.username ? " you" : ""}`;
    item.dataset.username = name;

    const av = document.createElement("div");
    av.className = `user-item-avatar ${hashColor(name)}`;
    av.textContent = initials(name);

    const nm = document.createElement("div");
    nm.className = "user-item-name";
    nm.textContent = name + (name === State.username ? " (you)" : "");

    const dm = document.createElement("div");
    dm.className = "user-item-dm";
    dm.textContent = "DM";

    item.appendChild(av);
    item.appendChild(nm);
    if (name !== State.username) item.appendChild(dm);

    // Click to start DM
    item.addEventListener("click", () => {
      if (name !== State.username) {
        setPMTarget(name);
        closeSidebar();
      }
    });

    DOM.userList.appendChild(item);
  });
}

function updateTypingBar() {
  const users = [...State.typingUsers].filter(u => u !== State.username);
  if (users.length === 0) {
    DOM.typingBar.classList.remove("active");
    return;
  }

  DOM.typingBar.classList.add("active");
  if (users.length === 1) {
    DOM.typingText.textContent = `${users[0]} is typing...`;
  } else if (users.length === 2) {
    DOM.typingText.textContent = `${users[0]} and ${users[1]} are typing...`;
  } else {
    DOM.typingText.textContent = `${users.length} people are typing...`;
  }
}

function setPMTarget(name) {
  State.pmTarget = name;
  DOM.pmTargetName.textContent = name;
  DOM.pmBar.classList.remove("hidden");
  DOM.messageInput.placeholder = `Message ${name} privately...`;
  DOM.messageInput.focus();
}

function clearPMTarget() {
  State.pmTarget = null;
  DOM.pmBar.classList.add("hidden");
  DOM.messageInput.placeholder = "Type a message...";
}



function connectWS(username) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/ws/${encodeURIComponent(username)}`;

  setConnectionStatus("connecting");

  const ws = new WebSocket(url);
  State.ws = ws;

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    State.connected = true;
    setConnectionStatus("connected");
  };

  ws.onmessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {

      case "welcome":
        renderUserList(msg.users || []);
        break;

      case "error":
        // Show error on join screen if not yet in chat
        if (DOM.joinScreen && !DOM.joinScreen.classList.contains("hidden")) {
          showJoinError(msg.message);
        }
        ws.close();
        break;

      case "message":
        appendMessage(msg);
        break;

      case "private":
        appendMessage(msg);
        break;

      case "system":
        appendSystemMessage(msg.message);
        break;

      case "user_list":
        renderUserList(msg.users || []);
        break;

      case "typing":
        if (msg.typing) {
          State.typingUsers.add(msg.user);
        } else {
          State.typingUsers.delete(msg.user);
        }
        updateTypingBar();
        break;

      default:
        console.log("Unknown message type:", msg.type);
    }
  };

  ws.onclose = () => {
    State.connected = false;
    setConnectionStatus("disconnected");
    appendSystemMessage("⚠️ Connection lost. Refresh the page to reconnect.");
    console.log("WebSocket closed");
  };

  ws.onerror = err => {
    console.error("WebSocket error:", err);
  };
}

function sendMessage() {
  const text = DOM.messageInput.value.trim();
  if (!text || !State.connected) return;

  if (State.pmTarget) {
    State.ws.send(JSON.stringify({
      type: "private",
      to: State.pmTarget,
      text
    }));
  } else {
    State.ws.send(JSON.stringify({
      type: "message",
      text
    }));
  }

  DOM.messageInput.value = "";
  DOM.sendBtn.disabled = true;
  DOM.messageInput.style.height = "auto";
  stopTyping();
}

function startTyping() {
  if (!State.isTyping && State.connected) {
    State.isTyping = true;
    State.ws.send(JSON.stringify({ type: "typing", typing: true }));
  }
  clearTimeout(State.typingTimer);
  State.typingTimer = setTimeout(stopTyping, 2000);
}

function stopTyping() {
  clearTimeout(State.typingTimer);
  if (State.isTyping && State.connected) {
    State.isTyping = false;
    State.ws.send(JSON.stringify({ type: "typing", typing: false }));
  }
}


let sidebarOverlay = null;

function openSidebar() {
  DOM.sidebar.classList.add("open");
  if (!sidebarOverlay) {
    sidebarOverlay = document.createElement("div");
    sidebarOverlay.className = "sidebar-overlay";
    document.body.appendChild(sidebarOverlay);
    sidebarOverlay.addEventListener("click", closeSidebar);
  }
  sidebarOverlay.classList.add("active");
}

function closeSidebar() {
  DOM.sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("active");
}



// Join
DOM.joinBtn.addEventListener("click", handleJoin);
DOM.usernameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") handleJoin();
});
DOM.usernameInput.addEventListener("input", hideJoinError);

function handleJoin() {
  const name = DOM.usernameInput.value.trim();
  if (!name) {
    showJoinError("Please enter a name.");
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    showJoinError("Only letters, numbers, _ and - are allowed.");
    return;
  }
  if (name.length < 2) {
    showJoinError("Name must be at least 2 characters.");
    return;
  }

  State.username = name;

  // Show avatar in sidebar
  DOM.youAvatar.textContent = initials(name);
  DOM.youAvatar.className = `you-avatar ${hashColor(name)}`;
  DOM.youName.textContent = name;

  // Switch screens
  DOM.joinScreen.classList.add("hidden");
  DOM.chatScreen.classList.remove("hidden");

  // Connect WS
  connectWS(name);

  // Focus input
  setTimeout(() => DOM.messageInput.focus(), 100);
}

// Send message
DOM.sendBtn.addEventListener("click", sendMessage);

DOM.messageInput.addEventListener("keydown", e => {
  // Send on Enter (not Shift+Enter)
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
    return;
  }
});

DOM.messageInput.addEventListener("input", () => {
  autoResize(DOM.messageInput);
  DOM.sendBtn.disabled = DOM.messageInput.value.trim().length === 0;
  startTyping();
});

// PM cancel
DOM.pmCancel.addEventListener("click", clearPMTarget);

// Sidebar toggle (mobile)
DOM.menuBtn.addEventListener("click", openSidebar);
DOM.sidebarClose.addEventListener("click", closeSidebar);


document.addEventListener("DOMContentLoaded", () => {
  DOM.usernameInput.focus();
});
