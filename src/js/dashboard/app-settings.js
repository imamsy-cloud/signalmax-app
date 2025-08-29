// File: src/js/dashboard/app-settings.js
// Deskripsi: Logika untuk halaman Pengaturan Aplikasi di Dashboard Admin.
// Versi Perbaikan: 3.0 (Sentralisasi Kompresi)
// Perubahan:
// - Menghapus fungsi compressImage lokal.
// - Mengimpor fungsi compressImage terpusat dari ui.js.

import * as api from '../api.js';
import { showMessage, setButtonLoading, compressImage } from '../ui.js';

let newBannerFile = null; // Variabel untuk menyimpan file gambar baru

// Fungsi kompresi lokal DIHAPUS dari sini.

/**
 * Fungsi inisialisasi untuk halaman Pengaturan Aplikasi.
 */
export function initPage(params, addL) {
    loadCurrentSettings();
    setupFormListener(addL);
}

/**
 * Memuat pengaturan saat ini dari Firestore dan mengisi form.
 */
async function loadCurrentSettings() {
    const form = document.getElementById('interstitial-form');
    if (!form) return;

    try {
        const settingsRef = api.doc(api.db, "settings", "app");
        const docSnap = await api.getDoc(settingsRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            form.querySelector('#interstitial-active-toggle').checked = data.interstitialActive || false;
            form.querySelector('#interstitial-preview').src = data.imageUrl || 'https://placehold.co/200x250/e0e0e0/333?text=Preview';
            form.querySelector('#interstitial-link-input').value = data.linkUrl || '';
            form.querySelector('#interstitial-freq-input').value = data.showFrequencyHours || 24;
        }
    } catch (error) {
        console.error("Gagal memuat pengaturan:", error);
        showMessage("Gagal memuat pengaturan saat ini.", 3000, true);
    }
}

/**
 * Menyiapkan event listener untuk form pengaturan.
 */
function setupFormListener(addL) {
    const form = document.getElementById('interstitial-form');
    if (!form) return;

    const imageInput = form.querySelector('#interstitial-image-input');
    const imagePreview = form.querySelector('#interstitial-preview');

    const imageChangeHandler = (e) => {
        if (e.target.files && e.target.files[0]) {
            newBannerFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                imagePreview.src = event.target.result;
            };
            reader.readAsDataURL(newBannerFile);
        }
    };
    imageInput.addEventListener('change', imageChangeHandler);

    const formSubmitHandler = async (e) => {
        e.preventDefault();
        await handleSaveSettings();
    };
    form.addEventListener('submit', formSubmitHandler);

    addL(() => imageInput.removeEventListener('change', imageChangeHandler));
    addL(() => form.removeEventListener('submit', formSubmitHandler));
}

/**
 * Menangani logika penyimpanan pengaturan ke Firestore dan Storage.
 */
async function handleSaveSettings() {
    const saveBtn = document.getElementById('save-interstitial-btn');
    setButtonLoading(saveBtn, true);

    try {
        const settingsRef = api.doc(api.db, "settings", "app");
        
        const isActiveToggle = document.getElementById('interstitial-active-toggle');
        
        const dataToSave = {
            interstitialActive: isActiveToggle.checked,
            linkUrl: document.getElementById('interstitial-link-input').value.trim(),
            showFrequencyHours: Number(document.getElementById('interstitial-freq-input').value) || 24
        };

        if (newBannerFile) {
            const processedImage = await compressImage(newBannerFile);
            const storageRef = api.ref(api.storage, `app_settings/interstitial_banner_${Date.now()}`);
            const snapshot = await api.uploadBytes(storageRef, processedImage);
            dataToSave.imageUrl = await api.getDownloadURL(snapshot.ref);
            newBannerFile = null;
        }

        await api.setDoc(settingsRef, dataToSave, { merge: true });

        showMessage("Pengaturan berhasil disimpan!");

    } catch (error) {
        console.error("Gagal menyimpan pengaturan:", error);
        showMessage("Gagal menyimpan pengaturan. Coba lagi.", 4000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan Pengaturan');
    }
}

// AKHIR DARI FILE app-settings.js
