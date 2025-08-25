// File: src/js/dashboard/users.js
// Deskripsi: Logika untuk halaman Manajemen Pengguna di Dashboard Admin.
// Versi Perbaikan: 3.2 (Fix Pagination Logic)
// Perubahan:
// - Memperbaiki query untuk paginasi "Sebelumnya" (prev) dengan menghapus klausa orderBy yang duplikat.

import * as api from '../api.js';
import { showMessage, openModal, closeModal, setButtonLoading, createPaginationControls } from '../ui.js';

// --- State untuk Pagination ---
const ITEMS_PER_PAGE = 15;
let currentEditUserId = null;
let lastVisibleDoc = null; 
let firstVisibleDoc = null;
let currentPage = 1;
let pageMarkers = []; 
let currentQuery = null;

/**
 * Fungsi inisialisasi untuk halaman Manajemen Pengguna.
 */
export function initPage(params, addL) {
    resetPaginationState();
    
    setupEventListeners(addL);
    setupEditModal(addL);
    loadUsersPage(addL);
}

/** Mereset semua state pagination ke nilai awal */
function resetPaginationState() {
    lastVisibleDoc = null;
    firstVisibleDoc = null;
    currentPage = 1;
    pageMarkers = [];
    currentQuery = null;
}

/** Menyiapkan event listener untuk elemen di halaman utama (seperti search bar) */
function setupEventListeners(addL) {
    const searchInput = document.getElementById('user-search-input');
    let searchTimeout;
    const searchHandler = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            resetPaginationState();
            loadUsersPage(addL, e.target.value.trim());
        }, 500);
    };
    searchInput?.addEventListener('input', searchHandler);
    addL(() => searchInput?.removeEventListener('input', searchHandler));
}

/**
 * Memuat satu halaman data pengguna dari Firestore.
 */
async function loadUsersPage(addL, searchTerm = '', direction = 'first') {
    const usersTableBody = document.getElementById('users-table-body');
    if (!usersTableBody) return;
    usersTableBody.innerHTML = createUsersTableSkeleton(ITEMS_PER_PAGE);

    // Buat query dasar jika belum ada atau jika ada pencarian baru
    if (!currentQuery || searchTerm) {
        const usersCollection = api.collection(api.db, "users");
        if (searchTerm) {
            const searchTermLower = searchTerm.toLowerCase();
            currentQuery = api.query(usersCollection, 
                api.where("name_lowercase", ">=", searchTermLower),
                api.where("name_lowercase", "<=", searchTermLower + '\uf8ff')
            );
        } else {
            currentQuery = api.query(usersCollection, api.orderBy("joinDate", "desc"));
        }
    }

    let pageQuery = currentQuery;

    if (direction === 'next' && lastVisibleDoc) {
        pageMarkers.push(firstVisibleDoc); // Simpan penanda halaman saat ini
        pageQuery = api.query(pageQuery, api.startAfter(lastVisibleDoc), api.limit(ITEMS_PER_PAGE));
    } else if (direction === 'prev' && pageMarkers.length > 0) {
        const prevPageMarker = pageMarkers.pop(); 
        // --- PERBAIKAN UTAMA DI SINI ---
        // Menghapus orderBy() yang berlebihan. Query dasar (currentQuery) sudah memilikinya.
        pageQuery = api.query(pageQuery, api.startAt(prevPageMarker), api.limit(ITEMS_PER_PAGE));
    } else {
        pageQuery = api.query(pageQuery, api.limit(ITEMS_PER_PAGE));
    }

    try {
        const snapshot = await api.getDocs(pageQuery);
        usersTableBody.innerHTML = '';

        if (snapshot.empty) {
            usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-gray-500">Tidak ada pengguna yang ditemukan.</td></tr>';
            renderPagination(false, addL);
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach(doc => {
            usersTableBody.appendChild(createUserTableRow(doc.id, doc.data()));
        });

        const nextPageQuery = api.query(currentQuery, api.startAfter(lastVisibleDoc), api.limit(1));
        const nextPageSnapshot = await api.getDocs(nextPageQuery);
        const hasNextPage = !nextPageSnapshot.empty;

        renderPagination(hasNextPage, addL);

    } catch (error) {
        console.error("Gagal memuat pengguna:", error);
        usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-red-500">Gagal memuat data.</td></tr>';
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
            loadUsersPage(addL, document.getElementById('user-search-input').value.trim(), 'next');
        },
        onPrev: () => {
            currentPage--;
            loadUsersPage(addL, document.getElementById('user-search-input').value.trim(), 'prev');
        }
    });
}

/**
 * Membuat satu baris tabel (tr) untuk data pengguna.
 */
