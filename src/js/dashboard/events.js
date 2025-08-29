// File: src/js/dashboard/events.js
// Deskripsi: Logika untuk halaman Manajemen Event di Dashboard Admin.
// Versi Perbaikan: 4.1 (Error Handling Fix)
// Perubahan:
// - Memperbaiki blok `catch` untuk menampilkan pesan error yang benar (`error.message`).

import * as api from '../api.js';
import { showMessage, openModal, closeModal, setButtonLoading, createPaginationControls, compressImage } from '../ui.js';

// --- State untuk Pagination ---
const ITEMS_PER_PAGE = 10;
let currentEditId = null;
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let currentPage = 1;
let pageMarkers = [];
let currentQuery = null;


/**
 * Fungsi inisialisasi untuk halaman Manajemen Event.
 */
export function initPage(params, addL) {
    resetPaginationState();
    setupCreateForm(addL);
    setupEditModal(addL);
    loadEventsPage(addL);
}

/** Mereset semua state pagination ke nilai awal */
function resetPaginationState() {
    lastVisibleDoc = null;
    firstVisibleDoc = null;
    currentPage = 1;
    pageMarkers = [];
    currentQuery = null;
}

/**
 * Memuat dan menampilkan satu halaman daftar event dari Firestore.
 */
async function loadEventsPage(addL, direction = 'first') {
    const tableBody = document.getElementById('events-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Memuat event...</td></tr>';

    if (!currentQuery) {
        currentQuery = api.query(api.collection(api.db, "events"), api.orderBy("eventDate", "desc"));
    }

    let pageQuery = currentQuery;

    if (direction === 'next' && lastVisibleDoc) {
        pageMarkers.push(firstVisibleDoc);
        pageQuery = api.query(pageQuery, api.startAfter(lastVisibleDoc), api.limit(ITEMS_PER_PAGE));
    } else if (direction === 'prev' && pageMarkers.length > 0) {
        const prevPageMarker = pageMarkers.pop();
        pageQuery = api.query(pageQuery, api.startAt(prevPageMarker), api.limit(ITEMS_PER_PAGE));
    } else {
        pageQuery = api.query(pageQuery, api.limit(ITEMS_PER_PAGE));
    }

    try {
        const snapshot = await api.getDocs(pageQuery);
        tableBody.innerHTML = '';

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">Belum ada event yang dibuat.</td></tr>';
            renderPagination(false, addL);
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach(doc => {
            tableBody.appendChild(createEventTableRow(doc.id, doc.data(), addL));
        });

        const nextPageQuery = api.query(currentQuery, api.startAfter(lastVisibleDoc), api.limit(1));
        const nextPageSnapshot = await api.getDocs(nextPageQuery);
        const hasNextPage = !nextPageSnapshot.empty;

        renderPagination(hasNextPage, addL);

    } catch (error) {
        console.error("Gagal memuat event:", error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-red-500">Gagal memuat data.</td></tr>';
    }
}

/** Merender kontrol pagination */
function renderPagination(hasNextPage, addL) {
    createPaginationControls({
        containerId: 'pagination-container',
        currentPage: currentPage,
        hasNextPage: hasNextPage,
        onNext: () => {
            currentPage++;
            loadEventsPage(addL, 'next');
        },
        onPrev: () => {
            currentPage--;
            loadEventsPage(addL, 'prev');
        }
    });
}


/**
 * Membuat satu baris <tr> untuk tabel event.
 */
function createEventTableRow(id, data, addL) {
    const tr = document.createElement('tr');
    tr.className = 'border-b dark:border-gray-700';

    const eventDate = data.eventDate ? new Date(data.eventDate.seconds * 1000) : null;
    const formattedDate = eventDate ? eventDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
    
    const now = new Date();
    let statusBadge;
    if (!eventDate) {
        statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800">Tidak valid</span>`;
    } else if (eventDate < now) {
        statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200">Selesai</span>`;
    } else {
        statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Akan Datang</span>`;
    }

    tr.innerHTML = `
        <td class="p-3 font-medium">${data.title}</td>
        <td class="p-3">
            <div class="flex items-center">
                <span class="font-mono text-gray-500 text-xs">${id}</span>
                <button class="copy-id-btn text-gray-400 hover:text-primary-500 ml-2" data-id="${id}" title="Salin ID">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </td>
        <td class="p-3">${data.type}</td>
        <td class="p-3">${formattedDate}</td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 space-x-2">
            <button class="edit-event-btn text-blue-500 hover:text-blue-700" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="delete-event-btn text-red-500 hover:text-red-700" title="Hapus"><i class="fas fa-trash"></i></button>
        </td>
    `;

    tr.querySelector('.copy-id-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.currentTarget.dataset.id)
            .then(() => showMessage("ID Event berhasil disalin!"));
    });

    tr.querySelector('.edit-event-btn').addEventListener('click', () => openEditModal(id, data));
    tr.querySelector('.delete-event-btn').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus event "${data.title}"?`)) {
            api.deleteDoc(api.doc(api.db, 'events', id)).then(() => {
                showMessage("Event berhasil dihapus.");
                loadEventsPage(addL);
            });
        }
    });

    return tr;
}

