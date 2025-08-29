// File: src/js/dashboard/settings.js (REWORKED WITH FIXES)
// Versi: 2.1 - Perbaikan Unggah Banner & Validasi Judul
// Deskripsi: Logika baru untuk alur kerja pengaturan beranda yang lebih visual.

import * as api from '../api.js';
import { showMessage, setButtonLoading, openModal, closeModal, compressImage } from '../ui.js';

// --- STATE GLOBAL ---
let sortable = null;
let currentSectionData = {}; 
let isEditing = false;
let editingElement = null;
// [FIX 2] Variabel untuk menyimpan file banner baru
let newBannerFiles = { horizontal: null, vertical: null };

// --- KONSTANTA & DEFINISI ---

const CONTENT_TYPES = {
    signal: { name: 'Sinyal Trading', icon: 'fa-chart-line', layoutStyles: ['story-highlight', 'list-simple'] },
    article: { name: 'Artikel', icon: 'fa-newspaper', layoutStyles: ['highlight-main', 'grid-2-col', 'list-simple'] },
    video: { name: 'Video', icon: 'fa-video', layoutStyles: ['highlight-main', 'carousel-horizontal', 'grid-2-col'] },
    event: { name: 'Event', icon: 'fa-calendar-alt', layoutStyles: ['highlight-main', 'list-simple'] },
    course: { name: 'Edukasi', icon: 'fa-graduation-cap', layoutStyles: ['carousel-horizontal', 'grid-2-col'] },
    banner: { name: 'Banner Promosi', icon: 'fa-image', layoutStyles: ['banner-horizontal', 'banner-vertical'] }
};

const LAYOUT_STYLES = {
    'story-highlight': { name: 'Sorotan (Gaya Story)', preview: 'https://placehold.co/300x200/dcfce7/166534?text=Gaya+Story' },
    'list-simple': { name: 'Daftar Sederhana', preview: 'https://placehold.co/300x200/e0e7ff/3730a3?text=Daftar' },
    'highlight-main': { name: 'Sorotan Utama', preview: 'https://placehold.co/300x200/feefc7/92400e?text=Sorotan+Utama' },
    'grid-2-col': { name: 'Grid 2 Kolom', preview: 'https://placehold.co/300x200/f3e8ff/6b21a8?text=Grid+2+Kolom' },
    'carousel-horizontal': { name: 'Carousel Horizontal', preview: 'https://placehold.co/300x200/ffe4e6/9f1239?text=Carousel' },
    'banner-horizontal': { name: 'Banner Horizontal', preview: 'https://placehold.co/300x150/dbeafe/1e40af?text=Banner+Horizontal' },
    'banner-vertical': { name: 'Banner Vertikal', preview: 'https://placehold.co/200x300/fee2e2/991b1b?text=Banner+Vertikal' }
};

// --- INISIALISASI HALAMAN ---

export function initPage(params, addL) {
    loadHomepageLayout(addL);
    setupEventListeners(addL);
    setupModals(addL);
}

// --- FUNGSI UTAMA ---

async function loadHomepageLayout(addL) {
    const container = document.getElementById('homepage-layout-list');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500">Memuat layout...</p>';

    try {
        const layoutDoc = await api.getDoc(api.doc(api.db, "homepageLayout", "main"));
        container.innerHTML = '';
        if (layoutDoc.exists() && layoutDoc.data().sections) {
            const sections = layoutDoc.data().sections;
            if (sections.length > 0) {
                sections.forEach(section => container.appendChild(createSectionElement(section, addL)));
            } else {
                container.innerHTML = '<p class="text-gray-500 text-center p-4">Belum ada bagian. Klik "Tambah Bagian" untuk memulai.</p>';
            }
        } else {
            container.innerHTML = '<p class="text-gray-500 text-center p-4">Belum ada bagian. Klik "Tambah Bagian" untuk memulai.</p>';
        }
    } catch (error) {
        console.error("Gagal memuat layout:", error);
        container.innerHTML = '<p class="text-red-500">Gagal memuat tata letak.</p>';
    }

    if (sortable) sortable.destroy();
    sortable = new Sortable(container, {
        animation: 150,
        ghostClass: 'bg-blue-100'
    });
}

