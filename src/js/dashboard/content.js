// File: src/js/dashboard/content.js
// Versi: 6.0 (Image Compression & Bug Fixes)
// Perubahan:
// - Menambahkan fungsi `compressImage` untuk mengoptimalkan semua unggahan gambar.
// - Mengintegrasikan kompresi pada form tambah Banner dan Artikel.
// - Mengintegrasikan kompresi pada modal edit Banner dan Artikel.
// - Mengintegrasikan kompresi pada file picker di editor teks TinyMCE.
// - Memperbaiki bug paginasi "Sebelumnya" yang sebelumnya ada.

import * as api from '../api.js';
import { showMessage, setButtonLoading, openModal, closeModal, createPaginationControls } from '../ui.js';

const ITEMS_PER_PAGE = 5;
let currentEditId = null;
let currentEditType = null;
let paginationStates = {};

// === [BARU] FUNGSI KOMPRESI GAMBAR ===
async function compressImage(file) {
    if (!file || !file.type.startsWith('image/')) {
        return file;
    }

    const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
    };

    try {
        showMessage('Mengoptimalkan gambar...', 2000);
        const compressedFile = await imageCompression(file, options);
        console.log(`Gambar berhasil dikompres dari ${(file.size / 1024 / 1024).toFixed(2)} MB menjadi ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
        return compressedFile;
    } catch (error) {
        console.error('Gagal mengompres gambar:', error);
        showMessage('Gagal mengoptimalkan gambar. File asli akan digunakan.', 3000, true);
        return file;
    }
}


function resetPaginationState(type) {
    paginationStates[type] = {
        lastVisibleDoc: null,
        firstVisibleDoc: null,
        currentPage: 1,
        pageMarkers: [],
        currentQuery: null,
    };
}

export function initPage(params, addL) {
    tinymce.remove('#article-content-editor');
    tinymce.remove('#edit-article-content-editor');
    ['banners', 'articles', 'videos', 'ebooks'].forEach(resetPaginationState);
    setupTabListeners(addL);
    setupAllForms(addL);
    setupAllModals(addL);
    loadDataPage('banners', 'banner-list-container', createBannerElement, addL);
}

function setupTabListeners(addL) {
    const tabs = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    const handler = (e) => {
        e.preventDefault();
        const clickedTab = e.currentTarget;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(content => {
            content.classList.remove('active');
            content.classList.add('hidden');
        });

        clickedTab.classList.add('active');
        const targetId = clickedTab.dataset.target;
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
            targetContent.classList.remove('hidden');
            targetContent.classList.add('active');
        }

        switch (targetId) {
            case 'tab-banner':
                if (!paginationStates['banners']?.firstVisibleDoc) {
                    loadDataPage('banners', 'banner-list-container', createBannerElement, addL);
                }
                break;
            case 'tab-artikel':
                initTinyMCE('#article-content-editor');
                if (!paginationStates['articles']?.firstVisibleDoc) {
                    loadDataPage('articles', 'article-list-container', createTableElement, addL);
                }
                break;
            case 'tab-video':
                if (!paginationStates['videos']?.firstVisibleDoc) {
                    loadDataPage('videos', 'video-list-container', createTableElement, addL);
                }
                break;
            case 'tab-ebook':
                if (!paginationStates['ebooks']?.firstVisibleDoc) {
                    loadDataPage('ebooks', 'ebook-list-container', createTableElement, addL);
                }
                break;
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', handler);
        addL(() => tab.removeEventListener('click', handler));
    });
}

async function loadDataPage(collectionName, containerId, elementCreator, addL, direction = 'first') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const state = paginationStates[collectionName];
    const isTable = container.tagName === 'TBODY';
    container.innerHTML = isTable ? createTableSkeleton(ITEMS_PER_PAGE, 3) : '<p class="text-gray-500">Memuat...</p>';

    if (!state.currentQuery) {
        state.currentQuery = api.query(api.collection(api.db, collectionName), api.orderBy("createdAt", "desc"));
    }

    let pageQuery = state.currentQuery;

    if (direction === 'next' && state.lastVisibleDoc) {
        state.pageMarkers.push(state.firstVisibleDoc);
        pageQuery = api.query(pageQuery, api.startAfter(state.lastVisibleDoc), api.limit(ITEMS_PER_PAGE));
    } else if (direction === 'prev' && state.pageMarkers.length > 0) {
        const prevPageMarker = state.pageMarkers.pop();
        pageQuery = api.query(pageQuery, api.startAt(prevPageMarker), api.limit(ITEMS_PER_PAGE));
    } else {
        pageQuery = api.query(pageQuery, api.limit(ITEMS_PER_PAGE));
    }

    try {
        const snapshot = await api.getDocs(pageQuery);
        container.innerHTML = '';

        if (snapshot.empty) {
            const message = `Belum ada ${collectionName.slice(0, -1)}.`;
            container.innerHTML = isTable ? `<tr><td colspan="3" class="text-center p-8 text-gray-500">${message}</td></tr>` : `<p class="text-center text-gray-500 p-4">${message}</p>`;
            renderPaginationForTab(collectionName, false, containerId, elementCreator, addL);
            return;
        }

        state.firstVisibleDoc = snapshot.docs[0];
        state.lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach(doc => {
            container.appendChild(elementCreator(doc.id, doc.data(), collectionName.slice(0, -1), addL));
        });

        const nextPageQuery = api.query(state.currentQuery, api.startAfter(state.lastVisibleDoc), api.limit(1));
        const nextPageSnapshot = await api.getDocs(nextPageQuery);
        const hasNextPage = !nextPageSnapshot.empty;

        renderPaginationForTab(collectionName, hasNextPage, containerId, elementCreator, addL);

    } catch (error) {
        console.error(`Gagal memuat ${collectionName}:`, error);
        container.innerHTML = isTable ? `<tr><td colspan="3" class="text-center p-8 text-red-500">Gagal memuat data.</td></tr>` : `<p class="text-center text-red-500 p-4">Gagal memuat data.</p>`;
    }
}

function renderPaginationForTab(collectionName, hasNextPage, containerId, elementCreator, addL) {
    const state = paginationStates[collectionName];
    const type = collectionName.slice(0, -1);
    
    createPaginationControls({
        containerId: `pagination-container-${type}`,
        currentPage: state.currentPage,
        hasNextPage: hasNextPage,
        onNext: () => {
            state.currentPage++;
            loadDataPage(collectionName, containerId, elementCreator, addL, 'next');
        },
        onPrev: () => {
            state.currentPage--;
            loadDataPage(collectionName, containerId, elementCreator, addL, 'prev');
        }
    });
}

// --- [DIUBAH] Mengintegrasikan kompresi gambar ---
function setupForm(formId, collectionName, requiredFields, addL) {
    const form = document.getElementById(formId);
    if (!form) return;

    const handler = async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        if (collectionName === 'articles') {
            data.content = tinymce.get('article-content-editor').getContent();
            if (!data.content) {
                 return showMessage(`Konten artikel wajib diisi.`, 3000, true);
            }
        }

        for (const field of requiredFields) {
            if (!data[field] || (data[field] instanceof File && data[field].size === 0)) {
                return showMessage(`Field '${field}' wajib diisi.`, 3000, true);
            }
        }

        setButtonLoading(submitBtn, true);
        try {
            const dataToSave = { 
                createdAt: api.serverTimestamp(),
                title: data.title || '',
                title_lowercase: (data.title || '').toLowerCase(),
            };

            if (collectionName === 'videos') {
                dataToSave.description = data.description || '';
            }

            for (const key in data) {
                if (!(data[key] instanceof File) && key !== 'title' && key !== 'description') {
                    dataToSave[key] = data[key];
                }
            }

            if (data.image && data.image.size > 0) {
                const compressedImage = await compressImage(data.image);
                const storageRef = api.ref(api.storage, `${collectionName}/${Date.now()}_${compressedImage.name}`);
                const snapshot = await api.uploadBytes(storageRef, compressedImage);
                dataToSave.imageUrl = await api.getDownloadURL(snapshot.ref);
            }
            if (data.file && data.file.size > 0) {
                 if (data.file.type !== "application/pdf") throw new Error("File harus berupa PDF.");
                const storageRef = api.ref(api.storage, `${collectionName}/${Date.now()}_${data.file.name}`);
                const snapshot = await api.uploadBytes(storageRef, data.file);
                dataToSave.url = await api.getDownloadURL(snapshot.ref);
            }

            await api.addDoc(api.collection(api.db, collectionName), dataToSave);
            showMessage("Konten berhasil ditambahkan!");
            form.reset();
            if (collectionName === 'articles') {
                tinymce.get('article-content-editor').setContent('');
            }
            
            resetPaginationState(collectionName);
            const containerId = collectionName === 'banners' ? 'banner-list-container' : `${collectionName.slice(0, -1)}-list-container`;
            const creator = collectionName === 'banners' ? createBannerElement : createTableElement;
            loadDataPage(collectionName, containerId, creator, addL);

        } catch (error) {
            console.error(`Gagal menambah ${collectionName}:`, error);
            showMessage(error.message || "Terjadi kesalahan.", 3000, true);
        } finally {
            setButtonLoading(submitBtn, false, `Publikasikan`);
        }
    };
    form.addEventListener('submit', handler);
    addL(() => form.removeEventListener('submit', handler));
}

function addCommonListeners(element, id, data, type, addL) {
    const collectionName = `${type}s`;
    element.querySelector('.copy-id-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.currentTarget.dataset.id).then(() => showMessage("ID berhasil disalin!"));
    });
    element.querySelector('.delete-content-btn').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus "${data.title}"?`)) {
            api.deleteDoc(api.doc(api.db, collectionName, id)).then(() => {
                showMessage("Konten berhasil dihapus.");
                const containerId = collectionName === 'banners' ? 'banner-list-container' : `${type}-list-container`;
                const creator = collectionName === 'banners' ? createBannerElement : createTableElement;
                loadDataPage(collectionName, containerId, creator, addL, 'stay');
            });
        }
    });
    element.querySelector('.edit-content-btn').addEventListener('click', () => openEditModal(id, data, type));
}

