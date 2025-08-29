// File: src/js/pages/app-settings.js
// Deskripsi: Logika spesifik untuk halaman Pengaturan Aplikasi Pengguna.

import { loadScreen } from '../router.js';
import { applyTheme, showMessage } from '../ui.js';

/**
 * Fungsi inisialisasi untuk halaman Pengaturan Aplikasi.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    document.getElementById('back-to-profile-btn')?.addEventListener('click', () => loadScreen('profile'));

    const themeToggle = document.getElementById('settings-theme-toggle');
    if (themeToggle) {
        themeToggle.checked = document.documentElement.classList.contains('dark');
        const handleThemeChange = (e) => {
            const theme = e.target.checked ? 'dark' : 'light';
            localStorage.setItem('theme', theme);
            applyTheme(theme);
        };
        themeToggle.addEventListener('change', handleThemeChange);
        addL(() => themeToggle.removeEventListener('change', handleThemeChange));
    }
    
    document.getElementById('privacy-policy-btn')?.addEventListener('click', () => showMessage("Membuka Kebijakan Privasi..."));
    document.getElementById('terms-conditions-btn')?.addEventListener('click', () => showMessage("Membuka Syarat & Ketentuan..."));
}