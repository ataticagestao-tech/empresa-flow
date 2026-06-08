import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const SECOES: { t: string; c: React.ReactNode }[] = [
  {
    t: "1. Quem somos",
    c: (
      <p>
        A <strong>Tática Financeiro</strong> (CNPJ 57.202.144/0001-48), com sede na Av. Aristides Ribeiro, 58 —
        Jardim Ribeiro, Varginha/MG, CEP 37068-120, é a responsável pelo tratamento dos dados pessoais coletados
        por meio deste site e na prestação de seus serviços de gestão e BPO financeiro. Contato:{" "}
        <a href="mailto:ataticagestao@gmail.com" className="text-[#065F46] underline">ataticagestao@gmail.com</a>.
      </p>
    ),
  },
  {
    t: "2. Quais dados coletamos",
    c: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Dados de contato que você fornece (nome, telefone/WhatsApp, e-mail) ao solicitar um diagnóstico ou falar conosco;</li>
        <li>Dados de navegação (páginas visitadas, origem do acesso) coletados por cookies e ferramentas de análise;</li>
        <li>Para clientes contratantes: dados cadastrais e financeiros da empresa necessários à prestação do serviço (movimentações, contas, documentos fiscais e bancários).</li>
      </ul>
    ),
  },
  {
    t: "3. Para que usamos seus dados",
    c: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Responder ao seu contato e realizar o diagnóstico financeiro solicitado;</li>
        <li>Prestar os serviços de BPO e consultoria financeira contratados;</li>
        <li>Cumprir obrigações legais, contratuais e fiscais;</li>
        <li>Aprimorar nossos serviços e a comunicação com você.</li>
      </ul>
    ),
  },
  {
    t: "4. Base legal",
    c: (
      <p>
        Tratamos seus dados com fundamento na execução de contrato e em procedimentos preliminares (art. 7º, V),
        no consentimento (art. 7º, I), no cumprimento de obrigação legal (art. 7º, II) e no legítimo interesse
        (art. 7º, IX) da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), conforme o caso.
      </p>
    ),
  },
  {
    t: "5. Compartilhamento",
    c: (
      <p>
        <strong>Não vendemos seus dados.</strong> Podemos compartilhá-los apenas quando necessário com prestadores
        essenciais (ex.: contabilidade, provedores de tecnologia e de pagamentos), instituições financeiras
        envolvidas na operação e autoridades públicas, quando exigido por lei — sempre sob obrigação de
        confidencialidade.
      </p>
    ),
  },
  {
    t: "6. Segurança da informação",
    c: (
      <p>
        Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia, controle de
        acesso, backups automáticos e cláusulas de confidencialidade nos contratos. O acesso aos dados é restrito ao
        estritamente necessário para a prestação do serviço.
      </p>
    ),
  },
  {
    t: "7. Por quanto tempo guardamos",
    c: (
      <p>
        Mantemos os dados pelo tempo necessário às finalidades descritas e aos prazos legais aplicáveis. Encerrada a
        relação, os dados são eliminados ou anonimizados, salvo quando a guarda for exigida por lei.
      </p>
    ),
  },
  {
    t: "8. Seus direitos (LGPD)",
    c: (
      <p>
        A qualquer momento você pode: confirmar a existência de tratamento; acessar, corrigir, atualizar ou solicitar
        a exclusão dos seus dados; solicitar a portabilidade; revogar o consentimento; e obter informações sobre o
        compartilhamento. Para exercer seus direitos, escreva para{" "}
        <a href="mailto:ataticagestao@gmail.com" className="text-[#065F46] underline">ataticagestao@gmail.com</a>.
      </p>
    ),
  },
  {
    t: "9. Cookies",
    c: (
      <p>
        Utilizamos cookies essenciais ao funcionamento do site e cookies de análise para entender como as páginas são
        usadas. Você pode gerenciá-los nas configurações do seu navegador.
      </p>
    ),
  },
  {
    t: "10. Alterações desta política",
    c: (
      <p>
        Esta política pode ser atualizada periodicamente. A versão vigente estará sempre disponível nesta página, com
        a respectiva data de atualização.
      </p>
    ),
  },
  {
    t: "11. Contato",
    c: (
      <p>
        Dúvidas sobre esta política ou sobre o tratamento dos seus dados:{" "}
        <a href="mailto:ataticagestao@gmail.com" className="text-[#065F46] underline">ataticagestao@gmail.com</a>.
      </p>
    ),
  },
];

export default function Privacidade() {
  return (
    <div className="min-h-screen bg-[#F5F0E6] text-[#2B2620] antialiased">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-[#F5F0E6]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/venda" className="font-black tracking-tight text-[#020A17]">
            TÁTICA <span className="text-[#065F46]">Financeiro</span>
          </Link>
          <Link
            to="/venda"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#065F46] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <h1 className="text-[28px] font-black tracking-tight text-[#020A17] md:text-[34px]">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-[14px] text-[#73685B]">Atualizada em junho de 2026</p>

        <div className="mt-10 space-y-8">
          {SECOES.map((s) => (
            <section key={s.t}>
              <h2 className="text-[18px] font-black tracking-tight text-[#020A17]">{s.t}</h2>
              <div className="mt-2 text-[15px] leading-relaxed text-[#473f37]">{s.c}</div>
            </section>
          ))}
        </div>

        <div className="mt-14 border-t border-black/10 pt-6 text-[13px] text-[#73685B]">
          Tática Financeiro · CNPJ 57.202.144/0001-48 · Av. Aristides Ribeiro, 58 — Jardim Ribeiro, Varginha/MG ·
          CEP 37068-120
        </div>
      </main>
    </div>
  );
}
