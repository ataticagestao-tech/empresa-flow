import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Company as CompanyRow } from "@/types/company";

export type Company = Pick<
  CompanyRow,
  | "id"
  | "cnpj"
  | "razao_social"
  | "nome_fantasia"
  | "is_active"
  | "endereco_cidade"
  | "endereco_estado"
  | "activity_profile"
  | "enable_nfse"
  | "enable_nfe"
  | "enable_nfce"
>;

export interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const SELECTED_COMPANY_STORAGE_KEY = "tatica:selected-company";

function loadStoredCompany(): Company | null {
  try {
    const raw = localStorage.getItem(SELECTED_COMPANY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.id) return parsed as Company;
    return null;
  } catch {
    return null;
  }
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, activeClient } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(() => loadStoredCompany());
  const [loading, setLoading] = useState(true);

  // Persiste selectedCompany em localStorage sempre que mudar (independente da origem
  // do set: CompanySelector, fetchCompanies default, delete company, etc).
  useEffect(() => {
    try {
      if (selectedCompany) localStorage.setItem(SELECTED_COMPANY_STORAGE_KEY, JSON.stringify(selectedCompany));
      else localStorage.removeItem(SELECTED_COMPANY_STORAGE_KEY);
    } catch { /* ignore */ }
  }, [selectedCompany]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    if (!user) {
      setCompanies([]);
      setSelectedCompany(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await activeClient
        .from("user_companies")
        .select("is_default, company:companies(id, cnpj, razao_social, nome_fantasia, is_active, endereco_cidade, endereco_estado, activity_profile, enable_nfse, enable_nfe, enable_nfce)")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });

      if (!error) {
        const mapped = (data || [])
          .map((row: any) => ({ company: row.company, is_default: row.is_default }))
          .filter((row: any) => row.company && row.company.is_active);
        mapped.sort((a: any, b: any) => (a.company.razao_social || "").localeCompare(b.company.razao_social || ""));

        const onlyCompanies = mapped.map((row: any) => row.company) as Company[];
        setCompanies(onlyCompanies);

        if (onlyCompanies.length > 0) {
          const defaultCompany = mapped.find((row: any) => row.is_default)?.company || onlyCompanies[0];
          setSelectedCompany((current) => {
            if (!current || !onlyCompanies.some((c) => c.id === current.id)) return defaultCompany;
            return current;
          });
        } else {
          setSelectedCompany(null);
        }

        return;
      }

      const { data: companiesData, error: companiesError } = await activeClient
        .from("companies")
        .select("id, cnpj, razao_social, nome_fantasia, is_active, endereco_cidade, endereco_estado, activity_profile, enable_nfse, enable_nfe, enable_nfce")
        .eq("is_active", true)
        .order("razao_social");

      if (companiesError) throw companiesError;

      const mapped = (companiesData || []).filter((c: any) => c && c.is_active) as Company[];
      setCompanies(mapped);
      if (mapped.length > 0) {
        setSelectedCompany((current) => {
          if (!current || !mapped.some((c) => c.id === current.id)) return mapped[0];
          return current;
        });
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
      setCompanies([]);
      setSelectedCompany(null);
    } finally {
      setLoading(false);
    }
  }, [activeClient, user]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const refreshCompanies = async () => {
    await fetchCompanies();
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        setSelectedCompany,
        loading,
        refreshCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
