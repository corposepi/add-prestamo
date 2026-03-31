// ============================================
// DATA LAYER - Manejo de datos con Firebase + Cache local
// ============================================

const DB = {
    // Obtener datos (desde FirebaseSync cache)
    getClientes() {
        return FirebaseSync.getClientes();
    },

    getPrestamos() {
        return FirebaseSync.getPrestamos();
    },

    getMovimientos() {
        return FirebaseSync.getMovimientos();
    },

    // Guardar datos (actualiza cache + Firebase)
    saveClientes(clientes) {
        FirebaseSync.saveClientes(clientes);
    },

    savePrestamos(prestamos) {
        FirebaseSync.savePrestamos(prestamos);
    },

    saveMovimientos(movimientos) {
        FirebaseSync.saveMovimientos(movimientos);
    },

    // CRUD Clientes
    agregarCliente(cliente) {
        const clientes = this.getClientes();
        cliente.id = Date.now().toString();
        cliente.fechaRegistro = new Date().toISOString();
        clientes.push(cliente);
        this.saveClientes(clientes);
        return cliente;
    },

    actualizarCliente(id, datos) {
        const clientes = this.getClientes();
        const idx = clientes.findIndex(c => c.id === id);
        if (idx !== -1) {
            clientes[idx] = { ...clientes[idx], ...datos };
            this.saveClientes(clientes);
            return clientes[idx];
        }
        return null;
    },

    eliminarCliente(id) {
        const prestamos = this.getPrestamos().filter(p => p.clienteId === id && p.estado === 'activo');
        if (prestamos.length > 0) return false;
        const clientes = this.getClientes().filter(c => c.id !== id);
        this.saveClientes(clientes);
        return true;
    },

    getClienteById(id) {
        return this.getClientes().find(c => c.id === id) || null;
    },

    // CRUD Prestamos
    agregarPrestamo(prestamo) {
        const prestamos = this.getPrestamos();
        prestamo.id = Date.now().toString();
        prestamo.estado = 'activo';
        prestamo.saldoCapital = prestamo.montoCapital;
        prestamo.saldoFavor = 0;
        prestamo.fechaCreacion = new Date().toISOString();
        prestamos.push(prestamo);
        this.savePrestamos(prestamos);

        // Registrar movimiento de desembolso
        this.agregarMovimiento({
            prestamoId: prestamo.id,
            clienteId: prestamo.clienteId,
            tipo: 'desembolso',
            fecha: prestamo.fechaPrestamo,
            interesDescontado: prestamo.interesAdelantado,
            montoEntregado: prestamo.montoEntregado,
            capitalMovimiento: 0,
            saldoCapital: prestamo.saldoCapital,
            notas: `Prestamo creado. Capital: ${Utils.formatMoney(prestamo.montoCapital)}. Interes adelantado: ${Utils.formatMoney(prestamo.interesAdelantado)}. Entregado: ${Utils.formatMoney(prestamo.montoEntregado)}`
        });

        return prestamo;
    },

    getPrestamoById(id) {
        return this.getPrestamos().find(p => p.id === id) || null;
    },

    getPrestamosActivos() {
        return this.getPrestamos().filter(p => p.estado === 'activo');
    },

    getPrestamosPorCliente(clienteId) {
        return this.getPrestamos().filter(p => p.clienteId === clienteId);
    },

    actualizarPrestamo(id, datos) {
        const prestamos = this.getPrestamos();
        const idx = prestamos.findIndex(p => p.id === id);
        if (idx !== -1) {
            prestamos[idx] = { ...prestamos[idx], ...datos };
            this.savePrestamos(prestamos);
            return prestamos[idx];
        }
        return null;
    },

    // Registrar Pago
    // tipoPago: 'interes', 'abono_capital', 'pago_total', 'monto_libre'
    registrarPago(prestamoId, tipoPago, datos, fechaPago, notas) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo) return null;

        const interesMensual = prestamo.saldoCapital * (prestamo.tasaInteres / 100);
        let totalInteresPagado = 0;
        let capitalPagado = 0;
        let nuevoSaldo = prestamo.saldoCapital;
        let nuevoSaldoFavor = prestamo.saldoFavor || 0;
        const usarFavor = datos.usarSaldoFavor && nuevoSaldoFavor > 0;
        let favorUsado = 0;

        switch (tipoPago) {
            case 'interes': {
                totalInteresPagado = interesMensual;
                // Si usa saldo a favor, descuenta del interes
                if (usarFavor) {
                    favorUsado = Math.min(nuevoSaldoFavor, interesMensual);
                    nuevoSaldoFavor -= favorUsado;
                }
                break;
            }

            case 'abono_capital': {
                totalInteresPagado = interesMensual;
                capitalPagado = datos.montoAbono || 0;
                nuevoSaldo = prestamo.saldoCapital - capitalPagado;
                // Si usa saldo a favor, descuenta del interes primero
                if (usarFavor) {
                    favorUsado = Math.min(nuevoSaldoFavor, interesMensual);
                    nuevoSaldoFavor -= favorUsado;
                }
                break;
            }

            case 'pago_total': {
                const resumenMora = this.getResumenMora(prestamoId);
                totalInteresPagado = resumenMora.totalInteresMora > 0 ? resumenMora.totalInteresMora : interesMensual;
                capitalPagado = prestamo.saldoCapital;
                // Si usa saldo a favor, se descuenta del total (intereses + capital)
                if (usarFavor) {
                    favorUsado = nuevoSaldoFavor; // Usa todo el saldo a favor
                }
                nuevoSaldo = 0;
                nuevoSaldoFavor = 0;
                break;
            }

            case 'monto_libre': {
                const montoPago = datos.montoPago || 0;
                const resumenMora = this.getResumenMora(prestamoId);
                const cuotasMora = resumenMora.cuotas.filter(c => c.estado === 'mora');
                let restante = montoPago;

                // 1. Cubrir cuotas de interes en mora (solo meses COMPLETOS)
                // Registrar un movimiento POR CADA MES cubierto
                let mesesCubiertos = 0;
                cuotasMora.forEach(c => {
                    if (restante >= c.interesMes) {
                        totalInteresPagado += c.interesMes;
                        restante -= c.interesMes;
                        mesesCubiertos++;
                        // Movimiento individual por cada mes
                        this.agregarMovimiento({
                            prestamoId,
                            clienteId: prestamo.clienteId,
                            tipo: 'pago_interes',
                            fecha: c.fechaVencimiento, // Fecha de la cuota que cubre
                            interesPagado: c.interesMes,
                            capitalMovimiento: 0,
                            saldoCapital: prestamo.saldoCapital,
                            saldoFavor: 0,
                            notas: `Pago interes ${c.mes} (pago libre del ${fechaPago})`
                        });
                    }
                });

                // 2. Lo que sobra queda como saldo a favor (NO va a capital)
                if (restante > 0) {
                    nuevoSaldoFavor += restante;
                }

                // Actualizar prestamo
                this.actualizarPrestamo(prestamoId, {
                    saldoCapital: nuevoSaldo,
                    saldoFavor: nuevoSaldoFavor
                });

                // Movimiento resumen del pago libre
                const movLibre = this.agregarMovimiento({
                    prestamoId,
                    clienteId: prestamo.clienteId,
                    tipo: 'pago_libre',
                    fecha: fechaPago,
                    interesPagado: totalInteresPagado,
                    capitalMovimiento: 0,
                    saldoCapital: nuevoSaldo,
                    saldoFavor: nuevoSaldoFavor,
                    notas: notas || `Pago libre ${Utils.formatMoney(montoPago)}: ${mesesCubiertos} mes(es) cubiertos${nuevoSaldoFavor > 0 ? ', saldo a favor: ' + Utils.formatMoney(nuevoSaldoFavor) : ''}`
                });

                return {
                    movimiento: movLibre,
                    interesPagado: totalInteresPagado,
                    capitalPagado: 0,
                    nuevoSaldo,
                    nuevoSaldoFavor,
                    totalPagado: montoPago
                };
            }
        }

        // Para los demas tipos (interes, abono_capital, pago_total)
        const updates = { saldoCapital: nuevoSaldo, saldoFavor: nuevoSaldoFavor };
        if (nuevoSaldo === 0) {
            updates.estado = 'pagado';
            updates.fechaPago = fechaPago;
            updates.saldoFavor = 0;
        }
        this.actualizarPrestamo(prestamoId, updates);

        let tipoMov = 'pago_interes';
        if (capitalPagado > 0 && nuevoSaldo === 0) tipoMov = 'pago_total';
        else if (capitalPagado > 0) tipoMov = 'abono_capital';

        const totalPagado = totalInteresPagado + capitalPagado - favorUsado;
        const movimiento = this.agregarMovimiento({
            prestamoId,
            clienteId: prestamo.clienteId,
            tipo: tipoMov,
            fecha: fechaPago,
            interesPagado: totalInteresPagado,
            capitalMovimiento: capitalPagado,
            saldoCapital: nuevoSaldo,
            saldoFavor: nuevoSaldoFavor,
            favorUsado: favorUsado,
            notas: notas || ''
        });

        return {
            movimiento,
            interesPagado: totalInteresPagado,
            capitalPagado,
            nuevoSaldo,
            nuevoSaldoFavor,
            favorUsado,
            totalPagado
        };
    },

    // Aplicar saldo a favor como abono a capital
    aplicarSaldoFavorACapital(prestamoId) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo || !prestamo.saldoFavor || prestamo.saldoFavor <= 0) return null;

        const saldoFavor = prestamo.saldoFavor;
        const abonoCapital = Math.min(saldoFavor, prestamo.saldoCapital);
        const nuevoSaldo = prestamo.saldoCapital - abonoCapital;
        const nuevoSaldoFavor = saldoFavor - abonoCapital;

        const updates = { saldoCapital: nuevoSaldo, saldoFavor: nuevoSaldoFavor };
        if (nuevoSaldo === 0) {
            updates.estado = 'pagado';
            updates.fechaPago = Utils.hoy();
            updates.saldoFavor = 0;
        }
        this.actualizarPrestamo(prestamoId, updates);

        const movimiento = this.agregarMovimiento({
            prestamoId,
            clienteId: prestamo.clienteId,
            tipo: 'abono_capital',
            fecha: Utils.hoy(),
            interesPagado: 0,
            capitalMovimiento: abonoCapital,
            saldoCapital: nuevoSaldo,
            saldoFavor: nuevoSaldoFavor,
            notas: `Saldo a favor (${Utils.formatMoney(saldoFavor)}) aplicado a capital. Abono: ${Utils.formatMoney(abonoCapital)}`
        });

        return {
            movimiento,
            abonoCapital,
            nuevoSaldo,
            nuevoSaldoFavor
        };
    },

    // Extender plazo
    extenderPlazo(prestamoId, nuevaFecha, notas) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo) return null;

        const fechaAnterior = prestamo.fechaVencimiento;
        this.actualizarPrestamo(prestamoId, { fechaVencimiento: nuevaFecha });

        this.agregarMovimiento({
            prestamoId,
            clienteId: prestamo.clienteId,
            tipo: 'extension',
            fecha: new Date().toISOString().split('T')[0],
            interesPagado: 0,
            capitalMovimiento: 0,
            saldoCapital: prestamo.saldoCapital,
            notas: notas || `Plazo extendido de ${fechaAnterior} a ${nuevaFecha}`
        });

        return true;
    },

    // Movimientos
    agregarMovimiento(movimiento) {
        const movimientos = this.getMovimientos();
        movimiento.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        movimiento.fechaRegistro = new Date().toISOString();
        movimientos.push(movimiento);
        this.saveMovimientos(movimientos);
        return movimiento;
    },

    getMovimientosPorPrestamo(prestamoId) {
        return this.getMovimientos().filter(m => m.prestamoId === prestamoId);
    },

    getMovimientosPorCliente(clienteId) {
        return this.getMovimientos().filter(m => m.clienteId === clienteId);
    },

    // ==========================================
    // NOTIFICACIONES WHATSAPP
    // ==========================================
    getNotificaciones() {
        return FirebaseSync.getNotificaciones();
    },

    saveNotificaciones(notifs) {
        FirebaseSync.saveNotificaciones(notifs);
    },

    registrarNotificacion(prestamoId, tipo, fecha) {
        const notifs = this.getNotificaciones();
        notifs.push({
            id: Date.now().toString(),
            prestamoId,
            tipo, // 'pre_vencimiento', 'mora', 'mora_recurrente'
            fecha,
            fechaEnvio: new Date().toISOString()
        });
        this.saveNotificaciones(notifs);
    },

    fueNotificadoHoy(prestamoId, tipo) {
        const hoy = Utils.hoy();
        return this.getNotificaciones().some(
            n => n.prestamoId === prestamoId && n.tipo === tipo && n.fecha === hoy
        );
    },

    // Obtener alertas pendientes de envio
    // Siempre muestra alerta si hay mora de intereses o si faltan 5 dias para vencer
    getAlertasPendientes() {
        const activos = this.getPrestamosActivos();
        const hoy = Utils.hoy();
        const alertas = [];

        activos.forEach(p => {
            const cliente = this.getClienteById(p.clienteId);
            if (!cliente || !cliente.telefono) return;

            const diasRestantes = Utils.diasEntre(hoy, p.fechaVencimiento);
            const resumenMora = this.getResumenMora(p.id);

            // 1. Si tiene meses en mora de interes -> SIEMPRE mostrar alerta
            if (resumenMora.mesesMora > 0) {
                if (!this.fueNotificadoHoy(p.id, 'mora_intereses')) {
                    alertas.push({
                        prestamoId: p.id,
                        clienteId: p.clienteId,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.telefono,
                        tipo: 'mora_intereses',
                        mesesMora: resumenMora.mesesMora,
                        totalInteresMora: resumenMora.totalInteresMora,
                        deudaTotal: resumenMora.deudaTotal,
                        diasMora: diasRestantes < 0 ? Math.abs(diasRestantes) : 0,
                        saldoCapital: p.saldoCapital,
                        interesMensual: p.saldoCapital * (p.tasaInteres / 100),
                        fechaVencimiento: p.fechaVencimiento,
                        tasaInteres: p.tasaInteres,
                        cuotasMora: resumenMora.cuotas.filter(c => c.estado === 'mora')
                    });
                }
            }

            // 2. Faltando 5 dias para vencer capital (y sin mora de intereses)
            if (resumenMora.mesesMora === 0 && diasRestantes > 0 && diasRestantes <= 5) {
                if (!this.fueNotificadoHoy(p.id, 'pre_vencimiento')) {
                    alertas.push({
                        prestamoId: p.id,
                        clienteId: p.clienteId,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.telefono,
                        tipo: 'pre_vencimiento',
                        diasRestantes,
                        saldoCapital: p.saldoCapital,
                        interesMensual: p.saldoCapital * (p.tasaInteres / 100),
                        fechaVencimiento: p.fechaVencimiento,
                        tasaInteres: p.tasaInteres
                    });
                }
            }

            // 3. Capital vencido pero sin mora de intereses
            if (resumenMora.mesesMora === 0 && diasRestantes < 0) {
                if (!this.fueNotificadoHoy(p.id, 'capital_vencido')) {
                    alertas.push({
                        prestamoId: p.id,
                        clienteId: p.clienteId,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.telefono,
                        tipo: 'capital_vencido',
                        diasMora: Math.abs(diasRestantes),
                        saldoCapital: p.saldoCapital,
                        interesMensual: p.saldoCapital * (p.tasaInteres / 100),
                        fechaVencimiento: p.fechaVencimiento,
                        tasaInteres: p.tasaInteres
                    });
                }
            }
        });

        return alertas;
    },

    // ==========================================
    // CALCULO DE MORA MES A MES
    // ==========================================
    // Genera las cuotas mensuales de interes esperadas desde el inicio
    // del prestamo hasta hoy, y verifica cuales fueron pagadas
    getCuotasMensuales(prestamoId) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo) return [];

        const movimientos = this.getMovimientosPorPrestamo(prestamoId)
            .filter(m => m.tipo === 'pago_interes' || m.tipo === 'abono_capital' || m.tipo === 'pago_total')
            .map(m => ({ ...m })) // Copia profunda para no contaminar cache
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        const cuotas = [];
        const fechaInicio = new Date(prestamo.fechaPrestamo + 'T00:00:00');
        const hoy = new Date(Utils.hoy() + 'T00:00:00');

        // El primer mes de interes ya se desconto adelantado
        // Las cuotas empiezan desde el mes siguiente al prestamo
        let fechaCuota = new Date(fechaInicio);
        fechaCuota.setMonth(fechaCuota.getMonth() + 1);

        // Reconstruir saldo de capital en cada periodo
        let saldoCapital = prestamo.montoCapital;
        let cuotaNum = 1;

        // Rastrear abonos a capital para saber el saldo en cada momento
        const abonosCapital = this.getMovimientosPorPrestamo(prestamoId)
            .filter(m => m.tipo === 'abono_capital' || m.tipo === 'pago_total')
            .map(m => ({ ...m })) // Copia profunda para no contaminar cache
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        while (fechaCuota <= hoy) {
            const fechaStr = fechaCuota.toISOString().split('T')[0];
            const mesStr = fechaCuota.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });

            // Verificar si hubo abonos a capital ANTES de esta cuota
            // que reduzcan el saldo para calcular el interes correcto
            abonosCapital.forEach(ab => {
                const fechaAbono = new Date(ab.fecha + 'T00:00:00');
                // Si el abono fue antes o en la fecha de esta cuota
                // y aun no lo hemos descontado
                if (fechaAbono <= fechaCuota && ab._procesado !== true) {
                    saldoCapital -= ab.capitalMovimiento;
                    ab._procesado = true;
                }
            });

            if (saldoCapital <= 0) break; // Ya pago todo

            const interesMes = saldoCapital * (prestamo.tasaInteres / 100);

            // Buscar si hay un pago que cubra esta cuota
            // Un pago cubre la cuota del mes si su fecha es cercana a la fecha de cuota
            // (dentro del mismo periodo mensual)
            const fechaInicioMes = new Date(fechaCuota);
            fechaInicioMes.setMonth(fechaInicioMes.getMonth() - 1);
            fechaInicioMes.setDate(fechaInicioMes.getDate() + 1);

            const pagoDelMes = movimientos.find(m => {
                const fechaPago = new Date(m.fecha + 'T00:00:00');
                return fechaPago > fechaInicioMes && fechaPago <= fechaCuota && !m._usada;
            });

            // Tambien buscar pagos hechos despues de la cuota pero antes de la siguiente
            const fechaSiguiente = new Date(fechaCuota);
            fechaSiguiente.setMonth(fechaSiguiente.getMonth() + 1);

            const pagoTardio = !pagoDelMes ? movimientos.find(m => {
                const fechaPago = new Date(m.fecha + 'T00:00:00');
                return fechaPago > fechaCuota && fechaPago < fechaSiguiente && !m._usada;
            }) : null;

            const pago = pagoDelMes || pagoTardio;
            let estado = 'mora';

            if (pago) {
                pago._usada = true;
                estado = 'pagado';
            } else if (fechaCuota > hoy) {
                estado = 'pendiente';
            }

            cuotas.push({
                numero: cuotaNum,
                fechaVencimiento: fechaStr,
                mes: mesStr,
                saldoCapital: saldoCapital,
                interesMes: interesMes,
                estado: estado,
                pago: pago || null
            });

            cuotaNum++;
            fechaCuota.setMonth(fechaCuota.getMonth() + 1);
        }

        return cuotas;
    },

    // Resumen de mora de un prestamo
    getResumenMora(prestamoId) {
        const cuotas = this.getCuotasMensuales(prestamoId);
        const enMora = cuotas.filter(c => c.estado === 'mora');
        const pagadas = cuotas.filter(c => c.estado === 'pagado');
        const prestamo = this.getPrestamoById(prestamoId);

        const totalInteresMora = enMora.reduce((sum, c) => sum + c.interesMes, 0);
        const totalInteresPagado = pagadas.reduce((sum, c) => sum + c.interesMes, 0);
        // La deuda total es: saldo capital + intereses en mora
        const deudaTotal = (prestamo ? prestamo.saldoCapital : 0) + totalInteresMora;

        return {
            cuotas,
            mesesMora: enMora.length,
            mesesPagados: pagadas.length,
            totalCuotas: cuotas.length,
            totalInteresMora,
            totalInteresPagado,
            deudaTotal
        };
    },

    // Estadisticas
    getEstadisticas() {
        const prestamos = this.getPrestamos();
        const activos = prestamos.filter(p => p.estado === 'activo');
        const movimientos = this.getMovimientos();

        const totalCapital = activos.reduce((sum, p) => sum + p.saldoCapital, 0);
        const totalIntereses = movimientos
            .filter(m => m.interesPagado > 0)
            .reduce((sum, m) => sum + m.interesPagado, 0)
            + movimientos
                .filter(m => m.interesDescontado > 0)
                .reduce((sum, m) => sum + m.interesDescontado, 0);

        // Total mora acumulada
        const totalMora = activos.reduce((sum, p) => {
            const resumen = this.getResumenMora(p.id);
            return sum + resumen.totalInteresMora;
        }, 0);

        const clientesActivos = [...new Set(activos.map(p => p.clienteId))].length;

        return {
            clientesActivos,
            prestamosActivos: activos.length,
            totalCapital,
            totalIntereses,
            totalMora
        };
    }
};
