// File: src/js/dashboard/notifications.js (REVISED & FIXED)
// Deskripsi: Logika untuk halaman Manajemen Notifikasi di Dashboard Admin.
// Perubahan:
// - [FIX] Memperbaiki pemetaan rute untuk semua tipe konten (Event, Artikel, Video, dll.)
//   agar sesuai dengan yang terdaftar di router.js.

import * as api from '../api.js';
import { showMessage, setButtonLoading } from '../ui.js';

// State untuk menyimpan data konten yang akan ditautkan
let linkedContent = null;

/**
 * Fungsi inisialisasi utama untuk halaman.
 */
export function initPage(params, addL) {
    setupEventListeners(addL);
    loadHistory(addL);
    updateFormUI(); // Panggil sekali untuk mengatur state awal form
}

/**
 * Menyiapkan semua event listener untuk elemen di halaman.
 */
function setupEventListeners(addL) {
    const form = document.getElementById('notification-form');
    const typeRadios = form.querySelectorAll('input[name="notificationType"]');
    const checkContentBtn = document.getElementById('check-content-btn');
    const customTitleInput = document.getElementById('custom-title-input');
    const customBodyInput = document.getElementById('custom-body-input');

    // Listener untuk mengubah tampilan form saat tipe notifikasi diganti
    typeRadios.forEach(radio => {
        const handler = () => updateFormUI();
        radio.addEventListener('change', handler);
        addL(() => radio.removeEventListener('change', handler));
    });

    // Listener untuk tombol "Cek" konten
    const checkHandler = () => handleCheckContent();
    checkContentBtn.addEventListener('click', checkHandler);
    addL(() => checkContentBtn.removeEventListener('click', checkHandler));

    // Listener untuk input kustom untuk mengaktifkan/menonaktifkan tombol kirim
    const customInputHandler = () => updateFormUI();
    customTitleInput.addEventListener('input', customInputHandler);
    customBodyInput.addEventListener('input', customInputHandler);
    addL(() => customTitleInput.removeEventListener('input', customInputHandler));
    addL(() => customBodyInput.removeEventListener('input', customInputHandler));

    // Listener untuk submit form utama
    const submitHandler = (e) => {
        e.preventDefault();
        handleSendNotification();
    };
    form.addEventListener('submit', submitHandler);
    addL(() => form.removeEventListener('submit', submitHandler));
}

/**
 * Mengatur tampilan UI form berdasarkan pilihan tipe notifikasi.
 */
function updateFormUI() {
    const form = document.getElementById('notification-form');
    const selectedType = form.querySelector('input[name="notificationType"]:checked').value;
    const sendBtn = document.getElementById('send-notification-btn');

    document.getElementById('form-content-link').classList.toggle('hidden', selectedType !== 'content');
    document.getElementById('form-custom-message').classList.toggle('hidden', selectedType !== 'custom');

    // Logika untuk mengaktifkan tombol kirim
    if (selectedType === 'content') {
        sendBtn.disabled = !linkedContent; // Aktif hanya jika ada konten yang valid
    } else { // custom
        const title = document.getElementById('custom-title-input').value.trim();
        const body = document.getElementById('custom-body-input').value.trim();
        sendBtn.disabled = !title || !body; // Aktif hanya jika judul & isi tidak kosong
    }
}

/**
 * Mencari konten berdasarkan ID yang dimasukkan dan menampilkan pratinjau.
 */
async function handleCheckContent() {
    const contentId = document.getElementById('content-id-input').value.trim();
    const previewContainer = document.getElementById('content-preview-container');
    const previewEl = document.getElementById('content-preview');
    const checkBtn = document.getElementById('check-content-btn');

    if (!contentId) return;

    setButtonLoading(checkBtn, true);
    linkedContent = null; // Reset state
    previewContainer.classList.add('hidden');

    try {
        const collectionsToSearch = ['articles', 'videos', 'ebooks', 'events', 'signals', 'courses', 'posts'];
        let contentData = null;
        let contentType = null;

        for (const collectionName of collectionsToSearch) {
            const docRef = api.doc(api.db, collectionName, contentId);
            const docSnap = await api.getDoc(docRef);
            if (docSnap.exists()) {
                contentData = docSnap.data();
                contentType = collectionName.slice(0, -1); // 'articles' -> 'article'
                break;
            }
        }

        if (contentData) {
            linkedContent = {
                type: contentType,
                id: contentId,
                data: contentData
            };
            
            const iconMap = {
                signal: 'fa-signal text-green-500', event: 'fa-calendar-alt text-purple-500',
                post: 'fa-users text-indigo-500', article: 'fa-newspaper text-blue-500',
                video: 'fa-video text-red-500', ebook: 'fa-book text-yellow-600',
                course: 'fa-graduation-cap text-teal-500'
            };
            const iconClass = iconMap[contentType] || 'fa-question-circle';
            const title = contentData.title || contentData.pair || `Postingan oleh ${contentData.authorName}`;

            previewEl.innerHTML = `
                <i class="fas ${iconClass} text-2xl w-8 text-center"></i>
                <div>
                    <p class="font-semibold">${title}</p>
                    <p class="text-xs text-gray-500 capitalize">${contentType}</p>
                </div>`;
            previewContainer.classList.remove('hidden');
            showMessage("Konten berhasil ditemukan!");
        } else {
            showMessage("Konten dengan ID tersebut tidak ditemukan.", 3000, true);
        }
    } catch (error) {
        console.error("Error checking content:", error);
        showMessage("Terjadi kesalahan saat memeriksa konten.", 3000, true);
    } finally {
        setButtonLoading(checkBtn, false, 'Cek');
        updateFormUI(); // Update status tombol kirim
    }
}

