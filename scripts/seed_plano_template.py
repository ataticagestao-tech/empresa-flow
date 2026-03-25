"""Seed plano de contas template no Supabase via REST API."""
import json, urllib.request, urllib.error

SK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ub2Jvcm5tbnplbWdzZHVzY3VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODI3MDE0MCwiZXhwIjoyMDgzODQ2MTQwfQ.ndDsY81N88GYSXmRc-23aMdJ79h7nc43oC7bqWTXHJs"
URL = "https://onobornmnzemgsduscug.supabase.co/rest/v1/chart_of_accounts"
C = "00000000-0000-0000-0000-000000000001"

# Delete existing first
req = urllib.request.Request(URL + "?company_id=eq." + C, method="DELETE")
req.add_header("apikey", SK)
req.add_header("Authorization", "Bearer " + SK)
try:
    urllib.request.urlopen(req)
    print("Deleted existing template accounts")
except urllib.error.HTTPError as e:
    print(f"Delete: {e.code}")

def a(id, code, name, lvl, typ, nat, anal, dre_g, dre_o):
    return {"id": id, "company_id": C, "code": code, "name": name, "level": lvl,
            "account_type": typ, "account_nature": nat, "is_analytical": anal,
            "is_synthetic": not anal, "accepts_manual_entry": anal,
            "show_in_dre": True, "dre_group": dre_g, "dre_order": dre_o, "status": "active"}

