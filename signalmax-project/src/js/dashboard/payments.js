// File: src/js/dashboard/payments.js
// Deskripsi: Logika untuk halaman Konfirmasi Pembayaran Manual di Dashboard Admin.
// Versi: 1.0 (Fitur Baru)

import * as api from '../api.js';
import { showMessage, openModal, closeModal, setButtonLoading } from '../ui.js';

let currentRequest = null; // Menyimpan data request yang sedang diproses
let paymentsUnsubscribe = null;

/**
 * Fungsi inisialisasi untuk halaman Pembayaran Manual.
 */
export function initPage(params, addL) {
    if (paymentsUnsubscribe) paymentsUnsubscribe();

    setupModalListeners(addL);
    loadPaymentRequests(addL);
}

/**
 * Memuat daftar permintaan pembayaran yang statusnya 'pending'.
 */
function loadPaymentRequests(addL) {
    const tableBody = document.getElementById('payments-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Memuat permintaan...</td></tr>';

    // ASUMSI: Ada koleksi 'paymentRequests' di Firestore
    const q = api.query(
        api.collection(api.db, "paymentRequests"),
        api.where("status", "==", "pending"),
        api.orderBy("requestDate", "asc")
    );

    paymentsUnsubscribe = api.onSnapshot(q, (snapshot) => {
        tableBody.innerHTML = '';
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-gray-500">Tidak ada permintaan pembayaran manual yang pending.</td></tr>';
        } else {
            snapshot.forEach(doc => {
                tableBody.appendChild(createRequestTableRow(doc.id, doc.data()));
            });
        }
    }, (error) => {
        console.error("Gagal memuat permintaan pembayaran:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-red-500">Gagal memuat data.</td></tr>';
    });
    addL(paymentsUnsubscribe);
}

/**
 * Membuat satu baris <tr> untuk tabel permintaan.
 */
function createRequestTableRow(id, data) {
    const tr = document.createElement('tr');
    tr.className = 'border-b dark:border-gray-700';

    const requestDate = data.requestDate?.seconds 
        ? new Date(data.requestDate.seconds * 1000).toLocaleString('id-ID')
        : 'N/A';
    
    tr.innerHTML = `
        <td class="p-3 font-mono">${data.userId}</td>
        <td class="p-3">${data.userEmail}</td>
        <td class="p-3">${requestDate}</td>
        <td class="p-3">
            <button class="action-payment-btn text-blue-500 hover:text-blue-700 font-semibold" title="Lihat Aksi">
                Proses
            </button>
        </td>
    `;
    
    tr.querySelector('.action-payment-btn').addEventListener('click', () => {
        currentRequest = { id, ...data };
        const userInfoEl = document.getElementById('payment-user-info');
        if (userInfoEl) {
            userInfoEl.textContent = data.userEmail;
        }
        openModal('payment-action-modal');
    });

    return tr;
}

/**
 * Menyiapkan listener untuk modal aksi pembayaran.
 */
function setupModalListeners(addL) {
    const modal = document.getElementById('payment-action-modal');
    if (!modal) return;
    
    const confirmBtn = document.getElementById('confirm-payment-btn');
    const deleteBtn = document.getElementById('delete-payment-btn');
    
    const confirmHandler = () => handleConfirmPayment();
    const deleteHandler = () => handleDeleteRequest();

    confirmBtn?.addEventListener('click', confirmHandler);
    deleteBtn?.addEventListener('click', deleteHandler);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal('payment-action-modal'));
    modal.querySelector('.cancel-modal-btn')?.addEventListener('click', () => closeModal('payment-action-modal'));

    addL(() => confirmBtn?.removeEventListener('click', confirmHandler));
    addL(() => deleteBtn?.removeEventListener('click', deleteHandler));
}

/**
 * Menangani konfirmasi pembayaran: upgrade user ke premium & update status request.
 */
async function handleConfirmPayment() {
    if (!currentRequest) return;

    const confirmBtn = document.getElementById('confirm-payment-btn');
    setButtonLoading(confirmBtn, true);

    const userRef = api.doc(api.db, "users", currentRequest.userId);
    const paymentRequestRef = api.doc(api.db, "paymentRequests", currentRequest.id);

    try {
        const batch = api.writeBatch(api.db);
        
        // 1. Update status user menjadi premium
        batch.update(userRef, { isPremium: true });

        // 2. Update status request menjadi 'completed'
        batch.update(paymentRequestRef, { status: 'completed', processedAt: api.serverTimestamp() });

        await batch.commit();

        showMessage(`User ${currentRequest.userEmail} berhasil diupgrade ke Premium.`);
        closeModal('payment-action-modal');
    } catch (error) {
        console.error("Gagal konfirmasi pembayaran:", error);
        showMessage("Terjadi kesalahan saat konfirmasi. Periksa apakah ID User valid.", 4000, true);
    } finally {
        setButtonLoading(confirmBtn, false, 'Konfirmasi');
        currentRequest = null;
    }
}

/**
 * Menangani penghapusan permintaan pembayaran (jika tidak valid atau ditolak).
 */
async function handleDeleteRequest() {
    if (!currentRequest) return;

    if (!confirm(`Yakin ingin menghapus permintaan dari ${currentRequest.userEmail}?`)) return;

    const deleteBtn = document.getElementById('delete-payment-btn');
    setButtonLoading(deleteBtn, true);

    try {
        await api.deleteDoc(api.doc(api.db, "paymentRequests", currentRequest.id));
        showMessage("Permintaan pembayaran berhasil dihapus.");
        closeModal('payment-action-modal');
    } catch (error) {
        console.error("Gagal menghapus permintaan:", error);
        showMessage("Gagal menghapus permintaan.", 3000, true);
    } finally {
        setButtonLoading(deleteBtn, false, 'Hapus');
        currentRequest = null;
    }
}