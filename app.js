import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit,
  onSnapshot, serverTimestamp, doc, setDoc, getDoc, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAu84Vb6ExdUZjGNmTkjZtJoR37AoiX8Hw",
  authDomain: "chatt-55a5a.firebaseapp.com",
  projectId: "chatt-55a5a",
  storageBucket: "chatt-55a5a.firebasestorage.app",
  messagingSenderId: "1012255064348",
  appId: "1:1012255064348:web:5e7931e8d9d17651b83ad9",
  measurementId: "G-LP0B8VKBMX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
const MAX_MEDIA_CHARS = 470000;

let username = "";
let stopMessages = null;
let stickerTab = "mine";
let cachedStickers = [];
let cachedFavorites = [];

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// ---------- Authentication ----------
$("registerBtn").onclick = async () => {
  try {
    const name = $("username").value.trim();
    const email = $("email").value.trim();
    const password = $("password").value;
    if (name.length < 3) throw new Error("Username must have at least 3 characters.");
    if (password.length < 6) throw new Error("Password must have at least 6 characters.");
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    await setDoc(doc(db, "users", result.user.uid), {
      username: name, email, createdAt: serverTimestamp()
    });
    username = name;
    $("authStatus").textContent = "";
  } catch (error) {
    $("authStatus").textContent = error.message;
  }
};

$("loginBtn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    $("authStatus").textContent = "";
  } catch (error) {
    $("authStatus").textContent = error.message;
  }
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  if (!user) {
    $("authScreen").hidden = false;
    $("appScreen").hidden = true;
    if (stopMessages) { stopMessages(); stopMessages = null; }
    closeStickerPanel();
    return;
  }

  $("authScreen").hidden = true;
  $("appScreen").hidden = false;
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    username = userDoc.exists()
      ? userDoc.data().username
      : user.displayName || user.email.split("@")[0];
    startChat();
  } catch (error) {
    console.error(error);
    $("authStatus").textContent = error.message;
  }
});

function makeEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const icon = document.createElement("span"); icon.textContent = "✦";
  const title = document.createElement("strong"); title.textContent = "It's quiet in here";
  const hint = document.createElement("small"); hint.textContent = "Start the conversation.";
  empty.append(icon, title, hint);
  return empty;
}

function addMessageImage(parent, src, alt, sticker = false) {
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.loading = "lazy";
  image.className = sticker ? "sticker-image" : "chat-image";
  parent.appendChild(image);
}

function startChat() {
  if (stopMessages) stopMessages();
  const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(100));

  stopMessages = onSnapshot(q, snapshot => {
    const container = $("messages");
    container.replaceChildren();
    const docs = [...snapshot.docs].reverse();
    if (!docs.length) { container.appendChild(makeEmptyState()); return; }

    for (const item of docs) {
      const data = item.data();
      const mine = data.uid === auth.currentUser?.uid;
      const row = document.createElement("article");
      row.className = "message-row" + (mine ? " mine" : "");

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = (data.username || "U").slice(0, 1).toUpperCase();

      const body = document.createElement("div");
      body.className = "message-body";
      const sender = document.createElement("div");
      sender.className = "sender";
      sender.textContent = mine ? "You" : (data.username || "User");

      const message = document.createElement("div");
      message.className = "message " + (mine ? "mine" : "theirs");
      if (data.bubbleStyle && ["bubble-sun", "bubble-love", "bubble-mint", "bubble-night"].includes(data.bubbleStyle)) {
        message.classList.add("special", data.bubbleStyle);
      }

      if ((data.type === "drawing" || data.type === "image") && data.image) {
        addMessageImage(message, data.image, data.type === "drawing" ? "Shared drawing" : "Shared photo");
      } else if (data.type === "sticker" && data.image) {
        addMessageImage(message, data.image, "Sticker", true);
        const favorite = document.createElement("button");
        favorite.type = "button";
        favorite.className = "message-favorite";
        favorite.title = "Save sticker to favorites";
        favorite.textContent = "☆";
        favorite.addEventListener("click", () => saveFavorite({
          image: data.image,
          stickerId: data.stickerId || item.id,
          ownerUid: data.stickerOwnerUid || data.uid,
          name: data.stickerName || "Sticker"
        }));
        message.appendChild(favorite);
      } else {
        const text = document.createElement("p");
        text.textContent = data.text || "";
        message.appendChild(text);
      }

      const time = document.createElement("div");
      time.className = "time";
      time.textContent = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Sending…";

      body.append(sender, message, time);
      row.append(avatar, body);
      container.appendChild(row);
    }
    container.scrollTop = container.scrollHeight;
  }, error => {
    console.error(error);
    $("authStatus").textContent = error.message;
  });
}

