import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC2QHDEDzX7WhPO6c0CSdsYH16XU48Vdfc",
  authDomain: "audio-54955.firebaseapp.com",
  projectId: "audio-54955",
  storageBucket: "audio-54955.firebasestorage.app",
  messagingSenderId: "172126896600",
  appId: "1:172126896600:web:2f3373bd301f1dab2772ad",
  measurementId: "G-RRL16TNCE0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

export { app, auth, db, storage, analytics };
export default app;