function setupEventListeners(addL) {
    const addSectionBtn = document.getElementById('add-section-btn');
    const saveLayoutBtn = document.getElementById('save-layout-btn');

    const addSectionHandler = () => {
        isEditing = false;
        editingElement = null;
        currentSectionData = {};
        newBannerFiles = { horizontal: null, vertical: null }; // Reset file
        openModal('select-content-type-modal');
    };
    
    const saveLayoutHandler = () => handleSaveLayout();

    addSectionBtn?.addEventListener('click', addSectionHandler);
    saveLayoutBtn?.addEventListener('click', saveLayoutHandler);

    addL(() => {
        addSectionBtn?.removeEventListener('click', addSectionHandler);
        saveLayoutBtn?.removeEventListener('click', saveLayoutHandler);
    });
}

function setupModals(addL) {
    const contentTypeGrid = document.getElementById('content-type-grid');
    contentTypeGrid.innerHTML = ''; 

    for (const type in CONTENT_TYPES) {
        const info = CONTENT_TYPES[type];
        const button = document.createElement('button');
        button.className = 'p-4 border rounded-lg flex flex-col items-center justify-center text-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';
        button.dataset.type = type;
        button.innerHTML = `<i class="fas ${info.icon} text-3xl mb-2 text-primary-500"></i><span class="font-semibold">${info.name}</span>`;
        
        button.addEventListener('click', () => {
            currentSectionData = { contentType: type };
            populateConfigureModal(type);
            closeModal('select-content-type-modal');
            openModal('configure-section-modal');
        });
        contentTypeGrid.appendChild(button);
    }

    const saveSectionBtn = document.getElementById('save-section-btn');
    const saveSectionHandler = () => handleSaveSection(); // handleSaveSection sekarang async
    saveSectionBtn?.addEventListener('click', saveSectionHandler);
    addL(() => saveSectionBtn?.removeEventListener('click', saveSectionHandler));

    const contentSourceRadios = document.querySelectorAll('input[name="contentSource"]');
    contentSourceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('content-ids-container').classList.toggle('hidden', e.target.value !== 'manual');
        });
    });

    const seeAllCheckbox = document.getElementById('show-see-all-button');
    seeAllCheckbox?.addEventListener('change', (e) => {
        document.getElementById('see-all-link-container').classList.toggle('hidden', !e.target.checked);
    });

    // [FIX 2] Listener untuk input file banner
    document.getElementById('banner-horizontal-image')?.addEventListener('change', (e) => {
        if (e.target.files[0]) newBannerFiles.horizontal = e.target.files[0];
    });
    document.getElementById('banner-vertical-image')?.addEventListener('change', (e) => {
        if (e.target.files[0]) newBannerFiles.vertical = e.target.files[0];
    });
}

function populateConfigureModal(contentType) {
    const config = CONTENT_TYPES[contentType];
    if (!config) return;

    document.getElementById('section-config-form').reset();
    document.getElementById('content-ids-container').classList.add('hidden');
    document.getElementById('see-all-link-container').classList.add('hidden');
    newBannerFiles = { horizontal: null, vertical: null }; // Reset file saat modal dibuka
    
    document.getElementById('configure-modal-title').textContent = `Konfigurasi Bagian: ${config.name}`;

    const isBanner = contentType === 'banner';
    document.getElementById('banner-config-container').classList.toggle('hidden', !isBanner);
    document.getElementById('content-source-container').classList.toggle('hidden', isBanner);
    document.getElementById('limit').parentElement.classList.toggle('hidden', isBanner);
    document.getElementById('show-see-all-button').parentElement.parentElement.classList.toggle('hidden', isBanner);

    const picker = document.getElementById('layout-style-picker');
    picker.innerHTML = '';
    config.layoutStyles.forEach((styleId, index) => {
        const styleInfo = LAYOUT_STYLES[styleId];
        const div = document.createElement('div');
        div.className = 'border-2 border-transparent rounded-lg p-2 cursor-pointer hover:border-primary-500';
        div.dataset.styleId = styleId;
        div.innerHTML = `
            <img src="${styleInfo.preview}" alt="${styleInfo.name}" class="w-full h-auto object-cover rounded-md mb-2">
            <p class="text-sm font-medium text-center">${styleInfo.name}</p>
        `;
        picker.appendChild(div);

        if (index === 0) {
            div.classList.add('selected', 'border-primary-500');
            currentSectionData.layoutStyle = styleId;
        }
    });

    picker.addEventListener('click', (e) => {
        const selectedStyle = e.target.closest('[data-style-id]');
        if (!selectedStyle) return;

        picker.querySelectorAll('[data-style-id]').forEach(el => {
            el.classList.remove('selected', 'border-primary-500');
        });
        selectedStyle.classList.add('selected', 'border-primary-500');
        currentSectionData.layoutStyle = selectedStyle.dataset.styleId;
    });
}

