// File: src/js/auth.js
// Deskripsi: Mengelola semua logika otentikasi pengguna.
// Versi Perbaikan: 3.0 (Final Notification Logic)

import {
    auth, db, doc, getDoc, setDoc, serverTimestamp,
    onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    sendPasswordResetEmail, updatePassword, reauthenticateWithCredential,
    EmailAuthProvider, deleteUser,
    // Impor baru dari api.js untuk notifikasi
    messaging, getToken, updateDoc, arrayUnion
} from './api.js';
import { showMessage, setButtonLoading, openModal, closeModal } from './ui.js';
import { loadScreen, setupNotificationListener, cleanupNotificationListener } from './router.js';

export let currentUser = null;
export let currentUserData = null;

// --- FUNGSI BARU UNTUK MEMINTA IZIN & MENYIMPAN TOKEN ---
async function requestAndSaveToken() {
    // Hanya berjalan jika ada pengguna yang login & browser mendukung
    if (!currentUser || !("Notification" in window) || !messaging) {
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Izin notifikasi diberikan.');
            // VAPID key Anda sudah benar
            const vapidKey = "BIg2t14yU_Vs5rg5dY9STTYk8YXzYd8rLjR5nwxQwgA3gcSQkXhSWDryvI16_NXIXKkxA6m530q7RwqHyclqap4";
            const currentToken = await getToken(messaging, { vapidKey });

            if (currentToken) {
                console.log('FCM Token Diterima:', currentToken);
                const userRef = doc(db, "users", currentUser.uid);
                // Menyimpan token ke database menggunakan fungsi yang diimpor
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken)
                });
                console.log('Token berhasil disimpan ke profil pengguna.');
            } else {
                console.log('Gagal mendapatkan token dari Firebase.');
            }
        } else {
            console.log('Izin notifikasi tidak diberikan.');
        }
    } catch (err) {
        console.error('Gagal saat meminta atau menyimpan token:', err);
    }
}


export function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const appRoot = document.getElementById('app-root');
        const dashboardRoot = document.getElementById('dashboard-root');

        if (user) {
            currentUser = user;
            const userDocRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                currentUserData = { id: docSnap.id, ...docSnap.data() };
                if (!currentUserData.notificationSettings) {
                    currentUserData.notificationSettings = { newSignal: true, communityActivity: true, newEvent: true };
                }
            } else {
                const name = user.displayName || 'Pengguna Baru';
                const newUserProfile = {
                    name: name,
                    email: user.email,
                    name_lowercase: name.toLowerCase(),
                    avatarUrl: user.photoURL || `https://ui-avatars.com/api/?name=${name.split(' ').join('+')}&background=16a34a&color=ffffff`,
                    joinDate: serverTimestamp(),
                    isPremium: false,
                    isExpert: false,
                    isAdmin: false,
                    stats: { posts: 0, likes: 0, reputation: 0, skill: 0 },
                    notificationSettings: { newSignal: true, communityActivity: true, newEvent: true }
                };
                await setDoc(userDocRef, newUserProfile);
                currentUserData = { id: user.uid, ...newUserProfile };
            }
            
            // --- PERUBAHAN #2: Panggil fungsi notifikasi DI SINI, setelah login berhasil ---
            setTimeout(requestAndSaveToken, 5000); // Diberi jeda 5 detik
            
            setupNotificationListener(user.uid);
            checkAndShowInterstitialBanner();

            if (currentUserData.isAdmin) {
                appRoot?.classList.add('hidden');
                dashboardRoot?.classList.remove('hidden');
                loadScreen('dashboard');
            } else {
                dashboardRoot?.classList.add('hidden');
                appRoot?.classList.remove('hidden');
                loadScreen('home');
            }

        } else {
            currentUser = null;
            currentUserData = null;
            appRoot?.classList.add('hidden');
            dashboardRoot?.classList.add('hidden');
            loadScreen('login');
        }
    });
}

async function checkAndShowInterstitialBanner() {
    try {
        const settingsRef = doc(db, "settings", "app");
        const docSnap = await getDoc(settingsRef);

        if (!docSnap.exists() || !docSnap.data().interstitialActive) {
            return;
        }

        const bannerData = docSnap.data();
        const frequencyHours = bannerData.showFrequencyHours || 24;
        const lastShownTimestamp = localStorage.getItem('lastInterstitialShown');

        if (lastShownTimestamp) {
            const hoursSinceLastShown = (Date.now() - lastShownTimestamp) / (1000 * 60 * 60);
            if (hoursSinceLastShown < frequencyHours) {
                return;
            }
        }

        const modal = document.getElementById('interstitial-banner-modal');
        const linkEl = document.getElementById('interstitial-link');
        const imageEl = document.getElementById('interstitial-image');
        const closeBtn = document.getElementById('interstitial-close-btn');

        if (modal && linkEl && imageEl && closeBtn) {
            imageEl.src = bannerData.imageUrl;
            
            if (bannerData.linkUrl && bannerData.linkUrl.startsWith('http')) {
                linkEl.href = bannerData.linkUrl;
                linkEl.target = '_blank';
            } else if (bannerData.linkUrl) {
                linkEl.href = '#';
                linkEl.target = '';
                linkEl.onclick = (e) => {
                    e.preventDefault();
                    closeModal('interstitial-banner-modal');
                    loadScreen(bannerData.linkUrl);
                };
            } else {
                linkEl.href = '#';
                linkEl.onclick = (e) => e.preventDefault();
            }

            closeBtn.onclick = () => closeModal('interstitial-banner-modal');

            openModal('interstitial-banner-modal');
            localStorage.setItem('lastInterstitialShown', Date.now());
        }

    } catch (error) {
        console.error("Gagal memeriksa banner interstitial:", error);
    }
}