/**
 * Mengatur logika form untuk membuat event baru.
 */
function setupCreateForm(addL) {
    const form = document.getElementById('create-event-form');
    if (!form) return;

    const handler = async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        if (!data.title || !data.type || !data.eventDate || !data.description) {
            return showMessage("Semua field wajib diisi.", 3000, true);
        }

        setButtonLoading(submitBtn, true);
        try {
            const dataToSave = {
                title: data.title,
                type: data.type,
                location: data.location || '',
                link: data.link || '',
                price: Number(data.price) || 0,
                description: data.description,
                eventDate: new Date(data.eventDate),
                createdAt: api.serverTimestamp(),
                attendees: []
            };

            if (data.image && data.image.size > 0) {
                const processedImage = await compressImage(data.image);
                const storageRef = api.ref(api.storage, `events/${Date.now()}_${processedImage.name}`);
                const snapshot = await api.uploadBytes(storageRef, processedImage);
                dataToSave.imageUrl = await api.getDownloadURL(snapshot.ref);
            }

            await api.addDoc(api.collection(api.db, "events"), dataToSave);
            showMessage("Event baru berhasil dibuat!");
            form.reset();
            resetPaginationState();
            loadEventsPage(addL);
        } catch (error) {
            console.error("Gagal membuat event:", error);
            // --- PERBAIKAN DI SINI ---
            showMessage(error.message || "Gagal membuat event.", 4000, true);
        } finally {
            setButtonLoading(submitBtn, false, 'Publikasikan Event');
        }
    };
    form.addEventListener('submit', handler);
    addL(() => form.removeEventListener('submit', handler));
}

/**
 * Membuka dan mengisi modal edit dengan data event yang ada.
 */
function openEditModal(id, data) {
    currentEditId = id;
    const modal = document.getElementById('edit-event-modal');
    if (!modal) return;

    modal.querySelector('[name="title"]').value = data.title;
    modal.querySelector('[name="type"]').value = data.type;
    modal.querySelector('[name="location"]').value = data.location || '';
    modal.querySelector('[name="link"]').value = data.link || '';
    modal.querySelector('[name="price"]').value = data.price || 0;
    modal.querySelector('[name="description"]').value = data.description;
    
    if (data.eventDate) {
        const date = new Date(data.eventDate.seconds * 1000);
        const formattedDate = date.toISOString().slice(0, 16);
        modal.querySelector('[name="eventDate"]').value = formattedDate;
    }

    openModal('edit-event-modal');
}

/**
 * Mengatur logika modal untuk mengedit event.
 */
function setupEditModal(addL) {
    const modal = document.getElementById('edit-event-modal');
    if (!modal) return;
    
    modal.querySelector('.cancel-modal-btn')?.addEventListener('click', () => closeModal('edit-event-modal'));
    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal('edit-event-modal'));

    const saveBtn = modal.querySelector('.save-modal-btn');
    const handler = async () => {
        const form = modal.querySelector('form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        if (!currentEditId) return;
        setButtonLoading(saveBtn, true);
        try {
            const updateData = {
                title: data.title,
                type: data.type,
                location: data.location || '',
                link: data.link || '',
                price: Number(data.price) || 0,
                description: data.description,
                eventDate: new Date(data.eventDate)
            };

            await api.updateDoc(api.doc(api.db, "events", currentEditId), updateData);
            showMessage("Event berhasil diperbarui.");
            closeModal('edit-event-modal');
            loadEventsPage(addL);
        } catch (error) {
            console.error("Gagal update event:", error);
            // --- PERBAIKAN DI SINI ---
            showMessage(error.message || "Gagal menyimpan perubahan.", 4000, true);
        } finally {
            setButtonLoading(saveBtn, false, 'Simpan');
            currentEditId = null;
        }
    };
    saveBtn.addEventListener('click', handler);
}
