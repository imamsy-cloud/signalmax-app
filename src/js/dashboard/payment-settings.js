// File: src/js/dashboard/payment-settings.js (FILE BARU)
import * as api from '../api.js';
import { showMessage, setButtonLoading } from '../ui.js';

const settingsRef = api.doc(api.db, "settings", "payments");

export function initPage(params, addL) {
    loadCurrentSettings();
    setupFormListener(addL);
}

// Fungsi untuk memuat pengaturan saat ini dari Firestore dan menampilkannya di form
async function loadCurrentSettings() {
    try {
        const docSnap = await api.getDoc(settingsRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('weekly-price').value = data.weeklyPrice || '';
            document.getElementById('weekly-url').value = data.weeklyUrl || '';
            document.getElementById('monthly-price').value = data.monthlyPrice || '';
            document.getElementById('monthly-strikethrough-price').value = data.monthlyStrikethroughPrice || '';
            document.getElementById('monthly-discount-badge').value = data.monthlyDiscountBadge || '';
            document.getElementById('monthly-url').value = data.monthlyUrl || '';
            document.getElementById('yearly-price').value = data.yearlyPrice || '';
            document.getElementById('yearly-url').value = data.yearlyUrl || '';
            document.getElementById('whatsapp-number').value = data.whatsappNumber || '';
        }
    } catch (error) {
        console.error("Gagal memuat pengaturan:", error);
        showMessage("Gagal memuat pengaturan saat ini.", 3000, true);
    }
}

// Fungsi untuk menyiapkan listener pada form
function setupFormListener(addL) {
    const form = document.getElementById('payment-links-form');
    if (form) {
        const handler = (e) => {
            e.preventDefault();
            handleSaveSettings();
        };
        form.addEventListener('submit', handler);
        addL(() => form.removeEventListener('submit', handler));
    }
}

// Fungsi untuk menangani penyimpanan data ke Firestore
async function handleSaveSettings() {
    const saveBtn = document.getElementById('save-settings-btn');
    setButtonLoading(saveBtn, true);

    try {
        const settingsData = {
            weeklyPrice: Number(document.getElementById('weekly-price').value) || 0,
            weeklyUrl: document.getElementById('weekly-url').value.trim(),
            monthlyPrice: Number(document.getElementById('monthly-price').value) || 0,
            monthlyStrikethroughPrice: Number(document.getElementById('monthly-strikethrough-price').value) || 0,
            monthlyDiscountBadge: document.getElementById('monthly-discount-badge').value.trim(),
            monthlyUrl: document.getElementById('monthly-url').value.trim(),
            yearlyPrice: Number(document.getElementById('yearly-price').value) || 0,
            yearlyUrl: document.getElementById('yearly-url').value.trim(),
            whatsappNumber: document.getElementById('whatsapp-number').value.trim()
        };

        // Validasi sederhana
        if (!settingsData.weeklyUrl || !settingsData.monthlyUrl || !settingsData.yearlyUrl || !settingsData.whatsappNumber) {
            throw new Error("Semua kolom URL dan Nomor WhatsApp wajib diisi.");
        }

        await api.setDoc(settingsRef, settingsData);
        showMessage("Pengaturan berhasil disimpan!");

    } catch (error) {
        console.error("Gagal menyimpan pengaturan:", error);
        showMessage(error.message || "Gagal menyimpan. Coba lagi.", 4000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan Pengaturan');
    }
}