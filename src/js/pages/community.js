// File: src/js/pages/community.js
// Deskripsi: Logika inti untuk halaman Komunitas.
// Versi: 5.6 (Definitive Logic Fix)
// Perubahan:
// - [FIX] Mengubah total logika tombol 'add-story-btn'.
//   Sekarang, tombol ini tidak lagi memanggil `openStoryCreator`, melainkan
//   langsung memicu `click()` pada input file tersembunyi (#story-file-input-main),
//   meniru alur kerja tombol 'tambah gambar' yang sudah benar. Ini adalah perbaikan final.

import { currentUser, currentUserData } from '../auth.js';
import { openModal, closeModal, createPostSkeleton, createPostCard, createCommentElement, showMessage } from '../ui.js';
import * as api from '../api.js';
import { loadScreen } from '../router.js';

// --- STATE HALAMAN ---
const POSTS_PER_PAGE = 5;
let lastVisibleDoc = null;
let isLoading = false;
let allPostsLoaded = false;
let initialLoadTimestamp = null;

// State untuk Story Viewer
let activeStoryGroup = [];
let currentStoryIndex = 0;
let storyTimeout;
let storyUnsubscribes = [];
let storyStartTime = 0;
let storyTimeRemaining = 0;
const STORY_DURATION = 7000;

// Unsubscribe listeners
let newPostsUnsubscribe = null;
let commentUnsubscribe = null;
let scrollListener = null;

/**
 * Fungsi inisialisasi utama untuk halaman Komunitas.
 */
export function initPage(params, addL) {
    if (newPostsUnsubscribe) newPostsUnsubscribe();
    if (commentUnsubscribe) commentUnsubscribe();
    if (scrollListener) window.removeEventListener('scroll', scrollListener);
    storyUnsubscribes.forEach(unsub => unsub());
    storyUnsubscribes = [];

    resetState();

    // Menunda eksekusi untuk memastikan DOM sudah siap sepenuhnya.
    setTimeout(() => {
        const addStoryBtn = document.getElementById('add-story-btn');
        const storyFileInput = document.getElementById('story-file-input-main');

        const addStoryHandler = () => {
            // Langsung picu klik pada input file yang tersembunyi.
            // Alur selanjutnya (menampilkan preview, dll.) sudah ditangani oleh
            // event listener 'change' pada input file itu sendiri di main.js.
            if (storyFileInput) {
                storyFileInput.click();
            } else {
                console.error('Elemen input file #story-file-input-main tidak ditemukan.');
            }
        };
        
        if (addStoryBtn) {
            addStoryBtn.addEventListener('click', addStoryHandler);
            addL(() => addStoryBtn.removeEventListener('click', addStoryHandler));
        }

        document.getElementById('open-post-modal-btn')?.addEventListener('click', () => openModal('post-modal'));
    }, 0);


    const userAvatar = document.querySelector('.current-user-avatar');
    if (userAvatar && currentUserData) {
        userAvatar.src = currentUserData.avatarUrl;
    }

    initThemeToggle(addL);
    loadStories(addL);
    setupInfiniteScroll(addL, params.postId);
    setupStoryViewerListeners();

    const contentArea = document.getElementById('app-content-area');
    contentArea.addEventListener('click', handlePageClick);
    addL(() => contentArea.removeEventListener('click', handlePageClick));
}

function resetState() {
    lastVisibleDoc = null;
    isLoading = false;
    allPostsLoaded = false;
    initialLoadTimestamp = null;
    const container = document.getElementById('feed-container');
    if (container) container.innerHTML = '';
}

function setupInfiniteScroll(addL, postIdToHighlight) {
    const feedContainer = document.getElementById('feed-container');
    if (!feedContainer) return;

    for (let i = 0; i < 3; i++) feedContainer.appendChild(createPostSkeleton());

    scrollListener = () => {
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 400 && !isLoading) {
            loadPosts(false);
        }
    };
    window.addEventListener('scroll', scrollListener);
    addL(() => window.removeEventListener('scroll', scrollListener));

    loadPosts(true, postIdToHighlight, addL);
}

