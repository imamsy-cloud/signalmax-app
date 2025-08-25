// File: src/js/dashboard/education.js
// Deskripsi: Logika untuk Halaman Manajemen Edukasi (Kursus, Bab, Pelajaran, Kuis).
// Versi Perbaikan: 2.0 (Image Compression Integration)
// Perubahan:
// - Menambahkan fungsi `compressImage` untuk mengoptimalkan unggahan thumbnail kursus.
// - Mengintegrasikan kompresi pada modal pembuatan dan pengeditan kursus.

import * as api from '../api.js';
import { showMessage, setButtonLoading, openModal, closeModal } from '../ui.js';

// State Halaman
let currentCourseId = null;
let currentChapterId = null;
let currentLessonId = null;
let currentQuizQuestionId = null;
let courseUnsubscribe = null;
let curriculumUnsubscribe = null;
let quizUnsubscribe = null;
let chapterSortable = null;
let lessonSortables = {};

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

// =================================================================================
// INISIALISASI UTAMA & PERGANTIAN VIEW
// =================================================================================

export function initPage(params, addL) {
    if (courseUnsubscribe) courseUnsubscribe();
    if (curriculumUnsubscribe) curriculumUnsubscribe();
    if (quizUnsubscribe) quizUnsubscribe();
    
    if (chapterSortable) chapterSortable.destroy();
    Object.values(lessonSortables).forEach(s => s.destroy());
    lessonSortables = {};

    setupGlobalListeners(addL);
    setupCourseModal(addL);
    setupChapterModal(addL);
    setupLessonModal(addL);
    setupQuizModals(addL);
    
    loadCoursesView(addL);
}

function setupGlobalListeners(addL) {
    const backBtn = document.getElementById('back-to-list-btn');
    const addCourseBtn = document.getElementById('add-course-btn');

    const backToListHandler = () => loadCoursesView(addL);
    const addCourseHandler = () => openCourseModal();

    backBtn?.addEventListener('click', backToListHandler);
    addCourseBtn?.addEventListener('click', addCourseHandler);

    addL(() => backBtn?.removeEventListener('click', backToListHandler));
    addL(() => addCourseBtn?.removeEventListener('click', addCourseHandler));
}

function showEducationView(viewName) {
    document.getElementById('course-list-view').classList.toggle('hidden', viewName !== 'list');
    document.getElementById('course-editor-view').classList.toggle('hidden', viewName !== 'editor');
}


// =================================================================================
// BAGIAN 1: MANAJEMEN DAFTAR KURSUS (COURSE LIST VIEW)
// =================================================================================

function loadCoursesView(addL) {
    showEducationView('list');
    const container = document.getElementById('course-list-container');
    container.innerHTML = '<p class="text-gray-500">Memuat kursus...</p>';

    const q = api.query(api.collection(api.db, "courses"), api.orderBy("title"));
    courseUnsubscribe = api.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class.text-center p-4 text-gray-500">Belum ada kursus dibuat.</p>';
        } else {
            snapshot.forEach(doc => {
                container.appendChild(createCourseElement(doc.id, doc.data(), addL));
            });
        }
    });
    addL(courseUnsubscribe);
}

