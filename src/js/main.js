// File: src/js/main.js
// Deskripsi: File inisialisasi utama untuk aplikasi SPA SignalMax.
// Versi Perbaikan: 5.4 (Story Creator Logic Fix)
// Perubahan:
// - Memastikan logika pemanggilan upload story sudah benar dan sinkron dengan perbaikan di api.js.

import { initAuthListener, handleLogout, currentUser, currentUserData } from './auth.js';
import { loadScreen } from './router.js';
import { applyTheme, toggleSidebar, initAllModals, closeModal, showMessage, setButtonLoading, compressImage } from './ui.js';
import * as api from './api.js';

/**
 * Titik masuk utama aplikasi. Dijalankan setelah DOM sepenuhnya dimuat.
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikasi SignalMax dimulai.");

    applyTheme(localStorage.getItem('theme') || 'light');
    initGlobalListeners();
    initAuthListener(); 
    setTimeout(requestNotificationPermission, 5000);
    listenForForegroundMessages();
});

// --- FUNGSI BARU UNTUK NOTIFIKASI ---

async function requestNotificationPermission() {
    // Hanya jalankan jika pengguna sudah login dan berada di browser yang mendukung
    if (!currentUser || !("Notification" in window)) {
        return;
    }

    console.log('Meminta izin notifikasi...');
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
        console.log('Izin notifikasi diberikan.');
        try {
            const vapidKey = "BIg2t14yU_Vs5rg5dY9STTYk8YXzYd8rLjR5nwxQwgA3gcSQkXhSWDryvI16_NXIXKkxA6m530q7RwqHyclqap4";
            const currentToken = await api.getToken(api.messaging, { vapidKey: vapidKey });

            if (currentToken) {
                console.log('FCM Token:', currentToken);
                // Simpan token ini ke profil pengguna di Firestore
                const userRef = api.doc(api.db, "users", currentUser.uid);
                await api.updateDoc(userRef, {
                    fcmTokens: api.arrayUnion(currentToken)
                });
                console.log('Token berhasil disimpan ke profil pengguna.');
            } else {
                console.log('Tidak berhasil mendapatkan token registrasi.');
            }
        } catch (err) {
            console.error('Terjadi error saat mengambil token:', err);
        }
    } else {
        console.log('Izin notifikasi tidak diberikan.');
    }
}

function listenForForegroundMessages() {
    if ("Notification" in window) {
        api.onMessage(api.messaging, (payload) => {
            console.log('Pesan diterima saat aplikasi aktif: ', payload);
            // Tampilkan notifikasi custom menggunakan UI yang sudah ada
            showMessage(`Pesan Baru: ${payload.notification.title}`, 5000);
        });
    }
}
/**
 * Mendaftarkan semua event listener yang bersifat global di aplikasi.
 */
function initGlobalListeners() {
    // Navigasi
    document.getElementById('bottom-nav')?.addEventListener('click', handleBottomNavClick);
    document.getElementById('sidebar-nav')?.addEventListener('click', handleSidebarNavClick);
    
    // Tombol Global & Interaksi UI
    document.getElementById('menu-button')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', toggleSidebar);
    document.getElementById('theme-toggle-btn')?.addEventListener('click', handleThemeToggle);
    document.getElementById('dashboard-logout-btn')?.addEventListener('click', handleLogout);
    
    document.getElementById('notification-button')?.addEventListener('click', () => loadScreen('notifications-list'));
    
    const adminMenuDropdown = document.getElementById('admin-menu-dropdown');
    adminMenuDropdown?.addEventListener('click', handleAdminMenuClick);

    document.body.addEventListener('click', handleGlobalBodyClick);
    
    initAllModals();
    initStoryCreator();
}

/**
 * Mengelola semua logika untuk halaman "Buat Story".
 */
