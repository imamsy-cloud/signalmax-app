// File: src/js/pages/content-viewer.js
// Versi: 2.3 - Lesson Completion Logic
// Perubahan:
// - Menambahkan logika untuk menampilkan dan mengelola tombol "Tandai Selesai".
// - Tombol akan muncul jika halaman diakses dari 'education'.
// - Status tombol (aktif/nonaktif) disesuaikan dengan progres pengguna.
// - Menambahkan event listener untuk menyimpan progres saat tombol diklik.

import { loadScreen } from '../router.js';
import * as api from '../api.js';
import { currentUser, currentUserData } from '../auth.js'; // Impor currentUser
import { showMessage, setButtonLoading } from '../ui.js'; // Impor helper UI

/**
 * Fungsi inisialisasi untuk halaman Content Viewer.
 * @param {object} params - Parameter dari router.
 * @param {function} addL - Fungsi untuk mendaftarkan listener.
 */
export async function initPage(params, addL) {
    const { contentType, contentId, returnUrl, returnParams } = params;
    
    const headerTitle = document.getElementById('content-viewer-header-title');
    const loader = document.getElementById('content-loader');
    const errorView = document.getElementById('content-error-view');

    const backBtn = document.getElementById('back-to-home-btn');
    const backBtnHandler = () => {
        if (returnUrl && returnParams) {
            loadScreen(returnUrl, returnParams);
        } else {
            loadScreen('home');
        }
    };
    backBtn?.addEventListener('click', backBtnHandler);
    addL(() => backBtn?.removeEventListener('click', backBtnHandler));

    if (!contentType || !contentId) {
        showError(errorView, loader, headerTitle, 'Informasi konten tidak lengkap.');
        return;
    }

    try {
        const collectionName = `${contentType}s`;
        const docRef = api.doc(api.db, collectionName, contentId);
        const docSnap = await api.getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            headerTitle.textContent = data.title;
            renderContent(contentType, data);
            loader.classList.add('hidden');
            
            // --- PERBAIKAN DIMULAI DI SINI ---
            // Jika halaman ini adalah pelajaran dari kursus, siapkan tombol penyelesaian
            if (returnUrl === 'education' && returnParams?.courseId && returnParams?.lessonId) {
                setupLessonCompletionButton(returnParams.courseId, returnParams.lessonId, addL);
            }
            // --- PERBAIKAN SELESAI DI SINI ---

        } else {
            showError(errorView, loader, headerTitle, 'Konten yang Anda cari tidak ditemukan atau telah dihapus.');
        }
    } catch (error) {
        console.error("Gagal memuat konten:", error);
        showError(errorView, loader, headerTitle, 'Terjadi kesalahan saat memuat konten.');
    }
}

/**
 * [BARU] Menyiapkan dan menampilkan tombol "Tandai Selesai" untuk pelajaran.
 */
async function setupLessonCompletionButton(courseId, lessonId, addL) {
    const container = document.getElementById('lesson-completion-action-container');
    const button = document.getElementById('lesson-action-btn');
    if (!container || !button || !currentUser) return;

    // Tampilkan container tombol
    container.classList.remove('hidden');

    // Cek apakah pelajaran ini sudah diselesaikan oleh pengguna
    const progressRef = api.doc(api.db, `users/${currentUser.uid}/completedLessons`, courseId);
    const progressSnap = await api.getDoc(progressRef);
    const completedLessons = progressSnap.exists() ? progressSnap.data().lessons : [];
    const isCompleted = completedLessons.includes(lessonId);

    if (isCompleted) {
        button.disabled = true;
        button.textContent = 'Pelajaran Telah Selesai';
    } else {
        button.disabled = false;
        button.textContent = 'Tandai Selesai';
    }

    const clickHandler = async () => {
        setButtonLoading(button, true, 'Menyimpan...');
        try {
            // Panggil fungsi API untuk menandai pelajaran selesai (akan dibuat di api.js)
            await api.markLessonAsComplete(currentUser.uid, courseId, lessonId);
            showMessage("Progres berhasil disimpan!");
            button.disabled = true;
            button.textContent = 'Pelajaran Telah Selesai';
        } catch (error) {
            console.error("Gagal menyimpan progres:", error);
            showMessage("Gagal menyimpan progres. Coba lagi.", 3000, true);
        } finally {
            // Mengembalikan tombol ke state semula jika tidak dinonaktifkan
            if (!button.disabled) {
                 setButtonLoading(button, false, 'Tandai Selesai');
            }
        }
    };

    button.addEventListener('click', clickHandler);
    addL(() => button.removeEventListener('click', clickHandler));
}


function showError(errorView, loader, headerTitle, message) {
    loader.classList.add('hidden');
    headerTitle.textContent = 'Error';
    errorView.innerHTML = `<p>${message}</p>`;
    errorView.classList.remove('hidden');
}

function renderContent(type, data) {
    document.getElementById('article-view').classList.add('hidden');
    document.getElementById('video-view').classList.add('hidden');
    document.getElementById('ebook-view').classList.add('hidden');

    switch (type) {
        case 'article':
            const articleView = document.getElementById('article-view');
            document.getElementById('article-image').src = data.imageUrl || 'https://placehold.co/1200x600/e0e0e0/333?text=Artikel';
            document.getElementById('article-title').textContent = data.title;
            
            if (data.createdAt && data.createdAt.seconds) {
                const date = new Date(data.createdAt.seconds * 1000);
                document.getElementById('article-date').textContent = `Diterbitkan pada ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
            }
            
            document.getElementById('article-content').innerHTML = data.content;
            
            articleView.classList.remove('hidden');
            break;

        case 'video':
            const videoView = document.getElementById('video-view');
            const embedContainer = document.getElementById('video-embed-container');
            let videoId = '';
            try {
                const url = new URL(data.url);
                videoId = url.searchParams.get('v');
            } catch (e) {
                console.error("URL YouTube tidak valid:", data.url);
            }
            
            if (videoId) {
                const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&showinfo=0&modestbranding=1`;
                embedContainer.innerHTML = `
                    <iframe 
                        src="${embedUrl}" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen 
                        class="w-full h-full rounded-lg shadow-lg">
                    </iframe>`;
            } else {
                embedContainer.innerHTML = `<div class="w-full h-full rounded-lg shadow-lg bg-gray-800 flex items-center justify-center"><p class="text-red-500">URL video tidak valid.</p></div>`;
            }
            document.getElementById('video-title').textContent = data.title;
            const videoDescEl = document.getElementById('video-description');
            if (data.description) {
                videoDescEl.textContent = data.description;
                videoDescEl.classList.remove('hidden');
            } else {
                videoDescEl.classList.add('hidden');
            }
            videoView.classList.remove('hidden');
            break;

        case 'ebook':
            const ebookView = document.getElementById('ebook-view');
            document.getElementById('ebook-title').textContent = data.title;
            document.getElementById('ebook-download-link').href = data.url;
            ebookView.classList.remove('hidden');
            break;

        default:
            showError(document.getElementById('content-error-view'), document.getElementById('content-loader'), document.getElementById('content-viewer-header-title'), 'Tipe konten tidak didukung.');
    }
}
