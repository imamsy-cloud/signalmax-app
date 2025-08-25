// File: src/js/pages/community.js
// Versi Perbaikan: 5.2 (Fix Comment Event Listeners)
// Perubahan:
// - Memisahkan event handler untuk feed utama dan modal komentar.
// - Menambahkan listener khusus (`handleCommentModalClick`) yang ditempelkan langsung
//   ke modal komentar saat dibuka, memastikan semua tombol (balas, edit) berfungsi.
// - Membersihkan listener modal komentar dengan benar saat halaman diganti.

import { currentUser, currentUserData } from '../auth.js';
import { openModal, closeModal, createPostSkeleton, createPostCard, createCommentElement, showMessage } from '../ui.js';
import * as api from '../api.js';
import { loadScreen } from '../router.js';

// --- STATE UNTUK PAGINASI & REAL-TIME ---
const POSTS_PER_PAGE = 7;
let lastVisibleDoc = null;
let isLoading = false;
let allPostsLoaded = false;
let authorsData = new Map();
let initialLoadTimestamp = null;

// Variabel untuk listener, agar bisa di-cleanup
let postsUnsubscribe = null;
let commentUnsubscribe = null;
let scrollListener = null;
let pageClickListener = null;
let commentModalClickListener = null; // [BARU] Listener khusus untuk modal komentar


/**
 * Fungsi inisialisasi utama untuk halaman Komunitas.
 */
export function initPage(params, addL) {
    cleanupListeners();
    resetState();

    document.getElementById('add-story-btn')?.addEventListener('click', () => openModal('story-modal'));
    document.getElementById('open-post-modal-btn')?.addEventListener('click', () => openModal('post-modal'));

    const userAvatars = document.querySelectorAll('.current-user-avatar');
    if (userAvatars.length > 0 && currentUserData) {
        userAvatars.forEach(avatar => avatar.src = currentUserData.avatarUrl);
    }

    initThemeToggle(addL);
    loadStories(addL);
    
    setupInfiniteScroll(addL, params.postId);

    const contentArea = document.getElementById('app-content-area');
    pageClickListener = (e) => handlePageClick(e);
    contentArea.addEventListener('click', pageClickListener);
    addL(() => contentArea.removeEventListener('click', pageClickListener));
}

/**
 * Fungsi terpusat untuk membersihkan semua listener aktif.
 */
function cleanupListeners() {
    if (postsUnsubscribe) postsUnsubscribe();
    if (commentUnsubscribe) commentUnsubscribe();
    if (scrollListener) window.removeEventListener('scroll', scrollListener);
    
    const commentList = document.getElementById('comment-list');
    if (commentList && commentModalClickListener) {
        commentList.removeEventListener('click', commentModalClickListener);
    }

    postsUnsubscribe = null;
    commentUnsubscribe = null;
    scrollListener = null;
    commentModalClickListener = null;
}


/**
 * Mereset semua state yang berhubungan dengan feed postingan.
 */
function resetState() {
    lastVisibleDoc = null;
    isLoading = false;
    allPostsLoaded = false;
    initialLoadTimestamp = null;
    authorsData.clear();
    const container = document.getElementById('feed-container');
    if (container) container.innerHTML = '';
}

/**
 * Menyiapkan infinite scroll dan memuat batch pertama postingan.
 */
function setupInfiniteScroll(addL, postIdToHighlight) {
    const feedContainer = document.getElementById('feed-container');
    if (!feedContainer) return;

    for (let i = 0; i < 3; i++) feedContainer.appendChild(createPostSkeleton());

    scrollListener = () => {
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 300) {
            loadPosts(false);
        }
    };
    
    window.addEventListener('scroll', scrollListener);
    addL(() => {
        if (scrollListener) {
            window.removeEventListener('scroll', scrollListener);
        }
    });
    
    loadPosts(true, postIdToHighlight, addL);
}

/**
 * Fungsi utama untuk memuat postingan secara bertahap.
 */