export async function handleGoogleLogin() {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
        console.error("Google Login Error:", error);
        showMessage(`Login Google gagal. Silakan coba lagi.`, 3000, true);
    }
}
export async function handleEmailLogin(email, password, button) {
    if (!email || !password) {
        return showMessage("Email dan password tidak boleh kosong.", 3000, true);
    }
    setButtonLoading(button, true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Email Login Error:", error.code);
        const message = (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found')
            ? "Email atau password yang Anda masukkan salah."
            : "Login gagal. Silakan coba beberapa saat lagi.";
        showMessage(message, 3000, true);
    } finally {
        setButtonLoading(button, false, 'LOGIN');
    }
}
export async function handleRegistration(name, email, password, button) {
    if (!name || !email || !password) {
        return showMessage("Semua kolom harus diisi.", 3000, true);
    }
    if (password.length < 6) {
        return showMessage("Password minimal harus 6 karakter.", 3000, true);
    }
    setButtonLoading(button, true);
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userDocRef = doc(db, "users", user.uid);
        
        const newUserProfile = {
            name: name,
            email: user.email,
            name_lowercase: name.toLowerCase(),
            avatarUrl: `https://ui-avatars.com/api/?name=${name.split(' ').join('+')}&background=16a34a&color=ffffff`,
            joinDate: serverTimestamp(),
            isPremium: false,
            isExpert: false,
            isAdmin: false,
            stats: { posts: 0, likes: 0, reputation: 0, skill: 0 },
            notificationSettings: { newSignal: true, communityActivity: true, newEvent: true }
        };
        await setDoc(userDocRef, newUserProfile);
    } catch (error) {
        console.error("Registration Error:", error);
        let message = "Gagal mendaftar. Silakan coba lagi nanti.";
        if (error.code === 'auth/email-already-in-use') {
            message = "Email ini sudah terdaftar. Silakan login.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Format email tidak valid.";
        }
        showMessage(message, 3000, true);
    } finally {
        setButtonLoading(button, false, 'DAFTAR');
    }
}

export async function handleLogout() {
    try {
        cleanupNotificationListener();
        await signOut(auth);
    } catch (error) {
        showMessage('Gagal logout, silakan coba lagi.', 3000, true);
    }
}

export async function sendPasswordReset(email) {
    if (!email.includes('@')) {
        return showMessage("Format email tidak valid.", 3000, true);
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage("Link reset password telah dikirim ke email Anda!");
    } catch (error) {
        console.error("Gagal kirim reset email:", error);
        if (error.code === 'auth/user-not-found') {
            showMessage("Email tidak terdaftar.", 3000, true);
        } else {
            showMessage("Gagal mengirim link. Coba lagi nanti.", 3000, true);
        }
    }
}
export async function updateUserPassword(currentPassword, newPassword, confirmPassword) {
    if (!currentPassword || !newPassword || !confirmPassword) {
        return showMessage("Semua kolom harus diisi.", 3000, true);
    }
    if (newPassword.length < 6) {
        return showMessage("Password baru minimal 6 karakter.", 3000, true);
    }
    if (newPassword !== confirmPassword) {
        return showMessage("Konfirmasi password baru tidak cocok.", 3000, true);
    }
    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        showMessage("Password berhasil diperbarui!");
        loadScreen('profile');
    } catch (error) {
        console.error("Gagal ubah password:", error);
        let message = "Terjadi kesalahan, coba lagi.";
        if (error.code === 'auth/wrong-password') {
            message = "Password saat ini salah.";
        } else if (error.code === 'auth/requires-recent-login') {
            message = "Sesi Anda sudah terlalu lama, silakan login ulang untuk mengubah password.";
        }
        showMessage(message, 4000, true);
    }
}
export async function deleteCurrentUserAccount() {
    try {
        await deleteUser(currentUser);
        showMessage("Akun Anda telah berhasil dihapus.");
    } catch (error) {
        console.error("Gagal menghapus akun:", error);
        let message = "Gagal menghapus akun. Coba lagi.";
        if (error.code === 'auth/requires-recent-login') {
            message = "Untuk keamanan, silakan login ulang sebelum menghapus akun.";
        }
        showMessage(message, 4000, true);
    }
}

