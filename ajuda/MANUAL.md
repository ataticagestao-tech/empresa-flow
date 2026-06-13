# Manual de Uso — Gestap System (Tatica Gestao)

> Guia completo, em linguagem de empresário, sobre como o sistema funciona, em que ordem usar cada tela e como as informações se conectam.

---

## Índice

1. [Premissas — o que você precisa saber antes de começar](#1-premissas)
2. [Fluxograma geral — do cadastro ao DRE](#2-fluxograma-geral)
3. [Como as informações se conectam](#3-como-as-informações-se-conectam)
4. [Mapa do sistema (menu por menu)](#4-mapa-do-sistema)
5. [Rotinas — diária, semanal e mensal](#5-rotinas)
6. [Conceitos importantes (caixa x competência, conciliação, etc.)](#6-conceitos-importantes)
7. [Glossário rápido](#7-glossário)
8. [Perguntas frequentes](#8-perguntas-frequentes)
9. [Apêndice — Deploy e infraestrutura (visão geral)](#9-apêndice--deploy-e-infraestrutura)

---

## 1. Premissas

Antes de qualquer coisa, entenda estas regras do jogo. Elas explicam **por que** o sistema pede certas coisas.

### 1.1. Multi-empresa
- Você pode cadastrar **várias empresas** no mesmo login. O seletor no topo da barra lateral troca entre elas.
- Cada empresa tem **seus próprios** clientes, fornecedores, contas, vendas e relatórios. Nada vaza de uma para outra.
- Quem você convida pela tela **Equipe** só vê a empresa em que foi convidado.

### 1.2. Tudo gira em torno de 3 entidades
1. **Cadastros** (empresa, clientes, fornecedores, funcionários, produtos, contas bancárias, plano de contas).
2. **Lançamentos** (vendas, contas a pagar, contas a receber, movimentações bancárias).
3. **Relatórios** (DRE, Fluxo de Caixa, Dashboard, Relatórios para o contador).

> **Regra de ouro:** sem cadastro feito, lançamento não fica organizado. Sem lançamento feito, relatório não bate.

### 1.3. Toda receita e despesa precisa ter uma **categoria** (plano de contas)
- O **plano de contas** é a espinha dorsal do sistema. É a lista de categorias contábeis (Receita de Vendas, Aluguel, Salários, Impostos, etc.).
- Sem categoria, o lançamento "existe", mas **não aparece no DRE**. Categorize tudo.

### 1.4. O banco é a fonte da verdade
- Tudo que entra ou sai de uma conta bancária precisa estar refletido no sistema. É a **conciliação bancária** que garante isso.
- Você baixa o extrato (OFX, CSV ou Excel) do banco, sobe na tela **Conciliação**, e o sistema casa com os lançamentos. O que sobrar você categoriza ali mesmo.

### 1.5. Caixa x Competência (decore essa diferença)
- **Regime de Caixa**: conta a receita/despesa **no dia que o dinheiro entrou ou saiu de fato**.
- **Regime de Competência**: conta a receita/despesa **no dia da venda ou da nota**, mesmo se o pagamento for futuro.
- O Dashboard e o DRE têm um seletor para alternar. Use **competência** para entender o desempenho do negócio, **caixa** para entender o caixa.

### 1.6. Cartão de crédito é uma "conta especial"
- No sistema, cartão de crédito é cadastrado em **Contas Bancárias** com tipo `cartão de crédito`.
- Em Vendas, pagamento no cartão é considerado **Pago** mesmo que o repasse da operadora ainda esteja em aberto (o repasse fica como Conta a Receber).

### 1.7. Transferência entre contas não é receita nem despesa
- Tirar dinheiro de uma conta e colocar em outra **não impacta o DRE**, não vira receita nem despesa. É só um registro de movimentação.

### 1.8. Soft-delete (exclusão segura)
- Praticamente nada é apagado de verdade. CR e CP "excluídos" ficam guardados com data de exclusão. Isso protege contra acidente e mantém a auditoria.

---

## 2. Fluxograma geral

### 2.1. Onboarding (primeira vez no sistema)

```
   ┌─────────────────────┐
   │ 1. Cadastrar EMPRESA│  → CNPJ, regime tributário, responsável
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ 2. PLANO DE CONTAS  │  → copia modelo pronto ou cria do zero
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ 3. CONTAS BANCÁRIAS │  → cada banco/cartão usado pela empresa
   │   (ACCTID do OFX!)  │     com saldo inicial e ACCTID correto
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────────────────────────────┐
   │ 4. CADASTROS BASE                           │
   │   • Clientes  • Fornecedores  • Funcionários│
   │   • Produtos / Operacional                  │
   │   • Centros de Custo (opcional)             │
   └──────────┬──────────────────────────────────┘
              │
              ▼
   ┌─────────────────────┐
   │ 5. PRIMEIRA VENDA   │  ou primeira despesa em Contas a Pagar
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ 6. CONCILIAR EXTRATO│  sobe OFX, o sistema casa com lançamentos
   └─────────────────────┘
```

### 2.2. Ciclo do dia a dia

```
        ┌────────────────────────────────────────┐
        │              ROTINA DIÁRIA             │
        └────────────────────────────────────────┘

   ┌──────────┐       ┌──────────┐       ┌──────────┐
   │  VENDA   │       │  COMPRA  │       │  EXTRATO │
   │ do dia   │       │  recebida│       │ do banco │
   └────┬─────┘       └────┬─────┘       └────┬─────┘
        │                  │                  │
        ▼                  ▼                  ▼
   ┌──────────┐       ┌──────────┐       ┌──────────────┐
   │Lançar em │       │Lançar em │       │Subir OFX em  │
   │ VENDAS   │       │CONTAS A  │       │ CONCILIAÇÃO  │
   │          │       │  PAGAR   │       │  BANCÁRIA    │
   └────┬─────┘       └────┬─────┘       └──────┬───────┘
        │                  │                    │
        │  gera            │  gera              │  casa lançamentos
        │  automaticamente │  automaticamente   │  + categoriza
        │                  │                    │  o que sobrou
        ▼                  ▼                    ▼
   ┌─────────────────────────────────────────────────────┐
   │           BASE FINANCEIRA UNIFICADA                 │
   │  Contas a Receber + Contas a Pagar + Movimentações  │
   └────────────────────────┬────────────────────────────┘
                            │
                            ▼
   ┌─────────────────────────────────────────────────────┐
   │      DASHBOARD  •  DRE  •  FLUXO DE CAIXA           │
   └─────────────────────────────────────────────────────┘
```

### 2.3. Ciclo de uma venda (o que acontece nos bastidores)

```
  Você clica "Nova Venda"
            │
            ▼
   ┌──────────────────┐
   │ Escolhe cliente, │
   │ produtos, formas │
   │ de pagamento     │
   └────────┬─────────┘
            │
            ▼
   ┌────────────────────────────────────────────────┐
   │ Sistema cria, na MESMA transação:              │
   │   1. Registro da VENDA                         │
   │   2. Itens vendidos (com baixa no ESTOQUE)     │
   │   3. CONTA A RECEBER por parcela (se a prazo)  │
   │   4. MOVIMENTAÇÃO no caixa (se à vista)        │
   └────────┬───────────────────────────────────────┘
            │
            ▼
   ┌────────────────────────────────────────────────┐
   │ Quando o cliente paga:                         │
   │   • Você marca CR como recebida → gera         │
   │     movimentação no caixa                      │
   │   • OU, no extrato, a conciliação casa sozinha │
   └────────────────────────────────────────────────┘
```

### 2.4. Ciclo de uma despesa

```
  Você recebe boleto / nota / pix
            │
            ▼
   ┌────────────────────────────┐
   │ Lança em CONTAS A PAGAR    │
   │ • credor (fornecedor/func) │
   │ • valor                    │
   │ • categoria (plano contas) │
   │ • vencimento               │
   └────────┬───────────────────┘
            │
            ├─── quando paga ──► gera MOVIMENTAÇÃO no caixa
            │
            └─── ou casa sozinho ao subir o OFX (se já existir)
```

### 2.5. Ciclo de fechamento mensal

```
   ┌────────────────────────────────┐
   │ 1. Conferir CONCILIAÇÃO        │  zero pendência no mês
   └──────────────┬─────────────────┘
                  ▼
   ┌────────────────────────────────┐
   │ 2. Gerar e revisar o DRE       │  caixa OU competência
   └──────────────┬─────────────────┘
                  ▼
   ┌────────────────────────────────┐
   │ 3. Conferir FLUXO DE CAIXA     │  saldo do sistema = banco?
   └──────────────┬─────────────────┘
                  ▼
   ┌────────────────────────────────┐
   │ 4. ÁREA DO CONTADOR            │  baixa pacote do mês
   └──────────────┬─────────────────┘
                  ▼
   ┌────────────────────────────────┐
   │ 5. Enviar para o contador      │
   └────────────────────────────────┘
```

---

## 3. Como as informações se conectam

O sistema é "tudo interligado". Quando você lança em uma tela, vários outros lugares recebem o reflexo automaticamente. Este é o mapa das conexões.

### 3.1. Mapa das conexões

```
                    ┌─────────────────────┐
                    │   PLANO DE CONTAS   │
                    │   (categorias)      │
                    └──────────┬──────────┘
                               │  toda receita/despesa
                               │  precisa ter uma
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
  ┌──────────┐           ┌──────────┐           ┌──────────┐
  │  VENDAS  │           │CONTAS A  │           │CONTAS A  │
  │          │──gera────►│ RECEBER  │           │  PAGAR   │
  └────┬─────┘           └────┬─────┘           └────┬─────┘
       │                      │                      │
       │ baixa                │ ao receber           │ ao pagar
       ▼                      ▼                      ▼
  ┌──────────┐           ┌──────────────────────────────────┐
  │ ESTOQUE  │           │       MOVIMENTAÇÕES              │
  │          │           │  (entradas e saídas no caixa)    │
  └──────────┘           └─────────────┬────────────────────┘
                                       │
                                       ▼
                         ┌──────────────────────────┐
                         │   CONTAS BANCÁRIAS       │
                         │   (saldo dia a dia)      │
                         └─────────────┬────────────┘
                                       │
                                       ▼
                         ┌──────────────────────────┐
                         │   CONCILIAÇÃO BANCÁRIA   │
                         │   (extrato OFX/CSV)      │
                         └─────────────┬────────────┘
                                       │
       ┌───────────────────────────────┴────────────────────┐
       ▼                               ▼                    ▼
  ┌─────────┐                   ┌──────────┐         ┌─────────────┐
  │   DRE   │                   │   FLUXO  │         │  DASHBOARD  │
  │         │                   │ DE CAIXA │         │             │
  └─────────┘                   └──────────┘         └─────────────┘
```

### 3.2. O que dispara o quê

| Ação que você faz                       | O que o sistema cria automaticamente                                                                                       |
|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Lançar **venda à vista**                | Movimentação de entrada na conta + baixa no estoque                                                                        |
| Lançar **venda a prazo** (3x)           | 3 Contas a Receber (uma por parcela) + baixa no estoque                                                                    |
| Lançar **venda no cartão**              | 1 Conta a Receber (repasse da operadora) + baixa no estoque + venda já entra como "Paga"                                  |
| Marcar **CR como recebida**             | Movimentação de entrada na conta bancária escolhida                                                                        |
| Lançar **conta a pagar** e marcar paga  | Movimentação de saída na conta bancária                                                                                    |
| **Subir OFX** na Conciliação            | Casa com CR/CP existentes; o que sobra você categoriza e vira movimentação                                                |
| **Excluir extrato** importado           | Soft-deleta também as CR/CP que tinham sido criadas a partir dele (`created_via_bank_tx_id`)                              |
| **Cadastrar funcionário** ou fornecedor | Fica disponível em CR, CP, Folha; se tiver PIX, o sistema usa para casar pagamentos no extrato                            |
| Lançar **folha de pagamento**           | Gera CP por funcionário (salário, INSS, FGTS, vale-transporte, etc.)                                                       |

### 3.3. Ligações que valem ouro

- **PIX do fornecedor/funcionário** → o sistema casa pagamentos do extrato automaticamente quando o nome ou CPF/CNPJ bate (sem precisar de chave estrangeira).
- **ACCTID do OFX** → cada conta bancária precisa ter o `ACCTID` exato do extrato (com hífen e zeros à esquerda). Sem isso, a conciliação não funciona; se errado, o sistema bloqueia o upload para você não subir extrato na conta errada.
- **Centro de custo** → permite filtrar DRE e relatórios por unidade, departamento ou projeto (opcional, mas poderoso).
- **`created_via_bank_tx_id`** → se você importou um extrato e ele gerou CR/CP automaticamente, excluir esse extrato remove as CR/CP em cascata. Sem retrabalho.

---

## 4. Mapa do sistema

A barra lateral está organizada em **grupos**. Cada grupo agrupa telas que se complementam.

### 4.1. Dashboard
Visão única do "como está a empresa agora":
- Saldo de caixa atual (todas as contas).
- Faturamento e despesa do mês.
- Contas a vencer nos próximos 7 dias.
- Contas atrasadas (vermelhas).
- Toggle **Caixa / Competência** para alternar a leitura.

### 4.2. Cadastros
A base de tudo. Preencha esse grupo antes de começar a lançar.

| Tela              | Para que serve                                                                                                  |
|-------------------|------------------------------------------------------------------------------------------------------------------|
| **Empresas**      | Cadastra o(s) CNPJ(s). O sistema busca razão social na Receita automaticamente.                                  |
| **Funcionários** | Lista de colaboradores. Preencha PIX para o sistema casar pagamento de folha no extrato.                         |
| **Clientes**      | Quem compra de você. Usado em Vendas e CR.                                                                       |
| **Fornecedores** | Quem vende para você. Usado em CP, ordens de compra, conciliação.                                                |
| **Plano de Contas**| As categorias contábeis. **Sem isso, DRE não funciona.**                                                        |
| **Contas Bancárias**| Cada conta corrente, poupança ou cartão de crédito. ACCTID do OFX é obrigatório para conciliação automática.   |
| **Centros de Custo**| Subdivisões da empresa (filiais, projetos, departamentos). Opcional, mas habilita relatórios por área.         |
| **Operacional**   | Produtos e serviços que você vende. Cada item pode ter SKU, preço, custo, estoque.                              |

> **Dica:** os cadastros são salvos em **Title Case** automaticamente (Nome Próprio fica "Nome Próprio"). Apenas descrição livre de CR/CP **não** sofre essa formatação.

> **Dica:** se houver duplicados de fornecedor/funcionário, use o botão **Localizar duplicados** dentro de cada tela para detectar e mesclar.

### 4.3. Financeiro
O coração operacional.

| Tela                       | O que faz                                                                                                                       |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| **Vendas**                 | Registra vendas (à vista, a prazo, múltiplas formas, cartão, contrato/pacote). Gera CR e movimentações automaticamente.         |
| **Contas a Receber**       | Tudo que clientes te devem. Marca como recebida → vira movimentação.                                                            |
| **Contas a Pagar**         | Tudo que você deve a fornecedores, funcionários, governo. Marca como paga → vira movimentação.                                  |
| **Recibos**                | Emite recibo a partir de CR/CP pagas ou cria recibo avulso (sem CR/CP).                                                         |
| **Movimentações**          | Lista bruta de entradas e saídas no caixa, conta por conta. Visível apenas para o owner.                                        |
| **DRE**                    | Demonstração de Resultado do Exercício. Receita – despesa = lucro. Toggle Caixa/Competência.                                    |
| **Fluxo de Caixa**         | Entradas e saídas reais por dia, por conta bancária. Use para auditar.                                                          |
| **Relatórios**             | Relatórios analíticos diversos (vendas, comissões, inadimplência, etc.).                                                        |
| **Régua de Cobrança**      | Mensagens automáticas (WhatsApp/e-mail) para clientes atrasados.                                                                |
| **Conciliação Bancária**   | A tela mais importante. Sobe o OFX, casa com lançamentos, categoriza o que sobrou. Use **toda semana**.                         |

### 4.4. Fiscal
| Tela                | O que faz                                                                                              |
|---------------------|--------------------------------------------------------------------------------------------------------|
| **Área do Contador**| Painel com pacote do mês pronto para baixar: extrato, conciliações com categoria, vendas, despesas.    |
| **Emissão NFSe**    | Emite nota de serviço; aba "Vendas a faturar" permite marcar manualmente nf_emitida.                   |
| **Notas Fiscais**   | Visualização e gestão de notas emitidas.                                                               |
| **Importação XML**  | Sobe XML de notas fiscais recebidas.                                                                   |
| **Config NFSe**     | Configura certificado, prefeitura, alíquotas, série da nota.                                           |

### 4.5. RH & Folha
| Tela                    | O que faz                                                                                                    |
|-------------------------|--------------------------------------------------------------------------------------------------------------|
| **Folha de Pagamento**  | Calcula salário, descontos, líquido a pagar. Gera CP por funcionário.                                       |
| **Ponto Eletrônico**    | Marcação e fechamento de ponto.                                                                              |
| **Férias e Afastamentos**| Programa férias, atestados, licenças.                                                                       |
| **Encargos**            | INSS, FGTS, IRRF — cálculo automático.                                                                       |
| **Admissões e Demissões**| Processo de entrada e saída de colaboradores, com geração dos documentos.                                   |

### 4.6. Projeção Financeira
| Tela                       | O que faz                                                                                              |
|----------------------------|--------------------------------------------------------------------------------------------------------|
| **Fluxo Projetado**        | Projeta saldo de caixa futuro com base em CR/CP em aberto.                                             |
| **Orçamento**              | Define metas mensais por categoria; compara com realizado.                                             |
| **Previsão de Receitas**   | Previsão de faturamento por período.                                                                   |
| **Cenários**               | Simula otimista / pessimista / realista.                                                               |

### 4.7. Estoque & Compras
| Tela                  | O que faz                                                                                                |
|-----------------------|----------------------------------------------------------------------------------------------------------|
| **Estoque**           | Saldo atual de cada item. Atualizado automaticamente a cada venda/compra.                                |
| **Ordens de Compra**  | Pedidos de compra a fornecedores.                                                                        |
| **Inventário**        | Conferência cíclica do estoque físico vs sistema.                                                        |

### 4.8. Documentos
| Tela              | O que faz                                                                                                     |
|-------------------|---------------------------------------------------------------------------------------------------------------|
| **Explorador**    | Armazena PDF, fotos, contratos, organizados por pasta.                                                        |
| **Upload**        | Faz upload (inclusive batch).                                                                                 |
| **Vencimentos**   | Lista documentos com data de validade próxima (alvarás, certificados).                                        |

### 4.9. Precificação
| Tela                  | O que faz                                                                                                      |
|-----------------------|----------------------------------------------------------------------------------------------------------------|
| **Ficha Técnica**     | Cadastra a "receita" do produto (insumos + quantidades).                                                       |
| **Composição de Custo**| Soma os custos para descobrir o CMV.                                                                          |
| **Margem de Desconto**| Define o desconto máximo que ainda preserva margem.                                                            |
| **Tabela de Preços**  | Lista de preços por canal/cliente.                                                                             |
| **Markup**            | Simulador: a partir do custo e da margem desejada, calcula preço final.                                        |

### 4.10. Multi-empresa
Disponível apenas para o owner. Consolida vários CNPJs:
- **Consolidado**: DRE somado de todas as empresas.
- **Transferências**: registro de transferências entre empresas do grupo.
- **Relatórios**: comparativos entre empresas.

### 4.11. Administração
| Tela                   | O que faz                                                                                                |
|------------------------|----------------------------------------------------------------------------------------------------------|
| **Equipe**             | Convida colaboradores por e-mail. Define perfil (admin, financeiro, vendas, leitura).                    |
| **Usuários**           | Gestão fina de permissões (admin).                                                                       |
| **WhatsApp Autorizados**| Lista de números autorizados a cadastrar via WhatsApp.                                                  |
| **Log de Atividades**  | Auditoria: quem alterou, criou, excluiu cada registro e quando.                                          |

### 4.12. Configurações (rodapé)
- **Geral**: nome fantasia, logo, fuso horário.
- **Integrações**: Gmail (importar extrato do e-mail), WhatsApp, Google Calendar.
- **Resumo Overnight**: configura horário do PDF diário/semanal enviado por WhatsApp.
- **NFSe**: certificado e prefeitura.

---

## 5. Rotinas

Use estas três rotinas como checklist:

### 5.1. Diária (5-10 min)
1. Lançar vendas do dia (se não vieram automáticas).
2. Lançar boletos/notas recebidos em **Contas a Pagar**.
3. Marcar pagamentos efetuados em **CR** e **CP**.
4. Verificar no **Dashboard** se há conta atrasada.

### 5.2. Semanal (15 min, idealmente sexta)
1. Baixar OFX de cada banco e subir em **Conciliação**.
2. Casar transações sugeridas; categorizar o resto.
3. Conferir se o saldo do sistema bate com o saldo real do banco (em **Fluxo de Caixa**).
4. Olhar a **Régua de Cobrança** — clientes atrasados receberam mensagem?

### 5.3. Mensal (30 min, primeiro dia útil do mês seguinte)
1. **Conciliação**: zero pendência no mês fechado.
2. **DRE**: revisar, conferir categorias estranhas.
3. **Fluxo de Caixa**: auditar dia a dia.
4. **Área do Contador**: baixar pacote do mês.
5. Enviar para o contador (e-mail ou WhatsApp).
6. (Opcional) Ativar **Resumo Overnight** para receber PDF diário do mês seguinte sem precisar abrir o sistema.

---

## 6. Conceitos importantes

### 6.1. Regime de Caixa vs Competência
- **Caixa** = quando o dinheiro entrou/saiu do banco.
- **Competência** = quando a venda foi feita ou a nota foi recebida, mesmo se ainda não pagaram.
- Para impostos e visão estratégica: **competência**.
- Para entender quanto realmente está no banco: **caixa**.

### 6.2. Por que a conciliação é tão importante?
Porque ela é o ponto onde o sistema cruza **o que você lançou** com **o que o banco registrou**. Diferenças aqui podem ser:
- Boleto que você lançou mas o cliente pagou com desconto (juros, multa, ajuste).
- Lançamento esquecido (cobrança não lançada que apareceu no extrato).
- Lançamento duplicado.
- Compra pessoal feita pela conta da empresa (precisa ser registrada como Retirada do Sócio).

Use **Conciliar Manualmente** quando houver diferença: o sistema cria um CR/CP auxiliar com a categoria que você escolher (ex: "Juros pago", "Desconto concedido").

### 6.3. Vendas com múltiplas formas de pagamento
Desde 2026-05, uma venda pode ser paga com mais de uma forma (ex: 50% no PIX + 50% no cartão). O sistema marca a venda como `forma=multiplo` e cria uma CR ou movimentação para cada parte.

### 6.4. Cartão de crédito como conta
Cadastre o cartão em **Contas Bancárias** com tipo `cartão de crédito`. As compras feitas no cartão geram CP com vencimento na data da fatura, e o pagamento da fatura é registrado quando a conta corrente debita.

### 6.5. Contratos e pacotes
Para HAIR OF BRASIL (e clientes com plano similar): existe o tipo `contrato`/`pacote`. A venda quebra automaticamente em parcelas. Ao tentar criar nova venda para o cliente, o sistema detecta o contrato em aberto e oferece **Pagar parcela** ou **Quitar tudo**.

### 6.6. Exclusão em cascata via banco
Se uma CR ou CP foi criada a partir de uma transação importada do extrato, ela carrega o campo `created_via_bank_tx_id`. Excluir o extrato (ou estornar a importação) remove essas CR/CP juntas — sem deixar fantasmas.

### 6.7. WhatsApp como atalho
Você pode:
- Mandar foto de uma nota fiscal para o número do sistema → cadastra fornecedor + lança CP.
- Receber **Resumo Overnight** PDF com faturamento + despesas do dia anterior.
- Validar telefone de funcionário com 1 clique.

---

## 7. Glossário

| Termo              | Significado em "empresês"                                                                                          |
|--------------------|--------------------------------------------------------------------------------------------------------------------|
| **CR**             | Conta a Receber. Dinheiro que cliente te deve.                                                                     |
| **CP**             | Conta a Pagar. Dinheiro que você deve.                                                                             |
| **DRE**            | Demonstração de Resultado. Mostra se você teve lucro ou prejuízo no período.                                       |
| **Plano de Contas**| Lista de categorias contábeis. Toda receita/despesa precisa de uma.                                                |
| **Conciliação**    | Confronto entre o que você lançou no sistema e o que aparece no extrato do banco.                                  |
| **OFX**            | Arquivo padrão de extrato bancário (todo banco gera). Tem um código `ACCTID` que identifica a conta.                |
| **Movimentação**   | Entrada ou saída efetiva de dinheiro em uma conta bancária.                                                        |
| **Centro de Custo**| Subdivisão da empresa para análise (filial, projeto, departamento).                                                |
| **Regime de Caixa**| Conta receita/despesa no dia do pagamento.                                                                         |
| **Competência**    | Conta receita/despesa no dia da venda/nota, mesmo se o pagamento for futuro.                                       |
| **Soft-delete**    | Excluir sem apagar de verdade — fica marcado como deletado mas pode ser recuperado.                                |
| **NFSe**           | Nota Fiscal de Serviço Eletrônica.                                                                                 |
| **Multi-tenant**   | Várias empresas no mesmo sistema, isoladas entre si.                                                               |
| **Owner**          | Dona/dono do sistema. Vê todos os menus restritos.                                                                 |

---

## 8. Perguntas frequentes

**P: Lancei uma venda, mas ela não aparece no DRE.**
R: Verifique se a venda tem **categoria** preenchida (item do plano de contas). Sem categoria, ela não entra no DRE.

**P: O saldo do sistema não bate com o do banco.**
R: Quase sempre é conciliação pendente. Vá em **Conciliação**, sobe o OFX mais recente e categorize o que sobrar. Se ainda assim não bater, confira o **saldo inicial** cadastrado na conta bancária.

**P: Excluí uma venda errada. Tem como voltar?**
R: CR/CP e vendas usam soft-delete — fale com o suporte para restaurar. Movimentações são hard-delete (não voltam).

**P: O extrato OFX deu erro ao subir.**
R: Provavelmente o **ACCTID** do arquivo não bate com o cadastrado na conta. Abra o OFX no bloco de notas, procure por `<ACCTID>`, e ajuste o cadastro em **Contas Bancárias** com o valor exato (com hífen e zeros).

**P: Como sei se uma transação é receita real ou transferência?**
R: Transferência entre contas suas **nunca** entra no DRE. Quando categorizar na conciliação, use a categoria `Transferência entre Contas`. Isso garante que não vire receita/despesa.

**P: Quero esconder um menu para outros usuários.**
R: Configurações de menu por usuário ficam em **Equipe** (perfis) e **Admin**. Alguns menus são `ownerOnly` por padrão (Movimentações, Multi-empresa, Administração, Fiscal, Projeção) — apenas a dona do sistema vê.

**P: Onde vejo quem alterou um lançamento?**
R: **Administração → Log de Atividades**. Mostra quem mexeu, quando e o quê.

**P: Onde configuro o WhatsApp para receber o resumo diário?**
R: **Configurações → Resumo Overnight**. Define o horário e o número. O PDF chega no celular sem precisar abrir o sistema.

**P: Posso testar uma operação sem afetar os dados reais?**
R: Não há ambiente de teste por enquanto. Para experimentar, crie uma empresa "Teste" no seletor de empresas — o isolamento multi-tenant garante que nada vaza.

---

## 9. Apêndice — Deploy e infraestrutura

> Esta seção é para quem **publica atualizações** no sistema (você mesma ou um desenvolvedor). O empresário comum não precisa mexer aqui.

### 9.1. Onde o sistema roda
- **Frontend (o que você vê no navegador):** publicado na **Vercel**, no domínio **ataticagestao.com**.
- **Banco de dados e API:** **Supabase** (Postgres gerenciado).
- **WhatsApp e e-mail:** Edge Functions Supabase + Evolution API + Gmail OAuth.
- **Cron diário (resumo overnight):** `pg_cron` no Supabase dispara em horário configurado.

### 9.2. Publicar uma atualização (deploy)
```powershell
git add .
git commit -m "descrição da mudança"
git push fork main      # NÃO use 'origin' (sem permissão no upstream)
```
A Vercel detecta o push, faz o build (`npm run build`) e publica em ~2 min. O domínio `ataticagestao.com` recebe a nova versão automaticamente.

### 9.3. Onde verificar se deu certo
- **Vercel Dashboard:** logs de build e deploy.
- **Site (Ctrl+Shift+R):** força recarregar sem cache para ver a versão nova.
- **Supabase Logs:** logs das Edge Functions (importar-extrato-email, overnight, WhatsApp).

### 9.4. Migrations (mudanças no banco)
- Arquivos em `supabase/migrations/`.
- Aplique pelo **Supabase SQL Editor** (cole o conteúdo do `.sql` e rode).
- Atenção: o SQL Editor **não persiste** `BEGIN/COMMIT` entre runs — use um bloco `DO $$ BEGIN ... END $$;` se precisar de transação atômica.

### 9.5. Rollback rápido
- **Frontend:** na Vercel, abra a aba **Deployments**, encontre a versão estável anterior e clique em **Promote to Production**.
- **Banco:** se uma migration deu errado, escreva uma migration inversa nova; **nunca** edite uma migration já aplicada.

### 9.6. Variáveis de ambiente
Ficam na Vercel (e no Supabase para Edge Functions). Nunca subir `.env` no git. Exemplos:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — conexão com o banco.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Gmail + Login Google.
- `EVOLUTION_API_KEY`, `EVOLUTION_API_URL` — WhatsApp.

### 9.7. Domínios e produtos
- **ataticagestao.com** = empresa-flow (este sistema, gestão).
- **meutatico.site** = produto separado (login Google cria usuário no 1º tenant ativo).
- Não confunda os deploys.

### 9.8. Em caso de incidente
1. Olhar **Vercel → Deployments** para identificar a versão que quebrou.
2. **Promote** a versão estável anterior (resolve o frontend em ~30s).
3. Se for banco: olhar **Supabase → Logs → Postgres**.
4. Registrar o incidente em `MEMORY.md` (project_incidente_*).
5. Para detalhe técnico completo, ver **`ajuda/DEPLOY.md`**.

---

## Resumo de uma página

> **Cadastre** (empresa, plano de contas, banco, clientes/fornecedores/funcionários) → **Lance** (vendas, CP, CR) → **Concilie** (OFX semanal) → **Analise** (Dashboard, DRE, Fluxo de Caixa) → **Feche o mês** (Área do Contador).

Se você seguir essa sequência e respeitar a regra de **categorizar tudo**, o sistema te dá em tempo real: saldo de caixa, contas a vencer, lucro do mês, projeção futura, e o pacote pronto para o contador.

---

*Manual gerado em 2026-05-25. Para dúvidas pontuais, abra a **Central de Ajuda** dentro do sistema (`/ajuda`) — ela tem instruções passo a passo por tela.*
