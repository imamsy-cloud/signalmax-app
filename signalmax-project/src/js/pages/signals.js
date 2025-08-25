// File: src/js/pages/signals.js
// Versi Perbaikan: 3.7 (Fix History Highlight from Notification Deep Link)
// Perubahan:
// - Menambahkan fungsi baru `findAndLoadHistorySignal` untuk secara rekursif memuat
//   halaman riwayat hingga sinyal yang dituju ditemukan di DOM.
// - Memperbarui `displaySpecificSignal` untuk menggunakan fungsi baru ini,
//   mengatasi masalah paginasi saat membuka dari notifikasi atau link langsung.

import { currentUserData } from '../auth.js';
import { loadScreen } from '../router.js';
import { createSignalSkeleton, createSignalCard, showMessage, setCircleDashoffset, setupSwipeableTabs, setButtonLoading, openModal } from '../ui.js';
import * as api from '../api.js';

const SIGNALS_PER_PAGE = 5;
let historyLastVisibleDoc = null;
let historyIsLoading = false;
let allHistoryLoaded = false;
let activeSignalsUnsubscribe = null;
let performanceUnsubscribe = null;

/**
 * Fungsi inisialisasi untuk halaman Sinyal.
 */
export function initPage(params, addL) {
    if (activeSignalsUnsubscribe) activeSignalsUnsubscribe();
    if (performanceUnsubscribe) performanceUnsubscribe();

    resetHistoryState();

    if (params.signalId) {
        displaySpecificSignal(params.signalId, addL);
    } else {
        loadNormalPage(addL);
    }
    
    loadPerformanceStats(addL);

    const signalsContainer = document.getElementById('signals-swipe-container');
    if (signalsContainer) {
        const clickHandler = (e) => {
            if (e.target.closest('.upgrade-btn')) {
                openModal('upgrade-premium-modal');
            }
        };
        signalsContainer.addEventListener('click', clickHandler);
        addL(() => signalsContainer.removeEventListener('click', clickHandler));
    }
}

/**
 * Memuat halaman sinyal secara normal (tanpa highlight).
 */
function loadNormalPage(addL) {
    const listBerjalan = document.getElementById('list-berjalan');
    const listRiwayat = document.getElementById('list-riwayat');
    const historyPanel = document.getElementById('history-panel');
    if (!listBerjalan || !listRiwayat || !historyPanel) return;

    listBerjalan.innerHTML = createSkeletons(3);
    listRiwayat.innerHTML = createSkeletons(3);

    const tabButtons = [document.getElementById('tab-berjalan'), document.getElementById('tab-riwayat')];
    const contentPanels = [listBerjalan, historyPanel];
    setupSwipeableTabs({ tabButtons, contentPanels, addL });

    loadActiveSignals(listBerjalan, addL);
    loadHistorySignals(listRiwayat, true, addL);
}

/**
 * [FIXED] Menampilkan sinyal spesifik dan memastikan sinyal riwayat dimuat
 * meskipun berada di halaman selanjutnya.
 */
async function displaySpecificSignal(signalId, addL) {
    const listBerjalan = document.getElementById('list-berjalan');
    const listRiwayat = document.getElementById('list-riwayat');
    const historyPanel = document.getElementById('history-panel');
    const tabButtons = [document.getElementById('tab-berjalan'), document.getElementById('tab-riwayat')];
    const contentPanels = [listBerjalan, historyPanel];

    listBerjalan.innerHTML = createSkeletons(3);
    listRiwayat.innerHTML = createSkeletons(3);

    try {
        const signalRef = api.doc(api.db, "signals", signalId);
        const signalSnap = await api.getDoc(signalRef);

        if (!signalSnap.exists()) {
            showMessage("Sinyal tidak ditemukan.", 3000, true);
            loadNormalPage(addL);
            return;
        }

        const signalData = signalSnap.data();
        const isHistory = signalData.status === 'Selesai';
        const initialIndex = isHistory ? 1 : 0;

        // Selalu muat sinyal aktif di latar belakang.
        loadActiveSignals(listBerjalan, addL);

        // --- LOGIKA PERBAIKAN UTAMA ---
        if (isHistory) {
            // Jika sinyal ada di riwayat, panggil fungsi khusus untuk memuat halaman
            // secara berulang hingga sinyal yang dituju ditemukan.
            const found = await findAndLoadHistorySignal(signalId, listRiwayat, addL);
            if (!found) {
                 showMessage("Sinyal riwayat tidak ditemukan setelah memuat semua data.", 4000, true);
                 // Muat ulang halaman pertama sebagai fallback jika tidak ditemukan
                 await loadHistorySignals(listRiwayat, true, addL);
            }
        } else {
            // Jika sinyal aktif, cukup muat halaman pertama riwayat di latar belakang.
            loadHistorySignals(listRiwayat, true, addL);
        }
        // --- AKHIR PERBAIKAN ---

        setupSwipeableTabs({ tabButtons, contentPanels, addL, initialIndex });
        highlightSignal(signalId);

    } catch (error) {
        console.error("Gagal memuat sinyal spesifik:", error);
        showMessage("Gagal memuat detail sinyal.", 3000, true);
        loadNormalPage(addL);
    }
}

/**
 * [BARU] Fungsi rekursif untuk memuat halaman riwayat hingga sinyal target ditemukan.
 */
