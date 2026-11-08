import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit,
  onSnapshot, serverTimestamp, doc, setDoc, getDoc
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

let username = "";
let stopMessages = null;

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
  const icon = document.createElement("span");
  icon.textContent = "✦";
  const title = document.createElement("strong");
  title.textContent = "It's quiet in here";
  const hint = document.createElement("small");
  hint.textContent = "Start the conversation.";
  empty.append(icon, title, hint);
  return empty;
}

function startChat() {
  if (stopMessages) stopMessages();
  const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(100));

  stopMessages = onSnapshot(q, snapshot => {
    const container = $("messages");
    container.replaceChildren();
    const docs = [...snapshot.docs].reverse();

    if (!docs.length) {
      container.appendChild(makeEmptyState());
      return;
    }

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

      if (data.type === "drawing" && data.image) {
        const image = document.createElement("img");
        image.src = data.image;
        image.alt = "Shared drawing";
        image.loading = "lazy";
        message.appendChild(image);
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

async function sendText(text, bubbleStyle = "") {
  if (!text || !auth.currentUser) return;
  await addDoc(collection(db, "messages"), {
    uid: auth.currentUser.uid,
    username,
    text,
    type: "text",
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
  try {
    await sendText(text);
  } catch (error) {
    input.value = text;
    alert("Message could not be sent: " + error.message);
  }
};

$("bubbleBtn").onclick = () => {
  $("bubblePicker").hidden = !$("bubblePicker").hidden;
  if (!$("bubblePicker").hidden) $("messageInput").focus();
};

document.querySelectorAll(".bubble-choice").forEach(button => {
  button.addEventListener("click", async () => {
    const input = $("messageInput");
    const text = input.value.trim();
    if (!text) {
      input.placeholder = "Write something first…";
      input.focus();
      return;
    }
    try {
      await sendText(text, button.dataset.bubble);
      input.value = "";
      input.placeholder = "Write a message...";
      $("bubblePicker").hidden = true;
    } catch (error) {
      alert("Bubble could not be sent: " + error.message);
    }
  });
});

// Drawing canvas
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
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height
  };
}

canvas.addEventListener("pointerdown", event => {
  drawing = true;
  hasDrawing = true;
  canvas.setPointerCapture(event.pointerId);
  const pos = getPosition(event);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointermove", event => {
  if (!drawing) return;
  const pos = getPosition(event);
  ctx.strokeStyle = $("drawColor").value;
  ctx.lineWidth = Number($("drawSize").value);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
});

function stopDrawing() { drawing = false; ctx.beginPath(); }
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);

$("drawBtn").onclick = () => {
  $("drawingPanel").hidden = false;
  $("bubblePicker").hidden = true;
};
$("closeDrawing").onclick = () => $("drawingPanel").hidden = true;
$("clearDrawing").onclick = clearCanvas;

$("sendDrawing").onclick = async () => {
  if (!auth.currentUser || !hasDrawing) {
    alert("Draw something first!");
    return;
  }
  try {
    const image = canvas.toDataURL("image/jpeg", 0.78);
    await addDoc(collection(db, "messages"), {
      uid: auth.currentUser.uid,
      username,
      type: "drawing",
      image,
      createdAt: serverTimestamp()
    });
    clearCanvas();
    $("drawingPanel").hidden = true;
  } catch (error) {
    alert("Drawing could not be sent: " + error.message);
  }
};

document.addEventListener("click", event => {
  if (!$("bubblePicker").contains(event.target) && event.target !== $("bubbleBtn")) {
    $("bubblePicker").hidden = true;
  }
});
