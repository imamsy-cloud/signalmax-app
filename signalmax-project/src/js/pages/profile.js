// File: src/js/pages/profile.js
// Deskripsi: Logika spesifik untuk halaman Profil pengguna.
// Versi Perbaikan: 2.3 (Image Compression Integration)
// Perubahan:
// - Menggunakan fungsi kompresi gambar saat pengguna memilih file baru untuk
//   avatar atau foto sampul di modal "Edit Profil".

import { currentUserData, handleLogout } from '../auth.js';
import { loadScreen } from '../router.js';
import { openModal, setCircleDashoffset } from '../ui.js';

/**
 * Fungsi inisialisasi untuk halaman Profil.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    if (!currentUserData) {
        console.error("Data pengguna tidak ditemukan, tidak dapat merender halaman profil.");
        return;
    }

    const profileContent = document.getElementById('app-content-area');
    if (!profileContent) return;

    // Tampilkan data pengguna
    const thumbnailElement = profileContent.querySelector('#profile-thumbnail');
    if (thumbnailElement) {
        thumbnailElement.src = currentUserData.thumbnailUrl || 'https://placehold.co/600x200/15803d/ffffff?text=SignalMax';
    }
    profileContent.querySelector('#profile-avatar').src = currentUserData.avatarUrl || `https://ui-avatars.com/api/?name=${currentUserData.name.split(' ').join('+')}`;
    profileContent.querySelector('#profile-name').textContent = currentUserData.name;
    profileContent.querySelector('#profile-email').textContent = currentUserData.email;

    // Tampilkan statistik
    if (currentUserData.stats) {
        profileContent.querySelector('#post-count').textContent = currentUserData.stats.posts || 0;
        profileContent.querySelector('#like-count').textContent = currentUserData.stats.likes || 0;
        const skillPercent = currentUserData.stats.skill || 0;
        profileContent.querySelector('#skill-progress-text').textContent = `${skillPercent}%`;
        setCircleDashoffset(profileContent.querySelector('#skill-progress-circle'), skillPercent);
    }

    // Tampilkan badge premium/expert dengan desain baru
    const badgesContainer = profileContent.querySelector('#profile-badges-container');
    if (badgesContainer) {
        let badgesHtml = '';
        if (currentUserData.isPremium) {
            badgesHtml += `<span class="inline-flex items-center text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-600 text-white px-2 py-1 rounded-full shadow-sm"><i class="fas fa-crown fa-xs mr-1.5"></i>Premium</span>`;
        }
        if (currentUserData.isExpert) {
            badgesHtml += `<span class="inline-flex items-center text-xs font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-2 py-1 rounded-full shadow-sm ${currentUserData.isPremium ? 'ml-2' : ''}"><i class="fas fa-star fa-xs mr-1.5"></i>Expert</span>`;
        }
        badgesContainer.innerHTML = badgesHtml;
    }
    
    // Pasang listener untuk semua tombol aksi di halaman profil
    setupActionListeners();
}

/**
 * Mendaftarkan semua event listener untuk tombol-tombol di halaman profil.
 */
function setupActionListeners() {
    const profileContent = document.getElementById('app-content-area');
    if (!profileContent) return;

    profileContent.querySelector('#go-to-settings-btn')?.addEventListener('click', () => loadScreen('settings'));
    profileContent.querySelector('[data-action="security"]')?.addEventListener('click', () => loadScreen('security'));
    profileContent.querySelector('[data-action="notifications"]')?.addEventListener('click', () => loadScreen('notifications'));
    profileContent.querySelector('[data-action="help"]')?.addEventListener('click', () => loadScreen('help-center'));
    profileContent.querySelector('[data-action="logout"]')?.addEventListener('click', handleLogout);
    
    // Listener khusus untuk tombol "Edit Profil"
    profileContent.querySelector('[data-action="edit-profile"]')?.addEventListener('click', () => {
        const modalNameInput = document.getElementById('edit-name-input');
        const modalAvatarPreview = document.getElementById('edit-avatar-preview');
        const modalThumbnailPreview = document.getElementById('edit-thumbnail-preview');

        if (modalNameInput && modalAvatarPreview && modalThumbnailPreview) {
            modalNameInput.value = currentUserData.name;
            modalAvatarPreview.src = currentUserData.avatarUrl || `https://ui-avatars.com/api/?name=${currentUserData.name.split(' ').join('+')}`;
            modalThumbnailPreview.src = currentUserData.thumbnailUrl || 'https://placehold.co/400x150/e0e0e0/333?text=Sampul';
            
            openModal('edit-profile-modal');
        } else {
            console.error("Elemen modal untuk edit profil tidak ditemukan.");
        }
    });
}
