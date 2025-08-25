// File: src/js/pages/home.js
// Versi: 3.6 - Fix "Latest" Courses Query
// Perubahan:
// - Memodifikasi fetchContent untuk mengurutkan kursus berdasarkan 'title' jika sumbernya 'terbaru'.

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
    loadDynamicLayout(contentWrapper);
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
            container.innerHTML = ''; return;
        }

        const latestRequest = snapshot.docs[0].data();
        const hoursDiff = (new Date() - latestRequest.requestDate.toDate()) / (1000 * 60 * 60);

        if (hoursDiff < 24) {
            const settingsSnap = await api.getDoc(api.doc(api.db, "settings", "payments"));
            if (!settingsSnap.exists() || !settingsSnap.data().whatsappNumber) return;
            
            const adminWhatsappNumber = settingsSnap.data().whatsappNumber;
            const message = encodeURIComponent(`Halo Admin, saya sudah melakukan pembayaran untuk upgrade premium.\nEmail: ${currentUserData.email}\nMohon diproses. Terima kasih.`);
            
            container.innerHTML = `
                <div class="bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 px-4 py-3 rounded-lg text-center" role="alert">
                    <strong class="font-bold">Selesaikan Pembayaran!</strong>
                    <p class="text-sm">Pembayaran Anda menunggu konfirmasi. Hubungi Admin untuk mempercepat proses.</p>
                    <a href="https://wa.me/${adminWhatsappNumber}?text=${message}" target="_blank" class="mt-3 inline-block bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm">
                        <i class="fab fa-whatsapp mr-2"></i>Konfirmasi via WhatsApp
                    </a>
                </div>`;
        }
    } catch (error) {
        console.error("Gagal memeriksa pembayaran pending:", error);
    }
}

async function loadDynamicLayout(container) {
    container.innerHTML = '<div class="p-8 text-center"><i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i></div>';
    try {
        const layoutDoc = await api.getDoc(api.doc(api.db, "homepageLayout", "main"));
        if (!layoutDoc.exists() || !layoutDoc.data().sections || layoutDoc.data().sections.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">Tampilan beranda belum diatur.</p>';
            return;
        }
        container.innerHTML = '';
        const sections = layoutDoc.data().sections;
        for (const section of sections) {
            await renderSection(container, section);
        }
    } catch (error) {
        console.error("Gagal memuat layout beranda:", error);
        container.innerHTML = `<p class="text-center text-red-500 p-8">Gagal memuat beranda.</p>`;
    }
}

async function renderSection(container, sectionData) {
    const sectionContainer = document.createElement('div');
    sectionContainer.className = 'space-y-3 mb-6';
    
    let seeAllButtonHtml = '';
    if (sectionData.showSeeAllButton && sectionData.seeAllLink) {
        seeAllButtonHtml = `<button class="see-all-btn text-sm font-semibold text-primary-600 hover:underline" data-link="${sectionData.seeAllLink}">Lihat Semua</button>`;
    }

    const titleHtml = sectionData.title ? `
        <div class="flex justify-between items-center">
            <h3 class="font-semibold text-lg text-gray-700 dark:text-gray-200">${sectionData.title}</h3>
            ${seeAllButtonHtml}
        </div>
    ` : '';

    sectionContainer.innerHTML = titleHtml;
    const contentDiv = document.createElement('div');
    sectionContainer.appendChild(contentDiv);
    
    try {
        const items = await fetchContent(sectionData);
        if (items.length === 0) {
             contentDiv.innerHTML = `<p class="text-sm text-gray-500">Konten untuk bagian ini belum tersedia.</p>`;
        } else {
            renderContentByLayout(contentDiv, items, sectionData);
        }
        container.appendChild(sectionContainer);
        
        const seeAllBtn = sectionContainer.querySelector('.see-all-btn');
        seeAllBtn?.addEventListener('click', (e) => loadScreen(e.target.dataset.link));

    } catch (error) {
        console.error(`Gagal merender bagian "${sectionData.title}":`, error);
    }
}

