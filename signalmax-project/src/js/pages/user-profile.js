// File: src/js/pages/user-profile.js
// Deskripsi: Logika spesifik untuk halaman Profil Pengguna Lain.
// Versi Perbaikan: 2.1 (Badge Implementation)
// Perubahan:
// - Menghapus logika untuk menampilkan tanggal bergabung.
// - Menambahkan logika untuk merender badge Premium dan Expert yang baru.

import { loadScreen } from '../router.js';
import * as api from '../api.js';

/**
 * Fungsi inisialisasi untuk halaman Profil Pengguna.
 * @param {object} params - Parameter dari router, berisi `userId`.
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export async function initPage(params, addL) {
    const userId = params.userId;
    const contentArea = document.getElementById('app-content-area');

    if (!userId) {
        contentArea.innerHTML = '<p class="text-center text-red-500">ID Pengguna tidak valid.</p>';
        return;
    }

    try {
        const userDocSnap = await api.getDoc(api.doc(api.db, "users", userId));
        if (!userDocSnap.exists()) {
            contentArea.innerHTML = `<div class="p-8 text-center text-red-500">Pengguna tidak ditemukan.</div>`;
            return;
        }
        
        const userData = userDocSnap.data();
        renderProfileHeader(userData);
        renderProfileStats(userData);
        setupTabs();
        loadCompletedCourses(userId);
        loadUserPosts(userId);

        document.getElementById('user-profile-content')?.classList.remove('opacity-0');
        document.getElementById('back-to-community-btn')?.addEventListener('click', () => loadScreen('community'));

    } catch (error) {
        console.error("Gagal memuat profil pengguna:", error);
        contentArea.innerHTML = `<div class="p-8 text-center text-red-500">Terjadi kesalahan saat memuat profil.</div>`;
    }
}

function renderProfileHeader(userData) {
    document.getElementById('user-profile-header').textContent = userData.name;
    document.getElementById('user-thumbnail').src = userData.thumbnailUrl || 'https://placehold.co/600x200/16a34a/ffffff?text=+';
    document.getElementById('user-avatar').src = userData.avatarUrl;
    document.getElementById('user-name').textContent = userData.name;
    
    // --- PERBAIKAN DIMULAI DI SINI ---
    const badgesContainer = document.getElementById('user-badges-container');
    if (badgesContainer) {
        let badgesHtml = '';
        if (userData.isPremium) {
            badgesHtml += `<span class="inline-flex items-center text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-600 text-white px-2 py-1 rounded-full shadow-sm"><i class="fas fa-crown fa-xs mr-1.5"></i>Premium</span>`;
        }
        if (userData.isExpert) {
            badgesHtml += `<span class="inline-flex items-center text-xs font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-2 py-1 rounded-full shadow-sm ${userData.isPremium ? 'ml-2' : ''}"><i class="fas fa-star fa-xs mr-1.5"></i>Expert</span>`;
        }
        badgesContainer.innerHTML = badgesHtml;
    }
    // --- PERBAIKAN SELESAI DI SINI ---
}

function renderProfileStats(userData) {
    const stats = userData.stats || {};
    document.getElementById('user-post-count').textContent = stats.posts || 0;
    document.getElementById('user-like-count').textContent = stats.likes || 0;
    document.getElementById('user-reputation').textContent = stats.reputation || 0;

    const skillPercent = stats.skill || 0;
    const skillBar = document.getElementById('user-skill-bar');
    if (skillBar) skillBar.style.width = `${skillPercent}%`;
    document.getElementById('user-skill-text').textContent = `${skillPercent}%`;
}

function setupTabs() {
    const tabs = document.querySelectorAll('.profile-tab');
    const tabContents = document.querySelectorAll('.profile-tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('border-primary-500', 'text-primary-500');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            tabContents.forEach(c => c.classList.add('hidden'));
            tab.classList.remove('border-transparent', 'text-gray-500');
            tab.classList.add('border-primary-500', 'text-primary-500');
            document.getElementById(`tab-content-${tab.dataset.tab}`)?.classList.remove('hidden');
        });
    });
}

async function loadCompletedCourses(userId) {
    const coursesListContainer = document.getElementById('completed-courses-list');
    if (!coursesListContainer) return;
    coursesListContainer.innerHTML = '<p class="text-xs text-gray-400">Memuat kursus...</p>';
    try {
        const snapshot = await api.getDocs(api.query(api.collection(api.db, `users/${userId}/completedLessons`)));
        if (snapshot.empty) {
            coursesListContainer.innerHTML = '<p class="text-xs text-gray-400">Pengguna belum mengerjakan kursus apapun.</p>';
        } else {
            const coursePromises = snapshot.docs.map(docSnapshot => api.getDoc(api.doc(api.db, "courses", docSnapshot.id)));
            const courseDocs = await Promise.all(coursePromises);
            coursesListContainer.innerHTML = '';
            courseDocs.forEach(courseDoc => {
                if (courseDoc.exists()) {
                    const courseData = courseDoc.data();
                    const courseElement = document.createElement('div');
                    courseElement.className = 'bg-white dark:bg-gray-800 p-2 rounded-lg flex items-center space-x-3';
                    courseElement.innerHTML = `<img src="${courseData.imageUrl}" class="w-16 h-10 rounded object-cover"><p class="font-semibold text-sm">${courseData.title}</p>`;
                    coursesListContainer.appendChild(courseElement);
                }
            });
        }
    } catch (error) {
        console.error("Gagal memuat kursus:", error);
        coursesListContainer.innerHTML = '<p class="text-xs text-red-400">Gagal memuat data kursus.</p>';
    }
}

async function loadUserPosts(userId) {
    const postsContainer = document.getElementById('tab-content-posts');
    if (!postsContainer) return;
    postsContainer.innerHTML = '<div class="p-8 text-center"><i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i></div>';
    try {
        const q = api.query(api.collection(api.db, "posts"), api.where("authorId", "==", userId), api.orderBy("createdAt", "desc"));
        const postSnapshot = await api.getDocs(q);
        postsContainer.innerHTML = '';
        if (postSnapshot.empty) {
            postsContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Pengguna ini belum memiliki postingan.</p>';
        } else {
            postSnapshot.forEach(doc => postsContainer.appendChild(createPostElementForProfile(doc.id, doc.data())));
        }
    } catch (error) {
        console.error("Gagal memuat postingan:", error);
        postsContainer.innerHTML = '<p class="text-center text-red-500 p-8">Gagal memuat postingan.</p>';
    }
}

function createPostElementForProfile(id, data) {
    const card = document.createElement('div');
    card.id = `post-${id}`;
    card.className = 'bg-white dark:bg-gray-800 p-4 border-b dark:border-gray-700';

    const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '...';

    let contentHtml = `<p class="post-content-text text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">${data.content || ''}</p>`;
    if (data.type === 'image' && data.imageUrl) {
        contentHtml += `<img src="${data.imageUrl}" class="mt-2 rounded-lg w-full h-auto max-h-96 object-contain border dark:border-gray-700">`;
    }
    if (data.type === 'poll' && data.poll) {
        const pollOptionsHtml = data.poll.options.map((opt, index) => {
            const percentage = data.poll.totalVotes > 0 ? (opt.votes / data.poll.totalVotes) * 100 : 0;
            return `
                <div class="poll-option mt-2 p-2 border dark:border-gray-600 rounded-md relative">
                    <div class="absolute top-0 left-0 h-full bg-primary-500/20" style="width: ${percentage}%;"></div>
                    <div class="relative flex justify-between">
                        <span>${opt.text}</span>
                        <span>${Math.round(percentage)}%</span>
                    </div>
                </div>`;
        }).join('');
        contentHtml += `<div class="mt-2 space-y-1">${pollOptionsHtml}<p class="text-xs text-gray-400 mt-2">${data.poll.totalVotes} suara</p></div>`;
    }
    
    card.innerHTML = `
        <div class="flex items-start space-x-3">
            <img alt="Avatar" class="w-10 h-10 rounded-full" src="${data.authorAvatar || ''}"/>
            <div class="flex-1">
                <div>
                    <p class="font-semibold">${data.authorName || 'Pengguna'}</p>
                    <span class="text-xs text-gray-400">${time}</span>
                </div>
                ${contentHtml}
                <div class="flex items-center space-x-6 mt-3 text-gray-500">
                    <span class="flex items-center space-x-1">
                        <i class="fas fa-heart text-red-500"></i>
                        <span class="text-xs likes-count">${data.stats.likesCount || 0}</span>
                    </span>
                    <span class="flex items-center space-x-1">
                        <i class="fas fa-comment"></i>
                        <span class="text-xs comments-count">${data.stats.commentsCount || 0}</span>
                    </span>
                </div>
            </div>
        </div>`;

    return card;
}