function createCourseElement(id, data, addL) {
    const div = document.createElement('div');
    div.className = 'flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border dark:border-gray-700 rounded-lg';
    
    div.innerHTML = `
        <div class="flex items-center space-x-4">
            <img src="${data.imageUrl || 'https://placehold.co/200x100'}" alt="${data.title}" class="w-24 h-14 object-cover rounded-md bg-gray-200">
            <div>
                <p class="font-semibold">${data.title}</p>
                <p class="text-xs text-gray-500">${data.lessonsCount || 0} Pelajaran</p>
                <div class="flex items-center mt-1">
                    <p class="text-xs text-gray-400 mr-2">ID: <span class="font-mono">${id}</span></p>
                    <button class="copy-id-btn text-gray-400 hover:text-primary-500" data-id="${id}" title="Salin ID">
                        <i class="fas fa-copy fa-xs"></i>
                    </button>
                </div>
            </div>
        </div>
        <div class="flex items-center space-x-2 mt-3 sm:mt-0">
            <button class="edit-curriculum-btn text-sm bg-gray-200 dark:bg-gray-600 px-3 py-1 rounded-md hover:bg-gray-300">Edit Kurikulum</button>
            <button class="edit-course-btn text-blue-500 p-2 hover:text-blue-700" title="Edit Info Kursus"><i class="fas fa-edit"></i></button>
            <button class="delete-course-btn text-red-500 p-2 hover:text-red-700" title="Hapus Kursus"><i class="fas fa-trash"></i></button>
        </div>
    `;

    div.querySelector('.copy-id-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.currentTarget.dataset.id)
            .then(() => showMessage("ID Kursus berhasil disalin!"));
    });

    div.querySelector('.edit-curriculum-btn').addEventListener('click', () => loadEditorView(id, data.title, addL));
    div.querySelector('.edit-course-btn').addEventListener('click', () => openCourseModal(id, data));
    div.querySelector('.delete-course-btn').addEventListener('click', () => handleDeleteCourse(id, data.title));
    
    return div;
}

async function handleDeleteCourse(id, title) {
    if (!confirm(`Yakin ingin menghapus kursus "${title}"? Tindakan ini TIDAK dapat diurungkan dan akan menghapus semua bab serta pelajarannya.`)) return;
    try {
        await api.deleteDoc(api.doc(api.db, 'courses', id));
        showMessage("Kursus berhasil dihapus.");
    } catch (error) {
        console.error("Gagal hapus kursus:", error);
        showMessage("Gagal menghapus kursus.", 3000, true);
    }
}

function setupCourseModal(addL) {
    const form = document.getElementById('course-modal-form');
    const handler = (e) => {
        e.preventDefault();
        handleSaveCourse();
    };
    form?.addEventListener('submit', handler);
    addL(() => form?.removeEventListener('submit', handler));

    document.querySelector('#course-modal .cancel-modal-btn')?.addEventListener('click', () => closeModal('course-modal'));
    document.querySelector('#course-modal .close-modal-btn')?.addEventListener('click', () => closeModal('course-modal'));
}

function openCourseModal(id = null, data = {}) {
    currentCourseId = id;
    const modal = document.getElementById('course-modal');
    modal.querySelector('#course-modal-title').textContent = id ? 'Edit Info Kursus' : 'Buat Kursus Baru';
    modal.querySelector('#course-title-input').value = data.title || '';
    modal.querySelector('#course-desc-input').value = data.description || '';
    modal.querySelector('#course-image-input').value = '';
    openModal('course-modal');
}

