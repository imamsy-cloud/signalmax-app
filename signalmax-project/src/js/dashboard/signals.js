// File: src/js/dashboard/signals.js
// Deskripsi: Logika untuk halaman Manajemen Sinyal di Dashboard Admin.
// Versi Perbaikan: 3.3 (Fix Pagination "Previous" Button)
// Perubahan:
// - Mengganti pemanggilan fungsi endBefore() yang tidak ada dengan startAt() yang sudah benar.
//   Ini menyelesaikan error "api.endBefore is not a function".

import * as api from '../api.js';
import { showMessage, openModal, closeModal, setButtonLoading, createPaginationControls } from '../ui.js';

const ITEMS_PER_PAGE = 10;
let currentEditSignalId = null;
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let currentPage = 1;
let pageMarkers = [];
let currentQuery = null;

/**
 * Fungsi inisialisasi untuk halaman Manajemen Sinyal.
 */
export function initPage(params, addL) {
    resetPaginationState();
    const sendWithNotifBtn = document.getElementById('send-with-notification-btn');
    const sendWithoutNotifBtn = document.getElementById('send-without-notification-btn');
    const createHandler = (e) => handleFormSubmit(e.currentTarget.id === 'send-with-notification-btn', addL);
    sendWithNotifBtn?.addEventListener('click', createHandler);
    sendWithoutNotifBtn?.addEventListener('click', createHandler);
    loadSignalsPage(addL);
    setupEditModal(addL);
}

function resetPaginationState() {
    lastVisibleDoc = null;
    firstVisibleDoc = null;
    currentPage = 1;
    pageMarkers = [];
    currentQuery = null;
}

/**
 * Memuat satu halaman data sinyal dari Firestore.
 */
async function loadSignalsPage(addL, direction = 'first') {
    const tableBody = document.getElementById('signals-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = createTableSkeleton(ITEMS_PER_PAGE);

    if (!currentQuery) {
        currentQuery = api.query(
            api.collection(api.db, "signals"), 
            api.orderBy("createdAt", "desc")
        );
    }

    let pageQuery = currentQuery;

    if (direction === 'next' && lastVisibleDoc) {
        pageMarkers.push(firstVisibleDoc); // Simpan penanda halaman saat ini sebelum maju
        pageQuery = api.query(pageQuery, api.startAfter(lastVisibleDoc), api.limit(ITEMS_PER_PAGE));
    } else if (direction === 'prev' && pageMarkers.length > 0) {
        const prevPageMarker = pageMarkers.pop();
        // --- PERBAIKAN UTAMA DI SINI ---
        // Menggunakan startAt() yang sudah ada di api.js, bukan endBefore()
        pageQuery = api.query(pageQuery, api.startAt(prevPageMarker), api.limit(ITEMS_PER_PAGE));
    } else {
        pageQuery = api.query(pageQuery, api.limit(ITEMS_PER_PAGE));
    }

    try {
        const snapshot = await api.getDocs(pageQuery);
        tableBody.innerHTML = '';

        if (snapshot.empty && direction !== 'first') {
            // Jika halaman kosong saat navigasi, kemungkinan ada masalah, kembali ke awal
            resetPaginationState();
            loadSignalsPage(addL);
            return;
        }
        
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">Tidak ada sinyal yang ditemukan.</td></tr>';
            renderPagination(false, addL);
            return;
        }
        
        const docs = snapshot.docs;
        firstVisibleDoc = docs[0];
        lastVisibleDoc = docs[docs.length - 1];

        docs.forEach(doc => {
            tableBody.appendChild(createSignalTableRow(doc.id, doc.data(), addL));
        });

        const nextPageQuery = api.query(currentQuery, api.startAfter(lastVisibleDoc), api.limit(1));
        const nextPageSnapshot = await api.getDocs(nextPageQuery);
        const hasNextPage = !nextPageSnapshot.empty;

        renderPagination(hasNextPage, addL);

    } catch (error) {
        console.error("Gagal memuat sinyal:", error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-red-500">Gagal memuat data. Periksa console untuk detail.</td></tr>';
    }
}

function renderPagination(hasNextPage, addL) {
    createPaginationControls({
        containerId: 'pagination-container',
        currentPage: currentPage,
        hasNextPage: hasNextPage,
        onNext: () => {
            currentPage++;
            loadSignalsPage(addL, 'next');
        },
        onPrev: () => {
            currentPage--;
            loadSignalsPage(addL, 'prev');
        }
    });
}

function createSignalTableRow(id, data, addL) {
    const tr = document.createElement('tr');
    tr.className = 'border-b dark:border-gray-700';

    const actionClass = data.action === 'BUY' ? 'text-green-500' : 'text-red-500';
    let statusBadge;
    switch (data.status) {
        case 'Berjalan':
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Berjalan</span>`;
            break;
        case 'Selesai':
            const resultClass = data.result === 'Profit' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full ${resultClass}">${data.result}</span>`;
            break;
        default:
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200">${data.status || 'N/A'}</span>`;
    }

    tr.innerHTML = `
        <td class="p-3 font-medium">${data.pair}</td>
        <td class="p-3"><span class="font-semibold ${actionClass}">${data.action}</span></td>
        <td class="p-3">${data.entryPrice}</td>
        <td class="p-3">
            <div class="flex items-center">
                <span class="font-mono text-gray-500 text-xs">${id}</span>
                <button class="copy-id-btn text-gray-400 hover:text-primary-500 ml-2" data-id="${id}" title="Salin ID">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 space-x-2">
            <button class="edit-signal-btn text-blue-500 hover:text-blue-700" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="delete-signal-btn text-red-500 hover:text-red-700" title="Hapus"><i class="fas fa-trash"></i></button>
        </td>
    `;

    tr.querySelector('.copy-id-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.currentTarget.dataset.id)
            .then(() => showMessage("ID Sinyal berhasil disalin!"));
    });

    tr.querySelector('.edit-signal-btn').addEventListener('click', () => openEditModal(id, data));
    tr.querySelector('.delete-signal-btn').addEventListener('click', () => handleDeleteSignal(id, data.pair, addL));

    return tr;
}

