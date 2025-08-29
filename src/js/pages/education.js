// File: src/js/pages/education.js
// Deskripsi: Logika spesifik untuk halaman Edukasi pengguna.
// Versi Perbaikan: 2.8 (Full Code Restore)
// Perubahan:
// - Mengembalikan seluruh kode yang hilang akibat kesalahan pada pembaruan sebelumnya.
// - Memastikan semua fungsionalitas (daftar kursus, detail, kuis, modal premium) berfungsi.

import { currentUser, currentUserData } from '../auth.js';
import { openModal, closeModal, createCourseSkeleton, showMessage, setButtonLoading } from '../ui.js';
import * as api from '../api.js';
import { loadScreen } from '../router.js';

// State untuk halaman edukasi
let activeCourseData = null;
let userProgress = [];
let activeCourseUnsubscribe = null;
let quizState = {
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: [],
    passingGrade: 80
};

/**
 * Fungsi inisialisasi utama untuk halaman Edukasi.
 */
export function initPage(params, addL) {
    if (activeCourseUnsubscribe) activeCourseUnsubscribe();
    resetQuizState();

    if (params.courseId) {
        loadCourseDetailView(params.courseId, addL);
    } else {
        loadCourseListView(addL);
    }

    const container = document.getElementById('education-container');
    const clickHandler = (e) => handleEducationClick(e, addL);
    container.addEventListener('click', clickHandler);
    addL(() => container.removeEventListener('click', clickHandler));

    document.getElementById('quiz-next-btn')?.addEventListener('click', handleQuizNext);
    document.getElementById('close-quiz-btn')?.addEventListener('click', () => closeModal('quiz-modal'));
}

function showEducationView(viewName) {
    document.querySelectorAll('#education-container .page').forEach(page => {
        page.classList.add('hidden');
    });
    const view = document.getElementById(`education-${viewName}-view`);
    if (view) {
        view.classList.remove('hidden');
        window.scrollTo(0, 0);
    }
}

// =================================================================================
// TAMPILAN 1: DAFTAR KURSUS
// =================================================================================

async function loadCourseListView(addL) {
    showEducationView('list');
    const container = document.getElementById('course-list-content');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 4; i++) { container.appendChild(createCourseSkeleton()); }

    const q = api.query(api.collection(api.db, "courses"), api.orderBy("title"));
    const snapshot = await api.getDocs(q);
    
    container.innerHTML = '';
    if (snapshot.empty) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">Belum ada kursus yang tersedia.</p>';
    } else {
        snapshot.forEach(doc => {
            container.appendChild(createUserCourseCard(doc.id, doc.data(), addL));
        });
    }
}

function createUserCourseCard(id, course, addL) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md cursor-pointer overflow-hidden hover:shadow-xl transition-shadow duration-300';
    card.innerHTML = `
        <div class="relative">
            <img src="${course.imageUrl || 'https://placehold.co/600x300'}" alt="${course.title}" loading="lazy" class="w-full h-32 object-cover">
        </div>
        <div class="p-3">
            <h4 class="font-bold mt-1 text-gray-800 dark:text-white">${course.title}</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">${course.lessonsCount || 0} Pelajaran</p>
        </div>
    `;
    card.addEventListener('click', () => loadCourseDetailView(id, addL));
    return card;
}


// =================================================================================
// TAMPILAN 2: DETAIL KURSUS
// =================================================================================

async function loadCourseDetailView(courseId, addL) {
    showEducationView('detail');
    const courseSnap = await api.getDoc(api.doc(api.db, "courses", courseId));
    if (!courseSnap.exists()) {
        showMessage("Kursus tidak ditemukan.", 3000, true);
        return loadCourseListView(addL);
    }
    activeCourseData = { id: courseSnap.id, ...courseSnap.data() };

    document.getElementById('detail-course-title').textContent = activeCourseData.title;
    document.getElementById('detail-course-banner').src = activeCourseData.imageUrl;
    document.getElementById('detail-course-description').textContent = activeCourseData.description;

    loadUserProgress(courseId, addL);
}

function loadUserProgress(courseId, addL) {
    const progressRef = api.doc(api.db, `users/${currentUser.uid}/completedLessons`, courseId);
    
    if (activeCourseUnsubscribe) activeCourseUnsubscribe();
    activeCourseUnsubscribe = api.onSnapshot(progressRef, (doc) => {
        userProgress = doc.exists() ? doc.data().lessons : [];
        updateUserProgressUI();
        loadCurriculum();
    });
    addL(activeCourseUnsubscribe);
}