function createUserTableRow(id, userData) {
    const tr = document.createElement('tr');
    tr.className = `border-b dark:border-gray-700 ${userData.isBanned ? 'bg-red-50 dark:bg-red-900/20 opacity-60' : ''}`;

    const joinDate = userData.joinDate ? new Date(userData.joinDate.seconds * 1000).toLocaleDateString('id-ID') : 'N/A';
    
    let statusBadges = '';
    if (userData.isBanned) statusBadges += `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">Diblokir</span> `;
    if (userData.isAdmin) statusBadges += `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">Admin</span> `;
    if (userData.isExpert) statusBadges += `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Expert</span> `;
    if (userData.isPremium) statusBadges += `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Premium</span> `;
    if (statusBadges === '') statusBadges = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200">Free</span>`;

    tr.innerHTML = `
        <td class="p-3 font-medium flex items-center space-x-3">
            <img src="${userData.avatarUrl}" alt="avatar" class="w-8 h-8 rounded-full object-cover">
            <span>${userData.name}</span>
        </td>
        <td class="p-3 text-gray-600 dark:text-gray-400">${userData.email}</td>
        <td class="p-3"><div class="flex flex-wrap gap-1">${statusBadges}</div></td>
        <td class="p-3 text-gray-600 dark:text-gray-400">${joinDate}</td>
        <td class="p-3">
            <button class="edit-user-btn text-blue-500 hover:text-blue-700" title="Edit Pengguna"><i class="fas fa-edit"></i></button>
        </td>
    `;

    tr.querySelector('.edit-user-btn').addEventListener('click', () => openEditModal(id, userData));
    return tr;
}

/** Membuka dan mengisi modal edit dengan data pengguna yang dipilih */
function openEditModal(id, data) {
    currentEditUserId = id;
    const modal = document.getElementById('edit-user-modal');
    if (!modal) return;

    modal.querySelector('#edit-user-name').value = data.name || '';
    modal.querySelector('#edit-user-email').value = data.email || '';
    modal.querySelector('#edit-user-isPremium').checked = data.isPremium || false;
    modal.querySelector('#edit-user-isExpert').checked = data.isExpert || false;
    modal.querySelector('#edit-user-isAdmin').checked = data.isAdmin || false;
    modal.querySelector('#edit-user-isBanned').checked = data.isBanned || false;
    
    openModal('edit-user-modal');
}

/** Menyiapkan listener untuk modal edit */
function setupEditModal(addL) {
    const modal = document.getElementById('edit-user-modal');
    if (!modal) return;
    
    const saveBtn = document.getElementById('save-user-btn');
    const saveHandler = () => handleSaveUserChanges(addL);
    saveBtn?.addEventListener('click', saveHandler);
    
    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal('edit-user-modal'));
    modal.querySelector('.cancel-modal-btn')?.addEventListener('click', () => closeModal('edit-user-modal'));
}

/** Menyimpan perubahan data pengguna dari modal ke Firestore */
async function handleSaveUserChanges(addL) {
    if (!currentEditUserId) return;
    const saveBtn = document.getElementById('save-user-btn');
    
    const newName = document.getElementById('edit-user-name').value;
    const updateData = {
        name: newName,
        name_lowercase: newName.toLowerCase(),
        isPremium: document.getElementById('edit-user-isPremium').checked,
        isExpert: document.getElementById('edit-user-isExpert').checked,
        isAdmin: document.getElementById('edit-user-isAdmin').checked,
        isBanned: document.getElementById('edit-user-isBanned').checked,
    };

    setButtonLoading(saveBtn, true);
    try {
        const userRef = api.doc(api.db, "users", currentEditUserId);
        await api.updateDoc(userRef, updateData);
        showMessage("Data pengguna berhasil diperbarui.");
        closeModal('edit-user-modal');
        loadUsersPage(addL, document.getElementById('user-search-input').value.trim(), 'stay');
    } catch (error) {
        console.error("Gagal update pengguna:", error);
        showMessage("Gagal menyimpan perubahan.", 3000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan Perubahan');
        currentEditUserId = null;
    }
}

/**
 * Membuat baris skeleton untuk tabel pengguna.
 */
function createUsersTableSkeleton(count) {
    let skeletonHtml = '';
    for (let i = 0; i < count; i++) {
        skeletonHtml += `
            <tr class="border-b dark:border-gray-700 animate-pulse">
                <td class="p-3"><div class="flex items-center space-x-3"><div class="skeleton w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700"></div><div class="skeleton h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div></div></td>
                <td class="p-3"><div class="skeleton h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                <td class="p-3"><div class="skeleton h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full"></div></td>
                <td class="p-3"><div class="skeleton h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div></td>
                <td class="p-3"><div class="skeleton h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded-full"></div></td>
            </tr>
        `;
    }
    return skeletonHtml;
}