async function fetchContent(sectionData) {
    const collectionMap = {
        article: 'articles', video: 'videos', ebook: 'ebooks', event: 'events',
        signal: 'signals', post: 'posts', banner: 'banners', course: 'courses'
    };
    const collectionName = collectionMap[sectionData.contentType];
    if (!collectionName) return [];

    if (sectionData.contentSource === 'manual' && sectionData.contentIds && sectionData.contentIds.length > 0) {
        const promises = sectionData.contentIds.map(id => api.getDoc(api.doc(api.db, collectionName, id)));
        const docs = await Promise.all(promises);
        return docs.filter(doc => doc.exists()).map(doc => ({ id: doc.id, ...doc.data() }));
    } else { // 'latest'
        // --- PERUBAHAN DIMULAI DI SINI ---
        // Logika untuk menentukan cara mengurutkan konten
        let orderByField = "createdAt";
        let orderByDirection = "desc";

        // Jika tipe konten adalah 'course', urutkan berdasarkan 'title' karena 'createdAt' mungkin tidak ada
        if (sectionData.contentType === 'course') {
            orderByField = "title";
            orderByDirection = "asc"; // Urutkan A-Z
        }

        const q = api.query(
            api.collection(api.db, collectionName), 
            api.orderBy(orderByField, orderByDirection), 
            api.limit(Number(sectionData.limit) || 4)
        );
        // --- PERUBAHAN SELESAI DI SINI ---
        
        const snapshot = await api.getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}

function renderContentByLayout(container, items, sectionData) {
    switch (sectionData.layoutStyle) {
        case 'carousel':
            container.className = 'flex items-stretch overflow-x-auto pb-4 -mx-4 px-4 space-x-4 mobile-tab-scroll';
            items.forEach(item => container.appendChild(createItemCard(item, sectionData.contentType, 'carousel')));
            break;
        case 'grid_2_column':
            container.className = 'grid grid-cols-2 gap-4';
            items.forEach(item => container.appendChild(createItemCard(item, sectionData.contentType, 'grid')));
            break;
        case 'grid_3_column':
            container.className = 'grid grid-cols-3 gap-3';
            items.forEach(item => container.appendChild(createItemCard(item, sectionData.contentType, 'grid_small')));
            break;
        case 'compact_list':
            container.className = 'space-y-2';
            items.forEach(item => container.appendChild(createItemCard(item, sectionData.contentType, 'compact_list')));
            break;
        case 'featured_item':
            container.className = 'space-y-3';
            if (items.length > 0) {
                container.appendChild(createItemCard(items[0], sectionData.contentType, 'featured'));
                const restItemsContainer = document.createElement('div');
                restItemsContainer.className = 'space-y-2';
                items.slice(1).forEach(item => restItemsContainer.appendChild(createItemCard(item, sectionData.contentType, 'compact_list')));
                container.appendChild(restItemsContainer);
            }
            break;
        case 'giant':
            container.className = '';
            if (items.length > 0) {
                container.appendChild(createItemCard(items[0], sectionData.contentType, 'giant'));
            }
            break;
        case 'vertical_list':
        default:
            container.className = 'space-y-3';
            items.forEach(item => container.appendChild(createItemCard(item, sectionData.contentType, 'list')));
            break;
    }
}


function createItemCard(item, type, layout) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md cursor-pointer hover:shadow-xl transition-shadow duration-300 overflow-hidden';
    let html = '';

    const placeholderImg = 'https://placehold.co/600x400/e0e0e0/333?text=SignalMax';
    const imageUrl = item.imageUrl || item.authorAvatar || placeholderImg;

    switch(type) {
        case 'signal':
            card.className = 'home-signal-card rounded-lg p-0.5 cursor-pointer'; 
            html = `
                <div class="bg-white dark:bg-gray-800 h-full w-full rounded-[7px] flex items-center justify-center p-3">
                    <p class="font-bold text-gray-800 dark:text-white text-lg">${item.pair || 'N/A'}</p>
                </div>`;
            break;
        case 'post':
            html = `
                <div class="p-3">
                    <div class="flex items-center space-x-2 mb-2">
                        <img src="${item.authorAvatar || placeholderImg}" class="w-8 h-8 rounded-full object-cover">
                        <p class="font-semibold text-sm text-gray-700 dark:text-gray-200">${item.authorName || 'Pengguna'}</p>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">${item.content || '...'}</p>
                </div>`;
            break;
        default: 
            if (layout === 'giant') {
                card.className = 'home-giant-card relative rounded-xl shadow-lg cursor-pointer overflow-hidden';
                html = `
                    <img src="${imageUrl}" alt="${item.title || type}" class="w-full h-full object-cover">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                    <div class="absolute bottom-0 left-0 p-4">
                        <h3 class="text-white font-bold text-2xl">${item.title || 'Konten'}</h3>
                    </div>
                `;
            } else if (layout === 'carousel') {
                card.classList.add('w-48', 'flex-shrink-0');
                html = `<img src="${imageUrl}" alt="${item.title || type}" class="w-full h-24 object-cover"><div class="p-2"><p class="font-semibold text-sm line-clamp-2">${item.title || 'Konten'}</p></div>`;
            } else if (layout === 'grid') {
                html = `<img src="${imageUrl}" alt="${item.title || type}" class="w-full h-28 object-cover"><div class="p-3"><p class="font-bold text-sm line-clamp-2">${item.title || 'Konten'}</p></div>`;
            } else if (layout === 'compact_list') {
                html = `<div class="flex items-center p-2 gap-3"><img src="${imageUrl}" class="w-12 h-12 rounded-md object-cover flex-shrink-0"><p class="font-semibold text-sm flex-grow">${item.title || 'Konten'}</p><i class="fas fa-chevron-right text-gray-400"></i></div>`;
            } else { // list
                html = `<div class="flex items-center p-3 gap-4"><img src="${imageUrl}" class="w-20 h-16 rounded-lg object-cover"><div class="flex-grow"><p class="font-bold">${item.title || 'Konten'}</p><p class="text-xs text-gray-500 line-clamp-1">${item.description || ''}</p></div></div>`;
            }
            break;
    }

    card.innerHTML = html;

    switch(type) {
        case 'article': case 'video': case 'ebook':
            card.onclick = () => loadScreen('content-viewer', { contentType: type, contentId: item.id }); break;
        case 'event':
            card.onclick = () => loadScreen('event-detail', { eventId: item.id }); break;
        case 'signal':
            card.onclick = () => loadScreen('signals', { signalId: item.id }); break;
        case 'post':
            card.onclick = () => loadScreen('community', { postId: item.id }); break;
        case 'banner':
            card.onclick = () => { if(item.link) window.open(item.link, '_blank'); }; break;
        case 'course':
            card.onclick = () => loadScreen('education', { courseId: item.id }); break;
        default:
            card.onclick = () => console.log("Clicked:", item);
    }
    
    return card;
}
