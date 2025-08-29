// File: src/js/router.js (REVISED & FIXED)
// Deskripsi: Mengelola semua logika perutean dan pemuatan halaman (SPA).
// Versi Perbaikan: 3.4 - Logout Cleanup
// Perubahan:
// - Menambahkan fungsi `cleanupNotificationListener` untuk mematikan listener notifikasi secara manual.

import { currentUserData } from './auth.js';
import { db, collection, query, where, onSnapshot } from './api.js';
import { updateBottomNavActiveState } from './ui.js';

let activePageListeners = [];
let notificationUnsubscribe = null;

const routes = {
    // Rute Publik
    'login': { path: 'app/login.html', role: 'public', init: () => import('./pages/login.js') },
    'register': { path: 'app/register.html', role: 'public', init: () => import('./pages/register.js') },

    // Rute Aplikasi Pengguna
    'home': { path: 'app/home.html', role: 'user', init: () => import('./pages/home.js') },
    'signals': { path: 'app/signals.html', role: 'user', init: () => import('./pages/signals.js') },
    'community': { path: 'app/community.html', role: 'user', init: () => import('./pages/community.js') },
    'education': { path: 'app/education.html', role: 'user', init: () => import('./pages/education.js') },
    'profile': { path: 'app/profile.html', role: 'user', init: () => import('./pages/profile.js') },
    'user-profile': { path: 'app/user-profile.html', role: 'user', init: () => import('./pages/user-profile.js') },
    'events': { path: 'app/events.html', role: 'user', init: () => import('./pages/events.js') },
    'event-detail': { path: 'app/event-detail.html', role: 'user', init: () => import('./pages/event-detail.js') },
    'security': { path: 'app/security.html', role: 'user', init: () => import('./pages/security.js') },
    'notifications': { path: 'app/notifications.html', role: 'user', init: () => import('./pages/notifications.js') },
    'settings': { path: 'app/settings.html', role: 'user', init: () => import('./pages/app-settings.js') },
    'help-center': { path: 'app/help-center.html', role: 'user', init: () => import('./pages/help-center.js') },
    'notifications-list': { path: 'app/notifications-list.html', role: 'user', init: () => import('./pages/notifications-list.js') },
    'search': { path: 'app/search.html', role: 'user', init: () => import('./pages/search.js') },
    'content-viewer': { path: 'app/content-viewer.html', role: 'user', init: () => import('./pages/content-viewer.js') },

    // Rute Dashboard Admin
    'dashboard': { path: 'dashboard/dashboard.html', role: 'admin', init: () => import('./dashboard/dashboard.js') },
    'users': { path: 'dashboard/users.html', role: 'admin', init: () => import('./dashboard/users.js') },
    'signals-admin': { path: 'dashboard/signals.html', role: 'admin', init: () => import('./dashboard/signals.js') },
    'content': { path: 'dashboard/content.html', role: 'admin', init: () => import('./dashboard/content.js') },
    'education-admin': { path: 'dashboard/education.html', role: 'admin', init: () => import('./dashboard/education.js') },
    'community-admin': { path: 'dashboard/community.html', role: 'admin', init: () => import('./dashboard/community.js') },
    'events-admin': { path: 'dashboard/events.html', role: 'admin', init: () => import('./dashboard/events.js') },
    'notifications-admin': { path: 'dashboard/notifications.html', role: 'admin', init: () => import('./dashboard/notifications.js') },
    'payment-settings': { path: 'dashboard/payment-settings.html', role: 'admin', init: () => import('./dashboard/payment-settings.js') },
    'payments': { path: 'dashboard/payments.html', role: 'admin', init: () => import('./dashboard/payments.js') },
    'app-settings-admin': { path: 'dashboard/app-settings.html', role: 'admin', init: () => import('./dashboard/app-settings.js') }, 
    'settings-admin': { path: 'dashboard/settings.html', role: 'admin', init: () => import('./dashboard/settings.js') }
};

function cleanupPageListeners() {
    activePageListeners.forEach(unsubscribe => unsubscribe());
    activePageListeners = [];
}

// [FUNGSI BARU]
export function cleanupNotificationListener() {
    if (notificationUnsubscribe) {
        notificationUnsubscribe();
        notificationUnsubscribe = null;
    }
}

export async function loadScreen(screenName, params = {}) {
    cleanupPageListeners();

    const normalizedScreenName = screenName.toLowerCase();

    const route = routes[normalizedScreenName];
    if (!route) {
        console.error(`Route "${screenName}" tidak ditemukan.`);
        return;
    }

    const userIsAdmin = currentUserData?.isAdmin || false;
    const userIsLoggedIn = !!currentUserData;

    if (route.role === 'admin') {
        if (!userIsLoggedIn) return loadScreen('login');
        if (!userIsAdmin) return loadScreen('home');
    }
    if (route.role === 'user') {
        if (!userIsLoggedIn) return loadScreen('login');
        if (userIsAdmin) return loadScreen('dashboard');
    }
    if (route.role === 'public') {
        if (userIsLoggedIn) {
            return loadScreen(userIsAdmin ? 'dashboard' : 'home');
        }
    }

    const roots = {
        public: document.getElementById('public-root'),
        app: document.getElementById('app-root'),
        dashboard: document.getElementById('dashboard-root'),
    };
    
    let activeRoot = null;
    let contentArea = null;

    if (route.role === 'public') {
        activeRoot = roots.public;
        contentArea = roots.public;
    } else if (route.role === 'user') {
        activeRoot = roots.app;
        contentArea = document.getElementById('app-content-area');
    } else if (route.role === 'admin') {
        activeRoot = roots.dashboard;
        contentArea = document.getElementById('dashboard-content-area');
    }

    Object.values(roots).forEach(root => root?.classList.add('hidden'));
    activeRoot?.classList.remove('hidden');

    if (!contentArea) {
        console.error(`Area konten untuk rute "${screenName}" tidak ditemukan.`);
        return;
    }

    contentArea.innerHTML = '<div class="h-screen flex items-center justify-center"><i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i></div>';

    try {
        const response = await fetch(`./src/pages/${route.path}?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`File halaman "${route.path}" tidak dapat diakses.`);
        
        contentArea.innerHTML = await response.text();

        const module = await route.init();
        if (typeof module.initPage === 'function') {
            module.initPage(params, (listener) => activePageListeners.push(listener));
        }
        
        if (route.role === 'user') {
            updateBottomNavActiveState(normalizedScreenName);
        }
        
        window.scrollTo(0, 0);

    } catch (error) {
        console.error("Gagal memuat halaman:", error);
        contentArea.innerHTML = `<div class="p-8 text-center text-red-500"><h2 class="font-bold">Gagal Memuat Halaman</h2><p class="text-sm">${error.message}</p></div>`;
    }
}

export function setupNotificationListener(userId) {
    if (notificationUnsubscribe) notificationUnsubscribe();
    if (!userId) return;

    const notificationsQuery = query(
        collection(db, `users/${userId}/notifications`),
        where('isRead', '==', false)
    );

    notificationUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const badges = document.querySelectorAll('.notification-badge');
        const hasUnread = !snapshot.empty;
        badges.forEach(badge => badge.classList.toggle('hidden', !hasUnread));
    });
}
