import * as pdfjsLib from 'pdfjs-dist';

type PromiseWithResolversResult<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
};

declare global {
    interface PromiseConstructor {
        withResolvers?<T>(): PromiseWithResolversResult<T>;
    }
}

// Polyfill para Promise.withResolvers (Requisito do PDF.js v4+)
if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function <T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;

        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        return { promise, resolve, reject };
    };
}

// Usando worker estático copiado para /public/pdf.worker.min.js
// Isso evita problemas de hash/MIME type no deploy do Vite e servidores que não suportam .mjs
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface CNCJData {
    endereco: any;
    contato: any;
    cnpj?: string;
    razao_social?: string;
    nome_fantasia?: string;
    porte?: string;
    natureza_juridica?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    email?: string;
    telefone?: string;
    situacao_cadastral?: string;
    data_abertura?: string;
    cnae_principal?: string;
}

export class CNPJParserService {
    async parse(file: File): Promise<CNCJData> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let fullText = '';

            // Extrair texto de todas as páginas
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => item.str)
                    .join(' ');
                fullText += pageText + ' ';
            }

            console.log('Texto extraído do PDF:', fullText); // Debug

            return this.userIdCardData(fullText);
        } catch (error) {
            console.error('Erro ao ler PDF:', error);
            throw new Error('Falha ao processar o arquivo PDF. Certifique-se que é um arquivo válido.');
        }
    }

    private userIdCardData(text: string): CNCJData {
        const data: CNCJData = {};

        // Normaliza o texto para facilitar regex (remove múltiplos espaços)
        const normalized = text.replace(/\s+/g, ' ').toUpperCase();

        // 1. Número de Inscrição (CNPJ)
        // Padrão: NÚMERO DE INSCRIÇÃO XX.XXX.XXX/XXXX-XX MATRIZ
        const cnpjMatch = normalized.match(/NÚMERO DE INSCRIÇÃO\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        if (cnpjMatch) data.cnpj = cnpjMatch[1];

        // 2. Data de Abertura
        const aberturaMatch = normalized.match(/DATA DE ABERTURA\s+(\d{2}\/\d{2}\/\d{4})/);
        if (aberturaMatch) data.data_abertura = aberturaMatch[1];

        // 3. Nome Empresarial (Razão Social)
        // Geralmente aparece após "NOME EMPRESARIAL" e antes de "TÍTULO DO ESTABELECIMENTO"
        const razaoMatch = normalized.match(/NOME EMPRESARIAL\s+(.*?)\s+TÍTULO DO ESTABELECIMENTO/);
        if (razaoMatch) data.razao_social = razaoMatch[1].trim();

        // 4. Título do Estabelecimento (Fantasia)
        // Entre "TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)" e "PORTE" ou "CÓDIGO E DESCRIÇÃO"
        const fantasiaMatch = normalized.match(/TÍTULO DO ESTABELECIMENTO \(NOME DE FANTASIA\)\s+(.*?)\s+PORTE/);
        if (fantasiaMatch && fantasiaMatch[1] !== '********') {
            data.nome_fantasia = fantasiaMatch[1].trim();
        }

        // 5. Porte
        const porteMatch = normalized.match(/PORTE\s+(.*?)\s+CÓDIGO E DESCRIÇÃO/);
        if (porteMatch) data.porte = porteMatch[1].trim();

        // 6. CNAE Principal (Código e Descrição)
        // Padrão: CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
        //         X.XX-X-XX - Descrição da atividade...
        const cnaePrincipalMatch = normalized.match(/ATIVIDADE ECONÔMICA PRINCIPAL\s+(\d{2}\.\d{2}-\d-\d{2})\s+-\s+(.*?)\s+CÓDIGO E DESCRIÇÃO DAS? ATIVIDADES? ECONÔMICAS? SECUNDÁRIAS?/);
        if (cnaePrincipalMatch) {
            data.cnae_principal_code = cnaePrincipalMatch[1].replace(/[^\d]/g, '');
            // Captura tudo até o próximo título, removendo espaços extras
            data.cnae_principal = cnaePrincipalMatch[1] + ' - ' + cnaePrincipalMatch[2].trim();
        } else {
            // Fallback simples se o regex complexo falhar
            const simpleCnae = normalized.match(/ATIVIDADE ECONÔMICA PRINCIPAL\s+(\d{2}\.\d{2}-\d-\d{2})/);
            if (simpleCnae) data.cnae_principal_code = simpleCnae[1].replace(/[^\d]/g, '');
        }

        // 6.1 CNAEs Secundários
        // Padrão: CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS
        //         xx.xx-x-xx - Descrição 1
        //         yy.yy-y-yy - Descrição 2
        //         ...
        //         CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
        const secondaryBlockMatch = normalized.match(/ATIVIDADES? ECONÔMICAS? SECUNDÁRIAS?\s+(.*?)\s+CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA/);

        if (secondaryBlockMatch) {
            const block = secondaryBlockMatch[1];
            // Regex para pegar todos os códigos no formato XX.XX-X-XX
            const codes = [...block.matchAll(/(\d{2}\.\d{2}-\d-\d{2})/g)].map(m => m[1]);

            if (codes.length > 0) {
                // Salva apenas os códigos separados por vírgula para facilitar
                data.cnae_secundario_code = codes.map(c => c.replace(/[^\d]/g, '')).join(',');
                data.cnae_secundario_desc = block.trim(); // Salva o bloco inteiro de texto como descrição por enquanto
            } else {
                // Caso especial: "Não informada"
                if (block.includes("NÃO INFORMADA")) {
                    data.cnae_secundario_desc = "Não informada";
                }
            }
        }

        // 7. Natureza Jurídica (Código e Descrição)
        // Padrão: CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
        //         XXXX-X ou XXX-X - Descrição...
        //         LOGRADOURO
        // Ajuste: (\d{3,4}-\d) aceita tanto 206-2 quanto 2062-1
        const natJuridicaMatch = normalized.match(/CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA\s+(\d{3,4}-\d)\s+-\s+(.*?)\s+LOGRADOURO/);
        if (natJuridicaMatch) {
            data.natureza_juridica_code = natJuridicaMatch[1].replace(/[^\d]/g, '');
            data.natureza_juridica_desc = natJuridicaMatch[2].trim();
            // Mantém compatibilidade com campo antigo
            data.natureza_juridica = natJuridicaMatch[1] + ' - ' + natJuridicaMatch[2].trim();
        }

        // 8. Endereço
        // LOGRADOURO X NÚMERO Y COMPLEMENTO Z CEP W BAIRRO B MUNICÍPIO M UF U
        const logradouroMatch = normalized.match(/LOGRADOURO\s+(.*?)\s+NÚMERO/);
        if (logradouroMatch) data.logradouro = logradouroMatch[1].trim();

        const numeroMatch = normalized.match(/NÚMERO\s+(.*?)\s+COMPLEMENTO/);
        if (numeroMatch) data.numero = numeroMatch[1].trim();

        const complementoMatch = normalized.match(/COMPLEMENTO\s+(.*?)\s+CEP/);
        if (complementoMatch) data.complemento = complementoMatch[1].trim();

        const cepMatch = normalized.match(/CEP\s+(\d{2}\.\d{3}-\d{3})/);
        if (cepMatch) data.cep = cepMatch[1];

        const bairroMatch = normalized.match(/BAIRRO\/DISTRITO\s+(.*?)\s+MUNICÍPIO/);
        if (bairroMatch) data.bairro = bairroMatch[1].trim();

        const municipioMatch = normalized.match(/MUNICÍPIO\s+(.*?)\s+UF/);
        if (municipioMatch) data.municipio = municipioMatch[1].trim();

        const ufMatch = normalized.match(/UF\s+(\w{2})/);
        if (ufMatch) data.uf = ufMatch[1];

        // 9. Contato
        const emailMatch = normalized.match(/ENDEREÇO ELETRÔNICO\s+(.*?)\s+TELEFONE/);
        if (emailMatch) data.email = emailMatch[1].trim().toLowerCase();

        const telefoneMatch = normalized.match(/TELEFONE\s+(.*?)\s+ENTE FEDERATIVO/);
        if (telefoneMatch) data.telefone = telefoneMatch[1].trim();

        // 10. Situação Cadastral
        const situacaoMatch = normalized.match(/SITUAÇÃO CADASTRAL\s+(.*?)\s+DATA DA SITUAÇÃO/);
        if (situacaoMatch) data.situacao_cadastral = situacaoMatch[1].trim();

        const dataSituacaoMatch = normalized.match(/DATA DA SITUAÇÃO CADASTRAL\s+(\d{2}\/\d{2}\/\d{4})/);
        if (dataSituacaoMatch) data.data_situacao_cadastral = dataSituacaoMatch[1];

        // Consolidar objetos aninhados conforme esperado pela interface
        data.endereco = {
            logradouro: data.logradouro,
            numero: data.numero,
            complemento: data.complemento,
            bairro: data.bairro,
            municipio: data.municipio,
            uf: data.uf,
            cep: data.cep
        };

        data.contato = {
            email: data.email,
            telefone: data.telefone
        };

        return data;
    }
}
