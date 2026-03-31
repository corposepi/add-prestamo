// ============================================
// UTILIDADES
// ============================================

const Utils = {
    formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        });
    },

    diasEntre(fecha1, fecha2) {
        const d1 = new Date(fecha1);
        const d2 = new Date(fecha2);
        const diff = d2 - d1;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    },

    hoy() {
        return new Date().toISOString().split('T')[0];
    },

    showToast(message, type = 'success') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="${icons[type]}"></i> ${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Modal de confirmacion
    confirm(titulo, mensaje) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('modal-overlay');
            document.getElementById('modal-titulo').textContent = titulo;
            document.getElementById('modal-body').innerHTML = mensaje;
            overlay.classList.add('active');

            const confirmar = document.getElementById('modal-confirmar');
            const cancelar = document.getElementById('modal-cancelar');
            const cerrar = document.getElementById('modal-close');

            function cleanup() {
                overlay.classList.remove('active');
                confirmar.removeEventListener('click', onConfirm);
                cancelar.removeEventListener('click', onCancel);
                cerrar.removeEventListener('click', onCancel);
            }

            function onConfirm() { cleanup(); resolve(true); }
            function onCancel() { cleanup(); resolve(false); }

            confirmar.addEventListener('click', onConfirm);
            cancelar.addEventListener('click', onCancel);
            cerrar.addEventListener('click', onCancel);
        });
    }
};
