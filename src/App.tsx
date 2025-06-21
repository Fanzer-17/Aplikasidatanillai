import React, { useState, useEffect, useRef, useCallback } from 'react';
// Hapus import untuk XLSX dan jsPDF karena diasumsikan dimuat secara global melalui CDN di HTML utama.
// import * as XLSX from 'xlsx';
// import { jsPDF } from 'jspdf';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

// Define types for window globals
declare global {
  interface Window {
    XLSX: any;
    jspdf: any;
    __app_id: string | undefined;
    __firebase_config: string | undefined;
    __initial_auth_token: string | undefined;
  }
}

// Global variables provided by the Canvas environment
const __app_id = window.__app_id;
const __firebase_config = window.__firebase_config;
const __initial_auth_token = window.__initial_auth_token;


// Define the structure for a student's data
interface StudentData {
  id?: string; // Firestore document ID
  pendidikan: string;
  nama: string;
  nosis: string;
  pangkat: string;
  kelas: string;
  [key: string]: string | number | null | undefined; // For subject scores
}

const App: React.FC = () => {
  const [password, setPassword] = useState<string>('');
  const [userRole, setUserRole] = useState<'guest' | 'admin' | 'student'>('guest');
  const [data, setData] = useState<StudentData[]>([]);
  const [filteredData, setFilteredData] = useState<StudentData[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Firebase state
  const [db, setDb] = useState<any>(null);
  const [auth, setAuth] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  // Input refs for manual data entry
  const pendidikanRef = useRef<HTMLInputElement>(null);
  const namaRef = useRef<HTMLInputElement>(null);
  const nosisRef = useRef<HTMLInputElement>(null);
  const pangkatRef = useRef<HTMLInputElement>(null);
  const kelasRef = useRef<HTMLInputElement>(null);
  const mataPelajaranRef = useRef<HTMLSelectElement>(null);
  const nilaiRef = useRef<HTMLInputElement>(null);

  // List of subjects
  const mataPelajaran = [
    "Studi Kasus", "CMI", "P3", "Nikpur", "Navigasi", "Offline Map",
    "Taktik Gerilya", "OLI", "Patroli Gunung Hutan", "Patroli Medsus",
    "Baksi", "Baksi Lanjutan", "Bakpur Lanjutan", "Nikgarlat",
    "UTP", "Perkemil", "Limed", "Renmil", "Ralasuntai",
    "Mountenering", "Hanmars", "Garjas"
  ];

  // Initialize Firebase and set up auth listener
  useEffect(() => {
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {};

      if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is not provided. Please ensure __firebase_config is set.");
        setMessage({ text: 'Error: Konfigurasi Firebase tidak ditemukan.', type: 'error' });
        setIsLoading(false);
        return;
      }

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          try {
            // Sign in anonymously if no token is provided, or if the token fails
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase authentication error:", error);
            setMessage({ text: `Kesalahan autentikasi Firebase: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
            setIsAuthReady(true); // Still set ready to allow UI to proceed, but with error
          }
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setMessage({ text: `Error inisialisasi Firebase: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
      setIsLoading(false);
    }
  }, []);

  // Fetch data from Firestore once auth is ready
  useEffect(() => {
    if (!db || !isAuthReady || !userId) {
      return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const dataCollectionRef = collection(db, `artifacts/${appId}/public/data/students`);

    const unsubscribe = onSnapshot(dataCollectionRef, (snapshot) => {
      const students: StudentData[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<StudentData, 'id'>
      }));
      setData(students);
      setFilteredData(students);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching data from Firestore:", error);
      setMessage({ text: `Gagal memuat data dari Firestore: ${error.message}`, type: 'error' });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, isAuthReady, userId]);

  const handleLogin = () => {
    if (password === 'Staf Urdik') {
      setUserRole('admin');
      showMessage('Login sebagai Admin berhasil!', 'success');
    } else if (password === 'Diktukba 2025') {
      setUserRole('student');
      showMessage('Login sebagai Siswa berhasil!', 'success');
    } else {
      showMessage('Kata sandi salah!', 'error');
    }
  };

  const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000); // Hide message after 3 seconds
  };

  const handleAddData = useCallback(async () => {
    if (!db || !userId) {
      showMessage('Firebase belum siap atau pengguna belum terautentikasi.', 'error');
      return;
    }

    const pendidikan = pendidikanRef.current?.value || '';
    const nama = namaRef.current?.value || '';
    const nosis = nosisRef.current?.value || '';
    const pangkat = pangkatRef.current?.value || '';
    const kelas = kelasRef.current?.value || '';
    const mataPelajaranSelected = mataPelajaranRef.current?.value || '';
    const nilai = parseInt(nilaiRef.current?.value || '0');

    if (!nama || !nosis || !pangkat || !mataPelajaranSelected || isNaN(nilai)) {
      showMessage('Harap lengkapi semua field yang diperlukan (Nama, Nosis, Pangkat, Mata Pelajaran, Nilai).', 'error');
      return;
    }

    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const studentDocRef = doc(db, `artifacts/${appId}/public/data/students`, nosis); // Use nosis as document ID

      const docSnap = await getDoc(studentDocRef);

      if (docSnap.exists()) {
        // Update existing student
        const updatedData = { [mataPelajaranSelected]: nilai };
        await updateDoc(studentDocRef, updatedData);
        showMessage('Data siswa berhasil diperbarui!', 'success');
      } else {
        // Add new student
        const newStudent: StudentData = {
          pendidikan,
          nama,
          nosis,
          pangkat,
          kelas,
        };
        mataPelajaran.forEach(mp => {
          newStudent[mp] = null; // Initialize all subjects to null
        });
        newStudent[mataPelajaranSelected] = nilai; // Set the current subject's score
        await setDoc(studentDocRef, newStudent);
        showMessage('Data siswa baru berhasil ditambahkan!', 'success');
      }

      // Clear inputs after successful add/update
      clearInputs();
    } catch (error) {
      console.error('Error adding/updating data to Firestore:', error);
      showMessage(`Gagal menyimpan data ke Firestore: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [db, userId, mataPelajaran]); // Dependencies for useCallback

  const handleProcessExcel = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!db || !userId) {
      showMessage('Firebase belum siap atau pengguna belum terautentikasi.', 'error');
      return;
    }

    // Check if XLSX is available globally
    if (typeof window.XLSX === 'undefined') {
      showMessage('Pustaka XLSX tidak dimuat. Pastikan Anda memiliki CDN XLSX di HTML utama Anda.', 'error');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      showMessage('Pilih file Excel terlebih dahulu!', 'info');
      return;
    }

    showMessage('Memproses file Excel...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const workbook = window.XLSX.read(e.target?.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const excelData = window.XLSX.utils.sheet_to_json(sheet) as any[];

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        for (const row of excelData) {
          const nosis = String(row['Nosis'] || '').trim();
          if (!nosis) {
            console.warn('Baris dilewati karena Nosis kosong:', row);
            continue;
          }

          const studentDocRef = doc(db, `artifacts/${appId}/public/data/students`, nosis);
          const docSnap = await getDoc(studentDocRef);
          let studentData: StudentData;

          if (docSnap.exists()) {
            studentData = docSnap.data() as StudentData;
          } else {
            studentData = {
              pendidikan: String(row['Pendidikan'] || ''),
              nama: String(row['Nama Siswa'] || ''),
              nosis: nosis,
              pangkat: String(row['Pangkat'] || ''),
              kelas: String(row['Kelas/Ton/Kompi'] || ''),
            };
            mataPelajaran.forEach(mp => studentData[mp] = null); // Initialize all subjects
          }

          // Update subject scores from the Excel row
          mataPelajaran.forEach(mp => {
            if (row[mp] !== undefined && row[mp] !== null && !isNaN(parseInt(row[mp]))) {
              studentData[mp] = parseInt(row[mp]);
            }
          });

          // Update or set the document in Firestore
          await setDoc(studentDocRef, studentData, { merge: true });
        }
        showMessage('Data Excel berhasil diproses dan disimpan!', 'success');
      } catch (error) {
        console.error('Error processing Excel file:', error);
        showMessage(`Gagal memproses file Excel: ${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        // Clear file input
        if (event.target) (event.target as HTMLInputElement).value = '';
      }
    };
    reader.readAsBinaryString(file);
  }, [db, userId, mataPelajaran]); // Dependencies for useCallback

  const handleSearchData = () => {
    const term = searchTerm.toLowerCase();
    if (term === '') {
      setFilteredData(data);
    } else {
      const results = data.filter(item =>
        item.nosis.toLowerCase().includes(term) ||
        item.nama.toLowerCase().includes(term)
      );
      setFilteredData(results);
    }
  };

  const handleResetSearch = () => {
    setSearchTerm('');
    setFilteredData(data);
  };

  const clearInputs = () => {
    if (pendidikanRef.current) pendidikanRef.current.value = '';
    if (namaRef.current) namaRef.current.value = '';
    if (nosisRef.current) nosisRef.current.value = '';
    if (pangkatRef.current) pangkatRef.current.value = '';
    if (kelasRef.current) kelasRef.current.value = '';
    if (mataPelajaranRef.current) mataPelajaranRef.current.value = '';
    if (nilaiRef.current) nilaiRef.current.value = '';
  };

  const handleDownloadPDF = () => {
    // Check if jsPDF is available globally
    if (typeof window.jspdf === 'undefined' || typeof (window.jspdf as any).jsPDF === 'undefined') {
      showMessage('Pustaka jsPDF tidak dimuat. Pastikan Anda memiliki CDN jsPDF di HTML utama Anda.', 'error');
      return;
    }
    // Access jsPDF from the window object
    const { jsPDF } = (window.jspdf as any);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    
    doc.setFontSize(16);
    doc.text('Hasil Nilai Siswa Dodiklatpur Rindam XV/Pattimura', pageWidth / 2, margin, { align: 'center' });

    // Table headers
    const headers = ["Nama Siswa", "Nosis", "Pangkat", ...mataPelajaran];
    const columnWidths = [30, 20, 20]; // Nama, Nosis, Pangkat
    const totalSubjectWidth = pageWidth - margin * 2 - columnWidths.reduce((a, b) => a + b, 0);
    const subjectWidth = totalSubjectWidth / mataPelajaran.length;
    mataPelajaran.forEach(() => columnWidths.push(subjectWidth));

    const tableData = filteredData.map(item => {
        const row: (string | number | null)[] = [item.nama, item.nosis, item.pangkat];
        mataPelajaran.forEach(mp => {
            row.push(item[mp] !== null && item[mp] !== undefined ? item[mp] : '-');
        });
        return row;
    });

    if (typeof (doc as any).autoTable === 'undefined') {
        showMessage('Plugin jspdf-autotable tidak dimuat. Pastikan Anda memiliki CDN jspdf-autotable di HTML utama Anda.', 'error');
        return;
    }

    (doc as any).autoTable({
        head: [headers],
        body: tableData,
        startY: margin + 10,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
        headStyles: { fillColor: [47, 75, 41], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        columnStyles: columnWidths.reduce((acc: any, width, index) => {
            acc[index] = { cellWidth: width };
            return acc;
        }, {}),
        margin: { top: margin, bottom: margin, left: margin, right: margin },
        didDrawPage: function (data: any) {
            if (data.pageNumber > 1) {
                doc.setFontSize(16);
                doc.text('Hasil Nilai Siswa Dodiklatpur Rindam XV/Pattimura (Lanjutan)', pageWidth / 2, margin, { align: 'center' });
            }
        }
    });

    doc.save('Hasil_Nilai_Siswa.pdf');
  };

  if (!isAuthReady || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-lg">Memuat aplikasi dan data...</p>
          {message && (
            <div className={`mt-2 p-2 rounded-md ${message.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto p-4 overlay flex-grow">
        <header className="military-pattern rounded-lg p-6 mb-6 flex flex-col md:flex-row items-center justify-center gap-6 military-border shadow-lg">
          <img src="https://iili.io/FxvkDJt.png" alt="Logo Aplikasi Kiri" className="logo-app" onError={(e) => (e.currentTarget.src = 'https://placehold.co/80x80/2f4b29/ffffff?text=Logo')} />
          <h1 className="text-2xl md:text-4xl font-bold text-center text-white">Aplikasi Data Nilai Dodiklatpur Rindam XV/Pattimura</h1>
          <img src="https://iili.io/Fxw9se4.png" alt="Logo Aplikasi Kanan" className="logo-app" onError={(e) => (e.currentTarget.src = 'https://placehold.co/80x80/2f4b29/ffffff?text=Logo')} />
        </header>

        {message && (
          <div className={`p-3 mb-4 rounded-md text-center text-white ${message.type === 'success' ? 'bg-green-600' : message.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
            {message.text}
          </div>
        )}

        {userRole === 'guest' && (
          <div id="loginSection" className="bg-black bg-opacity-90 p-6 rounded-lg shadow-lg max-w-md mx-auto mb-6 military-border">
            <h2 className="text-xl font-semibold mb-4 text-center text-white">Login</h2>
            <input
              id="passwordInput"
              type="password"
              placeholder="Masukkan kata sandi"
              className="w-full p-2 mb-4 rounded bg-gray-800 text-white military-border focus:ring-green-500 focus:border-green-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              onClick={handleLogin}
              className="w-full bg-green-900 hover:bg-green-950 text-white p-2 rounded military-border shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
            >
              Masuk
            </button>
          </div>
        )}

        {(userRole === 'admin') && (
          <div id="adminSection" className="space-y-6">
            <div className="bg-black bg-opacity-90 p-6 rounded-lg shadow-lg mb-6 military-border">
              <h2 className="text-xl font-semibold mb-4 text-white">Input Data Excel</h2>
              <input
                type="file"
                id="excelInput"
                accept=".xlsx,.xls"
                className="mb-4 text-white block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                onChange={handleProcessExcel}
              />
            </div>

            <div className="bg-black bg-opacity-90 p-6 rounded-lg shadow-lg mb-6 military-border">
              <h2 className="text-xl font-semibold mb-4 text-center text-white">Input Data Manual</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
                <input ref={pendidikanRef} placeholder="Pendidikan" className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500" />
                <input ref={namaRef} placeholder="Nama Siswa" className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500" />
                <input ref={nosisRef} placeholder="Nosis" className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500" />
                <input ref={pangkatRef} placeholder="Pangkat" className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500" />
                <input ref={kelasRef} placeholder="Kelas/Ton/Kompi" className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500" />
                <select ref={mataPelajaranRef} className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500">
                  <option value="">Pilih Mata Pelajaran</option>
                  {mataPelajaran.map((mp, index) => (
                    <option key={index} value={mp}>{mp}</option>
                  ))}
                </select>
                <input ref={nilaiRef} type="number" placeholder="Nilai" className="p-2 rounded military-border bg-gray-800 text-white focus:ring-green-500 focus:border-green-500" />
              </div>
              <button
                onClick={handleAddData}
                className="w-full bg-green-900 hover:bg-green-950 text-white p-2 rounded military-border shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
              >
                Tambah Data
              </button>
            </div>
          </div>
        )}

        {(userRole === 'admin' || userRole === 'student') && (
          <div id="studentSection" className="bg-black bg-opacity-90 p-6 rounded-lg shadow-lg mb-6 military-border">
            <h2 className="text-xl font-semibold mb-4 text-white">Hasil Nilai Siswa</h2>
            <div className="flex flex-col md:flex-row gap-2 mb-4">
              <input
                id="searchInput"
                type="text"
                placeholder="Cari berdasarkan Nosis atau Nama"
                className="p-2 rounded bg-gray-800 text-white flex-grow military-border focus:ring-green-500 focus:border-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter') handleSearchData(); }}
              />
              <button
                onClick={handleSearchData}
                className="bg-green-900 hover:bg-green-950 text-white p-2 rounded military-border shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
              >
                Cari
              </button>
              <button
                onClick={handleResetSearch}
                className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded military-border shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75"
              >
                Reset
              </button>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="bg-green-900 hover:bg-green-950 text-white p-2 rounded mb-4 military-border shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
            >
              Unduh PDF
            </button>
            <div className="table-container overflow-x-auto rounded-lg military-border">
              <table id="dataTable" className="w-full bg-black">
                <thead className="military-pattern text-white">
                  <tr>
                    <th className="p-3 text-left">Nama Siswa</th>
                    <th className="p-3 text-left">Nosis</th>
                    <th className="p-3 text-left">Pangkat</th>
                    {mataPelajaran.map((mp, index) => (
                      <th key={index} className="p-3 text-left">{mp}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-white">
                  {filteredData.length > 0 ? (
                    filteredData.map((item, index) => (
                      <tr key={item.id || index} className="border-t border-gray-700">
                        <td className="p-3">{item.nama}</td>
                        <td className="p-3">{item.nosis}</td>
                        <td className="p-3">{item.pangkat}</td>
                        {mataPelajaran.map((mp, mpIndex) => (
                          <td key={mpIndex} className="p-3">{item[mp] !== null && item[mp] !== undefined ? item[mp] : '-'}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={mataPelajaran.length + 3} className="p-4 text-center text-gray-400">
                        Tidak ada data yang tersedia atau ditemukan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-sm text-gray-400">
              <p>ID Pengguna Saat Ini: {userId || 'Belum Terautentikasi'}</p>
            </div>
          </div>
        )}
      </div>

      <footer className="bg-black bg-opacity-90 p-4 mt-auto text-center text-white text-sm military-border w-full shadow-lg">
        Dikembangkan oleh Serka M. Tofan
      </footer>
    </div>
  );
};

export default App; 