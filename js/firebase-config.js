// ============================================
// FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyD705qj6t-IHw7VeYwgZapIQx3inWexdyo",
    authDomain: "prestamo-app-fredy.firebaseapp.com",
    databaseURL: "https://prestamo-app-fredy-default-rtdb.firebaseio.com",
    projectId: "prestamo-app-fredy",
    storageBucket: "prestamo-app-fredy.firebasestorage.app",
    messagingSenderId: "537636360824",
    appId: "1:537636360824:web:05e868d496bdb1a66ad38d"
};

// Inicializar Firebase (formato compat para CDN)
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ============================================
// FIREBASE DATA SYNC - Capa de sincronizacion
// ============================================
// Mantiene un cache local en memoria para lecturas rapidas (sincronas)
// y sincroniza con Firebase en cada escritura
// ============================================

const FirebaseSync = {
    // Cache local en memoria
    _cache: {
        clientes: [],
        prestamos: [],
        movimientos: [],
        notificaciones: []
    },

    _initialized: false,
    _refs: {
        clientes: database.ref('clientes'),
        prestamos: database.ref('prestamos'),
        movimientos: database.ref('movimientos'),
        notificaciones: database.ref('notificaciones')
    },

    // Cargar todos los datos de Firebase al cache local
    async init() {
        // Timeout de 8 segundos para no bloquear si Firebase no responde
        const timeout = (ms) => new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout conectando a Firebase')), ms)
        );

        try {
            const [clientes, prestamos, movimientos, notificaciones] = await Promise.race([
                Promise.all([
                    this._refs.clientes.once('value'),
                    this._refs.prestamos.once('value'),
                    this._refs.movimientos.once('value'),
                    this._refs.notificaciones.once('value')
                ]),
                timeout(8000)
            ]);

            this._cache.clientes = this._snapshotToArray(clientes);
            this._cache.prestamos = this._snapshotToArray(prestamos);
            this._cache.movimientos = this._snapshotToArray(movimientos);
            this._cache.notificaciones = this._snapshotToArray(notificaciones);

            // Si no hay datos en Firebase pero si en localStorage, migrar
            // Solo migra si el usuario lo confirma para evitar subir datos viejos
            if (this._cache.clientes.length === 0 && this._cache.prestamos.length === 0) {
                const hayDatosLocales = JSON.parse(localStorage.getItem('prestamo_clientes') || '[]').length > 0
                    || JSON.parse(localStorage.getItem('prestamo_prestamos') || '[]').length > 0;
                if (hayDatosLocales) {
                    const migrar = confirm('Se encontraron datos locales en este navegador. ¿Desea migrarlos a Firebase?\n\nSi presiona "Cancelar", se iniciara desde cero.');
                    if (migrar) {
                        await this._migrarDesdeLocalStorage();
                    } else {
                        // Limpiar localStorage para que no pregunte de nuevo
                        localStorage.removeItem('prestamo_clientes');
                        localStorage.removeItem('prestamo_prestamos');
                        localStorage.removeItem('prestamo_movimientos');
                        localStorage.removeItem('prestamo_notificaciones');
                    }
                }
            }

            this._initialized = true;
            console.log('Firebase sincronizado. Datos cargados:', {
                clientes: this._cache.clientes.length,
                prestamos: this._cache.prestamos.length,
                movimientos: this._cache.movimientos.length
            });

            // Escuchar cambios en tiempo real (por si se abre en otra pestana)
            this._listenChanges();

            return true;
        } catch (error) {
            console.error('Error conectando a Firebase:', error);
            // Fallback: cargar desde localStorage
            this._cargarDesdeLocalStorage();
            this._initialized = true;
            return false;
        }
    },

    _snapshotToArray(snapshot) {
        const data = snapshot.val();
        if (!data) return [];
        // Firebase guarda como objeto, convertir a array
        if (Array.isArray(data)) return data.filter(Boolean);
        return Object.values(data);
    },

    // Migrar datos existentes de localStorage a Firebase (primera vez)
    async _migrarDesdeLocalStorage() {
        const clientes = JSON.parse(localStorage.getItem('prestamo_clientes') || '[]');
        const prestamos = JSON.parse(localStorage.getItem('prestamo_prestamos') || '[]');
        const movimientos = JSON.parse(localStorage.getItem('prestamo_movimientos') || '[]');
        const notificaciones = JSON.parse(localStorage.getItem('prestamo_notificaciones') || '[]');

        if (clientes.length === 0 && prestamos.length === 0) return;

        console.log('Migrando datos de localStorage a Firebase...');

        // Guardar en Firebase
        const updates = {};
        clientes.forEach((c, i) => { updates[`clientes/${i}`] = c; });
        prestamos.forEach((p, i) => { updates[`prestamos/${i}`] = p; });
        movimientos.forEach((m, i) => { updates[`movimientos/${i}`] = m; });
        notificaciones.forEach((n, i) => { updates[`notificaciones/${i}`] = n; });

        await database.ref().update(updates);

        // Actualizar cache
        this._cache.clientes = clientes;
        this._cache.prestamos = prestamos;
        this._cache.movimientos = movimientos;
        this._cache.notificaciones = notificaciones;

        console.log('Migracion completada:', {
            clientes: clientes.length,
            prestamos: prestamos.length,
            movimientos: movimientos.length
        });
    },

    _cargarDesdeLocalStorage() {
        console.warn('Usando localStorage como fallback');
        this._cache.clientes = JSON.parse(localStorage.getItem('prestamo_clientes') || '[]');
        this._cache.prestamos = JSON.parse(localStorage.getItem('prestamo_prestamos') || '[]');
        this._cache.movimientos = JSON.parse(localStorage.getItem('prestamo_movimientos') || '[]');
        this._cache.notificaciones = JSON.parse(localStorage.getItem('prestamo_notificaciones') || '[]');
    },

    // Escuchar cambios en tiempo real
    _listenChanges() {
        ['clientes', 'prestamos', 'movimientos', 'notificaciones'].forEach(collection => {
            this._refs[collection].on('value', (snapshot) => {
                this._cache[collection] = this._snapshotToArray(snapshot);
            });
        });
    },

    // === LECTURA (sincrona, desde cache) ===
    getClientes() { return [...this._cache.clientes]; },
    getPrestamos() { return [...this._cache.prestamos]; },
    getMovimientos() { return [...this._cache.movimientos]; },
    getNotificaciones() { return [...this._cache.notificaciones]; },

    // === ESCRITURA (actualiza cache + Firebase) ===
    saveClientes(clientes) {
        this._cache.clientes = clientes;
        this._refs.clientes.set(clientes);
        // Backup en localStorage
        localStorage.setItem('prestamo_clientes', JSON.stringify(clientes));
    },

    savePrestamos(prestamos) {
        this._cache.prestamos = prestamos;
        this._refs.prestamos.set(prestamos);
        localStorage.setItem('prestamo_prestamos', JSON.stringify(prestamos));
    },

    saveMovimientos(movimientos) {
        this._cache.movimientos = movimientos;
        this._refs.movimientos.set(movimientos);
        localStorage.setItem('prestamo_movimientos', JSON.stringify(movimientos));
    },

    saveNotificaciones(notificaciones) {
        this._cache.notificaciones = notificaciones;
        this._refs.notificaciones.set(notificaciones);
        localStorage.setItem('prestamo_notificaciones', JSON.stringify(notificaciones));
    }
};
