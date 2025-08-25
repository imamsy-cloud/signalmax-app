// File: src/js/pages/search.js
// Deskripsi: Logika spesifik untuk halaman Pencarian.
// Versi Refactor: 2.0
// Perubahan:
// - Mengganti metode pencarian dari client-side filter menjadi server-side query.
// - Peningkatan performa drastis dan efisiensi pembacaan data Firestore.
// - Menggunakan query range `(>=, <=)` untuk simulasi "starts-with" search.
// - Menambahkan limit pada hasil pencarian untuk setiap kategori.

import { loadScreen } from '../router.js';
import * as api from '../api.js';

/**
 * Fungsi inisialisasi untuk halaman Pencarian.
 * @param {object} params - Parameter dari router (jika ada).
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export function initPage(params, addL) {
    const searchInput = document.getElementById('search-input-main');
    const resultsContainer = document.getElementById('search-results-container');
    const initialMessage = document.getElementById('initial-search-message');

    document.getElementById('back-to-home-btn')?.addEventListener('click', () => loadScreen('home'));

    let searchTimeout;
    const handleInput = (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.trim();
        
        // Menunggu 500ms setelah pengguna berhenti mengetik
        searchTimeout = setTimeout(() => {
            if (searchTerm.length > 2) {
                if (initialMessage) initialMessage.classList.add('hidden');
                performSearch(searchTerm, resultsContainer);
            } else {
                if (resultsContainer) resultsContainer.innerHTML = '';
                if (initialMessage) initialMessage.classList.remove('hidden');
            }
        }, 500);
    };
    searchInput.addEventListener('input', handleInput);
    addL(() => searchInput.removeEventListener('input', handleInput));
}

/**
 * Melakukan pencarian efisien menggunakan query Firestore.
 * @param {string} term - Kata kunci pencarian.
 * @param {HTMLElement} container - Elemen untuk menampilkan hasil.
 */
async function performSearch(term, container) {
    container.innerHTML = '<div class="p-8 text-center"><i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i></div>';
    
    // Konversi ke huruf kecil untuk pencarian case-insensitive
    const searchTerm = term.toLowerCase();
    const searchLimit = 5; // Batasi hasil per kategori
    
    // \uf8ff adalah karakter Unicode yang sangat tinggi, efektif untuk query 'starts-with'
    const searchEnd = searchTerm + '\uf8ff';

    // CATATAN: Query ini mengasumsikan ada field lowercase di Firestore
    // Contoh: 'name_lowercase' di koleksi 'users', 'title_lowercase' di 'courses', dll.
    // Ini adalah praktik umum untuk pencarian case-insensitive di Firestore.
    
    const userQuery = api.query(api.collection(api.db, 'users'), 
        api.where('name_lowercase', '>=', searchTerm), 
        api.where('name_lowercase', '<=', searchEnd), 
        api.limit(searchLimit));
        
    const postQuery = api.query(api.collection(api.db, 'posts'), 
        api.where('content_lowercase', '>=', searchTerm), 
        api.where('content_lowercase', '<=', searchEnd), 
        api.limit(searchLimit));

    const courseQuery = api.query(api.collection(api.db, 'courses'), 
        api.where('title_lowercase', '>=', searchTerm), 
        api.where('title_lowercase', '<=', searchEnd), 
        api.limit(searchLimit));

    const [userSnap, postSnap, courseSnap] = await Promise.all([
        api.getDocs(userQuery),
        api.getDocs(postQuery),
        api.getDocs(courseQuery)
    ]);

    container.innerHTML = '';
    let totalResults = 0;

    if (!userSnap.empty) {
        totalResults += userSnap.size;
        const section = createSearchResultSection('Pengguna');
        userSnap.forEach(doc => section.querySelector('.results-content').appendChild(createSearchResultUser(doc.id, doc.data())));
        container.appendChild(section);
    }

    if (!postSnap.empty) {
        totalResults += postSnap.size;
        const section = createSearchResultSection('Postingan Komunitas');
        postSnap.forEach(doc => section.querySelector('.results-content').appendChild(createSearchResultPost(doc.id, doc.data())));
        container.appendChild(section);
    }
    
    if (!courseSnap.empty) {
        totalResults += courseSnap.size;
        const section = createSearchResultSection('Materi Edukasi');
        courseSnap.forEach(doc => section.querySelector('.results-content').appendChild(createSearchResultCourse(doc.id, doc.data())));
        container.appendChild(section);
    }

    if (totalResults === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 pt-16"><i class="fas fa-box-open text-4xl mb-4"></i><p>Tidak ada hasil untuk "<span class="font-semibold">${term}</span>"</p></div>`;
    }
}

function createSearchResultSection(title) {
    const section = document.createElement('div');
    section.className = 'mb-6';
    section.innerHTML = `<h3 class="font-semibold text-lg text-gray-700 dark:text-gray-200 mb-2">${title}</h3><div class="results-content space-y-2"></div>`;
    return section;
}

function createSearchResultUser(id, data) {
    const item = document.createElement('div');
    item.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
    item.innerHTML = `
        <img src="${data.avatarUrl}" class="w-10 h-10 rounded-full object-cover">
        <p class="font-semibold">${data.name}</p>`;
    item.addEventListener('click', () => loadScreen('user-profile', { userId: id }));
    return item;
}

function createSearchResultPost(id, data) {
    const item = document.createElement('div');
    item.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
    item.innerHTML = `
        <div class="flex items-center space-x-3">
            <img src="${data.authorAvatar}" class="w-8 h-8 rounded-full object-cover">
            <span class="font-semibold text-sm">${data.authorName}</span>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-2 truncate">${data.content}</p>`;
    item.addEventListener('click', () => loadScreen('community')); // Navigasi ke community, post spesifik bisa jadi enhancement
    return item;
}

function createSearchResultCourse(id, data) {
    const item = document.createElement('div');
    item.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';
    item.innerHTML = `
        <img src="${data.imageUrl}" class="w-16 h-10 rounded object-cover flex-shrink-0">
        <p class="font-semibold">${data.title}</p>`;
    item.addEventListener('click', () => loadScreen('education', { courseId: id }));
    return item;
}