function createSectionElement(sectionData, addL) {
    const li = document.createElement('li');
    li.className = 'p-3 border rounded-lg flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 cursor-grab';
    li.dataset.section = JSON.stringify(sectionData);

    const contentTypeInfo = CONTENT_TYPES[sectionData.contentType] || { name: 'Unknown', icon: 'fa-question-circle' };
    const layoutStyleInfo = LAYOUT_STYLES[sectionData.layoutStyle] || { name: 'Unknown' };

    li.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fas fa-grip-vertical text-gray-400"></i>
            <i class="fas ${contentTypeInfo.icon} text-primary-500 w-5 text-center"></i>
            <div>
                <p class="font-semibold">${sectionData.title || '(Tanpa Judul)'}</p>
                <p class="text-xs text-gray-500">${contentTypeInfo.name} / ${layoutStyleInfo.name}</p>
            </div>
        </div>
        <div class="flex items-center gap-3">
            <button class="edit-section-btn text-blue-500 hover:text-blue-700"><i class="fas fa-edit"></i></button>
            <button class="delete-section-btn text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
        </div>
    `;

    li.querySelector('.delete-section-btn').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus bagian "${sectionData.title || 'Tanpa Judul'}"?`)) {
            li.remove();
        }
    });

    li.querySelector('.edit-section-btn').addEventListener('click', () => {
        handleEditSection(sectionData, li);
    });

    return li;
}

// --- HANDLER AKSI ---

function handleEditSection(sectionData, element) {
    isEditing = true;
    editingElement = element;
    currentSectionData = { ...sectionData };
    newBannerFiles = { horizontal: null, vertical: null }; // Reset file

    populateConfigureModal(sectionData.contentType);

    document.getElementById('section-title').value = sectionData.title || '';
    
    if (sectionData.contentType !== 'banner') {
        const sourceRadio = document.querySelector(`input[name="contentSource"][value="${sectionData.contentSource || 'latest'}"]`);
        if (sourceRadio) sourceRadio.checked = true;
        document.getElementById('content-ids-container').classList.toggle('hidden', (sectionData.contentSource || 'latest') !== 'manual');
        document.getElementById('content-ids').value = (sectionData.contentIds || []).join(', ');
        document.getElementById('limit').value = sectionData.limit || 5;
        
        const seeAllCheckbox = document.getElementById('show-see-all-button');
        seeAllCheckbox.checked = sectionData.showSeeAllButton || false;
        document.getElementById('see-all-link-container').classList.toggle('hidden', !sectionData.showSeeAllButton);
        document.getElementById('see-all-link').value = sectionData.seeAllLink || '';
    } else {
        document.getElementById('banner-horizontal-link').value = sectionData.horizontalLink || '';
        document.getElementById('banner-vertical-link').value = sectionData.verticalLink || '';
    }

    const picker = document.getElementById('layout-style-picker');
    picker.querySelectorAll('[data-style-id]').forEach(el => {
        el.classList.remove('selected', 'border-primary-500');
        if (el.dataset.styleId === sectionData.layoutStyle) {
            el.classList.add('selected', 'border-primary-500');
        }
    });

    openModal('configure-section-modal');
}

