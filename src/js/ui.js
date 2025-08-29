// File: src/js/ui.js
// Deskripsi: Mengelola semua komponen UI, interaksi modal, dan rendering elemen dinamis.
// Versi: 5.2 (Show Badges on Posts)
// Perubahan:
// - [FIX] Memperbarui `createPostCard` untuk membaca field `authorIsPremium` dan `authorIsExpert`
//   dan merender HTML untuk badge jika nilainya true.

import * as api from './api.js';
import { currentUser, currentUserData, sendPasswordReset } from './auth.js';
import { loadScreen } from './router.js';

// --- STATE GLOBAL ---
let newAvatarFile = null;
let newThumbnailFile = null;
let postModalState = { imageFile: null, postType: 'text' };
let paymentSettings = null;

// === FUNGSI UTILITAS UI DASAR ===

export const showMessage = (message, duration = 3000, isError = false) => {
    const container = document.getElementById('modal-container') || document.body;
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white shadow-lg transition-all duration-300 z-50 ${isError ? 'bg-red-500' : 'bg-gray-800 dark:bg-gray-200 dark:text-gray-800'} transform translate-y-10 opacity-0`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-10', 'opacity-0'); }, 10);
    setTimeout(() => {
        toast.classList.add('opacity-0');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
};

export const openModal = async (modalId) => {
    if (modalId === 'upgrade-premium-modal') {
        const success = await populatePremiumModal();
        if (!success) return;
    }
    const modal = document.getElementById(modalId);
    if (modal) {
        document.body.classList.add('modal-open');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('visible'), 10);
    }
};

export const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        document.body.classList.remove('modal-open');
        modal.classList.remove('visible');
        const onTransitionEnd = () => {
            modal.classList.add('hidden');
            modal.removeEventListener('transitionend', onTransitionEnd);
        };
        modal.addEventListener('transitionend', onTransitionEnd);
        if (modalId === 'edit-profile-modal') {
            newAvatarFile = null;
            newThumbnailFile = null;
        }
        if (modalId === 'post-modal') {
            resetPostModal();
        }
    }
};

export const applyTheme = (theme) => {
    const themeToggleButtons = document.querySelectorAll('#theme-toggle-btn, #theme-toggle-community');
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        themeToggleButtons.forEach(btn => { if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>'; });
    } else {
        document.documentElement.classList.remove('dark');
        themeToggleButtons.forEach(btn => { if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>'; });
    }
};

export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.toggle('-translate-x-full');
    sidebarOverlay?.classList.toggle('hidden');
}

export function setButtonLoading(button, isLoading, defaultText = '') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    } else {
        button.disabled = false;
        button.innerHTML = `<span>${defaultText}</span>`;
    }
}

export function setCircleDashoffset(circleElement, percentage) {
    if (!circleElement) return;
    const radius = circleElement.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    circleElement.style.strokeDashoffset = offset;
}

export function setupPasswordToggle(inputId, buttonId) {
    const passwordInput = document.getElementById(inputId);
    const toggleButton = document.getElementById(buttonId);
    if (!passwordInput || !toggleButton) return;
    const icon = toggleButton.querySelector('i');
    toggleButton.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        icon.classList.toggle('fa-eye', !isPassword);
        icon.classList.toggle('fa-eye-slash', isPassword);
    });
}

function formatRelativeTime(timestamp) {
    if (!timestamp || !timestamp.seconds) return '';
    const now = new Date();
    const postDate = new Date(timestamp.seconds * 1000);
    const diffSeconds = Math.round((now - postDate) / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffSeconds < 60) return 'Baru saja';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}j`;
    if (diffDays < 7) return `${diffDays}h`;
    
    return postDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function compressImage(file, options = { maxWidth: 1080, quality: 0.8 }) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > options.maxWidth) {
                    height *= options.maxWidth / width;
                    width = options.maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => {
                    if (!blob) return reject(new Error('Canvas is empty'));
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', options.quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// === FUNGSI PEMBUAT KOMPONEN SKELETON ===

export function createPostSkeleton() {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 p-4 border-b dark:border-gray-700 animate-pulse';
    card.innerHTML = `<div class="flex items-start space-x-3"><div class="w-10 h-10 rounded-full flex-shrink-0 bg-gray-200 dark:bg-gray-700"></div><div class="flex-1 space-y-3"><div class="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700"></div><div class="h-4 w-full rounded bg-gray-200 dark:bg-gray-700"></div><div class="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div></div></div>`;
    return card;
}

export function createSignalSkeleton() {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-2xl shadow-md p-4 space-y-3 animate-pulse border border-gray-200 dark:border-gray-700';
    card.innerHTML = `<div class="flex justify-between items-center"><div class="skeleton h-5 w-2/5 rounded-md"></div><div class="skeleton h-4 w-1/4 rounded-md"></div></div><div class="mt-4 space-y-2"><div class="skeleton h-10 w-full rounded-lg"></div><div class="skeleton h-8 w-full rounded-lg"></div></div>`;
    return card;
}

export function createEventSkeleton() {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden flex animate-pulse';
    card.innerHTML = `<div class="flex-shrink-0 w-20 flex flex-col items-center justify-center bg-gray-200 dark:bg-gray-700 p-2 space-y-1"><div class="skeleton h-7 w-10 my-1 rounded-md"></div><div class="skeleton h-4 w-8 rounded-md"></div></div><div class="p-4 flex-1 space-y-2"><div class="skeleton h-3 w-1/4 rounded-md"></div><div class="skeleton h-5 w-3/4 rounded-md"></div><div class="skeleton h-4 w-full rounded-md"></div></div>`;
    return card;
}

export function createCourseSkeleton() {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden animate-pulse';
    card.innerHTML = `<div class="skeleton w-full h-32 bg-gray-200 dark:bg-gray-700"></div><div class="p-3 space-y-2"><div class="skeleton h-3 w-1/4 rounded-md"></div><div class="skeleton h-5 w-3/4 rounded-md"></div><div class="skeleton h-4 w-1/2 rounded-md"></div></div>`;
    return card;
}

// === FUNGSI PEMBUAT KOMPONEN KARTU ===

export function createPostCard(id, data) {
    const card = document.createElement('div');
    card.id = `post-${id}`;
    card.className = 'post-card bg-white dark:bg-gray-800 p-4 border-b dark:border-gray-700';

    const time = formatRelativeTime(data.createdAt);
    const isLiked = data.likedBy?.includes(currentUser.uid);
    const isAuthor = currentUser?.uid === data.authorId;

    // --- PERBAIKAN 1: Logika untuk membuat HTML badge ---
    let badgesHtml = '';
    if (data.authorIsPremium) {
        badgesHtml += `<span class="inline-flex items-center text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-600 text-white px-2 py-0.5 rounded-full shadow-sm"><i class="fas fa-crown fa-xs mr-1.5"></i>Premium</span>`;
    }
    if (data.authorIsExpert) {
        badgesHtml += `<span class="inline-flex items-center text-xs font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-white px-2 py-0.5 rounded-full shadow-sm ${data.authorIsPremium ? 'ml-2' : ''}"><i class="fas fa-star fa-xs mr-1.5"></i>Expert</span>`;
    }
    // --- AKHIR PERBAIKAN 1 ---

    let contentHtml = `<p class="post-content-text text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap">${data.content || ''}</p>`;
    if (data.type === 'image' && data.imageUrl) {
        contentHtml += `<img src="${data.imageUrl}" alt="Post image" loading="lazy" class="mt-3 rounded-lg w-full h-auto max-h-96 object-contain border dark:border-gray-700">`;
    }
    if (data.type === 'poll' && data.poll) {
        const hasVoted = data.poll.voters?.includes(currentUser.uid);
        const pollOptionsHtml = data.poll.options.map((opt, index) => {
            const percentage = data.poll.totalVotes > 0 ? (opt.votes / data.poll.totalVotes) * 100 : 0;
            return `<div class="poll-option mt-2 p-2.5 border dark:border-gray-600 rounded-lg ${hasVoted ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'} relative" data-option-index="${index}"><div class="absolute top-0 left-0 h-full bg-primary-500/20 rounded-md transition-all duration-500" style="width: ${percentage}%;"></div><div class="relative flex justify-between text-sm font-medium"><span>${opt.text}</span>${hasVoted ? `<span class="font-bold">${Math.round(percentage)}%</span>` : ''}</div></div>`;
        }).join('');
        contentHtml += `<div class="mt-3 space-y-1">${pollOptionsHtml}<p class="text-xs text-gray-400 mt-2">${data.poll.totalVotes || 0} suara</p></div>`;
    }

    const optionsButtonHtml = isAuthor ? `<div class="relative"><button class="post-options-btn text-gray-400 hover:text-gray-600 dark:hover:text-white p-2 rounded-full" aria-label="Post options"><i class="fas fa-ellipsis-h"></i></button><div class="post-options-dropdown hidden absolute right-0 mt-2 w-36 bg-white dark:bg-gray-700 rounded-md shadow-lg z-10 border dark:border-gray-600"><button class="edit-post-btn w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"><i class="fas fa-pencil-alt w-4 mr-2"></i>Edit</button><button class="delete-post-btn w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"><i class="fas fa-trash-alt w-4 mr-2"></i>Hapus</button></div></div>` : '';

    card.innerHTML = `
        <div class="flex items-start space-x-3">
            <img alt="Avatar" class="w-10 h-10 rounded-full cursor-pointer object-cover" src="${data.authorAvatar}" data-user-id="${data.authorId}"/>
            <div class="flex-1">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center space-x-2">
                            <p class="font-semibold cursor-pointer hover:underline" data-user-id="${data.authorId}">${data.authorName}</p>
                            <span class="text-xs text-gray-400">· ${time}</span>
                        </div>
                        <div class="mt-1 flex items-center space-x-2">${badgesHtml}</div>
                    </div>
                    ${optionsButtonHtml}
                </div>
                ${contentHtml}
                <div class="flex items-center space-x-6 mt-3 text-gray-500">
                    <button class="like-btn post-action-button ${isLiked ? 'liked' : ''}" aria-label="Like post">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span class="text-xs ml-2 likes-count">${data.stats.likesCount || 0}</span>
                    </button>
                    <button class="comment-btn post-action-button" aria-label="Comment on post">
                        <i class="far fa-comment"></i>
                        <span class="text-xs ml-2 comments-count">${data.stats.commentsCount || 0}</span>
                    </button>
                </div>
            </div>
        </div>`;
    return card;
}

export function createCommentElement(comment) {
    const commentEl = document.createElement('div');
    commentEl.className = 'flex items-start space-x-3';
    const time = comment.createdAt?.seconds ? new Date(comment.createdAt.seconds * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
    commentEl.innerHTML = `<img src="${comment.authorAvatar}" alt="avatar" class="w-8 h-8 rounded-full object-cover"><div class="flex-1 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg"><div class="flex justify-between items-center"><p class="font-semibold text-sm hover:underline cursor-pointer" data-user-id="${comment.authorId}">${comment.authorName}</p><p class="text-xs text-gray-400">${time}</p></div><p class="text-sm mt-1 whitespace-pre-wrap">${comment.text}</p></div>`;
    commentEl.querySelector('[data-user-id]').addEventListener('click', (e) => {
        closeModal('comment-modal');
        loadScreen('user-profile', { userId: e.currentTarget.dataset.userId });
    });
    return commentEl;
}

export function createSignalCard(id, signal) {
    const card = document.createElement('div');
    card.id = `signal-card-${id}`;
    const isLocked = signal.isPremium && !currentUserData.isPremium && signal.status === 'Berjalan';
    card.className = `signal-card-v2 relative ${isLocked ? 'locked' : ''} transition-all duration-300 bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700`;
    const time = signal.createdAt ? new Date(signal.createdAt.seconds * 1000).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '...';
    const actionColor = signal.action === 'BUY' ? 'green' : 'red';
    const actionIcon = signal.action === 'BUY' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
    let signalContentHtml = '';
    if (signal.status === 'Selesai') {
        const resultClass = signal.result === 'Profit' ? 'text-green-500' : 'text-red-500';
        const resultIcon = signal.result === 'Profit' ? 'fa-check-circle' : 'fa-times-circle';
        signalContentHtml = `<div class="flex justify-between items-start"><div><span class="text-xs font-semibold px-2 py-1 rounded-full bg-${actionColor}-100 text-${actionColor}-800 dark:bg-${actionColor}-900/50 dark:text-${actionColor}-300">${signal.action}</span><h4 class="font-bold text-lg mt-1 text-gray-800 dark:text-white">${signal.pair}</h4><p class="text-xs text-gray-400">${time}</p></div><div class="text-right"><p class="font-bold text-lg ${resultClass}">${signal.result}</p><p class="text-xs text-gray-500 flex items-center justify-end"><i class="fas ${resultIcon} mr-1"></i> Selesai</p></div></div><div class="mt-3 pt-3 border-t dark:border-gray-700 grid grid-cols-2 gap-2 text-sm"><div><p class="text-xs text-gray-500">Entry</p><p class="font-semibold text-gray-700 dark:text-gray-300">${signal.entryPrice}</p></div><div class="text-right"><p class="text-xs text-gray-500">Close</p><p class="font-semibold text-gray-700 dark:text-gray-300">${signal.closePrice || '-'}</p></div></div>`;
    } else {
        const tpLevelsHtml = (signal.takeProfitLevels || []).map((tp, index) => `<div class="flex justify-between items-center text-sm py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"><span class="text-gray-500 dark:text-gray-400">Take Profit ${index + 1}</span><span class="font-semibold text-green-500">${tp}</span></div>`).join('');
        signalContentHtml = `<div class="flex justify-between items-center"><div class="flex items-center space-x-3"><div class="w-10 h-10 rounded-full bg-${actionColor}-100 dark:bg-${actionColor}-900/50 flex items-center justify-center"><i class="fas ${actionIcon} text-lg text-${actionColor}-600 dark:text-${actionColor}-300"></i></div><div><h4 class="font-bold text-lg text-gray-800 dark:text-white">${signal.pair}</h4><p class="text-xs text-gray-400">${time}</p></div></div><span class="text-xs text-blue-500 font-semibold bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-full">Berjalan</span></div><div class="mt-4 space-y-2"><div class="grid grid-cols-2 gap-4 text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><div><p class="text-xs text-gray-500">Entry Price</p><p class="font-semibold text-gray-700 dark:text-gray-300">${signal.entryPrice}</p></div><div class="text-right"><p class="text-xs text-gray-500">Stop Loss</p><p class="font-semibold text-red-500">${signal.stopLoss}</p></div></div><div class="pt-2">${tpLevelsHtml}</div></div>`;
    }
    card.innerHTML = `<div class="signal-content p-4">${signalContentHtml}</div>`;
    if (isLocked) {
        card.innerHTML += `<div class="lock-overlay absolute inset-0 bg-white/80 dark:bg-gray-800/80 flex flex-col items-center justify-center text-center p-4 rounded-2xl"><i class="fas fa-lock text-yellow-500 text-3xl mb-2"></i><p class="font-bold text-gray-800 dark:text-white">Sinyal Khusus Premium</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Upgrade akun Anda untuk melihat semua sinyal.</p><button class="upgrade-btn mt-4 bg-primary-600 text-white text-sm font-bold py-2 px-5 rounded-full hover:bg-primary-700 transition">Upgrade Sekarang</button></div>`;
    }
    return card;
}

// === INISIALISASI MODAL ===

export function initAllModals() {
    initPostCreationModal();
    initCommentModal();
    initEditPostModal();
    initDeletePostModal();
    initEditProfileModal();
    initUpgradePremiumModal();
    initForgotPasswordModal();
    initStoryViewerModal();
    initQuizModal();
}

function resetPostModal() {
    const modal = document.getElementById('post-modal');
    if (!modal) return;
    postModalState = { imageFile: null, postType: 'text' };
    modal.querySelector('#post-textarea').value = '';
    modal.querySelector('#image-file-input').value = '';
    modal.querySelector('#image-preview-container').classList.add('hidden');
    const pollArea = modal.querySelector('#poll-creation-area');
    pollArea.classList.add('hidden');
    const pollInputs = pollArea.querySelectorAll('.poll-option-input');
    pollInputs.forEach((input, index) => { if (index < 2) input.value = ''; });
    pollArea.querySelector('#more-poll-options').innerHTML = '';
    document.getElementById('submit-post-btn').disabled = true;
}

function initPostCreationModal() {
    const modal = document.getElementById('post-modal');
    if (!modal) return;
    const textarea = modal.querySelector('#post-textarea');
    const submitBtn = modal.querySelector('#submit-post-btn');
    const imagePreviewContainer = modal.querySelector('#image-preview-container');
    const pollCreationArea = modal.querySelector('#poll-creation-area');

    const updateSubmitButtonState = () => {
        const hasText = textarea.value.trim().length > 0;
        const hasImage = !!postModalState.imageFile;
        const hasPoll = pollCreationArea.querySelectorAll('.poll-option-input').length >= 2 && 
                        Array.from(pollCreationArea.querySelectorAll('.poll-option-input')).slice(0, 2).every(i => i.value.trim());
        submitBtn.disabled = !hasText && !hasImage && !hasPoll;
    };

    modal.querySelector('#close-post-modal-btn')?.addEventListener('click', () => closeModal('post-modal'));
    textarea.addEventListener('input', updateSubmitButtonState);
    modal.querySelector('#post-image-btn')?.addEventListener('click', () => modal.querySelector('#image-file-input').click());
    
    modal.querySelector('#image-file-input')?.addEventListener('change', async e => {
        if (e.target.files && e.target.files[0]) {
            postModalState.imageFile = await compressImage(e.target.files[0]);
            postModalState.postType = 'image';
            const reader = new FileReader();
            reader.onload = e => modal.querySelector('#image-preview').src = e.target.result;
            reader.readAsDataURL(postModalState.imageFile);
            imagePreviewContainer.classList.remove('hidden');
            updateSubmitButtonState();
        }
    });

    modal.querySelector('#remove-image-btn')?.addEventListener('click', () => {
        postModalState.imageFile = null;
        modal.querySelector('#image-file-input').value = '';
        imagePreviewContainer.classList.add('hidden');
        if (textarea.value.trim().length === 0) postModalState.postType = 'text';
        updateSubmitButtonState();
    });

    modal.querySelector('#post-poll-btn')?.addEventListener('click', () => {
        pollCreationArea.classList.toggle('hidden');
        postModalState.postType = pollCreationArea.classList.contains('hidden') ? 'text' : 'poll';
        updateSubmitButtonState();
    });

    modal.querySelector('#add-poll-option-btn')?.addEventListener('click', () => {
        const container = modal.querySelector('#more-poll-options');
        if (container.children.length < 2) { // Max 4 options total
            const div = document.createElement('div');
            div.className = 'relative mt-2';
            div.innerHTML = `<input type="text" class="poll-option-input w-full bg-gray-100 dark:bg-gray-700 p-2 rounded-lg text-sm" placeholder="Opsi Tambahan"><button class="remove-poll-option-btn absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">&times;</button>`;
            container.appendChild(div);
            div.querySelector('.remove-poll-option-btn').onclick = () => div.remove();
        }
    });

    submitBtn.addEventListener('click', async () => {
        const content = textarea.value.trim();
        const postData = { content, content_lowercase: content.toLowerCase(), type: 'text' };

        if (postModalState.imageFile) {
            postData.type = 'image';
        }
        if (!pollCreationArea.classList.contains('hidden')) {
            const options = Array.from(modal.querySelectorAll('.poll-option-input')).map(input => input.value.trim()).filter(Boolean);
            if (options.length < 2) return showMessage("Polling harus memiliki minimal 2 opsi.", 3000, true);
            postData.type = 'poll';
            postData.poll = { options: options.map(opt => ({ text: opt, votes: 0 })), totalVotes: 0, voters: [] };
        }

        setButtonLoading(submitBtn, true);
        try {
            if (postModalState.imageFile) {
                const storageRef = api.ref(api.storage, `posts/${currentUser.uid}/${Date.now()}_${postModalState.imageFile.name}`);
                const snapshot = await api.uploadBytes(storageRef, postModalState.imageFile);
                postData.imageUrl = await api.getDownloadURL(snapshot.ref);
            }
            await api.submitPost(postData, currentUserData);
            closeModal('post-modal');
        } catch (error) {
            showMessage(`Gagal memposting: ${error.message}`, 3000, true);
        } finally {
            setButtonLoading(submitBtn, false, 'Posting');
        }
    });
}

function initStoryViewerModal() {
    // Logika event listener untuk viewer story sekarang dikelola oleh community.js
}

// --- FUNGSI MODAL LAINNYA ---

function initCommentModal() {
    const modal = document.getElementById('comment-modal');
    if(!modal) return;
    modal.querySelector('#close-comment-modal-btn')?.addEventListener('click', () => closeModal('comment-modal'));
    const submitCommentBtn = modal.querySelector('#submit-comment-btn');
    const commentInput = modal.querySelector('#comment-input');
    commentInput.addEventListener('input', () => {
        commentInput.style.height = 'auto';
        commentInput.style.height = (commentInput.scrollHeight) + 'px';
        submitCommentBtn.disabled = commentInput.value.trim() === '';
    });
    const handleSubmit = async () => {
        const text = commentInput.value.trim();
        if (!text) return;
        const postId = modal.dataset.postId;
        if (!postId) return;
        submitCommentBtn.disabled = true;
        try {
            await api.submitComment(postId, text, currentUserData);
            commentInput.value = '';
            commentInput.style.height = 'auto';
            submitCommentBtn.disabled = true;
        } catch (error) {
            console.error("Gagal menambah komentar:", error);
            showMessage("Gagal mengirim komentar.", 3000, true);
        } finally {
            if (!commentInput.value.trim()) submitCommentBtn.disabled = false;
        }
    };
    submitCommentBtn.onclick = handleSubmit;
    commentInput.onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };
}

function initEditPostModal() {
    const modal = document.getElementById('edit-post-modal');
    if(!modal) return;
    modal.querySelector('#close-edit-post-modal-btn')?.addEventListener('click', () => closeModal('edit-post-modal'));
    modal.querySelector('#cancel-edit-post-btn')?.addEventListener('click', () => closeModal('edit-post-modal'));
    modal.querySelector('#save-post-changes-btn')?.addEventListener('click', async () => {
        const newContent = modal.querySelector('#edit-post-textarea').value.trim();
        if (!newContent) return showMessage("Postingan tidak boleh kosong.", 3000, true);
        const btn = modal.querySelector('#save-post-changes-btn');
        const postId = modal.dataset.postId;
        if (!postId) return;
        setButtonLoading(btn, true);
        try {
            const postRef = api.doc(api.db, "posts", postId);
            await api.updateDoc(postRef, { 
                content: newContent,
                content_lowercase: newContent.toLowerCase()
            });
            showMessage("Postingan berhasil diperbarui.");
            closeModal('edit-post-modal');
        } catch (error) {
            console.error("Gagal memperbarui postingan:", error);
            showMessage("Gagal menyimpan perubahan.", 3000, true);
        } finally {
            setButtonLoading(btn, false, 'Simpan');
        }
    });
}

function initDeletePostModal() {
    const modal = document.getElementById('delete-post-modal');
    if (!modal) return;
    modal.querySelector('#cancel-delete-post-btn')?.addEventListener('click', () => closeModal('delete-post-modal'));
    modal.querySelector('#confirm-delete-post-btn')?.addEventListener('click', async () => {
        const btn = modal.querySelector('#confirm-delete-post-btn');
        const postId = modal.dataset.postId;
        if (!postId) return;
        setButtonLoading(btn, true);
        try {
            const postRef = api.doc(api.db, "posts", postId);
            const postSnap = await api.getDoc(postRef);
            if (postSnap.exists() && postSnap.data().imageUrl) {
                const imageUrl = postSnap.data().imageUrl;
                const imageRef = api.ref(api.storage, imageUrl);
                await api.deleteObject(imageRef);
            }
            await api.deleteDoc(postRef);
            await api.updateDoc(api.doc(api.db, "users", currentUser.uid), { 'stats.posts': api.increment(-1) });
            showMessage("Postingan berhasil dihapus.");
            closeModal('delete-post-modal');
        } catch (error) {
            if (error.code === 'storage/object-not-found') {
                await api.deleteDoc(api.doc(api.db, "posts", postId));
                showMessage("Postingan berhasil dihapus.");
                closeModal('delete-post-modal');
            } else {
                showMessage("Gagal menghapus postingan.", 3000, true);
            }
        } finally {
            setButtonLoading(btn, false, 'Ya, Hapus');
        }
    });
}

function initEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if(!modal) return;
    const nameInput = modal.querySelector('#edit-name-input');
    const avatarPreview = modal.querySelector('#edit-avatar-preview');
    const avatarInput = modal.querySelector('#edit-avatar-input');
    const thumbnailPreview = modal.querySelector('#edit-thumbnail-preview');
    const thumbnailInput = modal.querySelector('#edit-thumbnail-input');
    const saveBtn = modal.querySelector('#save-profile-btn');
    const resetModalState = () => {
        newAvatarFile = null; newThumbnailFile = null;
        if (avatarInput) avatarInput.value = ''; 
        if (thumbnailInput) thumbnailInput.value = '';
        closeModal('edit-profile-modal');
    };
    modal.querySelector('#close-edit-profile-btn')?.addEventListener('click', resetModalState);
    modal.querySelector('#cancel-edit-profile-btn')?.addEventListener('click', resetModalState);
    avatarInput?.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            newAvatarFile = await compressImage(e.target.files[0], { maxWidth: 400, quality: 0.8 });
            const reader = new FileReader();
            reader.onload = (event) => { avatarPreview.src = event.target.result; };
            reader.readAsDataURL(newAvatarFile);
        }
    });
    thumbnailInput?.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            newThumbnailFile = await compressImage(e.target.files[0], { maxWidth: 1200, quality: 0.8 });
            const reader = new FileReader();
            reader.onload = (event) => { thumbnailPreview.src = event.target.result; };
            reader.readAsDataURL(newThumbnailFile);
        }
    });
    saveBtn?.addEventListener('click', async () => {
        const newName = nameInput.value.trim();
        if (!newName) return showMessage("Nama tidak boleh kosong.", 3000, true);
        setButtonLoading(saveBtn, true, 'Menyimpan...');
        try {
            const updateData = { name: newName, name_lowercase: newName.toLowerCase() };
            if (newAvatarFile) {
                const storageRef = api.ref(api.storage, `avatars/${currentUser.uid}/${Date.now()}_${newAvatarFile.name}`);
                const snapshot = await api.uploadBytes(storageRef, newAvatarFile);
                updateData.avatarUrl = await api.getDownloadURL(snapshot.ref);
            }
            if (newThumbnailFile) {
                const storageRef = api.ref(api.storage, `thumbnails/${currentUser.uid}/${Date.now()}_${newThumbnailFile.name}`);
                const snapshot = await api.uploadBytes(storageRef, newThumbnailFile);
                updateData.thumbnailUrl = await api.getDownloadURL(snapshot.ref);
            }
            const userRef = api.doc(api.db, "users", currentUser.uid);
            await api.updateDoc(userRef, updateData);
            Object.assign(currentUserData, updateData);
            showMessage("Profil berhasil diperbarui!");
            resetModalState();
            loadScreen('profile');
        } catch (error) {
            showMessage("Gagal menyimpan perubahan. Coba lagi.", 4000, true);
        } finally {
            setButtonLoading(saveBtn, false, 'Simpan');
        }
    });
}