// --- [DIUBAH] Mengintegrasikan kompresi gambar ---
async function handleSaveCourse() {
    const form = document.getElementById('course-modal-form');
    const saveBtn = document.getElementById('save-course-btn');
    const title = form.querySelector('#course-title-input').value;
    const imageFile = form.querySelector('#course-image-input').files[0];

    if (!title) return showMessage("Judul kursus wajib diisi.", 3000, true);

    setButtonLoading(saveBtn, true);
    try {
        const data = {
            title: title,
            description: form.querySelector('#course-desc-input').value,
            title_lowercase: title.toLowerCase(),
        };

        if (imageFile) {
            const compressedImage = await compressImage(imageFile);
            const storageRef = api.ref(api.storage, `courses/${Date.now()}_${compressedImage.name}`);
            const snapshot = await api.uploadBytes(storageRef, compressedImage);
            data.imageUrl = await api.getDownloadURL(snapshot.ref);
        }

        if (currentCourseId) {
            await api.updateDoc(api.doc(api.db, 'courses', currentCourseId), data);
        } else {
            data.createdAt = api.serverTimestamp();
            data.lessonsCount = 0;
            await api.addDoc(api.collection(api.db, 'courses'), data);
        }
        
        showMessage("Kursus berhasil disimpan!");
        closeModal('course-modal');
    } catch (error) {
        console.error("Gagal menyimpan kursus:", error);
        showMessage("Gagal menyimpan kursus.", 3000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan');
    }
}


// =================================================================================
// BAGIAN 2: EDITOR KURIKULUM (EDITOR VIEW)
// =================================================================================

function loadEditorView(id, title, addL) {
    showEducationView('editor');
    currentCourseId = id;
    document.getElementById('editor-course-title').textContent = `Kurikulum: ${title}`;

    document.getElementById('add-chapter-btn').onclick = () => openChapterModal();
    document.getElementById('manage-quiz-btn').onclick = () => openQuizManager(addL);

    loadCurriculum(addL);
}

function loadCurriculum(addL) {
    const container = document.getElementById('chapters-container');
    container.innerHTML = '<p class="text-gray-500">Memuat kurikulum...</p>';
    
    const q = api.query(api.collection(api.db, `courses/${currentCourseId}/chapters`), api.orderBy("order"));
    curriculumUnsubscribe = api.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center p-4 text-gray-500">Belum ada bab. Klik "Tambah Bab Baru" untuk memulai.</p>';
        } else {
            snapshot.forEach(doc => {
                container.appendChild(createChapterElement(doc.id, doc.data()));
            });
        }
        
        initChapterSortable(container);
    });
    addL(curriculumUnsubscribe);
}

function createChapterElement(id, data) {
    const div = document.createElement('div');
    div.className = 'bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border dark:border-gray-600';
    div.dataset.id = id;

    const premiumIcon = data.isPremium ? '<i class="fas fa-star text-yellow-500 ml-2" title="Bab Premium"></i>' : '';

    div.innerHTML = `
        <div class="flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <i class="fas fa-grip-vertical text-gray-400 cursor-move" title="Ubah Urutan"></i>
                <h4 class="font-semibold text-lg">${data.title}</h4>
                ${premiumIcon}
            </div>
            <div class="flex items-center space-x-1">
                <button class="add-lesson-btn text-sm bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-300 px-3 py-1 rounded-md hover:bg-primary-200">+ Pelajaran</button>
                <button class="edit-chapter-btn text-blue-500 p-2 hover:text-blue-700"><i class="fas fa-edit"></i></button>
                <button class="delete-chapter-btn text-red-500 p-2 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="lesson-list pl-8 mt-3 space-y-2"></div>
    `;
    
    loadLessonsForChapter(id, div.querySelector('.lesson-list'));

    div.querySelector('.add-lesson-btn').addEventListener('click', () => openLessonModal(id));
    div.querySelector('.edit-chapter-btn').addEventListener('click', () => openChapterModal(id, data));
    div.querySelector('.delete-chapter-btn').addEventListener('click', () => handleDeleteChapter(id, data.title));
    
    return div;
}

function loadLessonsForChapter(chapterId, container) {
    const q = api.query(api.collection(api.db, `courses/${currentCourseId}/chapters/${chapterId}/lessons`), api.orderBy("order"));
    api.onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-xs text-gray-400">Belum ada pelajaran di bab ini.</p>';
        } else {
            snapshot.forEach(doc => {
                container.appendChild(createLessonElement(doc.id, doc.data()));
            });
        }
        initLessonSortable(container, chapterId);
    });
}

