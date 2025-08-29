// File: src/js/pages/notifications.js
// Deskripsi: Logika spesifik untuk halaman Pengaturan Notifikasi.

import { currentUser, currentUserData } from '../auth.js';
import { loadScreen } from '../router.js';
import { showMessage } from '../ui.js';
import * as api from '../api.js';

/**
 * Fungsi inisialisasi untuk halaman Pengaturan Notifikasi.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    document.getElementById('back-to-profile-btn')?.addEventListener('click', () => loadScreen('profile'));

    const toggles = document.querySelectorAll('.toggle-switch input');
    const settings = currentUserData.notificationSettings || { newSignal: true, communityActivity: true, newEvent: true };
    
    toggles.forEach(toggle => {
        const settingName = toggle.dataset.setting;
        toggle.checked = settings[settingName];
        
        const handleChange = async (e) => {
            const settingToUpdate = e.target.dataset.setting;
            const newValue = e.target.checked;
            try {
                const userRef = api.doc(api.db, "users", currentUser.uid);
                await api.updateDoc(userRef, { [`notificationSettings.${settingToUpdate}`]: newValue });
                currentUserData.notificationSettings[settingToUpdate] = newValue;
                showMessage("Pengaturan disimpan.");
            } catch (error) {
                console.error("Gagal menyimpan pengaturan notifikasi:", error);
                showMessage("Gagal menyimpan. Coba lagi.");
                e.target.checked = !newValue;
            }
        };
        
        toggle.addEventListener('change', handleChange);
        addL(() => toggle.removeEventListener('change', handleChange));
    });
}