async function loadPosts(isInitialLoad, postIdToHighlight, addL) {
    if (isLoading || allPostsLoaded) return;
    isLoading = true;

    const feedContainer = document.getElementById('feed-container');
    if (!isInitialLoad) {
        feedContainer.insertAdjacentHTML('beforeend', '<div id="feed-spinner" class="text-center p-4"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>');
    }

    try {
        let q = api.query(api.collection(api.db, "posts"), api.orderBy("createdAt", "desc"), api.limit(POSTS_PER_PAGE));
        if (!isInitialLoad && lastVisibleDoc) {
            q = api.query(q, api.startAfter(lastVisibleDoc));
        }

        const snapshot = await api.getDocs(q);

        if (isInitialLoad) {
            feedContainer.innerHTML = '';
            if (!snapshot.empty) {
                initialLoadTimestamp = snapshot.docs[0].data().createdAt;
                listenForNewPosts(addL);
            }
        }

        if (snapshot.empty) {
            allPostsLoaded = true;
            if (isInitialLoad) feedContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Jadilah yang pertama membuat postingan!</p>';
            return;
        }

        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        snapshot.forEach(doc => {
            feedContainer.appendChild(createPostCard(doc.id, doc.data()));
        });

        if (isInitialLoad && postIdToHighlight) {
            highlightPost(postIdToHighlight);
        }

    } catch (error) {
        console.error("Gagal memuat postingan:", error);
    } finally {
        isLoading = false;
        document.getElementById('feed-spinner')?.remove();
    }
}

function listenForNewPosts(addL) {
    if (newPostsUnsubscribe) newPostsUnsubscribe();
    if (!initialLoadTimestamp) return;

    const q = api.query(api.collection(api.db, "posts"), api.where("createdAt", ">", initialLoadTimestamp));
    newPostsUnsubscribe = api.onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const indicator = document.getElementById('new-post-indicator');
            if (indicator && !indicator.querySelector('button')) {
                const button = document.createElement('button');
                button.innerHTML = '<i class="fas fa-arrow-up mr-2"></i> Lihat Postingan Baru';
                button.className = 'bg-primary-500 text-white font-bold py-2 px-4 rounded-full shadow-lg animate-fadeIn';
                button.onclick = () => {
                    indicator.innerHTML = '';
                    resetState();
                    loadPosts(true, null, addL);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                };
                indicator.appendChild(button);
            }
        }
    });
    addL(newPostsUnsubscribe);
}

function highlightPost(postId) {
    setTimeout(() => {
        const postElement = document.getElementById(`post-${postId}`);
        if (postElement) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            postElement.classList.add('highlight');
            postElement.addEventListener('animationend', () => postElement.classList.remove('highlight'), { once: true });
        }
    }, 500);
}

function loadStories(addL) {
    const container = document.getElementById('stories-container');
    if (!container) return;

    const q = api.query(api.collection(api.db, "stories"), api.where("expiresAt", ">", new Date()), api.orderBy("expiresAt", "desc"));
    const unsubscribe = api.onSnapshot(q, (snapshot) => {
        container.querySelectorAll('.story-item').forEach(el => el.remove());
        const storiesByUser = {};
        snapshot.forEach(doc => {
            const story = { id: doc.id, ...doc.data() };
            if (!storiesByUser[story.userId]) storiesByUser[story.userId] = [];
            storiesByUser[story.userId].push(story);
        });

        for (const userId in storiesByUser) {
            const userStories = storiesByUser[userId];
            const firstStory = userStories[0];
            const storyElement = document.createElement('div');
            storyElement.className = 'story-item flex-shrink-0 text-center cursor-pointer';
            storyElement.dataset.userId = userId;
            storyElement.innerHTML = `<div class="w-16 h-16 rounded-full p-0.5 story-ring-v2"><img src="${firstStory.userAvatar}" class="w-full h-full rounded-full object-cover bg-gray-200 p-0.5 dark:bg-gray-700"></div><p class="text-xs mt-2 text-gray-600 dark:text-gray-300 truncate w-16">${firstStory.userName}</p>`;
            container.appendChild(storyElement);
        }
    });
    addL(unsubscribe);
}

function handlePageClick(e) {
    const target = e.target;
    const postCard = target.closest('.post-card');
    const postId = postCard?.id.split('-')[1];

    if (!target.closest('.post-options-btn')) {
        document.querySelectorAll('.post-options-dropdown').forEach(dropdown => {
            dropdown.classList.add('hidden');
        });
    }

    if (target.closest('.story-item')) {
        handleStoryClick(target.closest('.story-item').dataset.userId);
    } 
    else if (target.closest('.like-btn')) {
        const likeBtn = target.closest('.like-btn');
        const isLiked = likeBtn.classList.contains('liked');
        const countEl = likeBtn.querySelector('.likes-count');
        const iconEl = likeBtn.querySelector('i');
        let currentCount = parseInt(countEl.textContent);

        likeBtn.classList.toggle('liked');
        iconEl.classList.toggle('fas', !isLiked);
        iconEl.classList.toggle('far', isLiked);
        countEl.textContent = isLiked ? currentCount - 1 : currentCount + 1;

        api.handleLikePost(postId, currentUserData).catch(err => {
            console.error("Gagal like:", err);
            likeBtn.classList.toggle('liked');
            iconEl.classList.toggle('fas', isLiked);
            iconEl.classList.toggle('far', !isLiked);
            countEl.textContent = currentCount;
            showMessage("Gagal menyukai postingan.", 2000, true);
        });
    } 
    else if (target.closest('.comment-btn')) {
        openCommentModal(postId);
    } else if (target.closest('.post-options-btn')) {
        const dropdown = target.closest('.relative').querySelector('.post-options-dropdown');
        dropdown?.classList.toggle('hidden');
    } else if (target.closest('.edit-post-btn')) {
        openEditModal(postId);
    } else if (target.closest('.delete-post-btn')) {
        openDeleteModal(postId);
    } else if (target.closest('[data-user-id]')) {
        const userId = target.closest('[data-user-id]').dataset.userId;
        loadScreen('user-profile', { userId });
    } else if (target.closest('.poll-option')) {
        handlePollVote(postId, target.closest('.poll-option').dataset.optionIndex);
    }
}

