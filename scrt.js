// =============================================================
//  CONFIGURAÇÃO DO FIREBASE
// =============================================================
const firebaseConfig = {
  apiKey: "AIzaSyB07dkMK2L2BLtBIN80UQ4903AzfVdh8h0",
  authDomain: "cortewr.firebaseapp.com",
  projectId: "cortewr",
  storageBucket: "cortewr.firebasestorage.app",
  messagingSenderId: "646483124926",
  appId: "1:646483124926:web:f5993db9c7688d36cd74ef",
  measurementId: "G-6GS51ZF35N",
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);

// Exporta as instâncias para uso em app.js
const db = firebase.firestore();
const auth = firebase.auth();