// ---------- Text and bubble styles ----------
async function sendText(text, bubbleStyle = "") {
  if (!text || !auth.currentUser) return;
  await addDoc(collection(db, "messages"), {
    uid: auth.currentUser.uid, username, text, type: "text",
    ...(bubbleStyle ? { bubbleStyle } : {}),
    createdAt: serverTimestamp()
  });
}

$("messageForm").onsubmit = async event => {
  event.preventDefault();
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text || !auth.currentUser) return;
  input.value = "";
  $("bubblePicker").hidden = true;
  try { await sendText(text); }
  catch (error) { input.value = text; showToast("Message could not be sent: " + error.message); }
};

$("bubbleBtn").onclick = () => {
  $("bubblePicker").hidden = !$("bubblePicker").hidden;
  $("stickerPanel").hidden = true;
};

document.querySelectorAll(".bubble-choice").forEach(button => {
  button.addEventListener("click", async () => {
    const input = $("messageInput");
    const text = input.value.trim();
    if (!text) { input.placeholder = "Write something first…"; input.focus(); return; }
    try {
      await sendText(text, button.dataset.bubble);
      input.value = "";
      input.placeholder = "Write a message...";
      $("bubblePicker").hidden = true;
    } catch (error) { showToast("Bubble could not be sent: " + error.message); }
  });
});

// ---------- Gallery images and custom stickers (Firestore data URLs) ----------
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be opened.")); };
    image.src = url;
  });
}

function canvasToDataUrl(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error("Could not process this image."));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the processed image."));
      reader.readAsDataURL(blob);
    }, type, quality);
  });
}

async function makeCompressedImage(file, mode) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Choose an image from your gallery.");
  const image = await loadImageFile(file);
  const sticker = mode === "sticker";
  let maxSide = sticker ? 512 : 1440;
  let quality = sticker ? 0.88 : 0.76;
  let result = "";

  for (let attempt = 0; attempt < 7; attempt++) {
    const canvas = document.createElement("canvas");
    if (sticker) {
      canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext("2d");
      const scale = Math.min(464 / image.width, 464 / image.height);
      const width = image.width * scale, height = image.height * scale;
      ctx.clearRect(0, 0, 512, 512);
      ctx.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height);
    } else {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    result = await canvasToDataUrl(canvas, sticker ? "image/webp" : "image/jpeg", quality);
    if (result.length <= MAX_MEDIA_CHARS) return result;
    quality = Math.max(0.42, quality - 0.08);
    if (!sticker) maxSide = Math.round(maxSide * 0.82);
  }
  throw new Error("This image is too large. Try a smaller photo.");
}

async function sendPhoto(file) {
  const image = await makeCompressedImage(file, "photo");
  await addDoc(collection(db, "messages"), {
    uid: auth.currentUser.uid, username, type: "image", image,
    fileName: (file.name || "photo").slice(0, 80),
    createdAt: serverTimestamp()
  });
  showToast("Photo sent!");
}

$("photoBtn").onclick = () => {
  $("bubblePicker").hidden = true;
  $("stickerPanel").hidden = true;
  $("photoInput").click();
};
$("photoInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !auth.currentUser) return;
  try { showToast("Preparing photo…"); await sendPhoto(file); }
  catch (error) { showToast("Photo could not be sent: " + error.message); }
});

