import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore, disableNetwork, enableNetwork, clearIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// IMPORTANT: Replace with your own Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Set persistence to localStorage to maintain auth state across page refreshes
// This ensures the user stays logged in after page refresh
if (typeof window !== "undefined") {
  // browserLocalPersistence is the default, but we set it explicitly to ensure it's enabled
  // This stores the auth state in localStorage
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      // Persistence set successfully
    })
    .catch((error) => {
      console.error("Failed to set auth persistence:", error);
    });
}

const db = getFirestore(app);
const storage = getStorage(app);

// Utility function to clear Firestore persistence (call this when client is corrupted)
export async function clearFirestoreCache() {
  if (typeof window === "undefined") return;
  
  try {
    // Clear IndexedDB
    const databases = await indexedDB.databases();
    for (const dbInfo of databases) {
      if (dbInfo.name && (dbInfo.name.includes('firestore') || dbInfo.name.includes('firebase'))) {
        await new Promise((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase(dbInfo.name!);
          deleteReq.onsuccess = () => resolve(undefined);
          deleteReq.onerror = () => reject(deleteReq.error);
        });
      }
    }
    
    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Try to clear Firestore persistence
    try {
      await clearIndexedDbPersistence(db);
    } catch (err: any) {
      // Ignore if persistence is in use or doesn't exist
      if (err.code !== 'failed-precondition') {
        console.warn('Could not clear Firestore persistence:', err.message);
      }
    }
    
    console.log('✅ Firestore cache cleared! Please refresh the page.');
    return true;
  } catch (error) {
    console.error('Error clearing Firestore cache:', error);
    return false;
  }
}

export { app, auth, db, storage };