// --- [DIUBAH] Mengintegrasikan kompresi gambar ---
function initTinyMCE(selector) {
    tinymce.init({
        selector: selector,
        plugins: 'lists link image media code help wordcount autoresize',
        toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image media | code help',
        skin: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'oxide-dark' : 'oxide',
        content_css: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'default',
        promotion: false,
        height: 500,
        autoresize_bottom_margin: 50,
        file_picker_callback: (callback, value, meta) => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.onchange = async () => {
                const file = input.files[0];
                if (!file) return;
                
                const compressedFile = await compressImage(file); // Kompres gambar
                
                showMessage('Mengunggah gambar...');
                try {
                    const storageRef = api.ref(api.storage, `content_images/${Date.now()}_${compressedFile.name}`);
                    const snapshot = await api.uploadBytes(storageRef, compressedFile);
                    const downloadURL = await api.getDownloadURL(snapshot.ref);
                    callback(downloadURL, { alt: file.name });
                    showMessage('Gambar berhasil diunggah!', 2000);
                } catch (error) {
                    console.error("Gagal unggah gambar:", error);
                    showMessage("Gagal mengunggah gambar.", 3000, true);
                }
            };
            input.click();
        },
    });
}

function setupAllForms(addL) {
    setupForm('form-add-banner', 'banners', ['image'], addL);
    setupForm('form-add-article', 'articles', ['title', 'image'], addL);
    setupForm('form-add-video', 'videos', ['title', 'image', 'url'], addL);
    setupForm('form-add-ebook', 'ebooks', ['title', 'file'], addL);
}