function initStoryCreator() {
    const view = document.getElementById('story-creator-view');
    if (!view) return;

    let storyFile = null;
    const fileInput = document.getElementById('story-file-input-main');
    const previewContainer = document.getElementById('story-image-preview-container');
    const previewImage = document.getElementById('story-image-preview');
    const uploadPrompt = document.getElementById('story-upload-prompt');
    const postBtn = document.getElementById('post-story-btn');
    const closeBtn = document.getElementById('close-story-creator-btn');
    const actionButtons = document.getElementById('story-action-buttons');

    const resetView = () => {
        storyFile = null;
        fileInput.value = '';
        previewContainer.classList.add('hidden');
        uploadPrompt.classList.remove('hidden');
        postBtn.classList.add('hidden');
        postBtn.disabled = true;
        actionButtons.classList.add('hidden');
    };
    
    const closeCreator = () => {
        view.classList.remove('visible');
        setTimeout(resetView, 300);
    };

    closeBtn.addEventListener('click', closeCreator);

    fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            view.classList.add('visible');
            try {
                setButtonLoading(postBtn, true);
                postBtn.classList.remove('hidden');
                storyFile = await compressImage(e.target.files[0]);
                const reader = new FileReader();
                reader.onload = (event) => {
                    previewImage.src = event.target.result;
                    previewContainer.classList.remove('hidden');
                    uploadPrompt.classList.add('hidden');
                    postBtn.disabled = false;
                    setButtonLoading(postBtn, false, 'Posting');
                    actionButtons.classList.remove('hidden');
                };
                reader.readAsDataURL(storyFile);
            } catch (error) {
                 showMessage("Gagal memproses gambar.", 3000, true);
                 setButtonLoading(postBtn, false, 'Posting');
                 closeCreator();
            }
        }
    });

    postBtn.addEventListener('click', async () => {
        if (!storyFile || !currentUser) return;
        setButtonLoading(postBtn, true);
        try {
            // Kode ini sekarang akan berjalan dengan benar karena api.ref() sudah diekspor
            const storageRef = api.ref(api.storage, `stories/${currentUser.uid}/${Date.now()}_${storyFile.name}`);
            const snapshot = await api.uploadBytes(storageRef, storyFile);
            const imageUrl = await api.getDownloadURL(snapshot.ref);
            
            await api.addDoc(api.collection(api.db, "stories"), {
                userId: currentUser.uid, 
                userName: currentUserData.name, 
                userAvatar: currentUserData.avatarUrl,
                imageUrl: imageUrl, 
                createdAt: api.serverTimestamp(), 
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            showMessage("Story berhasil diunggah!");
            closeCreator();
        } catch (error) {
            console.error("Upload Story Error:", error); // Log error untuk debugging
            showMessage("Gagal mengunggah story.", 3000, true);
        } finally {
            setButtonLoading(postBtn, false, 'Posting');
        }
    });
}

function handleBottomNavClick(e) {
    const navItem = e.target.closest('.nav-item');
    if (navItem && !navItem.classList.contains('active')) {
        document.querySelectorAll('#bottom-nav .nav-item').forEach(n => n.classList.remove('active', 'text-primary-500'));
        navItem.classList.add('active', 'text-primary-500');
        loadScreen(navItem.dataset.target);
    }
}

function handleSidebarNavClick(e) {
    e.preventDefault();
    const link = e.target.closest('.sidebar-link');
    if (!link || link.classList.contains('active')) return;
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    const targetPage = link.dataset.target;
    const pageTitle = document.getElementById('page-title');
    if(pageTitle) pageTitle.textContent = link.querySelector('span').textContent;
    loadScreen(targetPage);
    if (window.innerWidth < 768) {
        toggleSidebar();
    }
}

function handleAdminMenuClick(e) {
    const button = e.target.closest('button');
    if (!button) return;
    const adminMenuDropdown = document.getElementById('admin-menu-dropdown');
    if (button.id === 'dashboard-menu-logout-btn') {
        handleLogout();
    }
    else if (button.dataset.target) {
        loadScreen(button.dataset.target);
    }
    adminMenuDropdown?.classList.add('hidden');
}

function handleThemeToggle() {
    const isDark = document.documentElement.classList.toggle('dark');
    const newTheme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

function handleGlobalBodyClick(e) {
    const target = e.target;
    const adminMenuButton = document.getElementById('admin-menu-button');
    const adminMenuDropdown = document.getElementById('admin-menu-dropdown');
    if (adminMenuButton && !adminMenuButton.contains(target) && !adminMenuDropdown.contains(target) && !adminMenuDropdown.classList.contains('hidden')) {
        adminMenuDropdown.classList.add('hidden');
    }
    if (adminMenuButton && adminMenuButton.contains(target)) {
        adminMenuDropdown?.classList.toggle('hidden');
    }
    if (target.closest('.close-modal-btn, .cancel-modal-btn') || target.classList.contains('modal-overlay')) {
        const modal = target.closest('.modal-overlay');
        if (modal) closeModal(modal.id);
    }
}
