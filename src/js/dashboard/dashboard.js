// File: src/js/dashboard/dashboard.js
// Deskripsi: Logika untuk halaman utama Dashboard Admin.
// Versi Perbaikan: 2.0 (Bug Fix)
// Perubahan:
// - Memastikan elemen target (total-users-stat, dll.) sudah benar sesuai perbaikan HTML.
// - Menambahkan skeleton/loader sederhana saat data pertama kali dimuat.

import * as api from '../api.js';

/**
 * Fungsi inisialisasi untuk halaman Dashboard.
 */
export function initPage(params, addL) {
    loadDashboardStats(addL);
}

/**
 * Memuat data statistik utama untuk dashboard dan menampilkannya.
 */
function loadDashboardStats(addL) {
    const totalUsersEl = document.querySelector('#total-users-stat');
    const premiumUsersEl = document.querySelector('#premium-users-stat');
    const activeSignalsEl = document.querySelector('#active-signals-stat');

    // Tampilkan loader awal
    const loader = '<i class="fas fa-spinner fa-spin text-2xl"></i>';
    if (totalUsersEl) totalUsersEl.innerHTML = loader;
    if (premiumUsersEl) premiumUsersEl.innerHTML = loader;
    if (activeSignalsEl) activeSignalsEl.innerHTML = loader;

    // Listener untuk statistik pengguna (total dan premium)
    const usersQuery = api.query(api.collection(api.db, "users"));
    const unsubUsers = api.onSnapshot(usersQuery, (snapshot) => {
        const totalUsers = snapshot.size;
        const premiumUsers = snapshot.docs.filter(doc => doc.data().isPremium).length;
        
        if (totalUsersEl) totalUsersEl.textContent = totalUsers.toLocaleString('id-ID');
        if (premiumUsersEl) premiumUsersEl.textContent = premiumUsers.toLocaleString('id-ID');
    }, (error) => {
        console.error("Gagal memuat data pengguna:", error);
        if (totalUsersEl) totalUsersEl.textContent = 'Error';
        if (premiumUsersEl) premiumUsersEl.textContent = 'Error';
    });
    addL(unsubUsers);

    // Listener untuk sinyal yang sedang aktif/berjalan
    const signalsQuery = api.query(api.collection(api.db, "signals"), api.where("status", "==", "Berjalan"));
    const unsubSignals = api.onSnapshot(signalsQuery, (snapshot) => {
        if (activeSignalsEl) activeSignalsEl.textContent = snapshot.size;
    }, (error) => {
        console.error("Gagal memuat data sinyal:", error);
        if (activeSignalsEl) activeSignalsEl.textContent = 'Error';
    });
    addL(unsubSignals);

    // CATATAN: Statistik pendapatan dan konten populer masih statis.
    // Ini memerlukan struktur data yang lebih kompleks di database (misalnya, koleksi 'payments' dan 'analytics').
}