async function createSticker(file) {
  const image = await makeCompressedImage(file, "sticker");
  const stickerRef = await addDoc(collection(db, "users", auth.currentUser.uid, "stickers"), {
    image, name: (file.name || "My sticker").replace(/\.[^.]+$/, "").slice(0, 40),
    ownerUid: auth.currentUser.uid, createdAt: serverTimestamp()
  });
  showToast("Sticker added! Tap it in My Stickers to send.");
  stickerTab = "mine";
  document.querySelectorAll("[data-sticker-tab]").forEach(b => b.classList.toggle("active", b.dataset.stickerTab === "mine"));
  $("stickerPanel").hidden = false;
  await renderStickerPanel();
}

$("stickerCreateBtn").onclick = () => $("stickerInput").click();
$("stickerInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !auth.currentUser) return;
  try { showToast("Creating sticker…"); await createSticker(file); }
  catch (error) { showToast("Sticker could not be created: " + error.message); }
});

async function sendSticker(sticker) {
  await addDoc(collection(db, "messages"), {
    uid: auth.currentUser.uid, username, type: "sticker",
    image: sticker.image, stickerId: sticker.stickerId,
    stickerOwnerUid: sticker.ownerUid, stickerName: sticker.name || "Sticker",
    createdAt: serverTimestamp()
  });
  $("stickerPanel").hidden = true;
  showToast("Sticker sent!");
}

// ---------- Sticker collection and favorites ----------
function closeStickerPanel() { if ($("stickerPanel")) $("stickerPanel").hidden = true; }

$("stickerBtn").onclick = async () => {
  $("bubblePicker").hidden = true;
  $("stickerPanel").hidden = !$("stickerPanel").hidden;
  if (!$("stickerPanel").hidden) await renderStickerPanel();
};

$("stickerClose").onclick = closeStickerPanel;
document.querySelectorAll("[data-sticker-tab]").forEach(button => {
  button.addEventListener("click", async () => {
    stickerTab = button.dataset.stickerTab;
    document.querySelectorAll("[data-sticker-tab]").forEach(b => b.classList.toggle("active", b === button));
    await renderStickerPanel();
  });
});

async function loadStickerCollections() {
  const uid = auth.currentUser.uid;
  const [stickersSnap, favoritesSnap] = await Promise.all([
    getDocs(query(collection(db, "users", uid, "stickers"), orderBy("createdAt", "desc"))),
    getDocs(query(collection(db, "users", uid, "favorites"), orderBy("savedAt", "desc")))
  ]);
  cachedStickers = stickersSnap.docs.map(d => ({ id: d.id, ...d.data(), ownerUid: uid }));
  cachedFavorites = favoritesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function renderStickerPanel() {
  if (!auth.currentUser) return;
  const grid = $("stickerGrid");
  grid.replaceChildren();
  $("stickerPanelTitle").textContent = stickerTab === "mine" ? "My stickers" : "Favorites";
  try {
    await loadStickerCollections();
    const items = stickerTab === "mine" ? cachedStickers : cachedFavorites;
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "sticker-empty";
      empty.textContent = stickerTab === "mine" ? "No stickers yet. Create one from your gallery!" : "Your favorite stickers will appear here.";
      grid.appendChild(empty);
      return;
    }
    for (const sticker of items) {
      const card = document.createElement("div"); card.className = "sticker-card";
      const send = document.createElement("button"); send.type = "button"; send.className = "sticker-send";
      const image = document.createElement("img"); image.src = sticker.image; image.alt = sticker.name || "Sticker";
      send.appendChild(image);
      send.addEventListener("click", () => sendSticker({
        image: sticker.image, stickerId: sticker.stickerId || sticker.id,
        ownerUid: sticker.ownerUid || auth.currentUser.uid, name: sticker.name || "Sticker"
      }));
      const star = document.createElement("button"); star.type = "button"; star.className = "sticker-star";
      star.textContent = stickerTab === "favorites" ? "★" : "☆";
      star.title = stickerTab === "favorites" ? "Remove from favorites" : "Add to favorites";
      star.addEventListener("click", async () => {
        if (stickerTab === "favorites") await removeFavorite(sticker);
        else await saveFavorite({ image: sticker.image, stickerId: sticker.id, ownerUid: sticker.ownerUid, name: sticker.name || "Sticker" });
        await renderStickerPanel();
      });
      card.append(send, star); grid.appendChild(card);
    }
  } catch (error) {
    console.error(error);
    const message = document.createElement("div");
    message.className = "sticker-empty";
    message.textContent = "Could not load stickers. Check your Firestore rules: " + error.message;
    grid.appendChild(message);
  }
}