async function fetchPaymentSettings() {
    if (paymentSettings) return paymentSettings;
    try {
        const settingsRef = api.doc(api.db, "settings", "payments");
        const docSnap = await api.getDoc(settingsRef);
        if (docSnap.exists()) {
            paymentSettings = docSnap.data();
            return paymentSettings;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function populatePremiumModal() {
    const settings = await fetchPaymentSettings();
    if (!settings) {
        showMessage("Gagal memuat detail paket.", 3000, true);
        return false;
    }
    const formatPrice = (price) => `Rp ${Number(price).toLocaleString('id-ID')}`;
    document.getElementById('price-weekly').textContent = formatPrice(settings.weeklyPrice);
    document.getElementById('price-monthly').textContent = formatPrice(settings.monthlyPrice);
    const badge = document.getElementById('discount-monthly-badge');
    const strikethrough = document.getElementById('price-monthly-strikethrough');
    if (settings.monthlyDiscountBadge) {
        badge.textContent = settings.monthlyDiscountBadge;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
    if (settings.monthlyStrikethroughPrice > 0) {
        strikethrough.textContent = formatPrice(settings.monthlyStrikethroughPrice);
        strikethrough.classList.remove('hidden');
    } else {
        strikethrough.classList.add('hidden');
    }
    document.getElementById('price-yearly').textContent = formatPrice(settings.yearlyPrice);
    return true;
}

function initUpgradePremiumModal() {
    const modal = document.getElementById('upgrade-premium-modal');
    if(!modal) return;
    let selectedPlan = null;
    let selectedUrl = null;
    modal.querySelector('#close-upgrade-modal-btn')?.addEventListener('click', () => closeModal('upgrade-premium-modal'));
    modal.querySelectorAll('.plan-option').forEach(option => {
        option.addEventListener('click', async () => {
            modal.querySelectorAll('.plan-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedPlan = option.dataset.plan;
            const settings = await fetchPaymentSettings();
            if (settings) {
                if (selectedPlan === 'weekly') selectedUrl = settings.weeklyUrl;
                if (selectedPlan === 'monthly') selectedUrl = settings.monthlyUrl;
                if (selectedPlan === 'yearly') selectedUrl = settings.yearlyUrl;
            }
        });
    });
    modal.querySelector('#proceed-payment-btn')?.addEventListener('click', async () => {
        if (!selectedPlan || !selectedUrl) {
            return showMessage('Silakan pilih salah satu paket terlebih dahulu.', 3000, true);
        }
        const btn = modal.querySelector('#proceed-payment-btn');
        setButtonLoading(btn, true, 'Memproses...');
        try {
            await api.initiatePaymentRequest(currentUser.uid, currentUserData.email, selectedPlan);
            showMessage('Anda akan diarahkan ke halaman pembayaran...');
            setTimeout(() => { window.location.href = selectedUrl; }, 1500);
        } catch (error) {
            showMessage('Gagal memulai pembayaran, silakan coba lagi.', 4000, true);
            setButtonLoading(btn, false, 'Lanjutkan Pembayaran');
        }
    });
}

function initForgotPasswordModal() {
    const modal = document.getElementById('forgot-password-modal');
    if(!modal) return;
    const emailInput = modal.querySelector('#reset-email-input');
    const sendBtn = modal.querySelector('#send-reset-link-btn');
    modal.querySelector('#cancel-reset-btn')?.addEventListener('click', () => {
        closeModal('forgot-password-modal');
        if(emailInput) emailInput.value = '';
    });
    sendBtn?.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        setButtonLoading(sendBtn, true);
        await sendPasswordReset(email);
        setButtonLoading(sendBtn, false, 'Kirim Link');
        closeModal('forgot-password-modal');
        emailInput.value = '';
    });
}

function initQuizModal() {
    const modal = document.getElementById('quiz-modal');
    if(!modal) return;
    modal.querySelector('#close-quiz-btn').onclick = () => closeModal('quiz-modal');
}

export function updateBottomNavActiveState(screenName) {
    const bottomNav = document.getElementById('bottom-nav');
    if (!bottomNav) return;
    const navItems = bottomNav.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active', 'text-primary-500');
    });
    if (screenName === 'content-viewer' || screenName === 'user-profile') {
        return;
    }
    const pageToTabMapping = {
        'event-detail': 'events',
    };
    const activeTab = pageToTabMapping[screenName] || screenName;
    const activeItem = bottomNav.querySelector(`.nav-item[data-target='${activeTab}']`);
    if (activeItem) {
        activeItem.classList.add('active', 'text-primary-500');
    }
}

export function setupSwipeableTabs({ tabButtons, contentPanels, addL, initialIndex = 0 }) {
    if (!tabButtons.length || !contentPanels.length || tabButtons.length !== contentPanels.length) return;
    const swipeContainer = contentPanels[0].parentElement;
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.width = `${contentPanels.length * 100}%`;
    wrapper.style.transition = 'transform 0.3s ease-out';
    contentPanels.forEach(panel => {
        panel.style.width = `${100 / contentPanels.length}%`;
        panel.style.flexShrink = '0';
        wrapper.appendChild(panel);
    });
    swipeContainer.innerHTML = '';
    swipeContainer.appendChild(wrapper);
    let currentIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let currentTranslate = 0;
    let isDragging = false;
    let scrollDirection = null;
    const onTouchStart = (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDragging = true;
        scrollDirection = null;
        wrapper.style.transition = 'none';
    };
    const onTouchMove = (e) => {
        if (!isDragging) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartX;
        const diffY = currentY - touchStartY;
        if (!scrollDirection) {
            if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
                scrollDirection = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical';
            }
        }
        if (scrollDirection === 'horizontal') {
            e.preventDefault();
            wrapper.style.transform = `translateX(${currentTranslate + diffX}px)`;
        }
    };
    const onTouchEnd = (e) => {
        if (!isDragging || scrollDirection !== 'horizontal') {
            isDragging = false;
            return;
        };
        isDragging = false;
        wrapper.style.transition = 'transform 0.3s ease-out';
        const diffX = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diffX) > 50) { 
            if (diffX < 0 && currentIndex < contentPanels.length - 1) {
                currentIndex++; 
            } else if (diffX > 0 && currentIndex > 0) {
                currentIndex--;
            }
        }
        goToPanel(currentIndex);
    };
    const goToPanel = (index) => {
        currentIndex = index;
        currentTranslate = -index * swipeContainer.offsetWidth;
        wrapper.style.transform = `translateX(${currentTranslate}px)`;
        tabButtons.forEach((btn, i) => btn.classList.toggle('active', i === index));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    tabButtons.forEach((btn, index) => {
        const clickHandler = () => goToPanel(index);
        btn.addEventListener('click', clickHandler);
        addL(() => btn.removeEventListener('click', clickHandler));
    });
    swipeContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    swipeContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    swipeContainer.addEventListener('touchend', onTouchEnd);
    addL(() => {
        swipeContainer.removeEventListener('touchstart', onTouchStart);
        swipeContainer.removeEventListener('touchmove', onTouchMove);
        swipeContainer.removeEventListener('touchend', onTouchEnd);
    });
    goToPanel(initialIndex);
}

export function createPaginationControls({ containerId, currentPage, hasNextPage, onNext, onPrev }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = !hasNextPage ? 'disabled' : '';
    container.innerHTML = `
        <div class="flex items-center justify-between">
            <button id="prev-page-btn" class="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed" ${prevDisabled}>Sebelumnya</button>
            <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Halaman ${currentPage}</span>
            <button id="next-page-btn" class="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed" ${nextDisabled}>Selanjutnya</button>
        </div>
    `;
    document.getElementById('prev-page-btn').addEventListener('click', onPrev);
    document.getElementById('next-page-btn').addEventListener('click', onNext);
}