/**
 * Mengirim notifikasi ke pengguna sesuai dengan data form.
 */
async function handleSendNotification() {
    const form = document.getElementById('notification-form');
    const sendBtn = document.getElementById('send-notification-btn');
    const userTarget = form.querySelector('input[name="userTarget"]:checked').value;
    const notificationType = form.querySelector('input[name="notificationType"]:checked').value;

    let payload = {};

    if (notificationType === 'content' && linkedContent) {
        const { type, id, data } = linkedContent;
        const title = data.title || data.pair || `Postingan Baru`;
        
        // --- PERBAIKAN UTAMA DI SINI ---
        let screenTarget = '';
        let params = {};

        // Memetakan tipe konten ke rute dan parameter yang benar
        switch (type) {
            case 'article':
            case 'video':
            case 'ebook':
                screenTarget = 'content-viewer';
                params = { contentType: type, contentId: id };
                break;
            case 'event':
                screenTarget = 'event-detail';
                params = { eventId: id };
                break;
            case 'signal':
                screenTarget = 'signals';
                params = { signalId: id };
                break;
            case 'post':
                screenTarget = 'community';
                params = { postId: id };
                break;
            case 'course':
                screenTarget = 'education';
                params = { courseId: id };
                break;
            default:
                // Fallback untuk banner atau tipe tak dikenal, arahkan ke beranda
                screenTarget = 'home';
                params = {};
        }

        payload = {
            title: `Konten Baru: ${title}`,
            body: `Ada ${type} baru yang mungkin Anda sukai. Klik untuk melihat.`,
            link: { screen: screenTarget, params: params }
        };
        // --- AKHIR PERBAIKAN ---

    } else if (notificationType === 'custom') {
        const title = document.getElementById('custom-title-input').value.trim();
        const body = document.getElementById('custom-body-input').value.trim();
        const customLink = document.getElementById('custom-link-input').value.trim();

        payload = {
            title,
            body,
            link: {}
        };
        
        if (customLink) {
            payload.link.url = customLink;
        } else {
            payload.link.screen = 'home';
        }

    } else {
        return showMessage("Data notifikasi tidak lengkap.", 3000, true);
    }

    setButtonLoading(sendBtn, true);
    try {
        await api.adminSendTargetedNotification(userTarget, payload);
        showMessage("Notifikasi berhasil dikirim!");
        form.reset();
        linkedContent = null;
        document.getElementById('content-preview-container').classList.add('hidden');
        updateFormUI();
    } catch (error) {
        console.error("Gagal mengirim notifikasi:", error);
        showMessage("Gagal mengirim notifikasi. Coba lagi.", 4000, true);
    } finally {
        setButtonLoading(sendBtn, false, 'Kirim Notifikasi');
    }
}

/**
 * Memuat riwayat notifikasi yang pernah dikirim oleh admin.
 */
function loadHistory(addL) {
    const tableBody = document.getElementById('history-table-body');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Memuat riwayat...</td></tr>';

    const q = api.query(
        api.collection(api.db, "adminNotificationHistory"),
        api.orderBy("sentAt", "desc"),
        api.limit(20)
    );

    const unsubscribe = api.onSnapshot(q, (snapshot) => {
        tableBody.innerHTML = '';
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-gray-500">Belum ada notifikasi yang dikirim.</td></tr>';
        } else {
            snapshot.forEach(doc => {
                tableBody.appendChild(createHistoryRow(doc.id, doc.data()));
            });
        }
    });
    addL(unsubscribe);
}

/**
 * Membuat satu baris <tr> untuk tabel riwayat.
 */
function createHistoryRow(id, data) {
    const tr = document.createElement('tr');
    tr.className = 'border-b dark:border-gray-700';

    const time = data.sentAt ? new Date(data.sentAt.seconds * 1000).toLocaleString('id-ID') : 'N/A';
    const targetText = { all: 'Semua', premium: 'Premium', regular: 'Biasa' }[data.target] || 'N/A';
    
    tr.innerHTML = `
        <td class="p-3">
            <p class="font-semibold">${data.title}</p>
            <p class="text-xs text-gray-500">${data.body}</p>
        </td>
        <td class="p-3 capitalize">${targetText}</td>
        <td class="p-3 text-xs">${time}</td>
        <td class="p-3">
            <button class="delete-history-btn text-red-500 hover:text-red-700" data-id="${id}" title="Hapus Riwayat">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;

    tr.querySelector('.delete-history-btn').addEventListener('click', async (e) => {
        const historyId = e.currentTarget.dataset.id;
        if (confirm(`Yakin ingin menghapus riwayat notifikasi "${data.title}"?`)) {
            try {
                await api.adminDeleteNotificationHistory(historyId);
                showMessage("Riwayat berhasil dihapus.");
            } catch (error) {
                console.error("Gagal menghapus riwayat:", error);
                showMessage("Gagal menghapus riwayat.", 3000, true);
            }
        }
    });

    return tr;
}