function favoriteDocId(ownerUid, stickerId) { return `${ownerUid}_${stickerId}`.replace(/[^a-zA-Z0-9_-]/g, "_"); }

async function saveFavorite(sticker) {
  if (!auth.currentUser) return;
  const id = favoriteDocId(sticker.ownerUid || auth.currentUser.uid, sticker.stickerId);
  await setDoc(doc(db, "users", auth.currentUser.uid, "favorites", id), {
    image: sticker.image, name: sticker.name || "Sticker",
    ownerUid: sticker.ownerUid || auth.currentUser.uid,
    stickerId: sticker.stickerId, savedAt: serverTimestamp()
  });
  showToast("Saved to favorites ★");
  if (!$("stickerPanel").hidden) await renderStickerPanel();
}

async function removeFavorite(sticker) {
  if (!auth.currentUser) return;
  const id = sticker.id || favoriteDocId(sticker.ownerUid || auth.currentUser.uid, sticker.stickerId);
  await deleteDoc(doc(db, "users", auth.currentUser.uid, "favorites", id));
  showToast("Removed from favorites");
}

// ---------- Drawing canvas ----------
const canvas = $("drawingCanvas");
const ctx = canvas.getContext("2d");
let drawing = false;
let hasDrawing = false;

function clearCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  hasDrawing = false;
}
clearCanvas();

function getPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
}

canvas.addEventListener("pointerdown", event => {
  drawing = true; hasDrawing = true; canvas.setPointerCapture(event.pointerId);
  const pos = getPosition(event); ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
});
canvas.addEventListener("pointermove", event => {
  if (!drawing) return;
  const pos = getPosition(event);
  ctx.strokeStyle = $("drawColor").value;
  ctx.lineWidth = Number($("drawSize").value);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineTo(pos.x, pos.y); ctx.stroke();
});
function stopDrawing() { drawing = false; ctx.beginPath(); }
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);

$("drawBtn").onclick = () => {
  $("drawingPanel").hidden = false;
  $("bubblePicker").hidden = true;
  $("stickerPanel").hidden = true;
};
$("closeDrawing").onclick = () => $("drawingPanel").hidden = true;
$("clearDrawing").onclick = clearCanvas;

$("sendDrawing").onclick = async () => {
  if (!auth.currentUser || !hasDrawing) { showToast("Draw something first!"); return; }
  try {
    const image = canvas.toDataURL("image/jpeg", 0.78);
    await addDoc(collection(db, "messages"), {
      uid: auth.currentUser.uid, username, type: "drawing", image,
      createdAt: serverTimestamp()
    });
    clearCanvas(); $("drawingPanel").hidden = true;
  } catch (error) { showToast("Drawing could not be sent: " + error.message); }
};

document.addEventListener("click", event => {
  if (!$("bubblePicker").contains(event.target) && event.target !== $("bubbleBtn")) $("bubblePicker").hidden = true;
  if (!$("stickerPanel").contains(event.target) && event.target !== $("stickerBtn") && !$("stickerPanel").hidden) {
    if (!event.target.closest("#stickerPanel")) $("stickerPanel").hidden = true;
  }
});