async function loadPosts(isInitialLoad, postIdToHighlight, addL) {
    if (isLoading || allPostsLoaded) return;
    isLoading = true;

    const feedContainer = document.getElementById('feed-container');
    const spinner = document.getElementById('feed-spinner');
    if (!isInitialLoad && !spinner) {
        feedContainer.insertAdjacentHTML('beforeend', '<div id="feed-spinner" class="text-center p-4"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>');
    }

    try {
        let q = api.query(
            api.collection(api.db, "posts"),
            api.orderBy("createdAt", "desc"),
            api.limit(POSTS_PER_PAGE)
        );

        if (lastVisibleDoc) {
            q = api.query(q, api.startAfter(lastVisibleDoc));
        }

        const snapshot = await api.getDocs(q);

        if (isInitialLoad) {
            feedContainer.innerHTML = '';
            if (!snapshot.empty) {
                initialLoadTimestamp = snapshot.docs[0].data().createdAt;
                listenForPostChanges(addL);
            } else {
                initialLoadTimestamp = api.serverTimestamp();
                listenForPostChanges(addL);
            }
        }

        if (snapshot.empty) {
            allPostsLoaded = true;
            if (isInitialLoad) {
                feedContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Belum ada postingan.</p>';
            }
            return;
        }

        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const authorIds = [...new Set(posts.map(post => post.authorId).filter(id => !authorsData.has(id)))];

        if (authorIds.length > 0) {
            const authorsQuery = api.query(api.collection(api.db, "users"), api.where(api.documentId(), "in", authorIds));
            const authorsSnapshot = await api.getDocs(authorsQuery);
            authorsSnapshot.forEach(doc => authorsData.set(doc.id, doc.data()));
        }

        posts.forEach(post => {
            const authorInfo = authorsData.get(post.authorId);
            const postCard = createPostCard(post.id, post, authorInfo);
            feedContainer.appendChild(postCard);
        });

        if (isInitialLoad && postIdToHighlight) {
            highlightPost(postIdToHighlight);
        }

    } catch (error) {
        console.error("Gagal memuat postingan:", error);
        showMessage("Gagal memuat postingan. Coba lagi.", 3000, true);
    } finally {
        isLoading = false;
        const existingSpinner = document.getElementById('feed-spinner');
        if (existingSpinner) existingSpinner.remove();
    }
}

/**
 * Memasang listener untuk semua perubahan (tambah, edit, hapus) pada postingan.
 */
function listenForPostChanges(addL) {
    if (postsUnsubscribe) postsUnsubscribe();
    if (!initialLoadTimestamp) return;

    const q = api.query(
        api.collection(api.db, "posts"),
        api.orderBy("createdAt", "desc")
    );

    postsUnsubscribe = api.onSnapshot(q, async (snapshot) => {
        const feedContainer = document.getElementById('feed-container');
        if (!feedContainer) return;

        for (const change of snapshot.docChanges()) {
            const postData = { id: change.doc.id, ...change.doc.data() };
            const existingCard = document.getElementById(`post-${postData.id}`);

            switch (change.type) {
                case "added":
                    if (!existingCard && postData.createdAt > initialLoadTimestamp) {
                        if (!authorsData.has(postData.authorId)) {
                            const authorDoc = await api.getDoc(api.doc(api.db, "users", postData.authorId));
                            if (authorDoc.exists()) authorsData.set(authorDoc.id, authorDoc.data());
                        }
                        const authorInfo = authorsData.get(postData.authorId);
                        const newCard = createPostCard(postData.id, postData, authorInfo);
                        feedContainer.prepend(newCard);
                    }
                    break;
                case "modified":
                    if (existingCard) {
                        const authorInfo = authorsData.get(postData.authorId);
                        const updatedCard = createPostCard(postData.id, postData, authorInfo);
                        existingCard.replaceWith(updatedCard);
                    }
                    break;
                case "removed":
                    if (existingCard) {
                        existingCard.classList.add('fade-out');
                        existingCard.addEventListener('transitionend', () => existingCard.remove());
                    }
                    break;
            }
        }
    });

    addL(postsUnsubscribe);
}


function highlightPost(postId) {
    if (!postId) return;
    setTimeout(() => {
        const postElement = document.getElementById(`post-${postId}`);
        if (postElement) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            postElement.classList.add('highlight');
            postElement.addEventListener('animationend', () => {
                postElement.classList.remove('highlight');
            }, { once: true });
        }
    }, 500);
}

function initThemeToggle(addL) {
    const themeToggle = document.getElementById('theme-toggle-community');
    if (themeToggle) {
        const handler = () => {
            const isDark = document.documentElement.classList.toggle('dark');
            const newTheme = isDark ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        };
        themeToggle.addEventListener('click', handler);
        addL(() => themeToggle.removeEventListener('click', handler));
    }
}

function loadStories(addL) {
    const container = document.getElementById('stories-container');
    if (!container) return;
    const q = api.query(api.collection(api.db, "stories"), api.where("expiresAt", ">", new Date()), api.orderBy("expiresAt", "desc"));
    const unsubscribe = api.onSnapshot(q, (snapshot) => {
        container.querySelectorAll('.animate-pulse, .story-item').forEach(el => el.remove());
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
            storyElement.innerHTML = `
                <div class="w-16 h-16 rounded-full p-1 story-ring">
                    <img src="${firstStory.userAvatar}" class="w-full h-full rounded-full object-cover bg-gray-200">
                </div>
                <p class="text-xs mt-2 text-gray-600 dark:text-gray-300 truncate w-16">${firstStory.userName}</p>
            `;
            container.appendChild(storyElement);
        }
    });
    addL(unsubscribe);
}

