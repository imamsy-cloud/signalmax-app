// File: src/js/dashboard/app-settings.js
// Deskripsi: Logika untuk halaman Pengaturan Aplikasi di Dashboard Admin.
// Versi Perbaikan: 2.0 (Image Compression Integration)
// Perubahan:
// - Menambahkan fungsi `compressImage` untuk mengoptimalkan unggahan banner interstitial.
// - Memperbaiki bug di mana status toggle 'interstitialActive' tidak tersimpan dengan benar.

import * as api from '../api.js';
import { showMessage, setButtonLoading } from '../ui.js';

let newBannerFile = null; // Variabel untuk menyimpan file gambar baru

// === [BARU] FUNGSI KOMPRESI GAMBAR ===
async function compressImage(file) {
    if (!file || !file.type.startsWith('image/')) {
        return file;
    }

    const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
    };

    try {
        showMessage('Mengoptimalkan gambar...', 2000);
        const compressedFile = await imageCompression(file, options);
        console.log(`Gambar berhasil dikompres dari ${(file.size / 1024 / 1024).toFixed(2)} MB menjadi ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
        return compressedFile;
    } catch (error) {
        console.error('Gagal mengompres gambar:', error);
        showMessage('Gagal mengoptimalkan gambar. File asli akan digunakan.', 3000, true);
        return file;
    }
}


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
            // Memastikan nilai default adalah false jika properti tidak ada
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

    // Listener untuk preview gambar
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

    // Listener untuk submit form
    const formSubmitHandler = async (e) => {
        e.preventDefault();
        await handleSaveSettings();
    };
    form.addEventListener('submit', formSubmitHandler);

    // Daftarkan listener untuk dibersihkan saat pindah halaman
    addL(() => imageInput.removeEventListener('change', imageChangeHandler));
    addL(() => form.removeEventListener('submit', formSubmitHandler));
}

/**
 * [FIXED] Menangani logika penyimpanan pengaturan ke Firestore dan Storage.
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

        // [DIUBAH] Jika ada file gambar baru yang dipilih, kompres dan upload
        if (newBannerFile) {
            const compressedFile = await compressImage(newBannerFile);
            const storageRef = api.ref(api.storage, `app_settings/interstitial_banner_${Date.now()}`);
            const snapshot = await api.uploadBytes(storageRef, compressedFile);
            dataToSave.imageUrl = await api.getDownloadURL(snapshot.ref);
            newBannerFile = null; // Reset setelah diupload
        }

        // Simpan data ke Firestore menggunakan merge: true agar tidak menimpa field imageUrl jika tidak diubah.
        await api.setDoc(settingsRef, dataToSave, { merge: true });

        showMessage("Pengaturan berhasil disimpan!");

    } catch (error) {
        console.error("Gagal menyimpan pengaturan:", error);
        showMessage("Gagal menyimpan pengaturan. Coba lagi.", 4000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan Pengaturan');
    }
}
