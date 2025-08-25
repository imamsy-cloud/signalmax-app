// File: src/js/main.js
// Deskripsi: File inisialisasi utama untuk aplikasi SPA SignalMax.
// Versi Perbaikan: 3.3 - Final Check for Notification Feature
// Perubahan:
// - Verifikasi bahwa logika sidebar generik sudah menangani rute baru. Tidak ada perubahan kode fungsional yang diperlukan.

import { initAuthListener, handleLogout } from './auth.js';
import { loadScreen } from './router.js';
import { applyTheme, toggleSidebar, initAllModals, closeModal } from './ui.js';

/**
 * Titik masuk utama aplikasi. Dijalankan setelah DOM sepenuhnya dimuat.
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikasi SignalMax dimulai.");

    applyTheme(localStorage.getItem('theme') || 'light');
    initGlobalListeners();
    initAuthListener(); 
});

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

    // Menangani klik di body untuk menutup modal atau dropdown
    document.body.addEventListener('click', handleGlobalBodyClick);
    
    // Inisialisasi semua listener untuk modal yang ada di index.html
    initAllModals();
}

/**
 * Menangani klik pada navigasi bawah (bottom nav).
 */
function handleBottomNavClick(e) {
    const navItem = e.target.closest('.nav-item');
    if (navItem && !navItem.classList.contains('active')) {
        document.querySelectorAll('#bottom-nav .nav-item').forEach(n => n.classList.remove('active', 'text-primary-500'));
        navItem.classList.add('active', 'text-primary-500');
        loadScreen(navItem.dataset.target);
    }
}

/**
 * Menangani klik pada navigasi samping (sidebar) di dashboard.
 */
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

/**
 * Menangani klik pada item di dalam menu dropdown admin.
 */
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


/**
 * Menangani pergantian tema (light/dark).
 */
function handleThemeToggle() {
    const isDark = document.documentElement.classList.toggle('dark');
    const newTheme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

/**
 * Menangani klik global pada body untuk menutup elemen-elemen UI.
 */
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
