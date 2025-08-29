// File: src/js/pages/home.js (REWORKED WITH FINAL AESTHETIC FIX)
// Versi: 4.7 - Gradient Outline Fix
// Deskripsi: Menyesuaikan padding kartu sinyal untuk menciptakan efek outline gradien.

import { currentUser, currentUserData } from '../auth.js';
import { loadScreen } from '../router.js';
import * as api from '../api.js';

export async function initPage(params, addL) {
    const contentWrapper = document.getElementById('home-content-wrapper');
    const welcomeMessageEl = document.getElementById('welcome-message');
    if (!contentWrapper || !welcomeMessageEl || !currentUserData) return;

    welcomeMessageEl.textContent = `Selamat Datang, ${currentUserData.name.split(' ')[0]}!`;

    document.getElementById('global-search-btn')?.addEventListener('click', () => loadScreen('search'));
    document.getElementById('notification-bell-btn')?.addEventListener('click', () => loadScreen('notifications-list'));

    checkPendingPayment();
    loadDynamicLayout(contentWrapper, addL);
}

async function loadDynamicLayout(container, addL) {
    container.innerHTML = createSkeletonLoader();

    try {
        const layoutDoc = await api.getDoc(api.doc(api.db, "homepageLayout", "main"));
        if (layoutDoc.exists() && layoutDoc.data().sections) {
            const sections = layoutDoc.data().sections;
            container.innerHTML = '';

            if (sections.length > 0) {
                for (const section of sections) {
                    const sectionElement = await createSectionElement(section, addL);
                    if (sectionElement) {
                        container.appendChild(sectionElement);
                    }
                }
            } else {
                container.innerHTML = '<p class="text-center text-gray-500 p-8">Selamat datang! Konten akan segera tersedia.</p>';
            }
        } else {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">Gagal memuat tata letak. Konfigurasi tidak ditemukan.</p>';
        }
    } catch (error) {
        console.error("Error loading dynamic layout:", error);
        container.innerHTML = '<p class="text-center text-red-500 p-8">Terjadi kesalahan saat memuat halaman.</p>';
    }
}

async function createSectionElement(sectionData, addL) {
    const sectionWrapper = document.createElement('div');
    sectionWrapper.className = 'space-y-6 animate-fadeIn';

    if (sectionData.title) {
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center';
        header.innerHTML = `<h2 class="text-lg font-bold text-gray-800 dark:text-white">${sectionData.title}</h2>`;

        if (sectionData.showSeeAllButton && sectionData.seeAllLink) {
            const seeAllBtn = document.createElement('button');
            seeAllBtn.textContent = 'Lihat Semua';
            seeAllBtn.className = 'text-sm font-semibold text-primary-500';
            seeAllBtn.onclick = () => loadScreen(sectionData.seeAllLink);
            header.appendChild(seeAllBtn);
        }
        sectionWrapper.appendChild(header);
    }

    const contentContainer = document.createElement('div');
    sectionWrapper.appendChild(contentContainer);

    const items = await fetchContent(sectionData);
    if (!items || items.length === 0) {
        if (sectionData.contentType !== 'banner') {
            return null;
        }
    }

    let layoutStyle = sectionData.layoutStyle;
    if (layoutStyle === 'carousel') layoutStyle = 'carousel-horizontal';
    if (layoutStyle === 'featured_item') layoutStyle = 'highlight-main';
    if (layoutStyle === 'grid') layoutStyle = 'grid-2-col';


    switch (layoutStyle) {
        case 'story-highlight':
            renderStoryHighlight(contentContainer, items, sectionData.contentType);
            break;
        case 'list-simple':
            renderListSimple(contentContainer, items, sectionData.contentType);
            break;
        case 'highlight-main':
            renderHighlightMain(contentContainer, items, sectionData.contentType);
            break;
        case 'grid-2-col':
            renderGrid2Col(contentContainer, items, sectionData.contentType);
            break;
        case 'carousel-horizontal':
            renderCarousel(contentContainer, items, sectionData.contentType);
            break;
        case 'banner-horizontal':
        case 'banner-vertical':
            renderBanner(contentContainer, items[0], layoutStyle);
            break;
        default:
            console.warn(`Layout style tidak dikenal: ${sectionData.layoutStyle}`);
            return null;
    }

    return sectionWrapper;
}

