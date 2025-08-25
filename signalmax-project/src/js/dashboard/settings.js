// File: src/js/dashboard/settings.js
// Versi: 3.6 - Add Course Content Type
// Perubahan:
// - Menambahkan 'course' ke dalam iconMap.

import * as api from '../api.js';
import { showMessage, setButtonLoading, openModal, closeModal } from '../ui.js';

let sortable = null;

export function initPage(params, addL) {
    loadHomepageLayout(addL);
    setupEventListeners(addL);
    setupSectionModal(addL);
}

function setupEventListeners(addL) {
    const saveBtn = document.getElementById('save-layout-btn');
    const addSectionBtn = document.getElementById('add-section-btn');
    
    const saveLayoutHandler = () => handleSaveLayout();
    const addSectionHandler = () => {
        const modal = document.getElementById('section-modal');
        const form = modal.querySelector('#section-modal-form');
        if (form) {
            form.reset();
        }
        updateModalUI(); 
        openModal('section-modal');
    };

    saveBtn?.addEventListener('click', saveLayoutHandler);
    addSectionBtn?.addEventListener('click', addSectionHandler);
    
    addL(() => saveBtn?.removeEventListener('click', saveLayoutHandler));
    addL(() => addSectionBtn?.removeEventListener('click', addSectionHandler));
}

function loadHomepageLayout(addL) {
    const container = document.getElementById('homepage-layout-list');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500">Memuat layout...</p>';

    const layoutRef = api.doc(api.db, "homepageLayout", "main");
    const unsubscribe = api.onSnapshot(layoutRef, (doc) => {
        container.innerHTML = '';
        if (doc.exists() && doc.data().sections && doc.data().sections.length > 0) {
            doc.data().sections.forEach(section => container.appendChild(createSectionElement(section)));
        } else {
            container.innerHTML = '<p class="text-center text-gray-500 p-4">Belum ada bagian di beranda.</p>';
        }
        if (sortable) sortable.destroy();
        sortable = new Sortable(container, { animation: 150, ghostClass: 'bg-blue-100' });
    });
    addL(unsubscribe);
}

function createSectionElement(section) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-between cursor-move';
    div.dataset.section = JSON.stringify(section);
    
    // --- PERUBAHAN DIMULAI DI SINI ---
    const iconMap = {
        signal: 'fa-signal text-green-500', 
        event: 'fa-calendar-alt text-purple-500',
        post: 'fa-users text-indigo-500', 
        article: 'fa-newspaper text-blue-500',
        video: 'fa-video text-red-500', 
        ebook: 'fa-book text-yellow-600',
        banner: 'fa-image text-orange-500',
        course: 'fa-graduation-cap text-teal-500' // Menambahkan ikon untuk kursus
    };
    // --- PERUBAHAN SELESAI DI SINI ---

    const iconClass = iconMap[section.contentType] || 'fa-question-circle';
    const layoutText = (section.layoutStyle || 'N/A').replace(/_/g, ' ');
    const contentText = section.contentType || section.type || 'N/A';

    div.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-grip-vertical mr-4 text-gray-400"></i>
            <i class="fas ${iconClass} w-6"></i>
            <div class="ml-3">
                <p class="font-semibold">${section.title || '<i>(Tanpa Judul)</i>'}</p>
                <p class="text-xs text-gray-500 capitalize">Layout: ${layoutText} | Konten: ${contentText}</p>
            </div>
        </div>
        <button class="remove-section-btn text-gray-400 hover:text-red-500 p-2"><i class="fas fa-times-circle"></i></button>
    `;
    div.querySelector('.remove-section-btn').onclick = (e) => e.currentTarget.closest('.p-3').remove();
    return div;
}

function setupSectionModal(addL) {
    const modal = document.getElementById('section-modal');
    if (!modal) return;

    const form = modal.querySelector('#section-modal-form');
    const sourceRadios = form.querySelectorAll('input[name="contentSource"]');
    const seeAllCheckbox = form.querySelector('#showSeeAllButton');
    
    const changeHandler = () => updateModalUI();
    sourceRadios.forEach(radio => radio.addEventListener('change', changeHandler));
    seeAllCheckbox?.addEventListener('change', changeHandler);

    document.getElementById('save-section-btn')?.addEventListener('click', handleSaveSection);

    modal.querySelector('.close-modal-btn').onclick = () => closeModal('section-modal');
    modal.querySelector('.cancel-modal-btn').onclick = () => closeModal('section-modal');

    addL(() => {
        sourceRadios.forEach(radio => radio.removeEventListener('change', changeHandler));
        seeAllCheckbox?.removeEventListener('change', changeHandler);
    });
}

function updateModalUI() {
    const form = document.getElementById('section-modal-form');
    if (!form) return;

    const selectedSource = form.querySelector('input[name="contentSource"]:checked').value;
    const isSeeAllChecked = form.querySelector('#showSeeAllButton').checked;

    form.querySelector('#limit-container').classList.toggle('hidden', selectedSource !== 'latest');
    form.querySelector('#contentIds-container').classList.toggle('hidden', selectedSource !== 'manual');
    form.querySelector('#seeAllLink-container').classList.toggle('hidden', !isSeeAllChecked);
}

function handleSaveSection() {
    const form = document.getElementById('section-modal-form');
    if (!form) return;

    const title = form.querySelector('#section-title').value;

    const data = {
        title: title,
        layoutStyle: form.querySelector('#layoutStyle').value,
        contentType: form.querySelector('#contentType').value,
        contentSource: form.querySelector('input[name="contentSource"]:checked').value,
        limit: Number(form.querySelector('#limit').value) || 4,
        contentIds: form.querySelector('#contentIds').value.split(',').map(id => id.trim()).filter(Boolean),
        showSeeAllButton: form.querySelector('#showSeeAllButton').checked,
        seeAllLink: form.querySelector('#seeAllLink').value
    };

    const container = document.getElementById('homepage-layout-list');
    container.appendChild(createSectionElement(data));
    showMessage("Bagian ditambahkan. Klik 'Simpan Tata Letak' untuk menerapkan.");
    closeModal('section-modal');
}

async function handleSaveLayout() {
    const container = document.getElementById('homepage-layout-list');
    const saveBtn = document.getElementById('save-layout-btn');
    if (!container || !saveBtn) return;
    const newSections = Array.from(container.children).map(el => JSON.parse(el.dataset.section));
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
