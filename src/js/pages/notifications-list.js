// File: src/js/pages/notifications-list.js
// Deskripsi: Logika spesifik untuk halaman Daftar Notifikasi.
// Perubahan:
// - [FIX] Memperbaiki bug hapus notifikasi dengan menghilangkan manipulasi DOM manual
//   dan membiarkan onSnapshot yang menangani pembaruan UI secara real-time.

import { currentUser } from '../auth.js';
import { loadScreen } from '../router.js';
import { showMessage } from '../ui.js';
import * as api from '../api.js';

// Variabel untuk melacak item notifikasi yang sedang terbuka (tergeser)
let currentlyOpenItem = null;
// Flag untuk memastikan animasi petunjuk hanya berjalan sekali
let hintAnimationShown = false;

/**
 * Fungsi inisialisasi untuk halaman Daftar Notifikasi.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    // Reset state saat halaman diinisialisasi
    hintAnimationShown = false;
    currentlyOpenItem = null;

    document.getElementById('back-to-home-btn')?.addEventListener('click', () => loadScreen('home'));
    
    const markAllReadBtn = document.getElementById('mark-all-read-btn');
    const handleMarkAllRead = async () => {
        markAllReadBtn.disabled = true;
        markAllReadBtn.textContent = 'Memproses...';
        try {
            const unreadQuery = api.query(api.collection(api.db, `users/${currentUser.uid}/notifications`), api.where('isRead', '==', false));
            const snapshot = await api.getDocs(unreadQuery);
            if (snapshot.empty) {
                showMessage("Semua notifikasi sudah dibaca.");
                return;
            }
            const updatePromises = snapshot.docs.map(doc => api.updateDoc(doc.ref, { isRead: true }));
            await Promise.all(updatePromises);
            showMessage("Semua notifikasi ditandai telah dibaca.");
        } catch (error) {
            console.error("Gagal menandai notifikasi:", error);
            showMessage("Terjadi kesalahan. Coba lagi.");
        } finally {
            markAllReadBtn.disabled = false;
            markAllReadBtn.textContent = 'Tandai semua dibaca';
        }
    };
    markAllReadBtn?.addEventListener('click', handleMarkAllRead);
    if(markAllReadBtn) addL(() => markAllReadBtn.removeEventListener('click', handleMarkAllRead));

    const q = api.query(api.collection(api.db, `users/${currentUser.uid}/notifications`), api.orderBy('createdAt', 'desc'));
    const unsubscribe = api.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">Tidak ada notifikasi.</p>';
            if (markAllReadBtn) markAllReadBtn.classList.add('hidden');
            return;
        }
        if (markAllReadBtn) markAllReadBtn.classList.remove('hidden');
        
        snapshot.forEach(doc => {
            container.appendChild(createNotificationElement(doc.id, doc.data()));
        });

        // --- LOGIKA ANIMASI PETUNJUK ---
        if (!hintAnimationShown && container.firstChild) {
            const firstItemContent = container.firstChild.querySelector('.notification-item-content');
            if (firstItemContent) {
                firstItemContent.classList.add('swipe-hint-animation');
                firstItemContent.addEventListener('animationend', () => {
                    firstItemContent.classList.remove('swipe-hint-animation');
                }, { once: true });
                hintAnimationShown = true;
            }
        }
    });
    addL(unsubscribe);
}


/**
 * Membuat elemen notifikasi dengan fungsionalitas geser-untuk-hapus.
 */
