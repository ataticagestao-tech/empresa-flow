
export const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
};

export const formatDate = (date: Date | string) => {
    let d: Date;
    if (typeof date === 'string') {
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T00:00:00' : date;
        d = new Date(iso);
    } else {
        d = date;
    }
    return new Intl.DateTimeFormat('pt-BR').format(d);
};