function createLessonElement(id, data) {
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-white dark:bg-gray-800 p-2 rounded-md border dark:border-gray-600';
    div.dataset.id = id;
    div.innerHTML = `
        <div class="flex items-center space-x-3">
            <i class="fas fa-grip-vertical text-gray-400 cursor-move"></i>
            <i class="fas ${data.contentType === 'video' ? 'fa-play-circle text-red-500' : 'fa-file-alt text-blue-500'}"></i>
            <span>${data.title}</span>
        </div>
        <div class="flex items-center space-x-1">
            <button class="edit-lesson-btn text-blue-500 p-2 hover:text-blue-700"><i class="fas fa-edit"></i></button>
            <button class="delete-lesson-btn text-red-500 p-2 hover:text-red-700"><i class="fas fa-trash"></i></button>
        </div>
    `;
    
    div.querySelector('.edit-lesson-btn').addEventListener('click', () => openLessonModal(data.chapterId, id, data));
    div.querySelector('.delete-lesson-btn').addEventListener('click', () => handleDeleteLesson(data.chapterId, id, data.title));

    return div;
}


function setupChapterModal(addL) {
    const form = document.getElementById('chapter-modal-form');
    const handler = (e) => {
        e.preventDefault();
        handleSaveChapter();
    };
    form?.addEventListener('submit', handler);
    addL(() => form?.removeEventListener('submit', handler));

    document.querySelector('#chapter-modal .cancel-modal-btn')?.addEventListener('click', () => closeModal('chapter-modal'));
    document.querySelector('#chapter-modal .close-modal-btn')?.addEventListener('click', () => closeModal('chapter-modal'));
}

function openChapterModal(id = null, data = {}) {
    currentChapterId = id;
    const modal = document.getElementById('chapter-modal');
    modal.querySelector('#chapter-modal-title').textContent = id ? 'Edit Bab' : 'Bab Baru';
    modal.querySelector('#chapter-title-input').value = data.title || '';
    modal.querySelector('#chapter-isPremium-input').checked = data.isPremium || false;
    openModal('chapter-modal');
}

async function handleSaveChapter() {
    const title = document.getElementById('chapter-title-input').value;
    if (!title) return showMessage("Judul bab wajib diisi.", 3000, true);

    const data = { 
        title,
        isPremium: document.getElementById('chapter-isPremium-input').checked
    };
    const collectionRef = api.collection(api.db, `courses/${currentCourseId}/chapters`);

    try {
        if (currentChapterId) {
            await api.updateDoc(api.doc(collectionRef, currentChapterId), data);
        } else {
            const snapshot = await api.getDocs(api.query(collectionRef, api.orderBy("order", "desc"), api.limit(1)));
            const lastOrder = snapshot.empty ? -1 : snapshot.docs[0].data().order;
            data.order = lastOrder + 1;
            await api.addDoc(collectionRef, data);
        }
        showMessage("Bab berhasil disimpan!");
        closeModal('chapter-modal');
    } catch (error) {
        console.error("Gagal simpan bab:", error);
        showMessage("Gagal menyimpan bab.", 3000, true);
    }
}

async function handleDeleteChapter(id, title) {
    if (!confirm(`Yakin ingin menghapus bab "${title}"? Ini juga akan menghapus semua pelajaran di dalamnya.`)) return;
    
    const lessonsQuery = api.query(api.collection(api.db, `courses/${currentCourseId}/chapters/${id}/lessons`));
    const lessonsSnap = await api.getDocs(lessonsQuery);
    const lessonsToDeleteCount = lessonsSnap.size;

    try {
        await api.deleteDoc(api.doc(api.db, `courses/${currentCourseId}/chapters`, id));
        
        if (lessonsToDeleteCount > 0) {
            const courseRef = api.doc(api.db, `courses/${currentCourseId}`);
            await api.updateDoc(courseRef, { lessonsCount: api.increment(-lessonsToDeleteCount) });
        }

        showMessage("Bab berhasil dihapus.");
    } catch (error) {
        console.error("Gagal hapus bab:", error);
        showMessage("Gagal menghapus bab.", 3000, true);
    }
}


function initChapterSortable(container) {
    if (chapterSortable) chapterSortable.destroy();
    chapterSortable = new Sortable(container, {
        animation: 150,
        handle: '.fa-grip-vertical',
        onEnd: () => handleSaveOrder('chapters')
    });
}

