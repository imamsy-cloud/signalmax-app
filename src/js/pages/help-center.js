// File: src/js/pages/help-center.js
// Deskripsi: Logika spesifik untuk halaman Pusat Bantuan.

import { loadScreen } from '../router.js';
import { showMessage } from '../ui.js';

/**
 * Fungsi inisialisasi untuk halaman Pusat Bantuan.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    document.getElementById('back-to-profile-btn')?.addEventListener('click', () => loadScreen('profile'));

    document.querySelectorAll('.faq-question').forEach(button => {
        const handleClick = () => {
            const answer = button.nextElementSibling;
            const icon = button.querySelector('i');
            answer.classList.toggle('hidden');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        };
        button.addEventListener('click', handleClick);
        addL(() => button.removeEventListener('click', handleClick));
    });
    
    document.getElementById('contact-support-btn')?.addEventListener('click', () => showMessage("Menghubungi tim dukungan kami..."));
}