async function findAndLoadHistorySignal(signalId, container, addL) {
    resetHistoryState(); // Mulai dari awal
    container.innerHTML = createSkeletons(5);
    
    const MAX_PAGES_TO_LOAD = 20; // Pengaman agar tidak terjadi infinite loop
    let isInitial = true;

    for (let i = 0; i < MAX_PAGES_TO_LOAD; i++) {
        // Muat satu halaman riwayat
        await loadHistorySignals(container, isInitial, addL);
        isInitial = false; // Panggilan selanjutnya akan menambahkan data

        // Cek apakah kartu sinyal yang dicari sudah ada di dalam halaman
        const signalCard = document.getElementById(`signal-card-${signalId}`);
        if (signalCard) {
            return true; // Berhasil ditemukan
        }

        // Jika semua riwayat sudah dimuat dan sinyal tidak ditemukan, berhenti.
        if (allHistoryLoaded) {
            return false; // Gagal ditemukan
        }
    }

    console.warn(`Pencarian sinyal ${signalId} dihentikan setelah ${MAX_PAGES_TO_LOAD} halaman.`);
    return false; // Gagal ditemukan setelah batas maksimal
}


function highlightSignal(signalId) {
    const checkInterval = setInterval(() => {
        const signalCard = document.getElementById(`signal-card-${signalId}`);
        if (signalCard) {
            clearInterval(checkInterval);
            
            setTimeout(() => {
                signalCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                signalCard.classList.add('highlight');
                signalCard.addEventListener('animationend', () => {
                    signalCard.classList.remove('highlight');
                }, { once: true });
            }, 400);
        }
    }, 100);

    setTimeout(() => clearInterval(checkInterval), 3000); // Tingkatkan timeout untuk keamanan
}


function resetHistoryState() {
    historyLastVisibleDoc = null;
    allHistoryLoaded = false;
    historyIsLoading = false;
}

function createSkeletons(count) {
    let skeletons = '';
    for (let i = 0; i < count; i++) {
        skeletons += createSignalSkeleton().outerHTML;
    }
    return skeletons;
}

function loadActiveSignals(container, addL) {
    const q = api.query(
        api.collection(api.db, "signals"),
        api.where("status", "==", "Berjalan"),
        api.orderBy("createdAt", "desc")
    );
    activeSignalsUnsubscribe = api.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">Tidak ada sinyal yang sedang aktif.</p>`;
        } else {
            snapshot.forEach(doc => {
                container.appendChild(createSignalCard(doc.id, doc.data()));
            });
        }
    });
    addL(activeSignalsUnsubscribe);
}

async function loadHistorySignals(container, isInitialLoad, addL) {
    if (historyIsLoading || allHistoryLoaded) return;
    historyIsLoading = true;

    const loadMoreBtn = document.getElementById('load-more-history-btn');
    if (loadMoreBtn && !isInitialLoad) setButtonLoading(loadMoreBtn, true, 'Memuat...');

    try {
        let q = api.query(
            api.collection(api.db, "signals"),
            api.where("status", "==", "Selesai"),
            api.orderBy("createdAt", "desc"),
            api.limit(SIGNALS_PER_PAGE)
        );

        if (!isInitialLoad && historyLastVisibleDoc) {
            q = api.query(q, api.startAfter(historyLastVisibleDoc));
        }

        const snapshot = await api.getDocs(q);

        if (isInitialLoad) {
            container.innerHTML = '';
        }

        if (snapshot.empty) {
            allHistoryLoaded = true;
            if (isInitialLoad) {
                container.innerHTML = `<p class="text-center text-gray-500 py-8">Tidak ada riwayat sinyal.</p>`;
            }
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            return;
        }

        historyLastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach(doc => {
            container.appendChild(createSignalCard(doc.id, doc.data()));
        });
        
        if (snapshot.size < SIGNALS_PER_PAGE) {
            allHistoryLoaded = true;
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        } else {
            if (loadMoreBtn) loadMoreBtn.style.display = 'block';
        }

    } catch (error) {
        console.error("Gagal memuat riwayat sinyal:", error);
        showMessage("Gagal memuat riwayat sinyal.", 3000, true);
    } finally {
        historyIsLoading = false;
        if (loadMoreBtn) {
            setButtonLoading(loadMoreBtn, false, 'Muat Lebih Banyak');
            // Pastikan listener hanya ditambahkan sekali atau diperbarui
            const newBtn = loadMoreBtn.cloneNode(true);
            loadMoreBtn.parentNode.replaceChild(newBtn, loadMoreBtn);
            newBtn.addEventListener('click', () => loadHistorySignals(container, false, addL));
        }
    }
}

function loadPerformanceStats(addL) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const q = api.query(
        api.collection(api.db, "signals"),
        api.where("status", "==", "Selesai"),
        api.where("createdAt", ">=", thirtyDaysAgo)
    );

    performanceUnsubscribe = api.onSnapshot(q, (snapshot) => {
        let profitCount = 0;
        let lossCount = 0;

        snapshot.forEach(doc => {
            const signal = doc.data();
            if (signal.result === 'Profit') {
                profitCount++;
            } else if (signal.result === 'Loss') {
                lossCount++;
            }
        });

        const total = profitCount + lossCount;
        const winrate = total > 0 ? Math.round((profitCount / total) * 100) : 0;

        const winrateValEl = document.getElementById('winrate-text-val');
        const profitCountEl = document.getElementById('profit-count');
        const lossCountEl = document.getElementById('loss-count');
        const circleEl = document.getElementById('win-rate-circle');

        if(winrateValEl) winrateValEl.textContent = `${winrate}%`;
        if(profitCountEl) profitCountEl.textContent = `${profitCount} Sinyal`;
        if(lossCountEl) lossCountEl.textContent = `${lossCount} Sinyal`;
        if(circleEl) setCircleDashoffset(circleEl, winrate);
    });
    addL(performanceUnsubscribe);
}
