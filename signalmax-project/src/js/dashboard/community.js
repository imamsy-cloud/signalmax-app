// File: src/js/dashboard/community.js
// Deskripsi: Logika untuk halaman Manajemen Komunitas di Dashboard Admin.
// Versi Perbaikan: 3.1 (Fix Pagination Logic)
// Perubahan:
// - Memperbaiki query untuk paginasi "Sebelumnya" (prev) dengan menghapus klausa orderBy yang duplikat.

import * as api from '../api.js';
import { showMessage, createPaginationControls } from '../ui.js';

// --- State untuk Pagination Postingan ---
const ITEMS_PER_PAGE = 10;
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let currentPage = 1;
let pageMarkers = [];
let currentQuery = null;

/**
 * Fungsi inisialisasi untuk halaman Manajemen Komunitas.
 */
export function initPage(params, addL) {
    setupTabListeners(addL);
    resetPaginationState();
    loadPostsPage(addL); 
}

/** Mereset semua state pagination ke nilai awal */
function resetPaginationState() {
    lastVisibleDoc = null;
    firstVisibleDoc = null;
    currentPage = 1;
    pageMarkers = [];
    currentQuery = null;
}

function setupTabListeners(addL) {
    const tabs = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    const handler = (e) => {
        e.preventDefault();
        const clickedTab = e.currentTarget;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(content => {
            content.classList.remove('active');
            content.classList.add('hidden');
        });

        clickedTab.classList.add('active');
        const targetId = clickedTab.dataset.target;
        const targetContent = document.getElementById(targetId);
        if(targetContent) {
            targetContent.classList.remove('hidden');
            targetContent.classList.add('active');
        }

        if (targetId === 'tab-posts') {
            resetPaginationState();
            loadPostsPage(addL);
        } else if (targetId === 'tab-stories') {
            loadStories(addL);
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', handler);
        addL(() => tab.removeEventListener('click', handler));
    });
}

// === BAGIAN POSTINGAN (DENGAN PAGINATION) ===

/**
 * Memuat satu halaman data postingan dari Firestore.
 */
async function loadPostsPage(addL, direction = 'first') {
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500 p-4">Memuat postingan...</p>';

    if (!currentQuery) {
        currentQuery = api.query(api.collection(api.db, "posts"), api.orderBy("createdAt", "desc"));
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
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-gray-500 p-4">Belum ada postingan.</p>';
            renderPagination(false, addL);
            return;
        }

        firstVisibleDoc = snapshot.docs[0];
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach(doc => {
            container.appendChild(createPostElement(doc.id, doc.data(), addL));
        });

        const nextPageQuery = api.query(currentQuery, api.startAfter(lastVisibleDoc), api.limit(1));
        const nextPageSnapshot = await api.getDocs(nextPageQuery);
        const hasNextPage = !nextPageSnapshot.empty;

        renderPagination(hasNextPage, addL);

    } catch (error) {
        console.error("Gagal memuat postingan:", error);
        container.innerHTML = '<p class="text-center text-red-500 p-4">Gagal memuat data.</p>';
    }
}

/** Merender kontrol pagination untuk postingan */
function renderPagination(hasNextPage, addL) {
    createPaginationControls({
        containerId: 'pagination-container',
        currentPage: currentPage,
        hasNextPage: hasNextPage,
        onNext: () => {
            currentPage++;
            loadPostsPage(addL, 'next');
        },
        onPrev: () => {
            currentPage--;
            loadPostsPage(addL, 'prev');
        }
    });
}


