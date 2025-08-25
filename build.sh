#!/bin/bash

# Script ini akan membuat file config.js secara dinamis saat proses build di Vercel.
echo "export const firebaseConfig = { apiKey: '$VITE_API_KEY', authDomain: '$VITE_AUTH_DOMAIN', projectId: '$VITE_PROJECT_ID', storageBucket: '$VITE_STORAGE_BUCKET', messagingSenderId: '$VITE_MESSAGING_SENDER_ID', appId: '$VITE_APP_ID', measurementId: '$VITE_MEASUREMENT_ID' };" > src/js/config.js

echo "File config.js berhasil dibuat."