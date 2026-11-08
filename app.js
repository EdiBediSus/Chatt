
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDoc
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

const authScreen = $("authScreen");
const appScreen = $("appScreen");

// REGISTER
$("registerBtn").onclick = async () => {
  try {
    const name = $("username").value.trim();
    const email = $("email").value.trim();
    const password = $("password").value;

    if (name.length < 3) {
      throw new Error("Username must have at least 3 characters.");
    }

    const result = await createUserWithEmailAndPassword(
      auth, email, password
    );

    await updateProfile(result.user, {
      displayName: name
    });

    await setDoc(doc(db, "users", result.user.uid), {
      username: name,
      email: email,
      createdAt: serverTimestamp()
    });

    username = name;
  } catch (error) {
    $("authStatus").textContent = error.message;
  }
};

// LOGIN
$("loginBtn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (error) {
    $("authStatus").textContent = error.message;
  }
};

// LOGOUT
$("logoutBtn").onclick = () => signOut(auth);

// AUTH STATE
onAuthStateChanged(auth, async user => {
  if (!user) {
    authScreen.hidden = false;
    appScreen.hidden = true;

    if (stopMessages) {
      stopMessages();
      stopMessages = null;
    }
    return;
  }

  authScreen.hidden = true;
  appScreen.hidden = false;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));

    username = userDoc.exists()
      ? userDoc.data().username
      : user.displayName || user.email.split("@")[0];

    startChat();
  } catch (error) {
    console.error(error);
  }
});

// CHAT
function startChat() {
  if (stopMessages) stopMessages();

  const q = query(
    collection(db, "messages"),
    orderBy("createdAt", "desc"),
    limit(100)
  );

  stopMessages = onSnapshot(q, snapshot => {
    const container = $("messages");
    container.replaceChildren();

    const messages = [...snapshot.docs].reverse();

    for (const item of messages) {
      const data = item.data();

      const bubble = document.createElement("div");
      bubble.className =
        "message" +
        (data.uid === auth.currentUser?.uid ? " mine" : "");

      const sender = document.createElement("div");
      sender.className = "sender";
      sender.textContent = data.username || "User";
      bubble.appendChild(sender);

      if (data.type === "drawing" && data.image) {
        const image = document.createElement("img");
        image.src = data.image;
        image.alt = "Drawing";
        image.loading = "lazy";
        bubble.appendChild(image);
      } else {
        const content = document.createElement("p");
        content.textContent = data.text || "";
        bubble.appendChild(content);
      }

      const time = document.createElement("div");
      time.className = "time";

      time.textContent = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "Sending...";

      bubble.appendChild(time);
      container.appendChild(bubble);
    }

    container.scrollTop = container.scrollHeight;
  }, error => {
    console.error(error);
    $("authStatus").textContent = error.message;
  });
}

// SEND TEXT
$("messageForm").onsubmit = async event => {
  event.preventDefault();

  const text = $("messageInput").value.trim();

  if (!text || !auth.currentUser) return;

  $("messageInput").value = "";

  try {
    await addDoc(collection(db, "messages"), {
      uid: auth.currentUser.uid,
      username,
      text,
      type: "text",
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    alert("Message could not be sent: " + error.message);
  }
};

// DRAWING
const canvas = $("drawingCanvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let hasDrawing = false;

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

function stopDrawing() {
  drawing = false;
  ctx.beginPath();
}

canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);

$("drawBtn").onclick = () => {
  $("drawingPanel").hidden = false;
};

$("closeDrawing").onclick = () => {
  $("drawingPanel").hidden = true;
};

$("clearDrawing").onclick = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawing = false;
};

$("sendDrawing").onclick = async () => {
  if (!auth.currentUser || !hasDrawing) {
    alert("Draw something first!");
    return;
  }

  try {
    const image = canvas.toDataURL("image/png");

    await addDoc(collection(db, "messages"), {
      uid: auth.currentUser.uid,
      username,
      type: "drawing",
      image,
      createdAt: serverTimestamp()
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawing = false;
    $("drawingPanel").hidden = true;
  } catch (error) {
    alert("Drawing could not be sent: " + error.message);
  }
};