async function getActualLessonCount(courseId) {
    let totalLessons = 0;
    const chaptersQuery = api.query(api.collection(api.db, `courses/${courseId}/chapters`));
    const chaptersSnap = await api.getDocs(chaptersQuery);

    for (const chapterDoc of chaptersSnap.docs) {
        const lessonsQuery = api.query(api.collection(chapterDoc.ref, "lessons"));
        const lessonsSnap = await api.getDocs(lessonsQuery);
        totalLessons += lessonsSnap.size;
    }
    return totalLessons;
}

async function updateUserProgressUI() {
    const totalLessons = await getActualLessonCount(activeCourseData.id);
    const completedLessons = userProgress.length;
    const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    document.getElementById('course-progress-text').textContent = `${percentage}%`;
    document.getElementById('course-progress-bar').style.width = `${percentage}%`;

    const quizContainer = document.getElementById('quiz-action-container');
    if (quizContainer) {
        const isCourseCompleted = totalLessons > 0 && completedLessons >= totalLessons;
        quizContainer.classList.toggle('hidden', !isCourseCompleted);
    }
}


async function loadCurriculum() {
    const container = document.getElementById('chapters-container');
    container.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i></div>';

    const chaptersQuery = api.query(api.collection(api.db, `courses/${activeCourseData.id}/chapters`), api.orderBy("order"));
    const chaptersSnap = await api.getDocs(chaptersQuery);

    container.innerHTML = '';
    if (chaptersSnap.empty) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">Kurikulum belum tersedia.</p>';
        return;
    }

    for (const chapterDoc of chaptersSnap.docs) {
        const chapterData = chapterDoc.data();
        const premiumIcon = chapterData.isPremium ? '<i class="fas fa-star text-yellow-500 ml-2" title="Bab Premium"></i>' : '';
        const chapterElement = document.createElement('div');
        chapterElement.innerHTML = `<h3 class="font-bold text-lg mb-2 flex items-center">${chapterData.title} ${premiumIcon}</h3>`;
        
        const lessonsList = document.createElement('div');
        lessonsList.className = 'space-y-2';
        chapterElement.appendChild(lessonsList);
        container.appendChild(chapterElement);

        const lessonsQuery = api.query(api.collection(chapterDoc.ref, "lessons"), api.orderBy("order"));
        const lessonsSnap = await api.getDocs(lessonsQuery);

        lessonsSnap.forEach(lessonDoc => {
            lessonsList.appendChild(createUserLessonElement(lessonDoc.id, lessonDoc.data(), chapterData));
        });
    }
}

function createUserLessonElement(lessonId, lessonData, chapterData) {
    const isPremiumLocked = chapterData.isPremium && !currentUserData.isPremium;
    const isCompleted = userProgress.includes(lessonId);

    const lessonElement = document.createElement('div');
    lessonElement.className = `flex items-center justify-between p-3 rounded-lg transition-colors ${isPremiumLocked ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-800 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700'}`;
    lessonElement.dataset.lessonId = lessonId;
    lessonElement.dataset.isPremium = chapterData.isPremium || false;
    
    const icon = isCompleted ? `<i class="fas fa-check-circle text-primary-500 text-xl"></i>` : `<i class="far fa-circle text-gray-400 text-xl"></i>`;
    const lockIcon = isPremiumLocked ? `<i class="fas fa-lock text-yellow-500 ml-auto"></i>` : '';
    const contentTypeIcon = lessonData.contentType === 'video' ? 'fa-play-circle text-red-500' : 'fa-file-alt text-blue-500';

    lessonElement.innerHTML = `
        <div class="flex items-center space-x-4">
            ${icon}
            <div>
                <p class="font-semibold text-gray-800 dark:text-gray-200">${lessonData.title}</p>
                <p class="text-xs text-gray-500 flex items-center"><i class="fas ${contentTypeIcon} mr-2"></i> ${lessonData.contentType === 'video' ? 'Video' : 'Artikel'}</p>
            </div>
        </div>
        ${lockIcon}
    `;
    return lessonElement;
}


async function navigateToLessonContent(lessonId) {
    showMessage("Membuka pelajaran...");

    let lessonSnap = null;
    const chaptersQuery = api.query(api.collection(api.db, `courses/${activeCourseData.id}/chapters`));
    const chaptersSnap = await api.getDocs(chaptersQuery);

    for (const chapterDoc of chaptersSnap.docs) {
        const lessonRef = api.doc(chapterDoc.ref, "lessons", lessonId);
        const lessonDoc = await api.getDoc(lessonRef);
        if (lessonDoc.exists()) {
            lessonSnap = lessonDoc;
            break;
        }
    }

    if (!lessonSnap || !lessonSnap.exists()) {
        return showMessage("Gagal menemukan data pelajaran.", 3000, true);
    }

    const lessonData = lessonSnap.data();

    if (!lessonData.contentId || !lessonData.contentType) {
        return showMessage("Pelajaran ini belum memiliki konten.", 3000, true);
    }

    loadScreen('content-viewer', {
        contentType: lessonData.contentType,
        contentId: lessonData.contentId,
        returnUrl: 'education',
        returnParams: { 
            courseId: activeCourseData.id,
            lessonId: lessonId 
        }
    });
}


