// File: src/js/pages/events.js
// Deskripsi: Logika spesifik untuk halaman Event & Webinar.
// Versi Perbaikan: 2.2 (Swipe Logic Hotfix)
// Perubahan:
// - Memperbaiki TypeError dengan mengirim elemen HTML asli ke fungsi setupSwipeableTabs.

import { loadScreen } from '../router.js';
import { createEventSkeleton, setupSwipeableTabs } from '../ui.js';
import * as api from '../api.js';

/**
 * Fungsi inisialisasi untuk halaman Events.
 */
export function initPage(params, addL) {
    const upcomingList = document.getElementById('event-list-upcoming');
    const historyList = document.getElementById('event-list-history');
    if (!upcomingList || !historyList) return;

    // Tampilkan skeleton loader
    upcomingList.innerHTML = '';
    for (let i = 0; i < 3; i++) { upcomingList.appendChild(createEventSkeleton()); }

    // PERBAIKAN: Ambil elemennya terlebih dahulu sebelum memanggil fungsi swipe
    const tabButtons = [
        document.getElementById('tab-upcoming'),
        document.getElementById('tab-history')
    ];
    const contentPanels = [
        upcomingList,
        historyList
    ];
    setupSwipeableTabs({ 
        tabButtons, 
        contentPanels, 
        addL,
        // Berikan ID container khusus yang sudah kita buat di HTML
        swipeContainerId: 'events-swipe-container' 
    });

    // Muat daftar event
    loadEventList(upcomingList, 'upcoming', addL);
    loadEventList(historyList, 'history', addL);
}

/**
 * Memuat dan menampilkan daftar event secara real-time.
 */
function loadEventList(container, type, addL) {
    let q;
    if (type === 'upcoming') {
        q = api.query(api.collection(api.db, "events"), api.where("eventDate", ">=", new Date()), api.orderBy("eventDate", "asc"));
    } else {
        q = api.query(api.collection(api.db, "events"), api.where("eventDate", "<", new Date()), api.orderBy("eventDate", "desc"));
    }

    const unsub = api.onSnapshot(q, (snapshot) => {
        // Hapus skeleton jika ada
        const skeletons = container.querySelectorAll('.animate-pulse');
        skeletons.forEach(sk => sk.remove());

        if (snapshot.empty) {
            if (container.innerHTML.trim() === '') {
                 container.innerHTML = `<p class="text-center text-gray-500 py-8">Tidak ada event ${type === 'upcoming' ? 'mendatang' : 'terakhir'}.</p>`;
            }
        } else {
             // Hapus pesan 'empty' jika ada
            const emptyMsg = container.querySelector('p');
            if (emptyMsg) emptyMsg.remove();
            
            snapshot.forEach(doc => {
                 // Cek agar tidak duplikat
                if (!container.querySelector(`#event-${doc.id}`)) {
                    const card = createEventCard({ id: doc.id, ...doc.data() });
                    card.id = `event-${doc.id}`;
                    container.appendChild(card);
                }
            });
        }
    });
    addL(unsub);
}

/**
 * Membuat kartu event (component).
 */
function createEventCard(eventData) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden cursor-pointer flex';
    const eventDate = eventData.eventDate?.seconds ? new Date(eventData.eventDate.seconds * 1000) : new Date();
    const day = eventDate.getDate();
    const month = eventDate.toLocaleString('id-ID', { month: 'short' }).toUpperCase();
    card.innerHTML = `
        <div class="flex-shrink-0 w-20 flex flex-col items-center justify-center bg-primary-50 dark:bg-primary-900 text-primary-600 dark:text-primary-300">
            <span class="text-3xl font-bold">${day}</span>
            <span class="text-sm font-semibold">${month}</span>
        </div>
        <div class="p-4 flex-1">
            <span class="text-xs font-semibold ${eventData.type === 'Online' ? 'text-blue-500' : 'text-purple-500'}">${eventData.type || 'Online'}</span>
            <h4 class="font-bold text-gray-800 dark:text-white mt-1">${eventData.title || 'Nama Event'}</h4>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center">
                <i class="fas fa-map-marker-alt w-4"></i>
                <span>${eventData.location || 'Lokasi'}</span>
            </div>
        </div>
    `;
    card.addEventListener('click', () => loadScreen('event-detail', { eventId: eventData.id }));
    return card;
}
