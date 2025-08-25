// File: src/js/pages/event-detail.js
// Deskripsi: Logika spesifik untuk halaman Detail Event.
// Versi Perbaikan: 2.0
// Perubahan:
// - Mengubah tombol kembali agar mengarah ke 'home'.
// - Menambahkan tombol baru untuk mengarah ke daftar 'events'.

import { currentUser, currentUserData } from '../auth.js';
import { loadScreen } from '../router.js';
import { showMessage } from '../ui.js';
import * as api from '../api.js';

/**
 * Fungsi inisialisasi untuk halaman Event Detail.
 * @param {object} params - Parameter dari router, berisi `eventId`.
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export async function initPage(params, addL) {
    const { eventId } = params;
    const contentArea = document.getElementById('app-content-area');
    if (!eventId) {
        contentArea.innerHTML = '<p class="text-center text-red-500 p-8">ID Event tidak ditemukan.</p>';
        return;
    }
    
    // --- PERBAIKAN DIMULAI DI SINI ---
    
    // 1. Tombol kembali (panah kiri) kini mengarah ke 'home'
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    const backToHomeHandler = () => loadScreen('home');
    backToHomeBtn?.addEventListener('click', backToHomeHandler);
    addL(() => backToHomeBtn?.removeEventListener('click', backToHomeHandler));

    // 2. Tombol baru (garis tiga) kini mengarah ke daftar 'events'
    const goToListBtn = document.getElementById('go-to-events-list-btn');
    const goToListHandler = () => loadScreen('events');
    goToListBtn?.addEventListener('click', goToListHandler);
    addL(() => goToListBtn?.removeEventListener('click', goToListHandler));
    
    // --- PERBAIKAN SELESAI DI SINI ---

    try {
        const eventDocRef = api.doc(api.db, "events", eventId);
        const eventDocSnap = await api.getDoc(eventDocRef);
        if (eventDocSnap.exists()) {
            const event = eventDocSnap.data();
            const registerBtn = document.getElementById('register-event-btn');

            document.getElementById('event-banner').src = event.imageUrl || 'https://placehold.co/400x200/e0e0e0/333333?text=Event';
            document.getElementById('event-title').textContent = event.title;
            document.getElementById('event-description').textContent = event.description;
            document.getElementById('event-location').textContent = event.location || event.type;
            const eventDate = new Date(event.eventDate.seconds * 1000);
            document.getElementById('event-date').textContent = eventDate.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
            document.getElementById('event-price').textContent = !event.price || event.price === 0 ? 'Gratis' : `Rp ${event.price.toLocaleString('id-ID')}`;

            if (event.attendees && event.attendees.includes(currentUser.uid)) {
                registerBtn.disabled = true;
                registerBtn.textContent = 'Anda Sudah Terdaftar';
            } else {
                registerBtn.disabled = false;
                registerBtn.textContent = 'Daftar Sekarang';
            }

            const handleRegisterClick = async () => {
                setButtonLoading(registerBtn, true);
                try {
                    await api.updateDoc(eventDocRef, { attendees: api.arrayUnion(currentUser.uid) });
                    showMessage(`Anda berhasil terdaftar untuk event: ${event.title}!`);
                    registerBtn.textContent = 'Anda Sudah Terdaftar';
                    registerBtn.disabled = true;
                } catch (error) {
                    console.error("Gagal mendaftar event:", error);
                    showMessage("Gagal mendaftar, coba lagi.");
                    setButtonLoading(registerBtn, false, 'Daftar Sekarang');
                }
            };
            registerBtn.addEventListener('click', handleRegisterClick);
            addL(() => registerBtn.removeEventListener('click', handleRegisterClick));

        } else {
            contentArea.innerHTML = '<p class="text-center text-red-500 p-8">Detail event tidak ditemukan.</p>';
        }
    } catch (error) {
        console.error("Gagal memuat detail event:", error);
        showMessage("Gagal memuat data. Silakan coba lagi.");
    }
}