
"use strict";


const State = {
  username: "",
  ws: null,
  connected: false,
  typingTimer: null,
  isTyping: false,
  pmTarget: null,           // null = public, "name" = private DM
  typingUsers: new Set(),
  avatarUrl: "",            // profile picture URL on server
  avatarFile: null,         // local avatar File object
  selectedFile: null,       // local attachment File object
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

  // New elements
  joinAvatarPreview:$("join-avatar-preview"),
  joinAvatarInput:  $("join-avatar-input"),
  sidebarAvatarInput:$("sidebar-avatar-input"),
  attachBtn:        $("attach-btn"),
  fileInput:        $("file-input"),
  attachmentPreviewBar:$("attachment-preview-bar"),
  previewContent:   $("preview-content"),
  attachmentCancel: $("attachment-cancel"),
  lightboxModal:    $("lightbox-modal"),
  lightboxImg:      $("lightbox-img"),
  lightboxCaption:  $("lightbox-caption"),
  closeLightbox:    $("close-lightbox"),

  shareBtn:          $("share-btn"),
  joinShareBtn:      $("join-share-btn"),
  shareModal:        $("share-modal"),
  closeShare:        $("close-share"),
  shareLinkInput:    $("share-link-input"),
  shareCopyBtn:      $("share-copy-btn"),
  shareQrImg:        $("share-qr-img"),
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

function createAvatarElement(username, avatarUrl, sizeClass = "") {
  const el = document.createElement("div");
  el.className = `avatar-el ${sizeClass}`;
  if (avatarUrl) {
    el.style.backgroundImage = `url(${avatarUrl})`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.textContent = "";
  } else {
    el.className += ` ${hashColor(username)}`;
    el.textContent = initials(username);
    el.style.backgroundImage = "";
  }
  return el;
}

function updateSidebarAvatar(username, avatarUrl) {
  const initialsEl = DOM.youAvatar.querySelector(".avatar-initials");
  if (avatarUrl) {
    DOM.youAvatar.style.backgroundImage = `url(${avatarUrl})`;
    DOM.youAvatar.style.backgroundSize = "cover";
    DOM.youAvatar.style.backgroundPosition = "center";
    if (initialsEl) initialsEl.style.display = "none";
  } else {
    DOM.youAvatar.style.backgroundImage = "";
    if (initialsEl) {
      initialsEl.textContent = initials(username);
      initialsEl.style.display = "inline-block";
    }
    DOM.youAvatar.className = `you-avatar editable ${hashColor(username)}`;
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function appendMessage({ from, avatar, text, file, timestamp, type, self, to }, playSound = true, smoothScroll = true) {
  const isOwn = from === State.username;
  const isPM  = type === "private";

  const row = document.createElement("div");
  row.className = `msg-row ${isOwn ? "sent" : "received"}`;

  const avContainer = document.createElement("div");
  avContainer.className = "msg-avatar-container";
  const avEl = createAvatarElement(from, avatar);
  avContainer.appendChild(avEl);
  row.appendChild(avContainer);

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

  if (text) {
    const textSpan = document.createElement("span");
    textSpan.innerHTML = sanitize(text).replace(/\n/g, "<br>");
    bubble.appendChild(textSpan);
  }

  if (file) {
    const fileDiv = document.createElement("div");
    
    if (file.type && file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = file.url;
      img.className = "msg-image-attachment";
      img.alt = file.name;
      img.title = "Click to view fullscreen";
      img.addEventListener("click", () => {
        showLightbox(file.url, file.name);
      });
      fileDiv.appendChild(img);
    } else if (file.type && file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = file.url;
      video.controls = true;
      video.className = "msg-video-attachment";
      fileDiv.appendChild(video);
    } else if (file.type && file.type.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.src = file.url;
      audio.controls = true;
      audio.className = "msg-audio-attachment";
      fileDiv.appendChild(audio);
    } else {
      fileDiv.className = "msg-file-attachment";
      fileDiv.innerHTML = `
        <div class="file-icon">📁</div>
        <div class="file-info">
          <span class="file-name">${sanitize(file.name)}</span>
          <span class="file-size">${formatBytes(file.size)}</span>
        </div>
        <a href="${file.url}" download="${sanitize(file.name)}" class="file-download-btn" title="Download file">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </a>
      `;
    }
    
    bubble.appendChild(fileDiv);
  }

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
  row.appendChild(wrapper);
  DOM.messagesContainer.appendChild(row);
  scrollToBottom(smoothScroll);

  if (!isOwn && playSound) {
    playNotifSound();
  }
}

function renderUserList(users) {
  DOM.userList.innerHTML = "";
  DOM.userCount.textContent = users.length;
  DOM.headerCount.textContent = users.length;

  users.forEach(({ username, avatar }) => {
    const item = document.createElement("div");
    item.className = `user-item${username === State.username ? " you" : ""}`;
    item.dataset.username = username;

    const av = createAvatarElement(username, avatar, "user-item-avatar");

    const nm = document.createElement("div");
    nm.className = "user-item-name";
    nm.textContent = username + (username === State.username ? " (you)" : "");

    const dm = document.createElement("div");
    dm.className = "user-item-dm";
    dm.textContent = "DM";

    item.appendChild(av);
    item.appendChild(nm);
    if (username !== State.username) item.appendChild(dm);

    item.addEventListener("click", () => {
      if (username !== State.username) {
        setPMTarget(username);
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



async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Upload failed");
  return await res.json();
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 50 * 1024 * 1024) {
    alert("File size exceeds 50MB limit.");
    DOM.fileInput.value = "";
    return;
  }

  State.selectedFile = file;
  DOM.attachmentPreviewBar.classList.remove("hidden");
  DOM.previewContent.innerHTML = "";

  if (file.type && file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.className = "preview-thumb";
    img.onload = () => URL.revokeObjectURL(img.src);
    DOM.previewContent.appendChild(img);
  }

  const details = document.createElement("div");
  details.className = "preview-file-card";
  details.innerHTML = `
    <div class="preview-file-details">
      <span class="preview-file-name">${sanitize(file.name)}</span>
      <span class="preview-file-size">${formatBytes(file.size)}</span>
    </div>
  `;
  DOM.previewContent.appendChild(details);

  DOM.sendBtn.disabled = false;
}

function clearAttachment() {
  State.selectedFile = null;
  DOM.fileInput.value = "";
  DOM.attachmentPreviewBar.classList.add("hidden");
  DOM.previewContent.innerHTML = "";
  DOM.sendBtn.disabled = DOM.messageInput.value.trim().length === 0;
}

function handleJoinAvatarSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("Avatar image size exceeds 5MB limit.");
    DOM.joinAvatarInput.value = "";
    return;
  }

  State.avatarFile = file;

  DOM.joinAvatarPreview.innerHTML = "";
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.onload = () => URL.revokeObjectURL(img.src);
  DOM.joinAvatarPreview.appendChild(img);

  const overlay = document.createElement("div");
  overlay.className = "avatar-picker-overlay";
  overlay.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  `;
  DOM.joinAvatarPreview.appendChild(overlay);
}

async function handleSidebarAvatarSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("Avatar image size exceeds 5MB limit.");
    DOM.sidebarAvatarInput.value = "";
    return;
  }

  try {
    const uploadRes = await uploadFile(file);
    const avatarUrl = uploadRes.url;
    State.avatarUrl = avatarUrl;

    updateSidebarAvatar(State.username, avatarUrl);

    if (State.connected) {
      State.ws.send(JSON.stringify({
        type: "update_avatar",
        avatar: avatarUrl
      }));
    }
  } catch (e) {
    alert("Failed to update avatar: " + e.message);
  }
}

function showLightbox(url, caption) {
  DOM.lightboxImg.src = url;
  DOM.lightboxCaption.textContent = caption;
  DOM.lightboxModal.classList.remove("hidden");
}

function hideLightbox() {
  DOM.lightboxModal.classList.add("hidden");
  DOM.lightboxImg.src = "";
  DOM.lightboxCaption.textContent = "";
}

function connectWS(username, avatarUrl = "") {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  let url = `${protocol}//${location.host}/ws/${encodeURIComponent(username)}`;
  if (avatarUrl) {
    url += `?avatar=${encodeURIComponent(avatarUrl)}`;
  }

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
        if (msg.history && Array.isArray(msg.history)) {
          msg.history.forEach(historyMsg => {
            appendMessage(historyMsg, false, false);
          });
        }
        break;

      case "error":
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

async function sendMessage() {
  const text = DOM.messageInput.value.trim();
  if (!text && !State.selectedFile) return;
  if (!State.connected) return;

  DOM.sendBtn.disabled = true;
  DOM.messageInput.disabled = true;

  let filePayload = null;
  try {
    if (State.selectedFile) {
      const uploadRes = await uploadFile(State.selectedFile);
      filePayload = {
        url: uploadRes.url,
        name: uploadRes.name,
        type: uploadRes.type,
        size: uploadRes.size
      };
    }
  } catch (e) {
    alert("Failed to upload file: " + e.message);
    DOM.sendBtn.disabled = false;
    DOM.messageInput.disabled = false;
    return;
  }

  const payload = {
    text
  };
  if (filePayload) {
    payload.file = filePayload;
  }

  if (State.pmTarget) {
    State.ws.send(JSON.stringify({
      type: "private",
      to: State.pmTarget,
      ...payload
    }));
  } else {
    State.ws.send(JSON.stringify({
      type: "message",
      ...payload
    }));
  }

  clearAttachment();
  DOM.messageInput.value = "";
  DOM.messageInput.disabled = false;
  DOM.messageInput.style.height = "auto";
  DOM.sendBtn.disabled = true;
  stopTyping();
  DOM.messageInput.focus();
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

async function handleJoin() {
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

  DOM.joinBtn.disabled = true;
  const btnSpan = DOM.joinBtn.querySelector("span");
  const oldText = btnSpan.textContent;
  btnSpan.textContent = "Connecting...";

  State.username = name;

  let avatarUrl = "";
  if (State.avatarFile) {
    try {
      const uploadRes = await uploadFile(State.avatarFile);
      avatarUrl = uploadRes.url;
      State.avatarUrl = avatarUrl;
    } catch (e) {
      showJoinError("Failed to upload avatar: " + e.message);
      DOM.joinBtn.disabled = false;
      btnSpan.textContent = oldText;
      return;
    }
  }

  // Show avatar in sidebar
  updateSidebarAvatar(name, avatarUrl);
  DOM.youName.textContent = name;

  // Switch screens
  DOM.joinScreen.classList.add("hidden");
  DOM.chatScreen.classList.remove("hidden");

  // Connect WS
  connectWS(name, avatarUrl);

  // Focus input
  setTimeout(() => DOM.messageInput.focus(), 100);
}

// Send message
DOM.sendBtn.addEventListener("click", sendMessage);

DOM.messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
    return;
  }
});

DOM.messageInput.addEventListener("input", () => {
  autoResize(DOM.messageInput);
  DOM.sendBtn.disabled = DOM.messageInput.value.trim().length === 0 && !State.selectedFile;
  startTyping();
});

// PM cancel
DOM.pmCancel.addEventListener("click", clearPMTarget);

// Sidebar toggle (mobile)
DOM.menuBtn.addEventListener("click", openSidebar);
DOM.sidebarClose.addEventListener("click", closeSidebar);

// New Event Listeners
DOM.joinAvatarPreview.addEventListener("click", () => DOM.joinAvatarInput.click());
DOM.joinAvatarInput.addEventListener("change", handleJoinAvatarSelect);
DOM.youAvatar.addEventListener("click", () => DOM.sidebarAvatarInput.click());
DOM.sidebarAvatarInput.addEventListener("change", handleSidebarAvatarSelect);

DOM.attachBtn.addEventListener("click", () => DOM.fileInput.click());
DOM.fileInput.addEventListener("change", handleFileSelect);
DOM.attachmentCancel.addEventListener("click", clearAttachment);

DOM.closeLightbox.addEventListener("click", hideLightbox);
DOM.lightboxModal.addEventListener("click", e => {
  if (e.target === DOM.lightboxModal) hideLightbox();
});

// Share Modal Functions
async function openShareModal() {
  try {
    const res = await fetch("/api/server-info");
    const info = await res.json();
    const inviteUrl = `http://${info.ip}:${info.port}`;
    DOM.shareLinkInput.value = inviteUrl;
  } catch (e) {
    DOM.shareLinkInput.value = window.location.origin;
  }
  DOM.shareQrImg.src = "/api/qr?t=" + Date.now();
  DOM.shareModal.classList.remove("hidden");
}

function closeShareModal() {
  DOM.shareModal.classList.add("hidden");
}

function copyShareLink() {
  const link = DOM.shareLinkInput.value;
  navigator.clipboard.writeText(link).then(() => {
    const btnSpan = DOM.shareCopyBtn.querySelector("span");
    const oldText = btnSpan.textContent;
    btnSpan.textContent = "Copied!";
    DOM.shareCopyBtn.style.background = "var(--accent-dark)";
    setTimeout(() => {
      btnSpan.textContent = oldText;
      DOM.shareCopyBtn.style.background = "";
    }, 2000);
  }).catch(err => {
    console.error("Failed to copy link: ", err);
  });
}

DOM.shareBtn.addEventListener("click", openShareModal);
if (DOM.joinShareBtn) {
  DOM.joinShareBtn.addEventListener("click", openShareModal);
}
DOM.closeShare.addEventListener("click", closeShareModal);
DOM.shareCopyBtn.addEventListener("click", copyShareLink);
DOM.shareModal.addEventListener("click", e => {
  if (e.target === DOM.shareModal) closeShareModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    hideLightbox();
    closeShareModal();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  DOM.usernameInput.focus();
});