function setupAllModals(addL) {
    setupModal('edit-banner-modal', 'banners', addL);
    setupModal('edit-article-modal', 'articles', addL);
    setupModal('edit-video-modal', 'videos', addL);
    setupModal('edit-ebook-modal', 'ebooks', addL);
}

// --- [DIUBAH] Mengintegrasikan kompresi gambar ---
function setupModal(modalId, collectionName, addL) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.querySelector('.cancel-modal-btn')?.addEventListener('click', () => closeModal(modalId));
    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal(modalId));
    
    const saveBtn = modal.querySelector('.save-modal-btn');
    const handler = async () => {
        const form = modal.querySelector('form');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const updateData = {};

        if (collectionName === 'articles') {
            data.content = tinymce.get('edit-article-content-editor').getContent();
        }

        for(const key in data) {
            if (data[key] instanceof File && data[key].size > 0) {
                updateData[key] = data[key];
            } else if (!(data[key] instanceof File) && data[key] !== undefined) {
                 updateData[key] = data[key];
            }
        }

        if (!currentEditId) return;
        setButtonLoading(saveBtn, true);
        try {
            if (updateData.image) {
                const compressedImage = await compressImage(updateData.image);
                const storageRef = api.ref(api.storage, `${collectionName}/${Date.now()}_${compressedImage.name}`);
                const snapshot = await api.uploadBytes(storageRef, compressedImage);
                updateData.imageUrl = await api.getDownloadURL(snapshot.ref);
            }
            if (updateData.file) {
                const storageRef = api.ref(api.storage, `${collectionName}/${Date.now()}_${updateData.file.name}`);
                const snapshot = await api.uploadBytes(storageRef, updateData.file);
                updateData.url = await api.getDownloadURL(snapshot.ref);
            }
            
            delete updateData.image;
            delete updateData.file;
            if (updateData.title) {
                updateData.title_lowercase = updateData.title.toLowerCase();
            }

            await api.updateDoc(api.doc(api.db, collectionName, currentEditId), updateData);
            showMessage("Konten berhasil diperbarui.");
            closeModal(modalId);

            const containerId = collectionName === 'banners' ? 'banner-list-container' : `${collectionName.slice(0, -1)}-list-container`;
            const creator = collectionName === 'banners' ? createBannerElement : createTableElement;
            loadDataPage(collectionName, containerId, creator, addL, 'stay');

        } catch (error) {
            console.error(`Gagal update ${collectionName}:`, error);
            showMessage("Gagal menyimpan perubahan.", 3000, true);
        } finally {
            setButtonLoading(saveBtn, false, 'Simpan');
            currentEditId = null;
        }
    };
    saveBtn?.addEventListener('click', handler);
}