async function handleFormSubmit(withNotification, addL) {
    const form = document.getElementById('signal-form');
    const pair = document.getElementById('signal-pair').value;
    const action = document.getElementById('signal-action').value;
    const entryPrice = parseFloat(document.getElementById('signal-entry').value);
    const stopLoss = parseFloat(document.getElementById('signal-sl').value);
    const isPremium = document.getElementById('signal-is-premium').checked;
    const takeProfitLevels = Array.from(document.querySelectorAll('#take-profit-container input[name="signal_tp"]'))
        .map(input => parseFloat(input.value))
        .filter(val => !isNaN(val));

    if (!pair || !entryPrice || !stopLoss || takeProfitLevels.length === 0) {
        return showMessage("Harap isi semua field wajib (Pair, Entri, SL, TP1).", 3000, true);
    }

    const signalData = {
        pair, action, entryPrice, stopLoss, isPremium, takeProfitLevels,
        status: 'Berjalan',
        createdAt: api.serverTimestamp()
    };
    
    const button = withNotification ? document.getElementById('send-with-notification-btn') : document.getElementById('send-without-notification-btn');
    setButtonLoading(button, true);

    try {
        const newSignalRef = await api.addDoc(api.collection(api.db, "signals"), signalData);
        
        if (withNotification) {
            await api.sendSignalNotification(signalData, newSignalRef.id);
            showMessage(`Sinyal untuk ${pair} berhasil dibuat & notifikasi terkirim!`);
        } else {
            showMessage(`Sinyal untuk ${pair} berhasil dibuat!`);
        }

        form.reset();
        resetPaginationState();
        loadSignalsPage(addL);

    } catch (error) {
        console.error("Error creating signal:", error);
        showMessage("Gagal membuat sinyal.", 3000, true);
    } finally {
        setButtonLoading(button, false, withNotification ? 'Kirim & Notifikasi' : 'Simpan Saja');
    }
}

function openEditModal(id, data) {
    currentEditSignalId = id;
    const form = document.getElementById('edit-signal-form');
    form.reset();
    
    document.getElementById('modal-signal-pair').value = data.pair;
    document.getElementById('modal-signal-entry').value = data.entryPrice;
    document.getElementById('modal-signal-sl').value = data.stopLoss;

    const tpInputs = document.querySelectorAll('#modal-tp-container input');
    tpInputs.forEach((input, index) => {
        input.value = data.takeProfitLevels[index] || '';
    });
    
    const closePositionContainer = document.getElementById('close-position-form-container');
    if (data.status === 'Berjalan') {
        closePositionContainer.classList.remove('hidden');
    } else {
        closePositionContainer.classList.add('hidden');
    }

    openModal('edit-signal-modal');
}

