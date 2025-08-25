// File: src/js/pages/security.js
// Deskripsi: Logika spesifik untuk halaman Keamanan & Pengaturan Akun.

import { updateUserPassword, deleteCurrentUserAccount } from '../auth.js';
import { loadScreen } from '../router.js';
import { openModal, setupPasswordToggle } from '../ui.js'; // Impor setupPasswordToggle

/**
 * Fungsi inisialisasi untuk halaman Keamanan.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    document.getElementById('back-to-profile-btn')?.addEventListener('click', () => loadScreen('profile'));

    const saveBtn = document.getElementById('save-password-btn');
    if (saveBtn) {
        const handleSaveClick = async () => {
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Menyimpan...';
            await updateUserPassword(currentPassword, newPassword, confirmPassword);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Simpan Perubahan';
        };
        saveBtn.addEventListener('click', handleSaveClick);
        addL(() => saveBtn.removeEventListener('click', handleSaveClick));
    }

    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        const handleDeleteClick = () => openModal('delete-account-modal');
        deleteAccountBtn.addEventListener('click', handleDeleteClick);
        addL(() => deleteAccountBtn.removeEventListener('click', handleDeleteClick));
    }

    // Modal delete account (listener ini spesifik untuk modal ini)
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if(confirmDeleteBtn) {
        const handleConfirmDelete = async () => {
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await deleteCurrentUserAccount();
            // Jika gagal, kembalikan tombol ke state semula
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Ya, Hapus';
        };
        confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
        addL(() => confirmDeleteBtn.removeEventListener('click', handleConfirmDelete));
    }

    // Aktifkan fitur toggle password untuk semua input password di halaman ini
    setupPasswordToggle('current-password', 'toggle-current-password');
    setupPasswordToggle('new-password', 'toggle-new-password');
    setupPasswordToggle('confirm-password', 'toggle-confirm-password');
}