// --- [DIUBAH] Event handler ini sekarang hanya untuk feed utama ---
function handlePageClick(e) {
    const target = e.target;
    
    // Klik di luar feed (misal: stories)
    if (target.closest('.story-item')) {
        handleStoryClick(target.closest('.story-item').dataset.userId);
        return;
    }

    const postCard = target.closest('.post-card');
    if (!postCard) return; // Keluar jika klik bukan di dalam kartu postingan
    
    const postId = postCard.id.split('-')[1];

    if (target.closest('.like-btn')) {
        api.handleLikePost(postId, currentUserData);
    } else if (target.closest('.comment-btn')) {
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

// --- [BARU] Event handler khusus untuk interaksi di dalam modal komentar ---
function handleCommentModalClick(e) {
    const target = e.target;
    const postId = document.getElementById('comment-modal').dataset.postId;

    if (target.closest('.reply-comment-btn')) {
        const { commentId, authorName } = target.closest('.reply-comment-btn').dataset;
        prepareReply(commentId, authorName);
    } else if (target.closest('.edit-comment-btn')) {
        const { commentId } = target.closest('.edit-comment-btn').dataset;
        openEditCommentModal(postId, commentId);
    } else if (target.closest('.show-replies-btn')) {
        const wrapper = target.closest('.comment-wrapper');
        const repliesContainer = wrapper.querySelector('.replies-container');
        const replyCount = wrapper.querySelector('.reply-count-text').textContent;
        
        repliesContainer.classList.toggle('hidden');
        target.innerHTML = repliesContainer.classList.contains('hidden')
            ? `<i class="fas fa-comment-dots mr-1"></i> Lihat ${replyCount} balasan`
            : `<i class="fas fa-minus-circle mr-1"></i> Sembunyikan balasan`;
    } else if (target.closest('[data-user-id]')) {
        const userId = target.closest('[data-user-id]').dataset.userId;
        closeModal('comment-modal');
        loadScreen('user-profile', { userId });
    }
}


async function openCommentModal(postId) {
    if (commentUnsubscribe) commentUnsubscribe();
    const modal = document.getElementById('comment-modal');
    const commentList = document.getElementById('comment-list');
    if (!modal || !commentList) return;

    // [FIX] Hapus listener lama sebelum menambahkan yang baru
    if (commentModalClickListener) {
        commentList.removeEventListener('click', commentModalClickListener);
    }
    commentModalClickListener = (e) => handleCommentModalClick(e);
    commentList.addEventListener('click', commentModalClickListener);

    modal.dataset.postId = postId;
    commentList.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i></div>';
    openModal('comment-modal');

    const q = api.query(api.collection(api.db, `posts/${postId}/comments`), api.orderBy("createdAt", "asc"));
    commentUnsubscribe = api.onSnapshot(q, (snapshot) => {
        commentList.innerHTML = '';
        if (snapshot.empty) {
            commentList.innerHTML = '<p class="text-center text-gray-500 text-sm p-4">Belum ada komentar.</p>';
            return;
        }
        
        const allCommentsMap = new Map();
        snapshot.docs.forEach(doc => allCommentsMap.set(doc.id, { id: doc.id, ...doc.data() }));

        allCommentsMap.forEach(comment => {
            if (!comment.parentId) {
                const commentElement = createCommentElement(comment, allCommentsMap);
                commentList.appendChild(commentElement);
            }
        });
    });
}

function prepareReply(commentId, authorName) {
    const modal = document.getElementById('comment-modal');
    const commentInput = document.getElementById('comment-input');
    
    modal.dataset.parentCommentId = commentId;
    commentInput.placeholder = `Membalas @${authorName}...`;
    commentInput.value = `@${authorName} `;
    commentInput.focus();
}

function openEditCommentModal(postId, commentId) {
    const modal = document.getElementById('edit-comment-modal');
    const textarea = document.getElementById('edit-comment-textarea');
    const originalText = document.querySelector(`#comment-${commentId} .comment-text-content`).textContent;
    
    modal.dataset.postId = postId;
    modal.dataset.commentId = commentId;
    textarea.value = originalText;
    
    openModal('edit-comment-modal');
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

async function handleStoryClick(userId) {
    const q = api.query(api.collection(api.db, "stories"), api.where("userId", "==", userId), api.where("expiresAt", ">", new Date()), api.orderBy("expiresAt", "desc"));
    const snapshot = await api.getDocs(q);
    if (snapshot.empty) return;
    const activeStoryGroup = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let currentStoryIndex = 0;
    let storyTimeout;
    const playStory = () => {
        if (currentStoryIndex >= activeStoryGroup.length) {
            closeModal('story-viewer');
            return;
        }
        clearTimeout(storyTimeout);
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
                barWrapper.innerHTML = `<div class="h-full bg-white rounded-full animate-progress"></div>`;
            }
            progressBarsContainer.appendChild(barWrapper);
        });
        storyTimeout = setTimeout(() => {
            currentStoryIndex++;
            playStory();
        }, 5000);
    };
    openModal('story-viewer');
    playStory();
}