// =================================================================================
// LOGIKA KUIS
// =================================================================================

function resetQuizState() {
    quizState = { questions: [], currentQuestionIndex: 0, userAnswers: [], passingGrade: 80 };
}

async function startQuiz() {
    resetQuizState();
    const quizSettingsRef = api.doc(api.db, `courses/${activeCourseData.id}/quizSettings`, 'main');
    const questionsQuery = api.query(api.collection(api.db, `courses/${activeCourseData.id}/questions`));

    const [settingsSnap, questionsSnap] = await Promise.all([
        api.getDoc(quizSettingsRef),
        api.getDocs(questionsQuery)
    ]);

    if (settingsSnap.exists()) quizState.passingGrade = settingsSnap.data().passingGrade;
    quizState.questions = questionsSnap.docs.map(doc => doc.data());

    if (quizState.questions.length === 0) {
        showMessage("Selamat! Anda telah menyelesaikan semua pelajaran di kursus ini.");
        await api.markCourseAsPassed(currentUser.uid, activeCourseData.id);
        return;
    }

    openModal('quiz-modal');
    renderCurrentQuestion();
}

function renderCurrentQuestion() {
    const question = quizState.questions[quizState.currentQuestionIndex];
    if (!question) return;
    const quizContent = document.getElementById('quiz-content');
    const progressText = document.getElementById('quiz-progress-text');
    const nextBtn = document.getElementById('quiz-next-btn');
    const optionsHtml = question.options.map((option, index) => `
        <label class="block p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
            <input type="radio" name="quizOption" value="${index}" class="mr-3">
            <span>${option}</span>
        </label>
    `).join('');
    quizContent.innerHTML = `<p class="font-semibold mb-4">${question.text}</p><div class="space-y-3">${optionsHtml}</div>`;
    progressText.textContent = `Pertanyaan ${quizState.currentQuestionIndex + 1} dari ${quizState.questions.length}`;
    nextBtn.textContent = (quizState.currentQuestionIndex === quizState.questions.length - 1) ? 'Selesaikan Kuis' : 'Lanjut';
}

function handleQuizNext() {
    const selectedOption = document.querySelector('input[name="quizOption"]:checked');
    if (!selectedOption) return showMessage("Harap pilih satu jawaban.", 3000, true);
    quizState.userAnswers.push(parseInt(selectedOption.value));
    quizState.currentQuestionIndex++;
    if (quizState.currentQuestionIndex < quizState.questions.length) {
        renderCurrentQuestion();
    } else {
        finishQuiz();
    }
}

async function finishQuiz() {
    let score = 0;
    quizState.questions.forEach((q, index) => {
        if (q.correctAnswer === quizState.userAnswers[index]) score++;
    });
    const percentage = Math.round((score / quizState.questions.length) * 100);
    closeModal('quiz-modal');

    if (percentage >= quizState.passingGrade) {
        const newSkillPercentage = await api.markCourseAsPassed(currentUser.uid, activeCourseData.id);
        if (currentUserData && currentUserData.stats) {
            currentUserData.stats.skill = newSkillPercentage;
        }
        showMessage(`Selamat! Anda lulus dengan nilai ${percentage}%. Keahlian Anda telah diperbarui!`, 4000);
    } else {
        showMessage(`Anda belum berhasil. Nilai Anda ${percentage}%. Coba lagi nanti!`, 4000, true);
    }
    showEducationView('detail');
}


// =================================================================================
// EVENT HANDLER UTAMA
// =================================================================================

function handleEducationClick(e, addL) {
    const target = e.target;

    if (target.closest('#back-to-course-list-btn')) {
        if (activeCourseUnsubscribe) activeCourseUnsubscribe();
        loadCourseListView(addL);
    }
    
    const lessonElement = target.closest('[data-lesson-id]');
    if (lessonElement) {
        const isPremium = lessonElement.dataset.isPremium === 'true';
        if (isPremium && !currentUserData.isPremium) {
            openModal('upgrade-premium-modal');
        } else {
            navigateToLessonContent(lessonElement.dataset.lessonId);
        }
    }

    if (target.closest('#start-quiz-btn')) {
        startQuiz();
    }
}