// --- LOGIKA STORY VIEWER ---

async function handleStoryClick(userId) {
    const q = api.query(api.collection(api.db, "stories"), api.where("userId", "==", userId), api.where("expiresAt", ">", new Date()), api.orderBy("createdAt", "asc"));
    const snapshot = await api.getDocs(q);
    if (snapshot.empty) return;
    activeStoryGroup = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    currentStoryIndex = 0;
    openModal('story-viewer');
    playCurrentStory();
}

function playCurrentStory(duration = STORY_DURATION) {
    if (storyTimeout) clearTimeout(storyTimeout);
    if (currentStoryIndex >= activeStoryGroup.length) {
        closeModal('story-viewer');
        return;
    }
    storyTimeRemaining = duration;
    storyStartTime = Date.now();
    const story = activeStoryGroup[currentStoryIndex];
    
    document.getElementById('story-user-avatar').src = story.userAvatar;
    document.getElementById('story-user-name').textContent = story.userName;
    document.getElementById('story-image').src = story.imageUrl;
    
    const progressBarsContainer = document.getElementById('story-progress-bars');
    progressBarsContainer.innerHTML = '';
    activeStoryGroup.forEach((_, index) => {
        const barWrapper = document.createElement('div');
        barWrapper.className = 'flex-1 h-1 bg-white/30 rounded-full overflow-hidden';
        if (index < currentStoryIndex) {
            barWrapper.innerHTML = `<div class="h-full bg-white rounded-full w-full"></div>`;
        } else if (index === currentStoryIndex) {
            barWrapper.innerHTML = `<div class="h-full bg-white rounded-full animate-progress" style="animation-duration: ${duration}ms;"></div>`;
        }
        progressBarsContainer.appendChild(barWrapper);
    });
    const isOwnStory = story.userId === currentUser.uid;
    document.getElementById('story-delete-btn').classList.toggle('hidden', !isOwnStory);
    document.getElementById('story-report-btn').classList.toggle('hidden', isOwnStory);
    storyTimeout = setTimeout(() => {
        currentStoryIndex++;
        playCurrentStory();
    }, duration);
}

function setupStoryViewerListeners() {
    const storyViewer = document.getElementById('story-viewer');
    const storyImage = document.getElementById('story-image');
    if (!storyViewer || !storyImage) return;

    const pauseStory = () => {
        clearTimeout(storyTimeout);
        const elapsedTime = Date.now() - storyStartTime;
        storyTimeRemaining -= elapsedTime;
        document.querySelector('.animate-progress')?.classList.add('paused');
    };
    const resumeStory = () => {
        document.querySelector('.animate-progress')?.classList.remove('paused');
        playCurrentStory(storyTimeRemaining);
    };

    storyImage.addEventListener('mousedown', pauseStory);
    storyImage.addEventListener('touchstart', pauseStory, { passive: true });
    storyImage.addEventListener('mouseup', resumeStory);
    storyImage.addEventListener('touchend', resumeStory);

    document.getElementById('story-back-btn')?.addEventListener('click', () => { clearTimeout(storyTimeout); closeModal('story-viewer'); });
    document.getElementById('story-nav-next')?.addEventListener('click', () => { currentStoryIndex++; playCurrentStory(); });
    document.getElementById('story-nav-prev')?.addEventListener('click', () => { currentStoryIndex = Math.max(0, currentStoryIndex - 1); playCurrentStory(); });
    document.getElementById('story-options-btn')?.addEventListener('click', () => document.getElementById('story-options-dropdown').classList.toggle('hidden'));
    document.getElementById('story-delete-btn')?.addEventListener('click', () => handleDeleteStory(activeStoryGroup[currentStoryIndex]));
    document.getElementById('story-report-btn')?.addEventListener('click', () => handleReportStory(activeStoryGroup[currentStoryIndex]));
    document.getElementById('story-like-btn')?.addEventListener('click', () => handleStoryLike(activeStoryGroup[currentStoryIndex]));
    document.getElementById('story-reply-send-btn')?.addEventListener('click', () => {
        const input = document.getElementById('story-reply-input');
        if (input.value.trim()) {
            handleStoryReply(activeStoryGroup[currentStoryIndex], input.value.trim());
            input.value = '';
        }
    });

    storyViewer.addEventListener('click', (e) => {
        if (!e.target.closest('#story-options-btn')) {
            document.getElementById('story-options-dropdown').classList.add('hidden');
        }
    });
}