// --- FUNGSI RENDERER UNTUK SETIAP GAYA LAYOUT ---

/**
 * [DIPERBAIKI] Merender kartu sinyal dengan padding yang benar untuk efek outline.
 */
function renderStoryHighlight(container, items, type) {
    container.className = 'flex overflow-x-auto mobile-tab-scroll py-2';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'flex-shrink-0 cursor-pointer mx-2';
        card.onclick = () => navigateTo(type, item.id);

        const pair = (item.pair || 'N/A').toUpperCase();
        let pairTop = pair;
        let pairBottom = '';

        if (pair.length === 6) {
            pairTop = pair.substring(0, 3);
            pairBottom = pair.substring(3, 6);
        } else if (pair.includes('/')) {
            const parts = pair.split('/');
            pairTop = parts[0];
            pairBottom = parts[1] || '';
        }

        card.innerHTML = `
    <div class="signal-story-card p-0.5 rounded-xl shadow">
        <div class="flex flex-col items-center justify-center h-20 w-24 bg-white dark:bg-gray-800 rounded-lg">
            <span class="signal-pair-top">${pairTop}</span>
            ${pairBottom ? `<span class="signal-pair-bottom">${pairBottom}</span>` : ''}
        </div>
    </div>
`;
        container.appendChild(card);
    });
}

function renderListSimple(container, items, type) {
    container.className = 'space-y-3';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50';
        card.onclick = () => navigateTo(type, item.id);
        let imageUrl = item.thumbnailUrl || item.imageUrl || 'https://placehold.co/100x80/e0e0e0/333?text=...';
        card.innerHTML = `
            <img src="${imageUrl}" alt="${item.title}" class="w-20 h-16 rounded-md object-cover bg-gray-200 dark:bg-gray-700 flex-shrink-0">
            <div class="flex-grow overflow-hidden">
                <p class="font-bold truncate">${item.title || 'Judul Konten'}</p>
                <p class="text-xs text-gray-500 line-clamp-1">${item.description || ''}</p>
            </div>
            <i class="fas fa-chevron-right text-gray-400"></i>
        `;
        container.appendChild(card);
    });
}

function renderHighlightMain(container, items, type) {
    const mainItem = items[0];
    if (!mainItem) return;
    container.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden cursor-pointer';
    container.onclick = () => navigateTo(type, mainItem.id);
    let imageUrl = mainItem.imageUrl || mainItem.thumbnailUrl || 'https://placehold.co/400x200/e0e0e0/333?text=Highlight';
    container.innerHTML = `
        <div class="relative">
            <img src="${imageUrl}" alt="${mainItem.title}" class="w-full h-48 object-cover">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div class="absolute bottom-0 left-0 p-4">
                <h3 class="font-bold text-white text-lg">${mainItem.title}</h3>
            </div>
        </div>
    `;
}