accounts = [
    # RECEITAS
    a("10000000-0000-0000-0000-000000000001","1","RECEITAS",1,"revenue","credit",False,"receita_bruta",10),
    a("10000000-0000-0000-0000-000000000002","1.1","Receita bruta de servicos",2,"revenue","credit",False,"receita_bruta",11),
    a("10000000-0000-0000-0000-000000000003","1.2","Receita bruta de produtos",2,"revenue","credit",False,"receita_bruta",12),
    a("10000000-0000-0000-0000-000000000004","1.3","Outras receitas",2,"revenue","credit",False,"outras_receitas",13),
    a("10000000-0000-0000-0000-000000000010","1.1.01","Receita de servicos - geral",3,"revenue","credit",True,"receita_bruta",11),
    a("10000000-0000-0000-0000-000000000020","1.2.01","Receita de produtos - geral",3,"revenue","credit",True,"receita_bruta",12),
    a("10000000-0000-0000-0000-000000000030","1.3.01","Juros e rendimentos",3,"revenue","credit",True,"outras_receitas",13),
    a("10000000-0000-0000-0000-000000000031","1.3.02","Receitas diversas",3,"revenue","credit",True,"outras_receitas",14),
    # DEDUCOES
    a("20000000-0000-0000-0000-000000000001","2","DEDUCOES DA RECEITA",1,"expense","debit",False,"deducoes",20),
    a("20000000-0000-0000-0000-000000000002","2.1","Impostos sobre a receita",2,"expense","debit",False,"deducoes",21),
    a("20000000-0000-0000-0000-000000000003","2.2","Devolucoes e cancelamentos",2,"expense","debit",False,"deducoes",22),
    a("20000000-0000-0000-0000-000000000010","2.1.01","ISS - Imposto sobre servicos",3,"expense","debit",True,"deducoes",21),
    a("20000000-0000-0000-0000-000000000011","2.1.02","PIS",3,"expense","debit",True,"deducoes",22),
    a("20000000-0000-0000-0000-000000000012","2.1.03","COFINS",3,"expense","debit",True,"deducoes",23),
    a("20000000-0000-0000-0000-000000000013","2.1.04","DAS - Simples Nacional",3,"expense","debit",True,"deducoes",24),
    a("20000000-0000-0000-0000-000000000014","2.1.05","IRPJ",3,"expense","debit",True,"deducoes",25),
    a("20000000-0000-0000-0000-000000000015","2.1.06","CSLL",3,"expense","debit",True,"deducoes",26),
    a("20000000-0000-0000-0000-000000000020","2.2.01","Devolucoes de servicos",3,"expense","debit",True,"deducoes",27),
    a("20000000-0000-0000-0000-000000000021","2.2.02","Devolucoes de produtos",3,"expense","debit",True,"deducoes",28),
    # CUSTOS
    a("30000000-0000-0000-0000-000000000001","3","CUSTOS",1,"expense","debit",False,"custos",30),
    a("30000000-0000-0000-0000-000000000002","3.1","Custo dos servicos prestados (CSP)",2,"expense","debit",False,"custos",31),
    a("30000000-0000-0000-0000-000000000003","3.2","Custo das mercadorias vendidas (CMV)",2,"expense","debit",False,"custos",32),
    a("30000000-0000-0000-0000-000000000010","3.1.01","Materiais e insumos diretos",3,"expense","debit",True,"custos",31),
    a("30000000-0000-0000-0000-000000000011","3.1.02","Mao de obra direta",3,"expense","debit",True,"custos",32),
    a("30000000-0000-0000-0000-000000000012","3.1.03","Terceiros e subcontratados",3,"expense","debit",True,"custos",33),
    a("30000000-0000-0000-0000-000000000020","3.2.01","Custo de mercadorias",3,"expense","debit",True,"custos",34),
    # DESPESAS OPERACIONAIS
    a("40000000-0000-0000-0000-000000000001","4","DESPESAS OPERACIONAIS",1,"expense","debit",False,"despesas_operacionais",40),
    a("40000000-0000-0000-0000-000000000002","4.1","Pessoal e encargos",2,"expense","debit",False,"despesas_operacionais",41),
    a("40000000-0000-0000-0000-000000000010","4.1.01","Salarios e ordenados",3,"expense","debit",True,"despesas_operacionais",41),
    a("40000000-0000-0000-0000-000000000011","4.1.02","FGTS",3,"expense","debit",True,"despesas_operacionais",42),
    a("40000000-0000-0000-0000-000000000012","4.1.03","INSS patronal",3,"expense","debit",True,"despesas_operacionais",43),
    a("40000000-0000-0000-0000-000000000013","4.1.04","Vale transporte",3,"expense","debit",True,"despesas_operacionais",44),
    a("40000000-0000-0000-0000-000000000014","4.1.05","Vale refeicao / alimentacao",3,"expense","debit",True,"despesas_operacionais",45),
    a("40000000-0000-0000-0000-000000000015","4.1.06","Plano de saude",3,"expense","debit",True,"despesas_operacionais",46),
    a("40000000-0000-0000-0000-000000000016","4.1.07","Pro-labore",3,"expense","debit",True,"despesas_operacionais",47),
    a("40000000-0000-0000-0000-000000000017","4.1.08","Ferias e 13o salario",3,"expense","debit",True,"despesas_operacionais",48),
    a("40000000-0000-0000-0000-000000000003","4.2","Ocupacao",2,"expense","debit",False,"despesas_operacionais",49),
    a("40000000-0000-0000-0000-000000000020","4.2.01","Aluguel",3,"expense","debit",True,"despesas_operacionais",49),
    a("40000000-0000-0000-0000-000000000021","4.2.02","Condominio",3,"expense","debit",True,"despesas_operacionais",50),
    a("40000000-0000-0000-0000-000000000022","4.2.03","IPTU",3,"expense","debit",True,"despesas_operacionais",51),
    a("40000000-0000-0000-0000-000000000023","4.2.04","Energia eletrica",3,"expense","debit",True,"despesas_operacionais",52),
    a("40000000-0000-0000-0000-000000000024","4.2.05","Agua e saneamento",3,"expense","debit",True,"despesas_operacionais",53),
    a("40000000-0000-0000-0000-000000000004","4.3","Despesas administrativas",2,"expense","debit",False,"despesas_operacionais",54),
    a("40000000-0000-0000-0000-000000000030","4.3.01","Honorarios contabeis",3,"expense","debit",True,"despesas_operacionais",54),
    a("40000000-0000-0000-0000-000000000031","4.3.02","Honorarios juridicos",3,"expense","debit",True,"despesas_operacionais",55),
    a("40000000-0000-0000-0000-000000000032","4.3.03","Material de escritorio",3,"expense","debit",True,"despesas_operacionais",56),
    a("40000000-0000-0000-0000-000000000033","4.3.04","Limpeza e conservacao",3,"expense","debit",True,"despesas_operacionais",57),
    a("40000000-0000-0000-0000-000000000034","4.3.05","Seguros",3,"expense","debit",True,"despesas_operacionais",58),
    a("40000000-0000-0000-0000-000000000035","4.3.06","Despesas bancarias",3,"expense","debit",True,"despesas_operacionais",59),
    a("40000000-0000-0000-0000-000000000005","4.4","Marketing e vendas",2,"expense","debit",False,"despesas_operacionais",60),
    a("40000000-0000-0000-0000-000000000040","4.4.01","Publicidade e propaganda",3,"expense","debit",True,"despesas_operacionais",60),
    a("40000000-0000-0000-0000-000000000041","4.4.02","Redes sociais e midia digital",3,"expense","debit",True,"despesas_operacionais",61),
    a("40000000-0000-0000-0000-000000000042","4.4.03","Comissoes de vendas",3,"expense","debit",True,"despesas_operacionais",62),
    a("40000000-0000-0000-0000-000000000006","4.5","Tecnologia e sistemas",2,"expense","debit",False,"despesas_operacionais",63),
    a("40000000-0000-0000-0000-000000000050","4.5.01","Software e assinaturas SaaS",3,"expense","debit",True,"despesas_operacionais",63),
    a("40000000-0000-0000-0000-000000000051","4.5.02","Internet e telefonia",3,"expense","debit",True,"despesas_operacionais",64),
    a("40000000-0000-0000-0000-000000000052","4.5.03","Equipamentos e manutencao",3,"expense","debit",True,"despesas_operacionais",65),
    a("40000000-0000-0000-0000-000000000007","4.6","Despesas financeiras",2,"expense","debit",False,"despesas_operacionais",66),
    a("40000000-0000-0000-0000-000000000060","4.6.01","Juros e multas",3,"expense","debit",True,"despesas_operacionais",66),
    a("40000000-0000-0000-0000-000000000061","4.6.02","IOF",3,"expense","debit",True,"despesas_operacionais",67),
    a("40000000-0000-0000-0000-000000000062","4.6.03","Tarifas bancarias",3,"expense","debit",True,"despesas_operacionais",68),
    # OUTRAS DESPESAS
    a("50000000-0000-0000-0000-000000000001","5","OUTRAS DESPESAS",1,"expense","debit",False,"outras_despesas",70),
    a("50000000-0000-0000-0000-000000000002","5.1","Impostos e taxas",2,"expense","debit",False,"outras_despesas",71),
    a("50000000-0000-0000-0000-000000000003","5.2","Depreciacao e amortizacao",2,"expense","debit",False,"outras_despesas",72),
    a("50000000-0000-0000-0000-000000000004","5.3","Outras despesas nao operacionais",2,"expense","debit",False,"outras_despesas",73),
    a("50000000-0000-0000-0000-000000000010","5.1.01","Alvara e licencas",3,"expense","debit",True,"outras_despesas",71),
    a("50000000-0000-0000-0000-000000000011","5.1.02","Taxas municipais e estaduais",3,"expense","debit",True,"outras_despesas",72),
    a("50000000-0000-0000-0000-000000000020","5.2.01","Depreciacao de equipamentos",3,"expense","debit",True,"outras_despesas",73),
    a("50000000-0000-0000-0000-000000000021","5.2.02","Amortizacao de intangiveis",3,"expense","debit",True,"outras_despesas",74),
    a("50000000-0000-0000-0000-000000000030","5.3.01","Perdas e sinistros",3,"expense","debit",True,"outras_despesas",75),
    a("50000000-0000-0000-0000-000000000031","5.3.02","Despesas diversas",3,"expense","debit",True,"outras_despesas",76),
]

data = json.dumps(accounts).encode("utf-8")
req = urllib.request.Request(URL, data=data, method="POST")
req.add_header("apikey", SK)
req.add_header("Authorization", "Bearer " + SK)
req.add_header("Content-Type", "application/json")
req.add_header("Prefer", "return=minimal")

try:
    resp = urllib.request.urlopen(req)
    print(f"OK! {len(accounts)} contas inseridas (status {resp.status})")
except urllib.error.HTTPError as e:
    print(f"Erro {e.code}: {e.read().decode()}")
