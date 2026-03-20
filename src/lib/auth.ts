import { auth, db } from "./firebase";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    getIdToken
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

/**
 * Cleanup function to grab values from DOM if used as direct event listeners
 * but also works as a standalone helper.
 */
export const signup = async () => {
    const emailInput = document.getElementById("email") as HTMLInputElement;
    const passwordInput = document.getElementById("password") as HTMLInputElement;
    
    // In a React app, we usually get these from state, but we'll support the requested DOM IDs
    const email = emailInput?.value;
    const password = passwordInput?.value;

    if (!email || !password) {
        toast.error("Email and password are required");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Optional: Save minimal user doc if not present
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            createdAt: new Date().toISOString()
        }, { merge: true });

        toast.success("Signup successful!");
        return user;
    } catch (error: any) {
        toast.error(error.message);
        console.error("Signup error:", error);
    }
};

export const login = async () => {
    const emailInput = document.getElementById("email") as HTMLInputElement;
    const passwordInput = document.getElementById("password") as HTMLInputElement;
    
    const email = emailInput?.value;
    const password = passwordInput?.value;

    if (!email || !password) {
        toast.error("Email and password are required");
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Store session info as we did previously
        localStorage.setItem("token", await getIdToken(user));
        localStorage.setItem("user", JSON.stringify({
            uid: user.uid,
            email: user.email
        }));

        toast.success("Login successful!");
        window.location.reload(); // Or redirect
        return user;
    } catch (error: any) {
        toast.error(error.message);
        console.error("Login error:", error);
    }
};