function renderGrid2Col(container, items, type) {
    container.className = 'grid grid-cols-2 gap-4';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden cursor-pointer';
        card.onclick = () => navigateTo(type, item.id);
        let imageUrl = item.thumbnailUrl || item.imageUrl || 'https://placehold.co/200x120/e0e0e0/333?text=Grid';
        card.innerHTML = `
            <img src="${imageUrl}" alt="${item.title}" class="w-full h-24 object-cover">
            <div class="p-3">
                <p class="font-semibold text-sm line-clamp-2">${item.title}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderCarousel(container, items, type) {
    container.className = 'flex space-x-4 overflow-x-auto mobile-tab-scroll pb-2';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'w-48 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden cursor-pointer';
        card.onclick = () => navigateTo(type, item.id);
        let imageUrl = item.thumbnailUrl || item.imageUrl || 'https://placehold.co/200x120/e0e0e0/333?text=Carousel';
        card.innerHTML = `
            <img src="${imageUrl}" alt="${item.title}" class="w-full h-24 object-cover">
            <div class="p-3">
                <p class="font-semibold text-sm line-clamp-2">${item.title}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderBanner(container, item, style) {
    if (!item || !item.imageUrl) return;
    let classList = 'cursor-pointer rounded-lg overflow-hidden shadow-lg';
    if (style === 'banner-vertical') {
        classList += ' aspect-[3/4]';
    } else {
        classList += ' banner-mobile-horizontal md:aspect-video';
    }
    container.className = classList;
    container.onclick = () => { if(item.link) window.open(item.link, '_blank'); };
    container.innerHTML = `<img src="${item.imageUrl}" alt="Banner" class="w-full h-full object-cover">`;
}

// --- FUNGSI HELPERS (TIDAK ADA PERUBAHAN DI BAWAH INI) ---

async function fetchContent(sectionData) {
    const { contentType, contentSource, contentIds, limit } = sectionData;
    let items = [];
    try {
        if (contentType === 'banner') {
            return [{
                imageUrl: sectionData.layoutStyle === 'banner-horizontal' ? sectionData.horizontalImageUrl : sectionData.verticalImageUrl,
                link: sectionData.layoutStyle === 'banner-horizontal' ? sectionData.horizontalLink : sectionData.verticalLink
            }];
        }
        const collectionName = {
            'article': 'articles', 'video': 'videos', 'signal': 'signals',
            'event': 'events', 'course': 'courses'
        }[contentType];
        if (!collectionName) return [];
        if (contentSource === 'manual' && contentIds && contentIds.length > 0) {
            const docRefs = contentIds.map(id => api.doc(api.db, collectionName, id));
            const docSnaps = await Promise.all(docRefs.map(ref => api.getDoc(ref)));
            items = docSnaps.filter(snap => snap.exists()).map(snap => ({ id: snap.id, ...snap.data() }));
        } else {
            let q;
            const baseQuery = [api.collection(api.db, collectionName)];
            if (contentType === 'signal') {
                baseQuery.push(api.where("status", "==", "Berjalan"));
                baseQuery.push(api.orderBy("createdAt", "desc"));
            } else if (contentType === 'event') {
                 baseQuery.push(api.where("eventDate", ">=", new Date()));
                 baseQuery.push(api.orderBy("eventDate", "asc"));
            } else if (contentType === 'course') {
                baseQuery.push(api.orderBy("title", "asc"));
            } else {
                baseQuery.push(api.orderBy("createdAt", "desc"));
            }
            baseQuery.push(api.limit(limit || 5));
            q = api.query(...baseQuery);
            const querySnapshot = await api.getDocs(q);
            items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    } catch (error) {
        console.error(`Gagal mengambil konten untuk tipe ${contentType}:`, error);
    }
    return items;
}

function navigateTo(type, id) {
    const routes = {
        article: 'content-viewer', video: 'content-viewer', event: 'event-detail',
        signal: 'signals', course: 'education'
    };
    const params = {
        article: { contentType: 'article', contentId: id },
        video: { contentType: 'video', contentId: id },
        event: { eventId: id },
        signal: { signalId: id },
        course: { courseId: id }
    };
    if (routes[type]) {
        loadScreen(routes[type], params[type]);
    }
}

function createSkeletonLoader() {
    let skeleton = '';
    for (let i = 0; i < 3; i++) {
        skeleton += `
            <div class="space-y-3 animate-pulse">
                <div class="flex justify-between items-center">
                    <div class="skeleton h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div class="skeleton h-4 w-1/5 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
                <div class="skeleton h-32 w-full bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            </div>
        `;
    }
    return `<div class="p-4 space-y-6">${skeleton}</div>`;
}

async function checkPendingPayment() {
    const container = document.getElementById('payment-confirmation-container');
    if (!container || !currentUser) return;
    const q = api.query(
        api.collection(api.db, "paymentRequests"),
        api.where("userId", "==", currentUser.uid),
        api.where("status", "==", "pending"),
        api.orderBy("requestDate", "desc"),
        api.limit(1)
    );
    try {
        const snapshot = await api.getDocs(q);
        if (snapshot.empty) {
            container.classList.add('hidden');
        } else {
            container.innerHTML = `
                <div class="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-300 p-4 rounded-lg" role="alert">
                    <p class="font-bold">Menunggu Konfirmasi</p>
                    <p class="text-sm">Permintaan upgrade premium Anda sedang kami proses. Mohon tunggu konfirmasi dari admin.</p>
                </div>
            `;
            container.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Gagal memeriksa status pembayaran:", error);
    }
}