// [FIX 2] Fungsi diubah menjadi async untuk menangani upload file
async function handleSaveSection() {
    const saveBtn = document.getElementById('save-section-btn');
    const title = document.getElementById('section-title').value.trim();
    
    // [FIX 3] Validasi judul menjadi opsional untuk banner
    if (!title && currentSectionData.contentType !== 'banner') {
        return showMessage("Judul bagian wajib diisi.", 3000, true);
    }
    if (!currentSectionData.layoutStyle) {
        return showMessage("Pilih gaya tampilan terlebih dahulu.", 3000, true);
    }

    setButtonLoading(saveBtn, true);

    const data = {
        ...currentSectionData,
        title: title,
    };
    
    try {
        if (data.contentType !== 'banner') {
            data.contentSource = document.querySelector('input[name="contentSource"]:checked').value;
            data.contentIds = document.getElementById('content-ids').value.split(',').map(id => id.trim()).filter(Boolean);
            data.limit = Number(document.getElementById('limit').value) || 5;
            data.showSeeAllButton = document.getElementById('show-see-all-button').checked;
            data.seeAllLink = document.getElementById('see-all-link').value.trim();
        } else {
            data.horizontalLink = document.getElementById('banner-horizontal-link').value.trim();
            data.verticalLink = document.getElementById('banner-vertical-link').value.trim();

            // [FIX 2] Logika Unggah Gambar Banner
            if (newBannerFiles.horizontal) {
                const compressedFile = await compressImage(newBannerFiles.horizontal, { quality: 0.8, maxWidth: 1280 });
                const storageRef = api.ref(api.storage, `homepage_banners/horizontal_${Date.now()}`);
                const snapshot = await api.uploadBytes(storageRef, compressedFile);
                data.horizontalImageUrl = await api.getDownloadURL(snapshot.ref);
            } else if (isEditing) {
                data.horizontalImageUrl = currentSectionData.horizontalImageUrl || '';
            }

            if (newBannerFiles.vertical) {
                const compressedFile = await compressImage(newBannerFiles.vertical, { quality: 0.8, maxWidth: 800 });
                const storageRef = api.ref(api.storage, `homepage_banners/vertical_${Date.now()}`);
                const snapshot = await api.uploadBytes(storageRef, compressedFile);
                data.verticalImageUrl = await api.getDownloadURL(snapshot.ref);
            } else if (isEditing) {
                data.verticalImageUrl = currentSectionData.verticalImageUrl || '';
            }
        }

        if (isEditing && editingElement) {
            editingElement.dataset.section = JSON.stringify(data);
            const contentTypeInfo = CONTENT_TYPES[data.contentType] || { name: 'Unknown', icon: 'fa-question-circle' };
            const layoutStyleInfo = LAYOUT_STYLES[data.layoutStyle] || { name: 'Unknown' };
            editingElement.querySelector('.font-semibold').textContent = data.title || '(Tanpa Judul)';
            editingElement.querySelector('.text-xs').textContent = `${contentTypeInfo.name} / ${layoutStyleInfo.name}`;
        } else {
            const newElement = createSectionElement(data);
            document.getElementById('homepage-layout-list').appendChild(newElement);
        }

        showMessage(`Bagian "${data.title || 'Banner'}" berhasil disimpan.`);
        closeModal('configure-section-modal');

    } catch (error) {
        console.error("Gagal menyimpan bagian:", error);
        showMessage("Gagal menyimpan bagian, terjadi kesalahan.", 4000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan Bagian');
    }
}

async function handleSaveLayout() {
    const container = document.getElementById('homepage-layout-list');
    const saveBtn = document.getElementById('save-layout-btn');
    if (!container || !saveBtn) return;

    const newSections = Array.from(container.children).map(el => {
        if(el.dataset.section) {
            return JSON.parse(el.dataset.section);
        }
        return null;
    }).filter(Boolean);

    setButtonLoading(saveBtn, true);
    try {
        await api.adminSaveHomepageLayout(newSections);
        showMessage("Tata letak beranda berhasil disimpan!");
    } catch (error) {
        console.error("Gagal menyimpan layout:", error);
        showMessage("Gagal menyimpan tata letak.", 3000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan Tata Letak');
    }
}