function initLessonSortable(container, chapterId) {
    if (lessonSortables[chapterId]) {
        lessonSortables[chapterId].destroy();
    }
    lessonSortables[chapterId] = new Sortable(container, {
        animation: 150,
        handle: '.fa-grip-vertical',
        onEnd: () => handleSaveOrder('lessons')
    });
}

function setupLessonModal(addL) {
    const form = document.getElementById('lesson-modal-form');
    form?.addEventListener('submit', e => { e.preventDefault(); handleSaveLesson(); });
    const linkBtn = document.getElementById('link-content-btn');
    linkBtn?.addEventListener('click', () => handleLinkContent(false));
    addL(() => linkBtn?.removeEventListener('click', () => handleLinkContent(false)));
    document.querySelector('#lesson-modal .cancel-modal-btn')?.addEventListener('click', () => closeModal('lesson-modal'));
    document.querySelector('#lesson-modal .close-modal-btn')?.addEventListener('click', () => closeModal('lesson-modal'));
}

function openLessonModal(chapterId, lessonId = null, data = {}) {
    currentChapterId = chapterId;
    currentLessonId = lessonId;
    const modal = document.getElementById('lesson-modal');
    modal.querySelector('#lesson-modal-title').textContent = lessonId ? 'Edit Pelajaran' : 'Pelajaran Baru';
    const form = modal.querySelector('form');
    form.reset();
    document.getElementById('lesson-content-preview').classList.add('hidden');
    document.getElementById('save-lesson-btn').disabled = true;
    if (lessonId) {
        document.getElementById('content-id-input').value = data.contentId || '';
        document.getElementById('lesson-title-input').value = data.title || '';
        if (data.contentId) handleLinkContent(true);
    }
    openModal('lesson-modal');
}

async function handleLinkContent(isAutoLink = false) {
    const contentId = document.getElementById('content-id-input').value.trim();
    const preview = document.getElementById('lesson-content-preview');
    const saveBtn = document.getElementById('save-lesson-btn');
    if (!contentId) return;
    const collectionsToSearch = ['articles', 'videos', 'ebooks'];
    let contentData = null;
    let contentType = null;
    for (const collectionName of collectionsToSearch) {
        const docRef = api.doc(api.db, collectionName, contentId);
        const docSnap = await api.getDoc(docRef);
        if (docSnap.exists()) {
            contentData = docSnap.data();
            contentType = collectionName.slice(0, -1);
            break;
        }
    }
    if (contentData) {
        if (!isAutoLink) showMessage("Konten berhasil ditautkan!");
        preview.querySelector('#preview-title').textContent = contentData.title;
        preview.querySelector('#preview-icon').className = `fas ${contentType === 'video' ? 'fa-play-circle' : 'fa-file-alt'} text-lg`;
        preview.classList.remove('hidden');
        document.getElementById('lesson-title-input').value = contentData.title;
        saveBtn.disabled = false;
        saveBtn.dataset.contentType = contentType;
    } else {
        if (!isAutoLink) showMessage("ID Konten tidak ditemukan.", 3000, true);
        preview.classList.add('hidden');
        saveBtn.disabled = true;
    }
}

async function handleSaveLesson() {
    const title = document.getElementById('lesson-title-input').value;
    const contentId = document.getElementById('content-id-input').value;
    const saveBtn = document.getElementById('save-lesson-btn');
    const contentType = saveBtn.dataset.contentType;
    if (!title || !contentId || !contentType) return showMessage("Judul & ID Konten wajib valid.", 3000, true);
    setButtonLoading(saveBtn, true);
    const data = { title, contentId, contentType, chapterId: currentChapterId };
    const collectionRef = api.collection(api.db, `courses/${currentCourseId}/chapters/${currentChapterId}/lessons`);
    const courseRef = api.doc(api.db, `courses/${currentCourseId}`);
    try {
        if (currentLessonId) {
            await api.updateDoc(api.doc(collectionRef, currentLessonId), data);
        } else {
            const snapshot = await api.getDocs(api.query(collectionRef, api.orderBy("order", "desc"), api.limit(1)));
            const lastOrder = snapshot.empty ? -1 : snapshot.docs[0].data().order;
            data.order = lastOrder + 1;
            await api.addDoc(collectionRef, data);
            await api.updateDoc(courseRef, { lessonsCount: api.increment(1) });
        }
        showMessage("Pelajaran berhasil disimpan!");
        closeModal('lesson-modal');
    } catch (error) {
        console.error("Gagal simpan pelajaran:", error);
        showMessage("Gagal menyimpan pelajaran.", 3000, true);
    } finally {
        setButtonLoading(saveBtn, false, 'Simpan');
    }
}

