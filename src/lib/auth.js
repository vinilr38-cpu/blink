// 🔥 Firebase Imports
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import {
  getFirestore,
  setDoc,
  doc
} from "firebase/firestore";


// 🔧 Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC2QHDEDzX7WhPO6c0CSdsYH16XU48Vdfc",
  authDomain: "audio-54955.firebaseapp.com",
  projectId: "audio-54955",
  storageBucket: "audio-54955.firebasestorage.app",
  messagingSenderId: "172126896600",
  appId: "1:172126896600:web:2f3373bd301f1dab2772ad",
  measurementId: "G-RRL16TNCE0"
};


// 🚀 Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// ==========================
// 📝 SIGNUP FUNCTION
// ==========================
export async function signup() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) {
    alert("Email or Password fields not found!");
    return;
  }

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);

    // Send verification email
    await sendEmailVerification(userCred.user);

    // Store user in Firestore
    await setDoc(doc(db, "users", userCred.user.uid), {
      email,
      createdAt: new Date(),
      verified: false
    });

    alert("Verification email sent! Check your Gmail.");

  } catch (err) {
    alert(err.message);
  }
}


// ==========================
// 🔐 LOGIN FUNCTION
// ==========================
export async function login() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) {
    alert("Email or Password fields not found!");
    return;
  }

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);

    if (!userCred.user.emailVerified) {
      alert("Please verify your email first!");
      return;
    }

    alert("Login successful!");
    window.location.href = "/dashboard.html";

  } catch (err) {
    alert(err.message);
  }
}


// ==========================
// 🔑 FORGOT PASSWORD
// ==========================
export async function forgotPassword() {
  const emailInput = document.getElementById("email");
  
  if (!emailInput) {
    alert("Email field not found!");
    return;
  }

  const email = emailInput.value;

  if (!email) {
    alert("Enter your email first!");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent! Check Gmail.");

  } catch (err) {
    alert(err.message);
  }
}


// ==========================
// 🔵 GOOGLE SIGN-IN
// ==========================
export async function googleSignIn() {
  const provider = new GoogleAuthProvider();

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Save user in Firestore
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      name: user.displayName,
      photo: user.photoURL,
      createdAt: new Date()
    }, { merge: true });

    alert("Google login successful!");
    window.location.href = "/dashboard.html";

  } catch (err) {
    alert(err.message);
  }
}


// ==========================
// 🔄 AUTO LOGIN (SESSION)
// ==========================
export function checkAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("User logged in:", user.email);

      if (user.emailVerified || user.providerData[0].providerId === "google.com") {
        // Optional auto redirect
        // window.location.href = "/dashboard.html";
      }

    } else {
      console.log("No user logged in");
    }
  });
}


// ==========================
// 🚪 LOGOUT
// ==========================
export async function logout() {
  await signOut(auth);
  alert("Logged out!");
  window.location.href = "/";
}