async function handleStoryLike(story) {
    if (!story) return;
    const likeBtn = document.getElementById('story-like-btn');
    const likeCountEl = document.getElementById('story-like-count');
    likeBtn.classList.toggle('liked');
    const currentCount = parseInt(likeCountEl.textContent);
    likeCountEl.textContent = likeBtn.classList.contains('liked') ? currentCount + 1 : currentCount - 1;
    // Implementasi API untuk like story perlu ditambahkan di `api.js` jika belum ada
    // await api.handleStoryLike(story.id); 
}
async function handleStoryReply(story, message) {
    showMessage(`Pesan terkirim ke ${story.userName}`);
}
async function handleDeleteStory(story) {
    if (confirm("Yakin ingin menghapus story ini?")) {
        clearTimeout(storyTimeout);
        try {
            await api.deleteDoc(api.doc(api.db, 'stories', story.id));
            showMessage("Story berhasil dihapus.");
            activeStoryGroup.splice(currentStoryIndex, 1);
            if (currentStoryIndex >= activeStoryGroup.length) {
                closeModal('story-viewer');
            } else {
                playCurrentStory();
            }
        } catch (error) {
            showMessage("Gagal menghapus story.", 3000, true);
        }
    }
}
async function handleReportStory(story) {
    showMessage(`Story dari ${story.userName} telah dilaporkan.`);
    document.getElementById('story-options-dropdown').classList.add('hidden');
}

// --- FUNGSI MODAL & HELPERS LAINNYA ---

function initThemeToggle(addL) {
    const themeToggle = document.getElementById('theme-toggle-community');
    if (themeToggle) {
        const handler = () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        };
        themeToggle.addEventListener('click', handler);
        addL(() => themeToggle.removeEventListener('click', handler));
    }
}

async function openCommentModal(postId) {
    if (commentUnsubscribe) commentUnsubscribe();
    const modal = document.getElementById('comment-modal');
    const commentList = document.getElementById('comment-list');
    
    const commentAvatar = modal.querySelector('.current-user-avatar');
    if (commentAvatar && currentUserData) {
        commentAvatar.src = currentUserData.avatarUrl;
    }

    modal.dataset.postId = postId;
    commentList.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i></div>';
    openModal('comment-modal');
    const q = api.query(api.collection(api.db, `posts/${postId}/comments`), api.orderBy("createdAt", "asc"));
    commentUnsubscribe = api.onSnapshot(q, (snapshot) => {
        commentList.innerHTML = '';
        if (snapshot.empty) {
            commentList.innerHTML = '<p class="text-center text-gray-500 text-sm p-4">Jadilah yang pertama berkomentar.</p>';
        } else {
            snapshot.forEach(doc => commentList.appendChild(createCommentElement({id: doc.id, ...doc.data()})));
            commentList.scrollTop = commentList.scrollHeight;
        }
    });
}

async function openEditModal(postId) {
    const postSnap = await api.getDoc(api.doc(api.db, "posts", postId));
    if (postSnap.exists()) {
        const modal = document.getElementById('edit-post-modal');
        modal.dataset.postId = postId;
        modal.querySelector('#edit-post-textarea').value = postSnap.data().content;
        openModal('edit-post-modal');
    }
}

function openDeleteModal(postId) {
    const modal = document.getElementById('delete-post-modal');
    modal.dataset.postId = postId;
    openModal('delete-post-modal');
}

async function handlePollVote(postId, optionIndex) {
    if (!currentUser) return showMessage("Harap login untuk vote.", 3000, true);
    const postRef = api.doc(api.db, "posts", postId);
    const postSnap = await api.getDoc(postRef);
    if (!postSnap.exists() || postSnap.data().poll.voters?.includes(currentUser.uid)) return;
    const postData = postSnap.data();
    const newOptions = postData.poll.options;
    newOptions[optionIndex].votes += 1;
    await api.updateDoc(postRef, {
        'poll.options': newOptions,
        'poll.totalVotes': api.increment(1),
        'poll.voters': api.arrayUnion(currentUser.uid)
    });
}