async function handleDeleteLesson(chapterId, lessonId, title) {
    if (!confirm(`Yakin ingin menghapus pelajaran "${title}"?`)) return;
    try {
        const lessonRef = api.doc(api.db, `courses/${currentCourseId}/chapters/${chapterId}/lessons`, lessonId);
        const courseRef = api.doc(api.db, `courses/${currentCourseId}`);
        
        const batch = api.writeBatch(api.db);
        
        batch.delete(lessonRef);
        batch.update(courseRef, { lessonsCount: api.increment(-1) });
        
        await batch.commit();
        showMessage("Pelajaran berhasil dihapus.");
    } catch (error) {
        console.error("Gagal hapus pelajaran:", error);
        showMessage("Gagal menghapus pelajaran.", 3000, true);
    }
}

async function handleSaveOrder(type) {
    showMessage("Menyimpan urutan...");
    const batch = api.writeBatch(api.db);
    if (type === 'chapters') {
        const chapterElements = document.querySelectorAll('#chapters-container > div[data-id]');
        chapterElements.forEach((el, index) => {
            const docRef = api.doc(api.db, `courses/${currentCourseId}/chapters`, el.dataset.id);
            batch.update(docRef, { order: index });
        });
    } else {
        const lessonLists = document.querySelectorAll('.lesson-list');
        lessonLists.forEach(list => {
            const chapterId = list.closest('[data-id]').dataset.id;
            list.querySelectorAll('[data-id]').forEach((el, index) => {
                const docRef = api.doc(api.db, `courses/${currentCourseId}/chapters/${chapterId}/lessons`, el.dataset.id);
                batch.update(docRef, { order: index });
            });
        });
    }
    try {
        await batch.commit();
        showMessage("Urutan berhasil disimpan!");
    } catch (error) {
        console.error("Gagal menyimpan urutan:", error);
        showMessage("Gagal menyimpan urutan.", 3000, true);
    }
}