function createBannerElement(id, data, type, addL) {
    const element = document.createElement('div');
    element.className = 'flex items-center justify-between p-3 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800';
    element.innerHTML = `
        <div class="flex items-center space-x-4 overflow-hidden">
            <img src="${data.imageUrl || 'https://placehold.co/200x100'}" alt="Banner" class="w-28 h-14 object-cover rounded-md bg-gray-200 flex-shrink-0">
            <div class="overflow-hidden">
                <p class="font-semibold truncate">${data.title || '<i>(Tanpa Judul)</i>'}</p>
                <div class="flex items-center mt-1"><p class="text-xs text-gray-400 mr-2">ID: <span class="font-mono">${id}</span></p><button class="copy-id-btn text-gray-400 hover:text-primary-500" data-id="${id}" title="Salin ID"><i class="fas fa-copy fa-xs"></i></button></div>
            </div>
        </div>
        <div class="flex items-center flex-shrink-0">
            <button class="edit-content-btn text-blue-500 hover:text-blue-700 p-2" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="delete-content-btn text-red-500 hover:text-red-700 p-2" title="Hapus"><i class="fas fa-trash"></i></button>
        </div>`;
    addCommonListeners(element, id, data, type, addL);
    return element;
}

function createTableElement(id, data, type, addL) {
    const element = document.createElement('tr');
    element.className = 'border-b dark:border-gray-700';
    element.innerHTML = `
        <td class="p-3 font-medium">${data.title}</td>
        <td class="p-3"><div class="flex items-center"><span class="font-mono text-gray-500 text-xs">${id}</span><button class="copy-id-btn text-gray-400 hover:text-primary-500 ml-2" data-id="${id}" title="Salin ID"><i class="fas fa-copy"></i></button></div></td>
        <td class="p-3 space-x-2">
            <button class="edit-content-btn text-blue-500" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="delete-content-btn text-red-500" title="Hapus"><i class="fas fa-trash"></i></button>
        </td>`;
    addCommonListeners(element, id, data, type, addL);
    return element;
}

function openEditModal(id, data, type) {
    currentEditId = id;
    currentEditType = type;
    const modalId = `edit-${type}-modal`;
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const form = modal.querySelector('form');
    form.reset();
    for (const key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && input.type !== 'file') {
            input.value = data[key];
        }
    }
    
    if (type === 'article') {
        tinymce.remove('#edit-article-content-editor'); 
        initTinyMCE('#edit-article-content-editor');
        setTimeout(() => {
            const editor = tinymce.get('edit-article-content-editor');
            if (editor) {
                editor.setContent(data.content || '');
            }
        }, 500); 
    }

    openModal(modalId);
}

function createTableSkeleton(rows, cols) {
    let html = '';
    for (let i = 0; i < rows; i++) {
        html += `<tr class="border-b dark:border-gray-700 animate-pulse">`;
        for (let j = 0; j < cols; j++) {
            html += `<td class="p-3"><div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div></td>`;
        }
        html += `</tr>`;
    }
    return html;
}
