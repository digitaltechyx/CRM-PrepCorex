// Only import firebase-admin on the server side
let admin: typeof import('firebase-admin') | null = null;

// Lazy initialization to avoid build-time errors
let adminDbInstance: any = null;
let adminFieldValueInstance: any = null;
let adminAuthInstance: any = null;

function getAdmin() {
  if (typeof window !== 'undefined') {
    throw new Error('Firebase Admin SDK can only be used on the server side');
  }
  
  if (!admin) {
    // Dynamic import to ensure it's only loaded on the server
    admin = require('firebase-admin');
  }
  
  return admin;
}

function initializeAdmin() {
  try {
    const adminModule = getAdmin();
    
    if (!adminModule.apps.length) {
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

      // Check which specific variable is missing
      if (!projectId) {
        throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set in environment variables');
      }
      if (!clientEmail) {
        throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL is not set in environment variables');
      }
      if (!privateKey) {
        throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set in environment variables');
      }

      try {
        adminModule.initializeApp({
          credential: adminModule.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } catch (initError: any) {
        // Provide more specific error for initialization failures
        if (initError.message?.includes('private_key')) {
          throw new Error('Invalid private key format. Make sure FIREBASE_ADMIN_PRIVATE_KEY is correctly formatted with \\n for newlines.');
        }
        throw new Error(`Failed to initialize Firebase Admin: ${initError.message || 'Unknown error'}`);
      }
    }

    if (!adminDbInstance) {
      adminDbInstance = adminModule.firestore();
      adminFieldValueInstance = adminModule.firestore.FieldValue;
    }
  } catch (error: any) {
    // Re-throw with more context
    if (error.message?.includes('Firebase admin') || error.message?.includes('FIREBASE_ADMIN')) {
      throw error; // Already has good message
    }
    throw new Error(`Firebase Admin initialization failed: ${error.message || 'Unknown error'}`);
  }
}

export function getAdminDb() {
  if (!adminDbInstance) {
    initializeAdmin();
  }
  return adminDbInstance;
}

export function getAdminFieldValue() {
  if (!adminFieldValueInstance) {
    initializeAdmin();
  }
  return adminFieldValueInstance;
}

export function getAdminAuth() {
  if (!adminAuthInstance) {
    initializeAdmin();
    const adminModule = getAdmin();
    adminAuthInstance = adminModule.auth();
  }
  return adminAuthInstance;
}

// Export getters for lazy initialization (only called when API routes run)
// Use getAdminDb() and getAdminFieldValue() in API routes instead of direct exports
export { getAdminDb as adminDb, getAdminFieldValue as adminFieldValue, getAdminAuth as adminAuth };