function setupEditModal(addL) {
    const modal = document.getElementById('edit-signal-modal');
    if (!modal) return;
    modal.querySelector('#close-edit-modal-btn')?.addEventListener('click', () => closeModal('edit-signal-modal'));
    modal.querySelector('#cancel-edit-btn')?.addEventListener('click', () => closeModal('edit-signal-modal'));
    
    modal.querySelector('#update-signal-btn')?.addEventListener('click', () => handleModalUpdate(addL));
    
    modal.querySelector('#confirm-close-position-btn')?.addEventListener('click', () => handleClosePosition(addL));
}

async function handleModalUpdate(addL) {
    if (!currentEditSignalId) return;

    const pair = document.getElementById('modal-signal-pair').value;
    const entryPrice = parseFloat(document.getElementById('modal-signal-entry').value);
    const stopLoss = parseFloat(document.getElementById('modal-signal-sl').value);
    const takeProfitLevels = Array.from(document.querySelectorAll('#modal-tp-container input[name="modal_signal_tp"]'))
        .map(input => parseFloat(input.value))
        .filter(val => !isNaN(val));

    if (!pair || !entryPrice || !stopLoss || takeProfitLevels.length === 0) {
        return showMessage("Field yang diedit tidak boleh kosong.", 3000, true);
    }

    const updateData = { pair, entryPrice, stopLoss, takeProfitLevels };
    const button = document.getElementById('update-signal-btn');
    setButtonLoading(button, true);

    try {
        await api.updateDoc(api.doc(api.db, "signals", currentEditSignalId), updateData);
        showMessage(`Sinyal untuk ${pair} berhasil diupdate.`);
        closeModal('edit-signal-modal');
        loadSignalsPage(addL);
    } catch (error) {
        console.error("Error updating signal:", error);
        showMessage("Gagal mengupdate sinyal.", 3000, true);
    } finally {
        setButtonLoading(button, false, 'Simpan Perubahan');
    }
}

async function handleClosePosition(addL) {
    if (!currentEditSignalId) return;

    const result = document.querySelector('input[name="signal_result"]:checked');
    const closePrice = parseFloat(document.getElementById('signal-close-price').value);

    if (!result) {
        return showMessage("Harap pilih hasil sinyal (Profit/Loss).", 3000, true);
    }
    if (isNaN(closePrice)) {
        return showMessage("Harap isi harga penutupan (close price).", 3000, true);
    }

    const button = document.getElementById('confirm-close-position-btn');
    setButtonLoading(button, true);

    const updateData = {
        status: 'Selesai',
        result: result.value,
        closePrice: closePrice,
        closedAt: api.serverTimestamp()
    };

    try {
        await api.updateDoc(api.doc(api.db, "signals", currentEditSignalId), updateData);
        showMessage("Sinyal berhasil ditutup dan diselesaikan.");
        closeModal('edit-signal-modal');
        loadSignalsPage(addL);
    } catch (error) {
        console.error("Error closing signal:", error);
        showMessage("Gagal menutup sinyal.", 3000, true);
    } finally {
        setButtonLoading(button, false, 'Tutup Posisi & Selesaikan Sinyal');
    }
}

async function handleDeleteSignal(id, pair, addL) {
    if (confirm(`Apakah Anda yakin ingin menghapus sinyal untuk ${pair}?`)) {
        try {
            await api.deleteDoc(api.doc(api.db, "signals", id));
            showMessage(`Sinyal ${pair} berhasil dihapus.`);
            loadSignalsPage(addL);
        } catch (error) {
            console.error("Error deleting signal:", error);
            showMessage("Gagal menghapus sinyal.", 3000, true);
        }
    }
}

function createTableSkeleton(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <tr class="border-b dark:border-gray-700 animate-pulse">
                <td class="p-3"><div class="skeleton h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                <td class="p-3"><div class="skeleton h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                <td class="p-3"><div class="skeleton h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                <td class="p-3"><div class="skeleton h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                <td class="p-3"><div class="skeleton h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded-full"></div></td>
                <td class="p-3"><div class="flex space-x-2"><div class="skeleton h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded-full"></div><div class="skeleton h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded-full"></div></div></td>
            </tr>
        `;
    }
    return html;
}