function createNotificationElement(id, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notification-item-wrapper';
    
    const actionWidth = 60;
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;
    let isRevealed = false;

    const bgColorClass = !data.isRead 
        ? 'bg-primary-50 dark:bg-primary-950' 
        : 'bg-white dark:bg-gray-800';

    const content = document.createElement('div');
    content.className = `notification-item-content p-3 flex items-start space-x-3 cursor-pointer rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${bgColorClass}`;
    
    const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString('id-ID', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    
    let iconHtml = '<i class="fas fa-bell text-gray-400"></i>';
    if (data.type === 'new_comment' || data.type === 'like') {
        iconHtml = '<i class="fas fa-heart text-red-500"></i>';
    } else if (data.type === 'new_signal') {
        iconHtml = '<i class="fas fa-chart-line text-primary-500"></i>';
    }
    
    let linkButtonHtml = '';
    if (data.link?.url) {
        linkButtonHtml = `<a href="${data.link.url}" target="_blank" rel="noopener noreferrer" class="external-link-btn inline-block mt-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-full transition-colors">Klik Disini</a>`;
    }

    content.innerHTML = `
        <div class="w-8 h-8 flex items-center justify-center mt-1">${iconHtml}</div>
        <div class="flex-1">
            <p class="font-semibold text-sm">${data.title || ''}</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">${data.body || ''}</p>
            ${linkButtonHtml}
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">${time}</p>
        </div>
        ${!data.isRead ? '<div class="w-2 h-2 bg-blue-500 rounded-full mt-1 self-center"></div>' : ''}
    `;

    const action = document.createElement('div');
    action.className = 'notification-item-action';
    action.innerHTML = `
        <button class="notification-delete-btn">
            <i class="fas fa-trash-alt text-xl"></i>
            <span class="text-xs mt-1">Hapus</span>
        </button>`;

    // --- LOGIKA EVENT LISTENER ---
    
    const closeAction = () => {
        content.style.transform = 'translateX(0)';
        isRevealed = false;
        if (currentlyOpenItem === wrapper) {
            currentlyOpenItem = null;
        }
    };

    const handleContentClick = async (e) => {
        if (isRevealed) {
            closeAction();
            return;
        }
        if (e.target.closest('.external-link-btn')) return;

        const notifRef = api.doc(api.db, `users/${currentUser.uid}/notifications`, id);
        await api.updateDoc(notifRef, { isRead: true });

        if (data.link?.screen) {
            loadScreen(data.link.screen, data.link.params || {});
        }
    };
    content.addEventListener('click', handleContentClick);

    // --- PERBAIKAN UTAMA DI SINI ---
    action.querySelector('.notification-delete-btn').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        button.disabled = true; // Nonaktifkan tombol untuk mencegah klik ganda
        
        try {
            // Cukup panggil fungsi hapus dari API.
            // onSnapshot akan secara otomatis menangani pembaruan UI.
            await api.deleteUserNotification(currentUser.uid, id);
            // Tidak perlu showMessage karena item akan langsung hilang dari UI
        } catch (error) {
            console.error("Gagal menghapus notifikasi:", error);
            showMessage("Gagal menghapus notifikasi.", 3000, true);
            button.disabled = false; // Aktifkan kembali tombol jika gagal
        }
    });
    // --- AKHIR PERBAIKAN ---

    const onTouchStart = (e) => {
        if (currentlyOpenItem && currentlyOpenItem !== wrapper) {
            const openContent = currentlyOpenItem.querySelector('.notification-item-content');
            if (openContent) {
                openContent.style.transform = 'translateX(0)';
            }
        }
        startX = e.touches[0].clientX;
        currentX = startX;
        isSwiping = true;
        content.style.transition = 'none';
    };

    const onTouchMove = (e) => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        if (diffX < 0) {
            content.style.transform = `translateX(${Math.max(-actionWidth, diffX)}px)`;
        }
    };

    const onTouchEnd = () => {
        if (!isSwiping) return;
        isSwiping = false;
        content.style.transition = 'transform 0.3s ease';
        const diffX = currentX - startX;
        
        if (diffX < -actionWidth / 2) {
            content.style.transform = `translateX(-${actionWidth}px)`;
            isRevealed = true;
            currentlyOpenItem = wrapper;
        } else {
            closeAction();
        }
    };

    wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: true });
    wrapper.addEventListener('touchend', onTouchEnd);
    
    wrapper.appendChild(content);
    wrapper.appendChild(action);
        
    return wrapper;
}
