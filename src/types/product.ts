export interface Product {
    id: string;
    company_id: string;
    code: string | null;
    description: string;
    family: string | null;
    ncm: string | null;
    cest: string | null;
    price: number;
    cost_price: number;
    activity: string | null;
    taxation_type: string | null;
    is_active: boolean;
    created_at: string;
    account_id?: string | null;
}