function createPostElement(id, data, addL) {
    const div = document.createElement('div');
    div.className = 'p-4 border rounded-lg dark:border-gray-700';
    const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString('id-ID') : 'N/A';
    
    let contentHtml = `<p class="text-gray-800 dark:text-gray-200 mt-2">${data.content}</p>`;
    if (data.type === 'image' && data.imageUrl) {
        contentHtml += `<img src="${data.imageUrl}" class="mt-2 rounded-lg w-full max-w-xs object-cover border dark:border-gray-600">`;
    }

    div.innerHTML = `
        <div class="flex items-start justify-between mb-2">
            <div class="flex items-center space-x-3">
                <img src="${data.authorAvatar}" class="w-10 h-10 rounded-full" alt="User Avatar">
                <div>
                    <p class="font-semibold">${data.authorName}</p>
                    <p class="text-xs text-gray-500">${time}</p>
                </div>
            </div>
            <div class="flex items-center space-x-3">
                <div class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-1">
                    <span class="font-mono text-gray-500 text-xs">${id}</span>
                    <button class="copy-id-btn text-gray-400 hover:text-primary-500 ml-2" data-id="${id}" title="Salin ID">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <button class="delete-post-btn text-red-500 hover:text-red-700" title="Hapus Postingan"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
        ${contentHtml}
    `;

    div.querySelector('.copy-id-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.currentTarget.dataset.id)
            .then(() => showMessage("ID Postingan berhasil disalin!"));
    });

    div.querySelector('.delete-post-btn').addEventListener('click', async () => {
        if (confirm(`Yakin ingin menghapus postingan dari ${data.authorName}?`)) {
            try {
                const postRef = api.doc(api.db, 'posts', id);
                if (data.imageUrl) {
                    const imageRef = api.ref(api.storage, data.imageUrl);
                    await api.deleteObject(imageRef);
                }
                await api.deleteDoc(postRef);
                showMessage("Postingan berhasil dihapus.");
                loadPostsPage(addL);
            } catch (error) {
                if (error.code === 'storage/object-not-found') {
                    console.warn("File gambar tidak ditemukan di storage, tapi postingan akan tetap dihapus.");
                    await api.deleteDoc(api.doc(api.db, 'posts', id));
                    showMessage("Postingan berhasil dihapus (gambar tidak ditemukan).");
                    loadPostsPage(addL);
                } else {
                    console.error("Gagal menghapus postingan:", error);
                    showMessage("Gagal menghapus.", 3000, true);
                }
            }
        }
    });

    return div;
}

// === BAGIAN STORIES (Tidak perlu pagination) ===

function loadStories(addL) {
    const container = document.getElementById('stories-container');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500 p-4">Memuat stories...</p>';

    const q = api.query(api.collection(api.db, "stories"), api.where("expiresAt", ">", new Date()), api.orderBy("expiresAt", "desc"));
    const unsubscribe = api.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-gray-500 p-4 col-span-full">Tidak ada stories yang aktif.</p>';
        } else {
            snapshot.forEach(doc => {
                container.appendChild(createStoryElement(doc.id, doc.data()));
            });
        }
    });
    addL(unsubscribe);
}

function createStoryElement(id, data) {
    const div = document.createElement('div');
    div.className = 'relative group aspect-w-9 aspect-h-16 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden';
    div.innerHTML = `
        <img src="${data.imageUrl}" class="w-full h-full object-cover" alt="Story Image">
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
        <div class="absolute bottom-0 left-0 p-2">
            <div class="flex items-center space-x-2">
                <img src="${data.userAvatar}" class="w-6 h-6 rounded-full border-2 border-white" alt="Avatar">
                <p class="text-white text-xs font-semibold">${data.userName}</p>
            </div>
        </div>
        <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-opacity">
            <button class="delete-story-btn text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 rounded-full w-12 h-12 flex items-center justify-center">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;

    div.querySelector('.delete-story-btn').addEventListener('click', async () => {
        if (confirm(`Yakin ingin menghapus story dari ${data.userName}?`)) {
            try {
                const storyRef = api.doc(api.db, 'stories', id);
                const imageRef = api.ref(api.storage, data.imageUrl);
                await api.deleteObject(imageRef);
                await api.deleteDoc(storyRef);
                showMessage("Story berhasil dihapus.");
            } catch (error) {
                 if (error.code === 'storage/object-not-found') {
                    console.warn("File gambar tidak ditemukan di storage, tapi story akan tetap dihapus.");
                    await api.deleteDoc(api.doc(api.db, 'stories', id));
                    showMessage("Story berhasil dihapus (gambar tidak ditemukan).");
                } else {
                    console.error("Gagal menghapus story:", error);
                    showMessage("Gagal menghapus.", 3000, true);
                }
            }
        }
    });

    return div;
}
