import type { FirebaseOptions } from "firebase/app";

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBi51oXLoYjqCJ6VdpJG0XE_awYDF5lXbI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "territorios-oeste-sf.web.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "salidas-territorio-pablo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "salidas-territorio-pablo.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "718796937265",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:718796937265:web:b1a894aa272317fff41d10",
};

export const firebaseConfigurado = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
export default config;
