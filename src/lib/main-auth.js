import {
  signup,
  login,
  forgotPassword,
  googleSignIn,
  logout,
  checkAuth
} from "./auth.js";

// Ensure elements exist before assigning handlers
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const forgotBtn = document.getElementById("forgotBtn");
const googleBtn = document.getElementById("googleBtn");
const logoutBtn = document.getElementById("logoutBtn");

if (signupBtn) signupBtn.onclick = signup;
if (loginBtn) loginBtn.onclick = login;
if (forgotBtn) forgotBtn.onclick = forgotPassword;
if (googleBtn) googleBtn.onclick = googleSignIn;
if (logoutBtn) logoutBtn.onclick = logout;

// Run on page load
checkAuth();