function setupQuizModals(addL) {
    document.querySelector('#quiz-manager-modal .close-modal-btn')?.addEventListener('click', () => closeModal('quiz-manager-modal'));
    document.querySelector('#quiz-manager-modal .cancel-modal-btn')?.addEventListener('click', () => closeModal('quiz-manager-modal'));
    document.querySelector('#question-editor-modal .close-modal-btn')?.addEventListener('click', () => closeModal('question-editor-modal'));
    document.querySelector('#question-editor-modal .cancel-modal-btn')?.addEventListener('click', () => closeModal('question-editor-modal'));
    document.getElementById('add-question-btn').onclick = () => openQuestionEditor();
    document.getElementById('save-quiz-btn').onclick = handleSaveQuizSettings;
    const questionForm = document.getElementById('question-editor-form');
    questionForm.onsubmit = (e) => {
        e.preventDefault();
        handleSaveQuestion();
    }
}
function openQuizManager(addL) {
    const quizSettingsRef = api.doc(api.db, `courses/${currentCourseId}/quizSettings`, 'main');
    const questionsCollectionRef = api.collection(api.db, `courses/${currentCourseId}/questions`);
    api.getDoc(quizSettingsRef).then(doc => {
        document.getElementById('passing-grade-input').value = (doc.exists() && doc.data().passingGrade) ? doc.data().passingGrade : 80;
    });
    const q = api.query(questionsCollectionRef);
    const container = document.getElementById('question-list-container');
    container.innerHTML = '<p>Memuat pertanyaan...</p>';
    if (quizUnsubscribe) quizUnsubscribe();
    quizUnsubscribe = api.onSnapshot(q, snapshot => {
        container.innerHTML = '';
        if(snapshot.empty) {
            container.innerHTML = '<p class="text-sm text-gray-500">Belum ada pertanyaan.</p>';
        } else {
            snapshot.forEach(doc => container.appendChild(createQuestionElement(doc.id, doc.data())));
        }
    });
    addL(quizUnsubscribe);
    openModal('quiz-manager-modal');
}
async function handleSaveQuizSettings() {
    const passingGrade = document.getElementById('passing-grade-input').value;
    const ref = api.doc(api.db, `courses/${currentCourseId}/quizSettings`, 'main');
    try {
        await api.setDoc(ref, { passingGrade: Number(passingGrade) }, { merge: true });
        showMessage("Pengaturan kuis disimpan!");
    } catch(e) {
        showMessage("Gagal menyimpan.", 3000, true);
    }
}
function createQuestionElement(id, data) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-100 dark:bg-gray-700 rounded-md flex justify-between items-center';
    div.innerHTML = `
        <p class="truncate pr-4">${data.text}</p>
        <div class="flex-shrink-0">
            <button class="edit-question-btn text-blue-500 p-1"><i class="fas fa-edit"></i></button>
            <button class="delete-question-btn text-red-500 p-1"><i class="fas fa-trash"></i></button>
        </div>
    `;
    div.querySelector('.edit-question-btn').onclick = () => openQuestionEditor(id, data);
    div.querySelector('.delete-question-btn').onclick = () => {
        if(confirm('Yakin hapus pertanyaan ini?')) {
            api.deleteDoc(api.doc(api.db, `courses/${currentCourseId}/questions`, id));
        }
    };
    return div;
}
function openQuestionEditor(id = null, data = {}) {
    currentQuizQuestionId = id;
    const modal = document.getElementById('question-editor-modal');
    modal.querySelector('#question-editor-title').textContent = id ? 'Edit Pertanyaan' : 'Tambah Pertanyaan';
    const form = document.getElementById('question-editor-form');
    form.reset();
    form.querySelector('#question-text-input').value = data.text || '';
    const options = data.options || ['', '', '', ''];
    form.querySelectorAll('input[type="text"]').forEach((input, index) => {
        input.value = options[index];
    });
    if (data.correctAnswer !== undefined) {
        form.querySelector(`input[name="correctAnswer"][value="${data.correctAnswer}"]`).checked = true;
    }
    openModal('question-editor-modal');
}
async function handleSaveQuestion() {
    const form = document.getElementById('question-editor-form');
    const text = form.querySelector('#question-text-input').value.trim();
    const options = Array.from(form.querySelectorAll('input[type="text"]')).map(input => input.value.trim());
    const correctAnswerEl = form.querySelector('input[name="correctAnswer"]:checked');
    if (!text || options.some(opt => !opt) || !correctAnswerEl) {
        return showMessage("Semua field pertanyaan dan pilihan wajib diisi.", 3000, true);
    }
    const data = {
        text,
        options,
        correctAnswer: Number(correctAnswerEl.value)
    };
    const collectionRef = api.collection(api.db, `courses/${currentCourseId}/questions`);
    try {
        if (currentQuizQuestionId) {
            await api.updateDoc(api.doc(collectionRef, currentQuizQuestionId), data);
        } else {
            await api.addDoc(collectionRef, data);
        }
        showMessage("Pertanyaan berhasil disimpan!");
        closeModal('question-editor-modal');
    } catch (e) {
        showMessage("Gagal menyimpan pertanyaan.", 3000, true);
    }
}
